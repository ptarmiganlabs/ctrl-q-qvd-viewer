const vscode = require("vscode");
const QvdReader = require("./qvdReader");

/**
 * Provider for QVD file custom editor
 */
class QvdEditorProvider {
  static viewType = "ctrl-q-qvd-viewer.qvdEditor";

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
      enableScripts: true,
    };

    // Get the max rows configuration
    const config = vscode.workspace.getConfiguration("ctrl-q-qvd-viewer");
    const maxRows = config.get("maxPreviewRows", 5000);

    // Read and display QVD content
    await this.updateWebview(
      document.uri.fsPath,
      webviewPanel.webview,
      maxRows
    );

    // Store file path and webview for later use
    const filePath = document.uri.fsPath;

    // Handle messages from webview
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "refresh":
          await this.updateWebview(filePath, webviewPanel.webview, maxRows);
          break;
        case "openAbout":
          vscode.commands.executeCommand("ctrl-q-qvd-viewer.about");
          break;
        case "openSettings":
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "ctrl-q-qvd-viewer"
          );
          break;
        case "loadMore":
          // Load more rows - double the current amount or load all if requested
          const currentRows = message.currentRows || maxRows;
          const newMaxRows = message.loadAll
            ? 0
            : Math.min(currentRows * 2, 100000);
          await this.updateWebview(filePath, webviewPanel.webview, newMaxRows);
          break;

        // Future: Server-side pagination support
        // When qvd4js supports streaming/lazy loading, add this handler:
        // case 'loadPage':
        //     const pageData = await this.qvdReader.readPage(
        //         filePath,
        //         message.page,
        //         message.pageSize
        //     );
        //     webviewPanel.webview.postMessage({
        //         command: 'pageData',
        //         data: pageData
        //     });
        //     break;
      }
    });
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
    const { metadata, data, columns, totalRows, dataError } = result;
    const hasMoreRows = data.length < totalRows;

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ctrl-Q QVD Viewer</title>
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
                
                .header-buttons {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                
                h1 {
                    font-size: 1.5em;
                    margin: 0;
                    color: var(--vscode-foreground);
                }
                
                .settings-button, .load-all-button, .about-button {
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
                
                .about-button {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
                
                .settings-button:hover, .load-all-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .about-button:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }
                
                .load-all-button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
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
                    margin-bottom: 30px;
                    border: 1px solid var(--vscode-panel-border);
                }
                
                .metadata-item {
                    margin: 8px 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .metadata-label {
                    font-weight: bold;
                    display: inline-block;
                    min-width: 200px;
                    color: var(--vscode-foreground);
                    flex-shrink: 0;
                }
                
                .metadata-value {
                    color: var(--vscode-descriptionForeground);
                    flex: 1;
                }
                
                .copy-btn {
                    background-color: transparent;
                    border: 1px solid var(--vscode-button-border);
                    color: var(--vscode-button-foreground);
                    padding: 4px 8px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 0.85em;
                    opacity: 0.7;
                    transition: opacity 0.2s, background-color 0.2s;
                    flex-shrink: 0;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }
                
                .copy-btn:hover {
                    opacity: 1;
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }
                
                .copy-btn.copied {
                    background-color: var(--vscode-button-background);
                    opacity: 1;
                }
                
                .collapsible-section {
                    margin: 15px 0;
                }
                
                .collapsible-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    padding: 10px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 4px;
                    border: 1px solid var(--vscode-panel-border);
                    user-select: none;
                }
                
                .collapsible-header:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                
                .collapsible-icon {
                    transition: transform 0.2s;
                    font-size: 0.8em;
                }
                
                .collapsible-icon.expanded {
                    transform: rotate(90deg);
                }
                
                .collapsible-content {
                    display: none;
                    padding: 10px;
                    margin-top: 5px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 4px;
                    border: 1px solid var(--vscode-panel-border);
                }
                
                .collapsible-content.expanded {
                    display: block;
                }
                
                .fields-section {
                    margin-top: 30px;
                    margin-bottom: 40px;
                    padding-bottom: 30px;
                    border-bottom: 2px solid var(--vscode-panel-border);
                }
                
                .data-section {
                    margin-top: 40px;
                    padding-top: 20px;
                    border-top: 3px solid var(--vscode-panel-border);
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
                
                /* Pagination styles */
                .pagination-controls {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    margin: 20px 0;
                    padding: 15px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 4px;
                    flex-wrap: wrap;
                }
                
                .pagination-info {
                    color: var(--vscode-foreground);
                    font-size: 0.9em;
                }
                
                .pagination-buttons {
                    display: flex;
                    gap: 5px;
                    align-items: center;
                }
                
                .pagination-btn {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 10px;
                    border-radius: 4px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 32px;
                    height: 28px;
                }
                
                .pagination-btn:hover:not(:disabled) {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .pagination-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .pagination-page-info {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    color: var(--vscode-foreground);
                    font-size: 0.9em;
                }
                
                .page-input {
                    width: 50px;
                    padding: 4px 8px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    text-align: center;
                }
                
                .pagination-size {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-left: auto;
                }
                
                .pagination-size label {
                    color: var(--vscode-foreground);
                    font-size: 0.9em;
                }
                
                .page-size-select {
                    padding: 4px 8px;
                    background-color: var(--vscode-dropdown-background);
                    color: var(--vscode-dropdown-foreground);
                    border: 1px solid var(--vscode-dropdown-border);
                    border-radius: 4px;
                    cursor: pointer;
                }
                
                .codicon {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                }
                
                .codicon-chevron-left::before {
                    content: '‹';
                    font-size: 20px;
                    font-weight: bold;
                }
                
                .codicon-chevron-right::before {
                    content: '›';
                    font-size: 20px;
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <div class="header-container">
                <h1>Ctrl-Q QVD File Viewer</h1>
                <div class="header-buttons">
                    <button class="about-button" onclick="openAbout()">
                        ℹ️ About
                    </button>
                    <button class="settings-button" onclick="openSettings()">
                        <svg class="settings-icon" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
                            <path d="M14 7.5a1.5 1.5 0 0 1-1.5 1.5h-.38a.5.5 0 0 0-.43.75l.19.32a1.5 1.5 0 0 1-2.3 1.94l-.31-.19a.5.5 0 0 0-.75.43v.38a1.5 1.5 0 0 1-3 0v-.38a.5.5 0 0 0-.75-.43l-.31.19a1.5 1.5 0 0 1-2.3-1.94l.19-.32a.5.5 0 0 0-.43-.75H2.5A1.5 1.5 0 0 1 1 7.5v-1A1.5 1.5 0 0 1 2.5 5h.38a.5.5 0 0 0 .43-.75l-.19-.32a1.5 1.5 0 0 1 2.3-1.94l.31.19a.5.5 0 0 0 .75-.43V1.5a1.5 1.5 0 0 1 3 0v.38a.5.5 0 0 0 .75.43l.31-.19a1.5 1.5 0 0 1 2.3 1.94l-.19.32a.5.5 0 0 0 .43.75h.38A1.5 1.5 0 0 1 14 6.5v1z"/>
                        </svg>
                        Settings
                    </button>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                const totalRowsInFile = ${totalRows};
                const currentLoadedRows = ${data.length};
                
                function openAbout() {
                    vscode.postMessage({ command: 'openAbout' });
                }
                
                function openSettings() {
                    vscode.postMessage({ command: 'openSettings' });
                }
                
                function loadMoreRows() {
                    const btn = document.getElementById('loadMoreBtn');
                    if (btn) {
                        btn.disabled = true;
                        btn.textContent = 'Loading...';
                    }
                    vscode.postMessage({ 
                        command: 'loadMore',
                        currentRows: currentLoadedRows,
                        loadAll: false
                    });
                }
                
                function loadAllRows() {
                    const btn = document.getElementById('loadAllBtn');
                    if (btn) {
                        btn.disabled = true;
                        btn.textContent = 'Loading...';
                    }
                    vscode.postMessage({ 
                        command: 'loadMore',
                        currentRows: currentLoadedRows,
                        loadAll: true
                    });
                }
                
                function copyToClipboard(text, buttonId) {
                    navigator.clipboard.writeText(text).then(() => {
                        const btn = document.getElementById(buttonId);
                        if (btn) {
                            const originalText = btn.innerHTML;
                            btn.innerHTML = '✓ Copied';
                            btn.classList.add('copied');
                            setTimeout(() => {
                                btn.innerHTML = originalText;
                                btn.classList.remove('copied');
                            }, 2000);
                        }
                    }).catch(err => {
                        console.error('Failed to copy:', err);
                    });
                }
                
                function toggleCollapsible(id) {
                    const content = document.getElementById(id);
                    const icon = document.getElementById(id + '-icon');
                    if (content && icon) {
                        content.classList.toggle('expanded');
                        icon.classList.toggle('expanded');
                    }
                }
            </script>
            
            <div class="metadata">
                <h2 style="margin-top: 0; border-bottom: 2px solid var(--vscode-panel-border); padding-bottom: 10px;">📋 File Metadata</h2>
                ${
                  metadata
                    ? `
                <div class="metadata-item">
                    <span class="metadata-label">QV Build No:</span>
                    <span class="metadata-value">${
                      this.escapeHtml(metadata.qvBuildNo) || "(empty)"
                    }</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Creator Document:</span>
                    <span class="metadata-value">${
                      this.escapeHtml(metadata.creatorDoc) || "(empty)"
                    }</span>
                    ${
                      metadata.creatorDoc
                        ? `<button class="copy-btn" id="copy-creator-doc" onclick="copyToClipboard('${this.escapeHtml(
                            metadata.creatorDoc
                          ).replace(
                            /'/g,
                            "\\'"
                          )}', 'copy-creator-doc')">📋 Copy</button>`
                        : ""
                    }
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Created (UTC):</span>
                    <span class="metadata-value">${
                      this.escapeHtml(metadata.createUtcTime) || "(empty)"
                    }</span>
                    ${
                      metadata.createUtcTime
                        ? `<button class="copy-btn" id="copy-create-time" onclick="copyToClipboard('${this.escapeHtml(
                            metadata.createUtcTime
                          )}', 'copy-create-time')">📋 Copy</button>`
                        : ""
                    }
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Source Create (UTC):</span>
                    <span class="metadata-value">${
                      this.escapeHtml(metadata.sourceCreateUtcTime) || "(empty)"
                    }</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Source File Time (UTC):</span>
                    <span class="metadata-value">${
                      this.escapeHtml(metadata.sourceFileUtcTime) || "(empty)"
                    }</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Source File Size:</span>
                    <span class="metadata-value">${
                      this.escapeHtml(metadata.sourceFileSize) || "(empty)"
                    }</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Stale Time (UTC):</span>
                    <span class="metadata-value">${
                      this.escapeHtml(metadata.staleUtcTime) || "(empty)"
                    }</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Table Name:</span>
                    <span class="metadata-value">${
                      this.escapeHtml(metadata.tableName) || "(empty)"
                    }</span>
                    ${
                      metadata.tableName
                        ? `<button class="copy-btn" id="copy-table-name" onclick="copyToClipboard('${this.escapeHtml(
                            metadata.tableName
                          ).replace(
                            /'/g,
                            "\\'"
                          )}', 'copy-table-name')">📋 Copy</button>`
                        : ""
                    }
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Table Creator:</span>
                    <span class="metadata-value">${
                      this.escapeHtml(metadata.tableCreator) || "(empty)"
                    }</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Compression:</span>
                    <span class="metadata-value">${
                      this.escapeHtml(metadata.compression) || "(empty)"
                    }</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Record Byte Size:</span>
                    <span class="metadata-value">${
                      this.escapeHtml(metadata.recordByteSize) || "(empty)"
                    }</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Total Records:</span>
                    <span class="metadata-value">${totalRows}</span>
                    <button class="copy-btn" id="copy-total-records" onclick="copyToClipboard('${totalRows}', 'copy-total-records')">📋 Copy</button>
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
                    <span class="metadata-value">${
                      this.escapeHtml(metadata.comment) || "(empty)"
                    }</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Encryption Info:</span>
                    <span class="metadata-value">${
                      this.escapeHtml(metadata.encryptionInfo) || "(empty)"
                    }</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Table Tags:</span>
                    <span class="metadata-value">${
                      this.escapeHtml(metadata.tableTags) || "(empty)"
                    }</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Profiling Data:</span>
                    <span class="metadata-value">${
                      this.escapeHtml(metadata.profilingData) || "(empty)"
                    }</span>
                </div>
                
                ${
                  metadata.lineage && metadata.lineage.LineageInfo
                    ? `
                <div class="collapsible-section">
                    <div class="collapsible-header" onclick="toggleCollapsible('lineage-content')">
                        <span class="collapsible-icon" id="lineage-content-icon">▶</span>
                        <strong>Lineage Information</strong>
                        <span style="color: var(--vscode-descriptionForeground); margin-left: auto;">${
                          Array.isArray(metadata.lineage.LineageInfo)
                            ? metadata.lineage.LineageInfo.length
                            : 1
                        } item(s)</span>
                    </div>
                    <div class="collapsible-content" id="lineage-content">
                        ${
                          Array.isArray(metadata.lineage.LineageInfo)
                            ? metadata.lineage.LineageInfo.map(
                                (lineageItem, index) => `
                            <div style="margin: 10px 0; padding: 10px; background-color: var(--vscode-editor-background); border-radius: 4px;">
                                <strong>Lineage Item ${index + 1}:</strong>
                                <div style="margin-left: 15px; margin-top: 5px;">
                                    ${
                                      lineageItem.Discriminator
                                        ? `<div><strong>Discriminator:</strong> ${this.escapeHtml(
                                            lineageItem.Discriminator
                                          )}</div>`
                                        : ""
                                    }
                                    ${
                                      lineageItem.Statement
                                        ? `<div><strong>Statement:</strong> <pre style="white-space: pre-wrap; margin: 5px 0; padding: 8px; background-color: var(--vscode-textCodeBlock-background); border-radius: 3px; overflow-x: auto;">${this.escapeHtml(
                                            lineageItem.Statement
                                          )}</pre></div>`
                                        : ""
                                    }
                                </div>
                            </div>
                            `
                              ).join("")
                            : `
                            <div style="margin: 10px 0; padding: 10px; background-color: var(--vscode-editor-background); border-radius: 4px;">
                                ${
                                  metadata.lineage.LineageInfo.Discriminator
                                    ? `<div><strong>Discriminator:</strong> ${this.escapeHtml(
                                        metadata.lineage.LineageInfo
                                          .Discriminator
                                      )}</div>`
                                    : ""
                                }
                                ${
                                  metadata.lineage.LineageInfo.Statement
                                    ? `<div><strong>Statement:</strong> <pre style="white-space: pre-wrap; margin: 5px 0; padding: 8px; background-color: var(--vscode-textCodeBlock-background); border-radius: 3px; overflow-x: auto;">${this.escapeHtml(
                                        metadata.lineage.LineageInfo.Statement
                                      )}</pre></div>`
                                    : ""
                                }
                            </div>
                            `
                        }
                    </div>
                </div>
                `
                    : ""
                }
                `
                    : "<p>No metadata available</p>"
                }
            </div>
            
            <div class="fields-section">
                <h2 style="border-bottom: 2px solid var(--vscode-panel-border); padding-bottom: 10px;">🔍 Field Metadata (${
                  metadata && metadata.fields ? metadata.fields.length : 0
                } fields)</h2>
                ${
                  metadata && metadata.fields && metadata.fields.length > 0
                    ? `
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Field Property</th>
                                ${metadata.fields
                                  .map(
                                    (field) =>
                                      `<th>${this.escapeHtml(field.name)}</th>`
                                  )
                                  .join("")}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="field-metadata-row"><strong>Type</strong></td>
                                ${metadata.fields
                                  .map(
                                    (field) =>
                                      `<td>${
                                        this.escapeHtml(field.type) || "(empty)"
                                      }</td>`
                                  )
                                  .join("")}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Extent</strong></td>
                                ${metadata.fields
                                  .map(
                                    (field) =>
                                      `<td>${
                                        this.escapeHtml(field.extent) ||
                                        "(empty)"
                                      }</td>`
                                  )
                                  .join("")}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Number of Symbols</strong></td>
                                ${metadata.fields
                                  .map(
                                    (field) => `<td>${field.noOfSymbols}</td>`
                                  )
                                  .join("")}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Offset</strong></td>
                                ${metadata.fields
                                  .map((field) => `<td>${field.offset}</td>`)
                                  .join("")}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Length</strong></td>
                                ${metadata.fields
                                  .map((field) => `<td>${field.length}</td>`)
                                  .join("")}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Bit Offset</strong></td>
                                ${metadata.fields
                                  .map((field) => `<td>${field.bitOffset}</td>`)
                                  .join("")}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Bit Width</strong></td>
                                ${metadata.fields
                                  .map((field) => `<td>${field.bitWidth}</td>`)
                                  .join("")}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Bias</strong></td>
                                ${metadata.fields
                                  .map((field) => `<td>${field.bias}</td>`)
                                  .join("")}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Tags</strong></td>
                                ${metadata.fields
                                  .map((field) => {
                                    const tagsDisplay =
                                      field.tags && field.tags.length > 0
                                        ? field.tags
                                            .map((t) => this.escapeHtml(t))
                                            .join(", ")
                                        : "(empty)";
                                    return `<td>${tagsDisplay}</td>`;
                                  })
                                  .join("")}
                            </tr>
                            <tr>
                                <td class="field-metadata-row"><strong>Comment</strong></td>
                                ${metadata.fields
                                  .map(
                                    (field) =>
                                      `<td>${
                                        this.escapeHtml(field.comment) ||
                                        "(empty)"
                                      }</td>`
                                  )
                                  .join("")}
                            </tr>
                        </tbody>
                    </table>
                </div>
                `
                    : "<p>No field metadata available</p>"
                }
            </div>
            
            <div class="data-section">
                <h2 style="margin-top: 0; padding-bottom: 15px; border-bottom: 2px solid var(--vscode-panel-border);">📊 Data Preview</h2>
                
                ${
                  hasMoreRows
                    ? `
                    <div class="info-banner" style="margin: 15px 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                📊 Showing ${data.length.toLocaleString()} of ${totalRows.toLocaleString()} rows 
                                (${((data.length / totalRows) * 100).toFixed(
                                  1
                                )}% of file loaded)
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <button class="load-all-button" onclick="loadMoreRows()" id="loadMoreBtn">
                                    Load More (next ${Math.min(
                                      data.length,
                                      totalRows - data.length
                                    ).toLocaleString()} rows)
                                </button>
                                <button class="load-all-button" onclick="loadAllRows()" id="loadAllBtn">
                                    Load All Remaining (${(
                                      totalRows - data.length
                                    ).toLocaleString()} rows)
                                </button>
                            </div>
                        </div>
                    </div>
                    `
                    : ""
                }
                
                ${
                  dataError
                    ? `
                    <div class="info-banner" style="background-color: var(--vscode-inputValidation-warningBackground); border-left-color: var(--vscode-inputValidation-warningBorder);">
                        ⚠️ Unable to load data: ${this.escapeHtml(dataError)}
                    </div>
                `
                    : data.length === 0
                    ? `
                    <div class="info-banner" style="background-color: var(--vscode-inputValidation-infoBackground); border-left-color: var(--vscode-inputValidation-infoBorder);">
                        ℹ️ No data loaded. The file may be empty or data could not be read.
                    </div>
                `
                    : ""
                }
                
                ${
                  data.length > 0
                    ? `
                    <!-- Pagination controls will be rendered here -->
                    <div id="pagination-container"></div>
                    
                    <!-- Table will be rendered here -->
                    <div class="table-container" id="data-table-container"></div>
                    
                    <script>
                        // Inline pagination implementation for webview
                        (function() {
                            const tableData = ${JSON.stringify(data)};
                            const tableColumns = ${JSON.stringify(columns)};
                            
                            class TablePagination {
                                constructor(options) {
                                    this.data = options.data || [];
                                    this.columns = options.columns || [];
                                    this.pageSize = options.pageSize || 100;
                                    this.currentPage = 0;
                                    this.totalRows = this.data.length; // Use actual data length for pagination
                                    this.totalRowsInFile = options.totalRowsInFile || this.data.length; // Total in file for display
                                    
                                    this.tableContainer = document.getElementById(options.tableContainerId);
                                    this.paginationContainer = document.getElementById(options.paginationContainerId);
                                    
                                    this.render();
                                }
                                
                                get totalPages() {
                                    return Math.ceil(this.totalRows / this.pageSize);
                                }
                                
                                getCurrentPageData() {
                                    const start = this.currentPage * this.pageSize;
                                    const end = start + this.pageSize;
                                    return this.data.slice(start, end);
                                }
                                
                                goToPage(page) {
                                    const newPage = Math.max(0, Math.min(page, this.totalPages - 1));
                                    if (newPage === this.currentPage) return;
                                    this.currentPage = newPage;
                                    this.render();
                                }
                                
                                render() {
                                    this.renderTable();
                                    this.renderPaginationControls();
                                }
                                
                                renderTable() {
                                    if (!this.tableContainer) return;
                                    
                                    const pageData = this.getCurrentPageData();
                                    let html = '<table class="qvd-data-table">';
                                    
                                    html += '<thead><tr>';
                                    this.columns.forEach(col => {
                                        html += '<th>' + this.escapeHtml(col) + '</th>';
                                    });
                                    html += '</tr></thead>';
                                    
                                    html += '<tbody>';
                                    pageData.forEach(row => {
                                        html += '<tr>';
                                        this.columns.forEach(col => {
                                            const value = row[col] !== null && row[col] !== undefined ? row[col] : '';
                                            html += '<td>' + this.escapeHtml(String(value)) + '</td>';
                                        });
                                        html += '</tr>';
                                    });
                                    html += '</tbody></table>';
                                    
                                    this.tableContainer.innerHTML = html;
                                }
                                
                                renderPaginationControls() {
                                    if (!this.paginationContainer) return;
                                    
                                    const startRow = this.currentPage * this.pageSize + 1;
                                    const endRow = Math.min((this.currentPage + 1) * this.pageSize, this.totalRows);
                                    
                                    let html = '<div class="pagination-controls">';
                                    
                                    html += '<div class="pagination-info">';
                                    html += 'Showing ' + startRow.toLocaleString() + ' - ' + endRow.toLocaleString() + ' of ' + this.totalRows.toLocaleString() + ' loaded rows';
                                    if (this.totalRows < this.totalRowsInFile) {
                                        html += ' (total in file: ' + this.totalRowsInFile.toLocaleString() + ')';
                                    }
                                    html += '</div>';
                                    
                                    html += '<div class="pagination-buttons">';
                                    
                                    const firstDisabled = this.currentPage === 0 ? ' disabled' : '';
                                    const lastDisabled = this.currentPage >= this.totalPages - 1 ? ' disabled' : '';
                                    
                                    html += '<button class="pagination-btn" data-action="first"' + firstDisabled + '>';
                                    html += '<span class="codicon codicon-chevron-left"></span><span class="codicon codicon-chevron-left"></span>';
                                    html += '</button>';
                                    
                                    html += '<button class="pagination-btn" data-action="prev"' + firstDisabled + '>';
                                    html += '<span class="codicon codicon-chevron-left"></span>';
                                    html += '</button>';
                                    
                                    html += '<div class="pagination-page-info">';
                                    html += 'Page <input type="number" class="page-input" min="1" max="' + this.totalPages + '" value="' + (this.currentPage + 1) + '"> of ' + this.totalPages;
                                    html += '</div>';
                                    
                                    html += '<button class="pagination-btn" data-action="next"' + lastDisabled + '>';
                                    html += '<span class="codicon codicon-chevron-right"></span>';
                                    html += '</button>';
                                    
                                    html += '<button class="pagination-btn" data-action="last"' + lastDisabled + '>';
                                    html += '<span class="codicon codicon-chevron-right"></span><span class="codicon codicon-chevron-right"></span>';
                                    html += '</button>';
                                    
                                    html += '</div>';
                                    
                                    html += '<div class="pagination-size">';
                                    html += '<label for="page-size-select">Rows per page:</label>';
                                    html += '<select id="page-size-select" class="page-size-select">';
                                    [25, 50, 100, 250, 500].forEach(size => {
                                        const selected = this.pageSize === size ? ' selected' : '';
                                        html += '<option value="' + size + '"' + selected + '>' + size + '</option>';
                                    });
                                    html += '</select>';
                                    html += '</div>';
                                    
                                    html += '</div>';
                                    
                                    this.paginationContainer.innerHTML = html;
                                    this.attachPaginationEvents();
                                }
                                
                                attachPaginationEvents() {
                                    if (!this.paginationContainer) return;
                                    
                                    const buttons = this.paginationContainer.querySelectorAll('.pagination-btn');
                                    buttons.forEach(btn => {
                                        btn.addEventListener('click', (e) => {
                                            const action = e.currentTarget.dataset.action;
                                            switch (action) {
                                                case 'first':
                                                    this.goToPage(0);
                                                    break;
                                                case 'prev':
                                                    this.goToPage(this.currentPage - 1);
                                                    break;
                                                case 'next':
                                                    this.goToPage(this.currentPage + 1);
                                                    break;
                                                case 'last':
                                                    this.goToPage(this.totalPages - 1);
                                                    break;
                                            }
                                        });
                                    });
                                    
                                    const pageInput = this.paginationContainer.querySelector('.page-input');
                                    if (pageInput) {
                                        pageInput.addEventListener('change', (e) => {
                                            const page = parseInt(e.target.value) - 1;
                                            this.goToPage(page);
                                        });
                                        
                                        pageInput.addEventListener('keypress', (e) => {
                                            if (e.key === 'Enter') {
                                                const page = parseInt(e.target.value) - 1;
                                                this.goToPage(page);
                                            }
                                        });
                                    }
                                    
                                    const sizeSelect = this.paginationContainer.querySelector('.page-size-select');
                                    if (sizeSelect) {
                                        sizeSelect.addEventListener('change', (e) => {
                                            this.pageSize = parseInt(e.target.value);
                                            this.currentPage = 0;
                                            this.render();
                                        });
                                    }
                                }
                                
                                escapeHtml(text) {
                                    const div = document.createElement('div');
                                    div.textContent = text;
                                    return div.innerHTML;
                                }
                            }
                            
                            // Initialize pagination
                            new TablePagination({
                                data: tableData,
                                columns: tableColumns,
                                totalRowsInFile: ${totalRows},
                                pageSize: 100,
                                tableContainerId: 'data-table-container',
                                paginationContainerId: 'pagination-container'
                            });
                        })();
                    </script>
                `
                    : ""
                }
            </div>
        </body>
        </html>`;
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return String(text).replace(/[&<>"']/g, (m) => map[m]);
  }
}

module.exports = QvdEditorProvider;
