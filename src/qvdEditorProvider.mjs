import * as vscode from "vscode";
import { stat } from "fs/promises";
import QvdReader from "./qvdReader.mjs";
import { getErrorHtml } from "./webview/templates/errorTemplate.mjs";
import { getHtmlForWebview } from "./webview/templates/mainTemplate.mjs";
import { setupMessageHandler } from "./webview/messageHandler.mjs";
import { getLoadMoreRowCount, previewRows } from "./webview/loadMore.mjs";
import { describeReadFailure, describeViewerFailure } from "./webview/readFailure.mjs";
import { splitRowsIntoBatches } from "./webview/rowBatches.mjs";
import logger from "./logger.mjs";

/**
 * A file's size, for the page's chart of the QVD's structure
 * @param {string} filePath - The file
 * @returns {Promise<number>} Its size, or 0 when it can't be looked at: the chart
 *   is left out, and the rows read are still shown
 */
function fileSizeOf(filePath) {
  return stat(filePath).then(
    (stats) => stats.size,
    () => 0
  );
}

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
    const filePath = document.uri.fsPath;
    // This editor's reads are given up once it is closed, queued or running,
    // so they neither hold up other editors' reads nor run for nothing
    const closed = new AbortController();
    webviewPanel.onDidDispose(() => closed.abort());
    // Whether the page's buttons reach the extension
    let listening = false;
    try {
      logger.log(`Opening QVD file: ${filePath}`);

      // Setup initial content for the webview
      webviewPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "media"),
        ],
      };

      // The rows to open the file with
      const maxRows = previewRows(vscode);

      // Before the first page, so that whatever page this editor shows can reach
      // it, an error page's Retry and Show Logs included. VS Code creates the
      // webview only once this method returns, so no message comes before then.
      setupMessageHandler(
        webviewPanel,
        filePath,
        this.qvdReader,
        this.context,
        this.updateWebview.bind(this),
        maxRows,
        closed.signal
      );
      listening = true;

      // Read and display QVD content
      // Note: We read the file ourselves, not relying on VS Code to read it
      await this.updateWebview(filePath, webviewPanel.webview, maxRows, { signal: closed.signal });
    } catch (error) {
      if (closed.signal.aborted) {
        // The editor was closed: there is no page to show the error on
        logger.log(`Editor closed while opening ${filePath}: ${error.message}`);
        return;
      }
      logger.error(`Fatal error in resolveCustomEditor for ${filePath}:`, error);
      // Show error in webview, with buttons only when something hears them
      const failure = describeViewerFailure(error, { filePath });
      webviewPanel.webview.html = getErrorHtml(listening ? failure : { ...failure, actions: [] });
      // Re-throw so VS Code knows there was an error
      throw error;
    }
  }

  /**
   * Update webview content with QVD data
   * @param {string} filePath - The QVD file path
   * @param {object} webview - The webview to fill
   * @param {number} maxRows - Rows to read, 0 for every row
   * @param {{keepPageOnFailure?: boolean, signal?: AbortSignal}} [options] -
   *   keepPageOnFailure: when the read fails, keep the page and say why in a warning,
   *   instead of replacing it. For Load More and Load All, where the rows already shown
   *   are still worth having, and the load buttons, put back, retry.
   *   signal: gives the read up once the editor is closed.
   * @returns {Promise<{rowsSent: Promise<void>}|undefined>} Resolves once the HTML
   *   is set; rowsSent settles once every row has been posted to the webview
   */
  async updateWebview(filePath, webview, maxRows, { keepPageOnFailure = false, signal } = {}) {
    const totalStart = performance.now();
    logger.log("⏱️ [TIMING] updateWebview started");
    // Ends the heap the rows read have booked, should they never reach the page
    let releaseRows = () => {};
    try {
      logger.log(`Reading QVD file: ${filePath}, maxRows: ${maxRows}`);

      const readStart = performance.now();
      const result = await this.qvdReader.read(filePath, maxRows, { signal });
      releaseRows = result.release ?? releaseRows;
      const readTime = performance.now() - readStart;
      logger.log(
        `⏱️ [TIMING] QVD read: ${readTime.toFixed(0)}ms, rows: ${
          result.data?.length
        }`
      );

      if (result.errorReason === "aborted") {
        // The editor is closed: there is no page left to show anything on
        logger.log(`Read given up, because its editor was closed: ${filePath}`);
        return;
      }

      if (result.error) {
        logger.error(`Error reading QVD file: ${filePath}`, {
          error: result.error,
          name: result.errorName,
          reason: result.errorReason,
          code: result.errorCode,
        });
        await this.showReadFailure(filePath, webview, result, { keepPage: keepPageOnFailure, signal });
        return;
      }

      logger.log(`Successfully read QVD file: ${filePath}`, {
        records: result.metadata?.noOfRecords,
        fields: result.metadata?.fields?.length,
      });

      // Get file size for QVD structure calculation
      const fileSize = await fileSizeOf(filePath);
      if (signal?.aborted) {
        // Closed meanwhile: nobody is waiting for these rows
        logger.log(`Editor closed before its rows were shown: ${filePath}`);
        releaseRows();
        return;
      }

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
      const rowsSent = this.postRows(webview, result)
        .catch((error) => {
          logger.error(`Exception while sending rows of QVD file: ${filePath}`, error);
          if (!signal?.aborted) {
            webview.html = getErrorHtml(describeViewerFailure(error, { filePath }));
          }
        })
        // The webview has the rows now: the heap they booked here is free for other reads
        .finally(() => result.release?.());

      const totalTime = performance.now() - totalStart;
      logger.log(
        `⏱️ [TIMING] ✅ TOTAL updateWebview: ${totalTime.toFixed(0)}ms`
      );
      return { rowsSent };
    } catch (error) {
      // Rows read before what was thrown will never reach the page
      releaseRows();
      if (signal?.aborted) {
        // The editor is closed: there is no page left to show anything on
        logger.log(`Editor closed while showing ${filePath}: ${error?.message ?? error}`);
        return;
      }
      logger.error(`Exception while processing QVD file: ${filePath}`, error);
      // A read never throws: what did is the viewer's, whatever system code it carries
      await this.showFailure(webview, describeViewerFailure(error, { filePath }), {
        keepPage: keepPageOnFailure,
      });
    }
  }

  /**
   * Say why a read failed
   * On Load More and Load All the page stays, and a warning says why. Otherwise the
   * page is replaced: by the viewer with the file's header and the failure in its
   * Data tab, when only the file's rows failed and its header still reads, and by
   * the error page when not.
   * @param {string} filePath - The QVD file path
   * @param {object} webview - The webview
   * @param {object} result - The failed read, as QvdReader.read() gives it
   * @param {{keepPage?: boolean, signal?: AbortSignal}} [options] - keepPage: keep the
   *   page, and put its load buttons back; signal: aborted once the editor is closed
   * @returns {Promise<void>} Resolves once the page says why
   */
  async showReadFailure(filePath, webview, result, { keepPage = false, signal } = {}) {
    const failure = describeReadFailure(result, { filePath });
    if (!keepPage && failure.dataOnly) {
      const shown = await this.showHeader(filePath, webview, result, signal);
      // Closed while the header was read: there is no page left to show anything on
      if (shown || signal?.aborted) {
        return;
      }
    }
    await this.showFailure(webview, failure, { keepPage });
  }

  /**
   * Show the file's header, with why its rows couldn't be read in the Data tab
   * @param {string} filePath - The QVD file path
   * @param {object} webview - The webview
   * @param {object} result - The failed read, as QvdReader.read() gives it
   * @param {AbortSignal} [signal] - Aborted once the editor is closed
   * @returns {Promise<boolean>} Whether the page shows it: false when the header
   *   can't be read or shown, or the editor has closed
   */
  async showHeader(filePath, webview, result, signal) {
    let header;
    try {
      header = await this.qvdReader.readHeader(filePath, { signal });
    } catch (error) {
      logger.log(`The header of ${filePath} can't be read either: ${error?.message ?? error}`);
      return false;
    }
    const fileSize = await fileSizeOf(filePath);
    if (signal?.aborted) {
      return false;
    }
    // Its header read, so the file is a QVD, whatever is wrong with its rows
    const failure = describeReadFailure(result, { filePath, headerRead: true });
    try {
      webview.html = getHtmlForWebview(
        { ...header, data: [], dataError: failure, fileSize },
        webview,
        this.context,
        { embedData: true }
      );
      return true;
    } catch (error) {
      // The error page says why the rows failed, as the header would have
      logger.error(`Failed to show the header of QVD file: ${filePath}`, error);
      return false;
    }
  }

  /**
   * Say why a file can't be shown: in a warning, on a page that stays as it is,
   * or on the error page
   * @param {object} webview - The webview
   * @param {import('./webview/readFailure.mjs').ReadFailure} failure - Why
   * @param {{keepPage?: boolean}} [options] - keepPage: keep the page, as Load More
   *   and Load All do, and put its load buttons back
   * @returns {Promise<void>} Resolves once the page says why
   */
  async showFailure(webview, failure, { keepPage = false } = {}) {
    if (keepPage) {
      // The rows already shown stay, and the page puts its load buttons back
      vscode.window
        .showWarningMessage(`${failure.title}. ${failure.summary}`, "Show Logs")
        .then((action) => {
          if (action === "Show Logs") {
            logger.show();
          }
        });
      await webview.postMessage({ command: "loadRefused" });
      return;
    }
    webview.html = getErrorHtml(failure);
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
