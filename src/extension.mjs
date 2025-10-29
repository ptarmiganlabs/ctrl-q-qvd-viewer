/**
 * Main extension module (ESM)
 * 
 * Contains the activation and deactivation logic for the Ctrl-Q QVD Viewer extension.
 * This module is loaded by the CommonJS wrapper (extension.cjs) using dynamic import().
 */

// Access vscode API via globalThis (injected by the CommonJS wrapper)
const vscode = globalThis.vscode;

import { QvdEditorProvider } from './qvdEditorProvider.mjs';
import { AboutPanel } from './aboutPanel.mjs';

/**
 * Activates the extension
 * @param {object} context - Extension context from VS Code
 */
export async function activate(context) {
	console.log('Ctrl-Q QVD Viewer extension is now active');

	// Check if this is the first activation and show About page
	const hasShownAbout = context.globalState.get('hasShownAbout', false);
	if (!hasShownAbout) {
		// Show About page on first activation
		AboutPanel.show(context);
		context.globalState.update('hasShownAbout', true);
	}

	// Register the custom editor provider for QVD files
	const qvdEditorProvider = new QvdEditorProvider(context);
	
	const editorRegistration = vscode.window.registerCustomEditorProvider(
		QvdEditorProvider.viewType,
		qvdEditorProvider,
		{
			webviewOptions: {
				retainContextWhenHidden: true
			},
			supportsMultipleEditorsPerDocument: false
		}
	);

	context.subscriptions.push(editorRegistration);

	// Register command to open QVD file
	const openQvdCommand = vscode.commands.registerCommand('ctrl-q-qvd-viewer.openQvd', async () => {
		const uri = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: {
				'QVD Files': ['qvd', 'QVD']
			}
		});

		if (uri && uri[0]) {
			await vscode.commands.executeCommand('vscode.openWith', uri[0], QvdEditorProvider.viewType);
		}
	});

	context.subscriptions.push(openQvdCommand);

	// Register command to show About page
	const aboutCommand = vscode.commands.registerCommand('ctrl-q-qvd-viewer.about', () => {
		AboutPanel.show(context);
	});

	context.subscriptions.push(aboutCommand);
}

/**
 * Deactivates the extension
 * Called when the extension is deactivated
 */
export function deactivate() {
	// Cleanup if needed
}
