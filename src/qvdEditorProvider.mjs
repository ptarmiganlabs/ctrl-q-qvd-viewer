import * as vscode from "vscode";
import QvdReader from "./qvdReader.mjs";
import { getErrorHtml } from "./webview/templates/errorTemplate.mjs";
import { getHtmlForWebview } from "./webview/templates/mainTemplate.mjs";
import { setupMessageHandler } from "./webview/messageHandler.mjs";
import logger from "./logger.mjs";

/**
 * Provider for QVD file custom editor with tabbed interface and Tabulator
 */
class QvdEditorProvider {
  static viewType = "ctrl-q-qvd-viewer.qvdEditor";

  constructor(context) {
    this.context = context;
    this.qvdReader = new QvdReader();
  }

  /**
   * Resolve custom text editor
   */
  async resolveCustomTextEditor(document, webviewPanel) {
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
  }

  /**
   * Update webview content with QVD data
   */
  async updateWebview(filePath, webview, maxRows) {
    try {
      logger.log(`Reading QVD file: ${filePath}, maxRows: ${maxRows}`);
      const result = await this.qvdReader.read(filePath, maxRows);

      if (result.error) {
        logger.error(`Error reading QVD file: ${filePath}`, result.error);
        webview.html = getErrorHtml(result.error);
        return;
      }

      logger.log(`Successfully read QVD file: ${filePath}`, {
        records: result.metadata?.noOfRecords,
        fields: result.metadata?.fields?.length,
      });
      webview.html = getHtmlForWebview(result, webview, this.context);
    } catch (error) {
      logger.error(`Exception while processing QVD file: ${filePath}`, error);
      webview.html = getErrorHtml(error.message);
    }
  }
}

export default QvdEditorProvider;
