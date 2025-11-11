import * as vscode from "vscode";
import { statSync } from "fs";
import QvdReader from "./qvdReader.mjs";
import { getErrorHtml } from "./webview/templates/errorTemplate.mjs";
import { getHtmlForWebview } from "./webview/templates/mainTemplate.mjs";
import { setupMessageHandler } from "./webview/messageHandler.mjs";
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
   */
  async updateWebview(filePath, webview, maxRows) {
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

      // Send data via postMessage to avoid HTML size limits
      // This fixes the "Unable to retrieve document" error for large QVDs
      logger.log(`Sending data to webview via postMessage...`);
      const postStart = performance.now();
      webview.postMessage({
        command: "loadInitialData",
        data: result.data,
        metadata: result.metadata,
        totalRows: result.totalRows,
        hasMoreRows: result.data.length < result.totalRows,
      });
      logger.log(
        `⏱️ [TIMING] postMessage: ${(performance.now() - postStart).toFixed(
          0
        )}ms`
      );

      const totalTime = performance.now() - totalStart;
      logger.log(
        `⏱️ [TIMING] ✅ TOTAL updateWebview: ${totalTime.toFixed(0)}ms`
      );

      logger.log(`Data sent to webview successfully`);
    } catch (error) {
      logger.error(`Exception while processing QVD file: ${filePath}`, error);
      webview.html = getErrorHtml(error.message);
    }
  }
}

export default QvdEditorProvider;
