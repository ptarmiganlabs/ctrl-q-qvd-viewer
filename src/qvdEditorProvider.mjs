import * as vscode from "vscode";
import { stat } from "fs/promises";
import QvdReader, { errorFacts, failedRead, isReadError } from "./qvdReader.mjs";
import { getErrorHtml } from "./webview/templates/errorTemplate.mjs";
import { getHtmlForWebview } from "./webview/templates/mainTemplate.mjs";
import { setupMessageHandler } from "./webview/messageHandler.mjs";
import { createPageServer } from "./webview/pageServer.mjs";
import { pageSize } from "./webview/pageSize.mjs";
import { describeReadFailure, describeViewerFailure } from "./webview/readFailure.mjs";
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
    // The Data tab's pages, from one open copy of the file, closed with the editor
    const pages = createPageServer({
      filePath,
      webview: webviewPanel.webview,
      signal: closed.signal,
      onFileChanged: () => this.updateWebview(filePath, webviewPanel.webview, { signal: closed.signal }),
    });
    webviewPanel.onDidDispose(() => {
      closed.abort();
      pages.close().catch((error) => logger.error(`Closing ${filePath} failed:`, error));
    });
    // A tab that isn't shown lets go of what its open file holds, for other tabs,
    // exports and profiling; its next page opens the file again
    webviewPanel.onDidChangeViewState?.(() => {
      if (!webviewPanel.visible && !closed.signal.aborted) {
        pages.rest().catch((error) => logger.error(`Resting ${filePath} failed:`, error));
      }
    });
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

      // Before the first page, so that whatever page this editor shows can reach
      // it, an error page's Retry and Show Logs included. VS Code creates the
      // webview only once this method returns, so no message comes before then.
      setupMessageHandler(
        webviewPanel,
        filePath,
        this.qvdReader,
        this.context,
        this.updateWebview.bind(this),
        pages,
        closed.signal
      );
      listening = true;

      // The file's header now; the Data tab asks for its rows a page at a time
      await this.updateWebview(filePath, webviewPanel.webview, { signal: closed.signal });
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
   * Show the file: its header in every tab, and the Data tab's grid, which then
   * asks for its rows a page at a time
   * The header reads in milliseconds whatever the file's size, and not at all when
   * the file hasn't changed since it was last read. A header that can't be read is
   * the file's failure, and the error page says why.
   * @param {string} filePath - The QVD file path
   * @param {object} webview - The webview to fill
   * @param {{signal?: AbortSignal}} [options] - signal: aborted once the editor is closed
   * @returns {Promise<void>} Resolves once the page is set, or there is none to set
   */
  async updateWebview(filePath, webview, { signal } = {}) {
    const start = performance.now();
    let header;
    try {
      header = await this.qvdReader.readHeader(filePath, { signal });
    } catch (error) {
      if (signal?.aborted) {
        logger.log(`Editor closed while the header of ${filePath} was read`);
        return;
      }
      const facts = errorFacts(error);
      logger.error(`Error reading the header of QVD file: ${filePath}`, {
        error: error?.message ?? String(error),
        name: facts.errorName,
        reason: facts.errorReason,
        code: facts.errorCode,
      });
      // The file's failure, or the viewer's own while it read the header
      const failure = isReadError(error)
        ? describeReadFailure(failedRead(error), { filePath })
        : describeViewerFailure(error, { filePath });
      this.showPage(webview, () => getErrorHtml(failure), filePath, signal);
      return;
    }

    // For the page's chart of the QVD's structure
    const fileSize = await fileSizeOf(filePath);
    if (signal?.aborted) {
      return;
    }
    this.showPage(
      webview,
      () => getHtmlForWebview({ ...header, fileSize, pageSize: pageSize(vscode) }, webview, this.context),
      filePath,
      signal
    );
    logger.log(
      `⏱️ [TIMING] Header page for ${filePath}: ${(performance.now() - start).toFixed(0)}ms, ` +
        `${header.totalRows.toLocaleString()} rows`
    );
  }

  /**
   * Set the webview's page, or the error page when the viewer fails to make it
   * @param {object} webview - The webview
   * @param {function(): string} makePage - Makes the page's HTML
   * @param {string} filePath - The QVD file path
   * @param {AbortSignal} [signal] - Aborted once the editor is closed
   */
  showPage(webview, makePage, filePath, signal) {
    try {
      webview.html = makePage();
    } catch (error) {
      if (signal?.aborted) {
        // The editor is closed: there is no page left to show anything on
        logger.log(`Editor closed while showing ${filePath}: ${error?.message ?? error}`);
        return;
      }
      logger.error(`Exception while showing QVD file: ${filePath}`, error);
      try {
        webview.html = getErrorHtml(describeViewerFailure(error, { filePath }));
      } catch (pageError) {
        logger.error(`The error page for ${filePath} couldn't be shown either:`, pageError);
      }
    }
  }
}

export default QvdEditorProvider;
