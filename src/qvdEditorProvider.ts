import * as vscode from 'vscode';
import * as path from 'path';
import { readQvdFile, QvdData } from './qvdReader';

export class QvdEditorProvider implements vscode.CustomReadonlyEditorProvider {
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new QvdEditorProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            QvdEditorProvider.viewType,
            provider
        );
        return providerRegistration;
    }

    private static readonly viewType = 'qvd-viewer.qvdEditor';

    constructor(
        private readonly context: vscode.ExtensionContext
    ) { }

    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return { uri, dispose: () => { } };
    }

    async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        token: vscode.CancellationToken
    ): Promise<void> {
        // Setup initial webview content
        webviewPanel.webview.options = {
            enableScripts: true
        };

        webviewPanel.webview.html = this.getLoadingHtml();

        try {
            // Get the row count from configuration
            const config = vscode.workspace.getConfiguration('qvd-viewer');
            const rowCount = config.get<number>('previewRowCount', 25);

            // Read the QVD file
            const qvdData = await readQvdFile(document.uri.fsPath, rowCount);

            // Update the webview with the actual content
            webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, qvdData, path.basename(document.uri.fsPath));
        } catch (error) {
            webviewPanel.webview.html = this.getErrorHtml(error instanceof Error ? error.message : String(error));
        }
    }

    private getLoadingHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loading QVD File</title>
</head>
<body>
    <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: var(--vscode-font-family);">
        <div>Loading QVD file...</div>
    </div>
</body>
</html>`;
    }

    private getErrorHtml(errorMessage: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
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

    private getHtmlForWebview(webview: vscode.Webview, qvdData: QvdData, fileName: string): string {
        const { metadata, rows } = qvdData;

        // Build metadata section
        let metadataHtml = `
            <div class="metadata-section">
                <h2>File Metadata</h2>
                <table class="metadata-table">
                    <tr><td><strong>File Name:</strong></td><td>${this.escapeHtml(fileName)}</td></tr>
                    ${metadata.tableName ? `<tr><td><strong>Table Name:</strong></td><td>${this.escapeHtml(metadata.tableName)}</td></tr>` : ''}
                    <tr><td><strong>Record Count:</strong></td><td>${metadata.recordCount.toLocaleString()}</td></tr>
                    <tr><td><strong>Field Count:</strong></td><td>${metadata.fields.length}</td></tr>
                    <tr><td><strong>File Size:</strong></td><td>${this.formatFileSize(metadata.fileSize)}</td></tr>
                    ${metadata.creatorDoc ? `<tr><td><strong>Creator:</strong></td><td>${this.escapeHtml(metadata.creatorDoc)}</td></tr>` : ''}
                    ${metadata.createUtcTime ? `<tr><td><strong>Created:</strong></td><td>${this.escapeHtml(metadata.createUtcTime)}</td></tr>` : ''}
                </table>
            </div>
        `;

        // Build fields section
        let fieldsHtml = `
            <div class="fields-section">
                <h2>Fields</h2>
                <table class="fields-table">
                    <thead>
                        <tr>
                            <th>Field Name</th>
                            <th>Type</th>
                            <th>Number Format</th>
                            <th>Tags</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        metadata.fields.forEach(field => {
            const numberFormat = field.numberFormat 
                ? `${field.numberFormat.type}${field.numberFormat.nDec !== undefined ? ` (${field.numberFormat.nDec} decimals)` : ''}`
                : '-';
            const tags = field.tags && field.tags.length > 0 
                ? field.tags.map(t => `<span class="tag">${this.escapeHtml(t)}</span>`).join('')
                : '-';

            fieldsHtml += `
                <tr>
                    <td><code>${this.escapeHtml(field.name)}</code></td>
                    <td>${field.type || '-'}</td>
                    <td>${this.escapeHtml(numberFormat)}</td>
                    <td>${tags}</td>
                </tr>
            `;
        });

        fieldsHtml += `
                    </tbody>
                </table>
            </div>
        `;

        // Build lineage section if available
        let lineageHtml = '';
        if (metadata.lineage && metadata.lineage.length > 0) {
            lineageHtml = `
                <div class="lineage-section">
                    <h2>Lineage</h2>
                    <ul class="lineage-list">
                        ${metadata.lineage.map(l => `<li>${this.escapeHtml(l)}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        // Build data preview section
        let dataHtml = `
            <div class="data-section">
                <h2>Data Preview (${rows.length} rows)</h2>
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                ${metadata.fields.map(f => `<th>${this.escapeHtml(f.name)}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
        `;

        rows.forEach(row => {
            dataHtml += '<tr>';
            metadata.fields.forEach(field => {
                const value = row[field.name];
                const displayValue = value !== null && value !== undefined ? String(value) : '';
                dataHtml += `<td>${this.escapeHtml(displayValue)}</td>`;
            });
            dataHtml += '</tr>';
        });

        dataHtml += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QVD Viewer</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            line-height: 1.6;
        }
        
        h1 {
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        
        h2 {
            color: var(--vscode-foreground);
            margin-top: 30px;
            margin-bottom: 15px;
        }
        
        .metadata-section, .fields-section, .lineage-section, .data-section {
            margin-bottom: 30px;
        }
        
        .metadata-table {
            border-collapse: collapse;
            background-color: var(--vscode-editor-background);
        }
        
        .metadata-table td {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .metadata-table td:first-child {
            width: 200px;
        }
        
        .fields-table, .data-table {
            width: 100%;
            border-collapse: collapse;
            background-color: var(--vscode-editor-background);
        }
        
        .fields-table th, .data-table th {
            background-color: var(--vscode-editor-selectionBackground);
            color: var(--vscode-foreground);
            padding: 10px;
            text-align: left;
            border: 1px solid var(--vscode-panel-border);
            font-weight: bold;
        }
        
        .fields-table td, .data-table td {
            padding: 8px 10px;
            border: 1px solid var(--vscode-panel-border);
        }
        
        .fields-table tbody tr:hover, .data-table tbody tr:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
        }
        
        .tag {
            display: inline-block;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 3px;
            margin-right: 5px;
            font-size: 0.9em;
        }
        
        .lineage-list {
            list-style-type: none;
            padding-left: 0;
        }
        
        .lineage-list li {
            padding: 8px;
            margin-bottom: 5px;
            background-color: var(--vscode-textCodeBlock-background);
            border-left: 3px solid var(--vscode-button-background);
        }
        
        .table-wrapper {
            overflow-x: auto;
        }
        
        .data-table {
            min-width: 100%;
        }
    </style>
</head>
<body>
    <h1>QVD File Viewer</h1>
    ${metadataHtml}
    ${fieldsHtml}
    ${lineageHtml}
    ${dataHtml}
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private formatFileSize(bytes: number): string {
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(2)} KB`;
        }
        if (bytes < 1024 * 1024 * 1024) {
            return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        }
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
}
