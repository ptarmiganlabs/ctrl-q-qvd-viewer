import * as vscode from 'vscode';
import { QvdEditorProvider } from './qvdEditorProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('QVD Viewer extension is now active!');

	// Register the custom editor provider for QVD files
	context.subscriptions.push(QvdEditorProvider.register(context));
}

export function deactivate() {}
