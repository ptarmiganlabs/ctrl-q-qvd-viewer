// The module 'vscode' contains the VS Code extensibility API
const vscode = require('vscode');
const QvdEditorProvider = require('./qvdEditorProvider');
const AboutPanel = require('./aboutPanel');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
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

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
