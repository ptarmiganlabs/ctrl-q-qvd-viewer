// The module 'vscode' contains the VS Code extensibility API
const vscode = require('vscode');
const QvdEditorProvider = require('./qvdEditorProvider');
const AboutPanel = require('./aboutPanel');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('QVD4VSCode extension is now active');

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
	const openQvdCommand = vscode.commands.registerCommand('qvd4vscode.openQvd', async () => {
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
	const aboutCommand = vscode.commands.registerCommand('qvd4vscode.about', () => {
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
