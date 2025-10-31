// ESM implementation of the VS Code extension
import * as vscode from "vscode";
import QvdEditorProvider from "./qvdEditorProvider.mjs";
import AboutPanel from "./aboutPanel.mjs";

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @returns {Promise<void>}
 */
export async function activate(context) {
  console.log("Ctrl-Q QVD Viewer extension is now active");

  // Register the custom editor provider for QVD files
  const qvdEditorProvider = new QvdEditorProvider(context);

  const editorRegistration = vscode.window.registerCustomEditorProvider(
    QvdEditorProvider.viewType,
    qvdEditorProvider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: false,
    }
  );

  context.subscriptions.push(editorRegistration);

  // Register command to open QVD file
  const openQvdCommand = vscode.commands.registerCommand(
    "ctrl-q-qvd-viewer.openQvd",
    async () => {
      const uri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          "QVD Files": ["qvd", "QVD"],
        },
      });

      if (uri && uri[0]) {
        await vscode.commands.executeCommand(
          "vscode.openWith",
          uri[0],
          QvdEditorProvider.viewType
        );
      }
    }
  );

  context.subscriptions.push(openQvdCommand);

  // Register command to show About page
  const aboutCommand = vscode.commands.registerCommand(
    "ctrl-q-qvd-viewer.about",
    () => {
      AboutPanel.show(context);
    }
  );

  context.subscriptions.push(aboutCommand);
}

/**
 * Deactivate the extension
 * @returns {void}
 */
export function deactivate() {}
