import * as vscode from "vscode";
import { statSync } from "fs";
import QvdReader from "./qvdReader.mjs";
import { getErrorHtml } from "./webview/templates/errorTemplate.mjs";
import { getHtmlForWebview } from "./webview/templates/mainTemplate.mjs";
import { setupMessageHandler } from "./webview/messageHandler.mjs";
import { getLoadMoreRowCount } from "./webview/loadMore.mjs";
import { splitRowsIntoBatches } from "./webview/rowBatches.mjs";
import logger from "./logger.mjs";

/**
 * Provider for QVD file custom editor with tabbed interface and Tabulator
 * Using CustomReadonlyEditorProvider instead of CustomTextEditorProvider
 * to avoid VS Code trying to read large files into memory
 */
class QvdEditorProvider {
  static viewType = "ctrl-q-qvd-viewer.qvdEditor";

  constructor(context) {
    this.context = context;
    this.qvdReader = new QvdReader();
  }

  /**
   * Open custom document - called first by VS Code
   * We return a simple document object that just holds the URI
   */
  async openCustomDocument(uri, openContext, _token) {
    console.log("🔵 openCustomDocument called for:", uri.fsPath);
    // Return a minimal document object
    // We don't read the file here - just return the URI
    return {
      uri,
      dispose: () => {
        console.log("🔵 Document disposed:", uri.fsPath);
      },
    };
  }

  /**
   * Resolve custom editor (not text editor!)
   * This method is called after openCustomDocument to create the webview
   */
  async resolveCustomEditor(document, webviewPanel, _token) {
    console.log("🔵 resolveCustomEditor called for:", document.uri.fsPath);
    try {
      logger.log(`Opening QVD file: ${document.uri.fsPath}`);

      // Setup initial content for the webview
      webviewPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "media"),
        ],
      };

      // Get the max rows configuration
      const config = vscode.workspace.getConfiguration("ctrl-q-qvd-viewer");
      const maxRows = config.get("maxPreviewRows", 5000);

      // Read and display QVD content
      // Note: We read the file ourselves, not relying on VS Code to read it
      await this.updateWebview(
        document.uri.fsPath,
        webviewPanel.webview,
        maxRows
      );

      // Store file path for message handler
      const filePath = document.uri.fsPath;

      // Setup message handler for webview messages
      setupMessageHandler(
        webviewPanel,
        filePath,
        this.qvdReader,
        this.context,
        this.updateWebview.bind(this),
        maxRows
      );
    } catch (error) {
      logger.error(
        `Fatal error in resolveCustomEditor for ${document.uri.fsPath}:`,
        error
      );
      // Show error in webview
      webviewPanel.webview.html = getErrorHtml(
        `Failed to open QVD file: ${error.message}`
      );
      // Re-throw so VS Code knows there was an error
      throw error;
    }
  }

  /**
   * Update webview content with QVD data
   * @param {string} filePath - The QVD file path
   * @param {object} webview - The webview to fill
   * @param {number} maxRows - Rows to read, 0 for every row
   * @param {{keepPageOnMemoryRefusal?: boolean}} [options] - keepPageOnMemoryRefusal: when
   *   the read is refused as too large for memory, keep the page and say so in a warning,
   *   instead of replacing it with the error page. For Load More and Load All, where the
   *   rows already shown are still worth having.
   * @returns {Promise<{rowsSent: Promise<void>}|undefined>} Resolves once the HTML
   *   is set; rowsSent settles once every row has been posted to the webview
   */
  async updateWebview(filePath, webview, maxRows, { keepPageOnMemoryRefusal = false } = {}) {
    const totalStart = performance.now();
    logger.log("⏱️ [TIMING] updateWebview started");
    try {
      logger.log(`Reading QVD file: ${filePath}, maxRows: ${maxRows}`);

      const readStart = performance.now();
      const result = await this.qvdReader.read(filePath, maxRows);
      const readTime = performance.now() - readStart;
      logger.log(
        `⏱️ [TIMING] QVD read: ${readTime.toFixed(0)}ms, rows: ${
          result.data?.length
        }`
      );

      if (result.error) {
        logger.error(`Error reading QVD file: ${filePath}`, result.error);
        if (keepPageOnMemoryRefusal && result.errorReason === "memory") {
          // The rows already shown stay, and the page puts its load buttons back
          vscode.window.showWarningMessage(result.error);
          await webview.postMessage({ command: "loadRefused" });
          return;
        }
        webview.html = getErrorHtml(result.error);
        return;
      }

      logger.log(`Successfully read QVD file: ${filePath}`, {
        records: result.metadata?.noOfRecords,
        fields: result.metadata?.fields?.length,
      });

      // Get file size for QVD structure calculation
      const fileSize = statSync(filePath).size;

      // Generate HTML WITHOUT embedded data (data will be sent via postMessage)
      logger.log(`Generating HTML for webview (embedData: false)...`);
      try {
        // For postMessage mode, pass an empty data array to avoid memory issues
        // The actual data will be sent via postMessage after HTML loads
        const resultForHtml = {
          ...result,
          data: [], // Empty array for HTML generation
          fileSize, // Add file size for QVD structure calculation
        };

        const htmlStart = performance.now();
        webview.html = getHtmlForWebview(resultForHtml, webview, this.context, {
          embedData: false, // NEW: Tell template to not embed data
        });
        const htmlTime = performance.now() - htmlStart;
        logger.log(
          `⏱️ [TIMING] HTML generation: ${htmlTime.toFixed(0)}ms, size: ${(
            webview.html?.length / 1024
          ).toFixed(0)}KB`
        );

        logger.log(
          `HTML generated successfully, length: ${
            webview.html ? webview.html.length : "null"
          }`
        );
      } catch (htmlError) {
        logger.error("🔴 HTML generation error:", htmlError);
        logger.error(`Failed to generate HTML:`, htmlError);
        throw htmlError;
      }

      // Wait a bit for webview to initialize
      const waitStart = performance.now();
      await new Promise((resolve) => setTimeout(resolve, 100));
      logger.log(
        `⏱️ [TIMING] Wait for webview: ${(
          performance.now() - waitStart
        ).toFixed(0)}ms`
      );

      // Send the rows without waiting for them here: VS Code creates a custom
      // editor's webview only once resolveCustomEditor has returned, and until
      // then a postMessage to it does not resolve
      const rowsSent = this.postRows(webview, result).catch((error) => {
        logger.error(`Exception while sending rows of QVD file: ${filePath}`, error);
        webview.html = getErrorHtml(error.message);
      });

      const totalTime = performance.now() - totalStart;
      logger.log(
        `⏱️ [TIMING] ✅ TOTAL updateWebview: ${totalTime.toFixed(0)}ms`
      );
      return { rowsSent };
    } catch (error) {
      logger.error(`Exception while processing QVD file: ${filePath}`, error);
      webview.html = getErrorHtml(error.message);
    }
  }

  /**
   * Send the rows to the webview via postMessage, in batches
   * @param {object} webview - The webview to send them to
   * @param {object} result - The QVD read result
   * @returns {Promise<void>} Settles once every batch has been posted, or the webview has gone
   */
  async postRows(webview, result) {
    // Send data via postMessage to avoid HTML size limits
    // This fixes the "Unable to retrieve document" error for large QVDs
    // The rows go in batches: VS Code turns each message into one JSON string,
    // which for every row of a large file is longer than a string can be
    logger.log(`Sending data to webview via postMessage...`);
    const postStart = performance.now();
    const batches = splitRowsIntoBatches(result.data);
    let delivered = await webview.postMessage({
      command: "loadInitialData",
      data: batches[0],
      loadedRows: result.data.length,
      metadata: result.metadata,
      totalRows: result.totalRows,
      hasMoreRows: result.data.length < result.totalRows,
      loadMoreRowCount: getLoadMoreRowCount(result.data.length),
    });
    // postMessage gives false once the webview is closed
    for (let i = 1; delivered && i < batches.length; i++) {
      delivered = await webview.postMessage({
        command: "appendRows",
        data: batches[i],
      });
    }
    logger.log(
      `⏱️ [TIMING] postMessage: ${(performance.now() - postStart).toFixed(
        0
      )}ms, ${batches.length} message(s)`
    );

    logger.log(
      delivered
        ? `Data sent to webview successfully`
        : `Webview closed before all data was sent`
    );
  }
}

export default QvdEditorProvider;
