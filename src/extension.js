// The module 'vscode' contains the VS Code extensibility API
const vscode = require('vscode');
const QvdEditorProvider = require('./qvdEditorProvider');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Ctrl-Q QVD Viewer extension is now active');

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
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
