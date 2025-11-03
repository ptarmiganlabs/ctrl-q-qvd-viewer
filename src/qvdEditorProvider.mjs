import * as vscode from "vscode";
import QvdReader from "./qvdReader.mjs";
import { getErrorHtml } from "./webview/templates/errorTemplate.mjs";
import { getHtmlForWebview } from "./webview/templates/mainTemplate.mjs";
import { setupMessageHandler } from "./webview/messageHandler.mjs";

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
      const result = await this.qvdReader.read(filePath, maxRows);

      if (result.error) {
        webview.html = getErrorHtml(result.error);
        return;
      }

      webview.html = getHtmlForWebview(result, webview, this.context);
    } catch (error) {
      webview.html = getErrorHtml(error.message);
    }
  }
}

export default QvdEditorProvider;
