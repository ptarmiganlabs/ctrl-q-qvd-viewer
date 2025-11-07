// ESM implementation of the VS Code extension
import * as vscode from "vscode";
import QvdEditorProvider from "./qvdEditorProvider.mjs";
import AboutPanel from "./aboutPanel.mjs";
import logger from "./logger.mjs";

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @returns {Promise<void>}
 */
export async function activate(context) {
  // Initialize logger
  logger.initialize();
  logger.log("Ctrl-Q QVD Viewer extension is now active");

  // Register the custom editor provider for QVD files
  // Using registerCustomEditorProvider (readonly) instead of registerCustomTextEditorProvider
  // This prevents VS Code from trying to read large QVD files into memory
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

  // Register command to show logs
  const showLogsCommand = vscode.commands.registerCommand(
    "ctrl-q-qvd-viewer.showLogs",
    () => {
      logger.show();
    }
  );

  context.subscriptions.push(showLogsCommand);

  // Add logger to subscriptions for proper cleanup
  context.subscriptions.push({
    dispose: () => logger.dispose(),
  });

  // Return the logger so tests can access it
  return { logger };
}

/**
 * Deactivate the extension
 * @returns {void}
 */
export function deactivate() {
  logger.log("Ctrl-Q QVD Viewer extension is deactivating");
  logger.dispose();
}
