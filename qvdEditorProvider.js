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
        
        // Handle messages from webview
        webviewPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'refresh':
                        await this.updateWebview(document.uri.fsPath, webviewPanel.webview, maxRows);
                        break;
                    case 'openSettings':
                        vscode.commands.executeCommand('workbench.action.openSettings', 'qvd4vscode');
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
                
                .header-container {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                
                h1 {
                    font-size: 1.5em;
                    margin: 0;
                    color: var(--vscode-foreground);
                }
                
                .settings-button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.9em;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                
                .settings-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .settings-icon {
                    width: 16px;
                    height: 16px;
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
                    min-width: 200px;
                    color: var(--vscode-foreground);
                }
                
                .metadata-value {
                    color: var(--vscode-descriptionForeground);
                }
                
                .fields-section {
                    margin-top: 15px;
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
                
                tbody tr:nth-child(even) {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                }
                
                tbody tr:hover {
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
                
                .field-metadata-row {
                    font-weight: bold;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                }
            </style>
        </head>
        <body>
            <div class="header-container">
                <h1>QVD File Viewer</h1>
                <button class="settings-button" onclick="openSettings()">
                    <svg class="settings-icon" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
                        <path d="M14 7.5a1.5 1.5 0 0 1-1.5 1.5h-.38a.5.5 0 0 0-.43.75l.19.32a1.5 1.5 0 0 1-2.3 1.94l-.31-.19a.5.5 0 0 0-.75.43v.38a1.5 1.5 0 0 1-3 0v-.38a.5.5 0 0 0-.75-.43l-.31.19a1.5 1.5 0 0 1-2.3-1.94l.19-.32a.5.5 0 0 0-.43-.75H2.5A1.5 1.5 0 0 1 1 7.5v-1A1.5 1.5 0 0 1 2.5 5h.38a.5.5 0 0 0 .43-.75l-.19-.32a1.5 1.5 0 0 1 2.3-1.94l.31.19a.5.5 0 0 0 .75-.43V1.5a1.5 1.5 0 0 1 3 0v.38a.5.5 0 0 0 .75.43l.31-.19a1.5 1.5 0 0 1 2.3 1.94l-.19.32a.5.5 0 0 0 .43.75h.38A1.5 1.5 0 0 1 14 6.5v1z"/>
                    </svg>
                    Settings
                </button>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                function openSettings() {
                    vscode.postMessage({ command: 'openSettings' });
                }
            </script>
            
            <div class="metadata">
                <h2>File Metadata</h2>
                ${metadata ? `
                <div class="metadata-item">
                    <span class="metadata-label">QV Build No:</span>
                    <span class="metadata-value">${this.escapeHtml(metadata.qvBuildNo) || '(empty)'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Creator Document:</span>
                    <span class="metadata-value">${this.escapeHtml(metadata.creatorDoc) || '(empty)'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Created (UTC):</span>
                    <span class="metadata-value">${this.escapeHtml(metadata.createUtcTime) || '(empty)'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Source Create (UTC):</span>
                    <span class="metadata-value">${this.escapeHtml(metadata.sourceCreateUtcTime) || '(empty)'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Source File Time (UTC):</span>
                    <span class="metadata-value">${this.escapeHtml(metadata.sourceFileUtcTime) || '(empty)'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Source File Size:</span>
                    <span class="metadata-value">${this.escapeHtml(metadata.sourceFileSize) || '(empty)'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Stale Time (UTC):</span>
                    <span class="metadata-value">${this.escapeHtml(metadata.staleUtcTime) || '(empty)'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Table Name:</span>
                    <span class="metadata-value">${this.escapeHtml(metadata.tableName) || '(empty)'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Table Creator:</span>
                    <span class="metadata-value">${this.escapeHtml(metadata.tableCreator) || '(empty)'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Compression:</span>
                    <span class="metadata-value">${this.escapeHtml(metadata.compression) || '(empty)'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Record Byte Size:</span>
                    <span class="metadata-value">${this.escapeHtml(metadata.recordByteSize) || '(empty)'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Total Records:</span>
                    <span class="metadata-value">${totalRows}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Offset:</span>
                    <span class="metadata-value">${metadata.offset}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Length:</span>
                    <span class="metadata-value">${metadata.length}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Comment:</span>
                    <span class="metadata-value">${this.escapeHtml(metadata.comment) || '(empty)'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Encryption Info:</span>
                    <span class="metadata-value">${this.escapeHtml(metadata.encryptionInfo) || '(empty)'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Table Tags:</span>
                    <span class="metadata-value">${this.escapeHtml(metadata.tableTags) || '(empty)'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Profiling Data:</span>
                    <span class="metadata-value">${this.escapeHtml(metadata.profilingData) || '(empty)'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Lineage:</span>
                    <span class="metadata-value">${metadata.lineage && metadata.lineage.LineageInfo ? 
                        (Array.isArray(metadata.lineage.LineageInfo) ? metadata.lineage.LineageInfo.length : 1) + ' item(s)' 
                        : '(empty)'}</span>
                </div>
                ` : '<p>No metadata available</p>'}
            </div>
            
            <div class="fields-section">
                <h2>Field Metadata (${metadata && metadata.fields ? metadata.fields.length : 0} fields)</h2>
                ${metadata && metadata.fields && metadata.fields.length > 0 ? `
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Field Property</th>
                                ${metadata.fields.map(field => `<th>${this.escapeHtml(field.name)}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="field-metadata-row"><strong>Type</strong></td>
                                ${metadata.fields.map(field => `<td>${this.escapeHtml(field.type) || '(empty)'}</td>`).join('')}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Extent</strong></td>
                                ${metadata.fields.map(field => `<td>${this.escapeHtml(field.extent) || '(empty)'}</td>`).join('')}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Number of Symbols</strong></td>
                                ${metadata.fields.map(field => `<td>${field.noOfSymbols}</td>`).join('')}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Offset</strong></td>
                                ${metadata.fields.map(field => `<td>${field.offset}</td>`).join('')}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Length</strong></td>
                                ${metadata.fields.map(field => `<td>${field.length}</td>`).join('')}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Bit Offset</strong></td>
                                ${metadata.fields.map(field => `<td>${field.bitOffset}</td>`).join('')}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Bit Width</strong></td>
                                ${metadata.fields.map(field => `<td>${field.bitWidth}</td>`).join('')}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Bias</strong></td>
                                ${metadata.fields.map(field => `<td>${field.bias}</td>`).join('')}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Tags</strong></td>
                                ${metadata.fields.map(field => {
                                    const tagsDisplay = field.tags && field.tags.length > 0 
                                        ? field.tags.map(t => this.escapeHtml(t)).join(', ') 
                                        : '(empty)';
                                    return `<td>${tagsDisplay}</td>`;
                                }).join('')}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Comment</strong></td>
                                ${metadata.fields.map(field => `<td>${this.escapeHtml(field.comment) || '(empty)'}</td>`).join('')}
                            </tr>
                        </tbody>
                    </table>
                </div>
                ` : '<p>No field metadata available</p>'}
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
