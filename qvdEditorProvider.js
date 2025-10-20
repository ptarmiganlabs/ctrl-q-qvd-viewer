const vscode = require('vscode');
const QvdReader = require('./qvdReader');

/**
 * Provider for QVD file custom editor
 */
class QvdEditorProvider {
    static viewType = 'qvd4vscode.qvdEditor';

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
            enableScripts: true
        };

        // Get the max rows configuration
        const config = vscode.workspace.getConfiguration('qvd4vscode');
        const maxRows = config.get('maxPreviewRows', 25);

        // Read and display QVD content
        await this.updateWebview(document.uri.fsPath, webviewPanel.webview, maxRows);
        
        // Handle refresh command
        webviewPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'refresh':
                        await this.updateWebview(document.uri.fsPath, webviewPanel.webview, maxRows);
                        break;
                }
            }
        );
    }

    /**
     * Update webview content with QVD data
     */
    async updateWebview(filePath, webview, maxRows) {
        try {
            const result = await this.qvdReader.read(filePath, maxRows);
            
            if (result.error) {
                webview.html = this.getErrorHtml(result.error);
                return;
            }

            webview.html = this.getHtmlForWebview(result);
        } catch (error) {
            webview.html = this.getErrorHtml(error.message);
        }
    }

    /**
     * Generate HTML for error display
     */
    getErrorHtml(errorMessage) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>QVD Error</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                }
                .error {
                    color: var(--vscode-errorForeground);
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    padding: 15px;
                    border-radius: 4px;
                }
            </style>
        </head>
        <body>
            <h1>Error Loading QVD File</h1>
            <div class="error">
                <strong>Error:</strong> ${this.escapeHtml(errorMessage)}
            </div>
        </body>
        </html>`;
    }

    /**
     * Generate HTML for webview
     */
    getHtmlForWebview(result) {
        const { metadata, data, columns, totalRows } = result;
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>QVD Viewer</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                    margin: 0;
                }
                
                h1 {
                    font-size: 1.5em;
                    margin-bottom: 10px;
                    color: var(--vscode-foreground);
                }
                
                h2 {
                    font-size: 1.2em;
                    margin-top: 25px;
                    margin-bottom: 10px;
                    color: var(--vscode-foreground);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 5px;
                }
                
                .metadata {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 15px;
                    border-radius: 4px;
                    margin-bottom: 20px;
                }
                
                .metadata-item {
                    margin: 8px 0;
                }
                
                .metadata-label {
                    font-weight: bold;
                    display: inline-block;
                    min-width: 150px;
                    color: var(--vscode-foreground);
                }
                
                .fields-section {
                    margin-top: 15px;
                }
                
                .field-item {
                    margin: 5px 0;
                    padding: 8px;
                    background-color: var(--vscode-editor-background);
                    border-radius: 3px;
                }
                
                .field-name {
                    font-weight: bold;
                    color: var(--vscode-symbolIcon-fieldForeground);
                }
                
                .field-details {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                    margin-left: 10px;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 15px;
                    background-color: var(--vscode-editor-background);
                }
                
                th {
                    background-color: var(--vscode-editor-selectionBackground);
                    color: var(--vscode-foreground);
                    padding: 10px;
                    text-align: left;
                    border: 1px solid var(--vscode-panel-border);
                    font-weight: bold;
                }
                
                td {
                    padding: 8px 10px;
                    border: 1px solid var(--vscode-panel-border);
                    color: var(--vscode-foreground);
                }
                
                tr:nth-child(even) {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                }
                
                tr:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                
                .info-banner {
                    background-color: var(--vscode-textBlockQuote-background);
                    border-left: 4px solid var(--vscode-textBlockQuote-border);
                    padding: 10px 15px;
                    margin: 15px 0;
                    color: var(--vscode-foreground);
                }
                
                .table-container {
                    overflow-x: auto;
                    margin-top: 10px;
                }
            </style>
        </head>
        <body>
            <h1>QVD File Viewer</h1>
            
            <div class="metadata">
                <h2>File Metadata</h2>
                ${metadata ? `
                <div class="metadata-item">
                    <span class="metadata-label">Creator Document:</span>
                    <span>${this.escapeHtml(metadata.creatorDoc)}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Created (UTC):</span>
                    <span>${this.escapeHtml(metadata.createUtcTime)}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Table Creator:</span>
                    <span>${this.escapeHtml(metadata.tableCreator)}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Total Records:</span>
                    <span>${totalRows}</span>
                </div>
                
                <div class="fields-section">
                    <h3>Fields (${metadata.fields ? metadata.fields.length : 0})</h3>
                    ${metadata.fields ? metadata.fields.map(field => `
                        <div class="field-item">
                            <span class="field-name">${this.escapeHtml(field.name)}</span>
                            <span class="field-details">
                                Type: ${this.escapeHtml(field.type)} | 
                                Symbols: ${field.noOfSymbols} |
                                Bit Width: ${field.bitWidth}
                            </span>
                        </div>
                    `).join('') : ''}
                </div>
                ` : '<p>No metadata available</p>'}
            </div>
            
            <div class="data-section">
                <h2>Data Preview</h2>
                <div class="info-banner">
                    Showing ${data.length} of ${totalRows} rows
                </div>
                
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                ${columns.map(col => `<th>${this.escapeHtml(col)}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(row => `
                                <tr>
                                    ${columns.map(col => `<td>${this.escapeHtml(String(row[col] ?? ''))}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </body>
        </html>`;
    }

    /**
     * Escape HTML special characters
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }
}

module.exports = QvdEditorProvider;
