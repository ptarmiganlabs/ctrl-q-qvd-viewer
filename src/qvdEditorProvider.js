const vscode = require("vscode");
const QvdReader = require("./qvdReader");
const fs = require("fs");
const path = require("path");

/**
 * Provider for QVD file custom editor with tabbed interface and Tabulator
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
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
      ],
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
        case "copyToClipboard":
          // Copy text to clipboard using VS Code API
          await vscode.env.clipboard.writeText(message.text);
          break;
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

      webview.html = this.getHtmlForWebview(result, webview);
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
   * Get nonce for CSP
   */
  getNonce() {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Get Tabulator library inlined as string
   */
  getTabulatorJs() {
    const tabulatorPath = path.join(
      this.context.extensionPath,
      "media",
      "tabulator",
      "tabulator.min.js"
    );
    return fs.readFileSync(tabulatorPath, "utf8");
  }

  /**
   * Get Tabulator CSS inlined as string
   */
  getTabulatorCss() {
    const tabulatorCssPath = path.join(
      this.context.extensionPath,
      "media",
      "tabulator",
      "tabulator.min.css"
    );
    return fs.readFileSync(tabulatorCssPath, "utf8");
  }

  /**
   * Generate HTML for webview with tabbed interface and Tabulator
   */
  getHtmlForWebview(result, webview) {
    const { metadata, data, totalRows, dataError } = result;
    const hasMoreRows = data.length < totalRows;
    const nonce = this.getNonce();

    // Inline Tabulator for easier CSP compliance
    const tabulatorJs = this.getTabulatorJs();
    const tabulatorCss = this.getTabulatorCss();

    // Get the logo URI for the webview
    const logoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "ctrl-q-logo-no-text.png"
      )
    );

    // Prepare schema data for schema tab
    const schemaData =
      metadata && metadata.fields
        ? metadata.fields.map((field) => ({
            name: field.name,
            type: field.type || "",
            extent: field.extent || "",
            noOfSymbols: field.noOfSymbols || 0,
            offset: field.offset || 0,
            length: field.length || 0,
            bitOffset: field.bitOffset || 0,
            bitWidth: field.bitWidth || 0,
            bias: field.bias || 0,
            tags:
              field.tags && field.tags.length > 0 ? field.tags.join(", ") : "",
            comment: field.comment || "",
          }))
        : [];

    // Prepare metadata as key-value pairs for metadata tab
    const metadataKV = metadata
      ? [
          { key: "QV Build No", value: metadata.qvBuildNo || "" },
          { key: "Creator Document", value: metadata.creatorDoc || "" },
          { key: "Created (UTC)", value: metadata.createUtcTime || "" },
          {
            key: "Source Create (UTC)",
            value: metadata.sourceCreateUtcTime || "",
          },
          {
            key: "Source File Time (UTC)",
            value: metadata.sourceFileUtcTime || "",
          },
          { key: "Source File Size", value: metadata.sourceFileSize || "" },
          { key: "Stale Time (UTC)", value: metadata.staleUtcTime || "" },
          { key: "Table Name", value: metadata.tableName || "" },
          { key: "Table Creator", value: metadata.tableCreator || "" },
          { key: "Compression", value: metadata.compression || "" },
          { key: "Record Byte Size", value: metadata.recordByteSize || "" },
          { key: "Total Records", value: totalRows.toString() },
          { key: "Offset", value: metadata.offset.toString() },
          { key: "Length", value: metadata.length.toString() },
          { key: "Comment", value: metadata.comment || "" },
          { key: "Encryption Info", value: metadata.encryptionInfo || "" },
          { key: "Table Tags", value: metadata.tableTags || "" },
          { key: "Profiling Data", value: metadata.profilingData || "" },
        ]
      : [];

    // Prepare lineage data for lineage tab
    const lineageData = [];
    if (metadata && metadata.lineage) {
      const lineageArray = Array.isArray(metadata.lineage)
        ? metadata.lineage
        : metadata.lineage.LineageInfo
        ? Array.isArray(metadata.lineage.LineageInfo)
          ? metadata.lineage.LineageInfo
          : [metadata.lineage.LineageInfo]
        : [];

      lineageArray.forEach((item, index) => {
        lineageData.push({
          index: index + 1,
          discriminator: item.Discriminator || item.discriminator || "",
          statement: item.Statement || item.statement || "",
        });
      });
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${
      webview.cspSource
    };">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ctrl-Q QVD Viewer</title>
    <style>
        /* Tabulator CSS - inlined */
        ${tabulatorCss}
        
        /* Custom styles */
        :root {
            --tab-active-color: var(--vscode-tab-activeBackground, #1e1e1e);
            --tab-inactive-color: var(--vscode-tab-inactiveBackground, #2d2d2d);
            --tab-border-color: var(--vscode-tab-border, #454545);
        }
        
        * {
            box-sizing: border-box;
        }
        
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            margin: 0;
            overflow: hidden;
        }
        
        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        
        .header-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 20px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
        }
        
        h1 {
            font-size: 1.2em;
            margin: 0;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .logo {
            width: 28px;
            height: 28px;
            object-fit: contain;
        }
        
        .header-buttons {
            display: flex;
            gap: 8px;
        }
        
        .header-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 0.9em;
        }
        
        .header-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        /* Tab styles */
        .tab-container {
            display: flex;
            flex-direction: column;
            flex: 1;
            overflow: hidden;
        }
        
        .tabs {
            display: flex;
            background-color: var(--tab-inactive-color);
            border-bottom: 1px solid var(--tab-border-color);
            padding: 0;
            margin: 0;
            flex-shrink: 0;
        }
        
        .tab-button {
            padding: 10px 20px;
            background-color: var(--tab-inactive-color);
            color: var(--vscode-foreground);
            border: none;
            border-right: 1px solid var(--tab-border-color);
            cursor: pointer;
            font-size: 0.9em;
            transition: background-color 0.15s;
        }
        
        .tab-button:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .tab-button.active {
            background-color: var(--tab-active-color);
            border-bottom: 2px solid var(--vscode-focusBorder);
        }
        
        .tab-content {
            display: none;
            flex: 1;
            overflow: hidden;
            padding: 15px;
        }
        
        .tab-content.active {
            display: flex;
            flex-direction: column;
        }
        
        /* Search box styles */
        .search-container {
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 10px;
            flex-shrink: 0;
        }
        
        .search-input {
            flex: 1;
            padding: 6px 10px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-size: 0.9em;
        }
        
        .search-input:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        
        .clear-search-btn {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 6px 12px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 0.85em;
            white-space: nowrap;
        }
        
        .clear-search-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .clear-search-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        /* Table container */
        .table-wrapper {
            flex: 1;
            overflow: auto;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 2px;
        }
        
        /* Info banner */
        .info-banner {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 10px 15px;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }
        
        .load-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 5px 10px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 0.85em;
            margin-left: 8px;
        }
        
        .load-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .load-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        /* Tabulator overrides for VSCode theme */
        .tabulator {
            background-color: var(--vscode-editor-background);
            border: none;
            font-size: var(--vscode-font-size, 13px);
        }
        
        .tabulator .tabulator-header {
            background-color: var(--vscode-editor-selectionBackground);
            border-bottom: 2px solid var(--vscode-panel-border);
        }
        
        .tabulator .tabulator-header .tabulator-col {
            background-color: var(--vscode-editor-selectionBackground);
            border-right: 1px solid var(--vscode-panel-border);
        }
        
        .tabulator .tabulator-header .tabulator-col .tabulator-col-content {
            padding: 8px;
            color: var(--vscode-foreground);
        }
        
        .tabulator .tabulator-tableholder .tabulator-table {
            background-color: var(--vscode-editor-background);
            color: var(--vscode-foreground);
        }
        
        .tabulator-row {
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .tabulator-row.tabulator-row-even {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
        }
        
        .tabulator-row:hover {
            background-color: var(--vscode-list-hoverBackground) !important;
        }
        
        .tabulator-cell {
            border-right: 1px solid var(--vscode-panel-border);
            padding: 6px 8px;
        }
        
        .tabulator-footer {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-top: 2px solid var(--vscode-panel-border);
            color: var(--vscode-foreground);
            padding: 8px;
        }
        
        .tabulator-footer .tabulator-page {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border);
            margin: 0 2px;
            border-radius: 2px;
            padding: 4px 8px;
        }
        
        .tabulator-footer .tabulator-page:not(.disabled):hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .tabulator-footer .tabulator-page.active {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        /* Context menu */
        .context-menu {
            position: fixed;
            background-color: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            border-radius: 2px;
            padding: 4px 0;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        
        .context-menu-item {
            padding: 6px 16px;
            cursor: pointer;
            color: var(--vscode-menu-foreground);
            font-size: 0.9em;
        }
        
        .context-menu-item:hover {
            background-color: var(--vscode-menu-selectionBackground);
            color: var(--vscode-menu-selectionForeground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header-container">
            <h1><img src="${logoUri}" alt="Ctrl-Q Logo" class="logo" />Ctrl-Q QVD File Viewer</h1>
            <div class="header-buttons">
                <button class="header-button" id="about-btn">ℹ️ About</button>
                <button class="header-button" id="settings-btn">⚙️ Settings</button>
            </div>
        </div>
        
        <div class="tab-container">
            <div class="tabs">
                <button class="tab-button active" data-tab="data">📋 Data</button>
                <button class="tab-button" data-tab="schema">🔍 Schema</button>
                <button class="tab-button" data-tab="metadata">ℹ️ File Metadata</button>
                <button class="tab-button" data-tab="lineage">🔗 Lineage</button>
            </div>
            
            <!-- Data Tab -->
            <div id="data-tab" class="tab-content active">
                ${
                  hasMoreRows
                    ? `
                <div class="info-banner">
                    <div>
                        📊 Showing ${data.length.toLocaleString()} of ${totalRows.toLocaleString()} rows 
                        (${((data.length / totalRows) * 100).toFixed(
                          1
                        )}% of file loaded)
                    </div>
                    <div>
                        <button class="load-button" id="loadMoreBtn">
                            Load More (next ${Math.min(
                              data.length,
                              totalRows - data.length
                            ).toLocaleString()} rows)
                        </button>
                        <button class="load-button" id="loadAllBtn">
                            Load All Remaining (${(
                              totalRows - data.length
                            ).toLocaleString()} rows)
                        </button>
                    </div>
                </div>
                `
                    : ""
                }
                ${
                  dataError
                    ? `
                <div class="info-banner" style="border-left-color: var(--vscode-inputValidation-warningBorder);">
                    ⚠️ Unable to load data: ${this.escapeHtml(dataError)}
                </div>
                `
                    : ""
                }
                <div class="search-container">
                    <input type="text" class="search-input" id="data-search" placeholder="🔍 Search in data..." />
                    <button class="clear-search-btn" id="clear-data-search">✕ Clear</button>
                </div>
                <div class="table-wrapper">
                    <div id="data-table"></div>
                </div>
            </div>
            
            <!-- Schema Tab -->
            <div id="schema-tab" class="tab-content">
                <div class="search-container">
                    <input type="text" class="search-input" id="schema-search" placeholder="🔍 Search in schema..." />
                    <button class="clear-search-btn" id="clear-schema-search">✕ Clear</button>
                </div>
                <div class="table-wrapper">
                    <div id="schema-table"></div>
                </div>
            </div>
            
            <!-- Metadata Tab -->
            <div id="metadata-tab" class="tab-content">
                <div class="search-container">
                    <input type="text" class="search-input" id="metadata-search" placeholder="🔍 Search in metadata..." />
                    <button class="clear-search-btn" id="clear-metadata-search">✕ Clear</button>
                </div>
                <div class="table-wrapper">
                    <div id="metadata-table"></div>
                </div>
            </div>
            
            <!-- Lineage Tab -->
            <div id="lineage-tab" class="tab-content">
                ${
                  lineageData.length > 0
                    ? `
                <div class="search-container">
                    <input type="text" class="search-input" id="lineage-search" placeholder="🔍 Search in lineage..." />
                    <button class="clear-search-btn" id="clear-lineage-search">✕ Clear</button>
                </div>
                <div class="table-wrapper">
                    <div id="lineage-table"></div>
                </div>
                `
                    : `
                <div class="info-banner">
                    ℹ️ No lineage information available for this QVD file.
                </div>
                `
                }
            </div>
        </div>
    </div>
    
    <!-- Context Menu -->
    <div id="context-menu" class="context-menu" style="display: none;">
        <div class="context-menu-item" id="copy-cell-btn">📋 Copy Cell Value</div>
    </div>
    
    <script nonce="${nonce}">
        /* Tabulator library - inlined */
        ${tabulatorJs}
    </script>
    
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const totalRowsInFile = ${totalRows};
        const currentLoadedRows = ${data.length};
        
        // Data for tables
        const tableData = ${JSON.stringify(data)};
        const schemaData = ${JSON.stringify(schemaData)};
        const metadataData = ${JSON.stringify(metadataKV)};
        const lineageData = ${JSON.stringify(lineageData)};
        
        let currentContextCell = null;
        let dataTable, schemaTable, metadataTable, lineageTable;
        
        // Initialize tables on load
        window.addEventListener('DOMContentLoaded', function() {
            initializeTables();
            setupEventListeners();
        });
        
        function setupEventListeners() {
            // Tab switching
            document.querySelectorAll('.tab-button').forEach(button => {
                button.addEventListener('click', function(e) {
                    const tabName = this.getAttribute('data-tab');
                    switchTab(e, tabName);
                });
            });
            
            // Search inputs
            const dataSearch = document.getElementById('data-search');
            if (dataSearch) {
                dataSearch.addEventListener('keyup', function() {
                    filterDataTable(this.value);
                });
            }
            
            const schemaSearch = document.getElementById('schema-search');
            if (schemaSearch) {
                schemaSearch.addEventListener('keyup', function() {
                    filterSchemaTable(this.value);
                });
            }
            
            const metadataSearch = document.getElementById('metadata-search');
            if (metadataSearch) {
                metadataSearch.addEventListener('keyup', function() {
                    filterMetadataTable(this.value);
                });
            }
            
            const lineageSearch = document.getElementById('lineage-search');
            if (lineageSearch) {
                lineageSearch.addEventListener('keyup', function() {
                    filterLineageTable(this.value);
                });
            }
            
            // Clear search buttons
            const clearDataSearch = document.getElementById('clear-data-search');
            if (clearDataSearch) {
                clearDataSearch.addEventListener('click', function() {
                    const searchInput = document.getElementById('data-search');
                    if (searchInput) {
                        searchInput.value = '';
                        filterDataTable('');
                    }
                });
            }
            
            const clearSchemaSearch = document.getElementById('clear-schema-search');
            if (clearSchemaSearch) {
                clearSchemaSearch.addEventListener('click', function() {
                    const searchInput = document.getElementById('schema-search');
                    if (searchInput) {
                        searchInput.value = '';
                        filterSchemaTable('');
                    }
                });
            }
            
            const clearMetadataSearch = document.getElementById('clear-metadata-search');
            if (clearMetadataSearch) {
                clearMetadataSearch.addEventListener('click', function() {
                    const searchInput = document.getElementById('metadata-search');
                    if (searchInput) {
                        searchInput.value = '';
                        filterMetadataTable('');
                    }
                });
            }
            
            const clearLineageSearch = document.getElementById('clear-lineage-search');
            if (clearLineageSearch) {
                clearLineageSearch.addEventListener('click', function() {
                    const searchInput = document.getElementById('lineage-search');
                    if (searchInput) {
                        searchInput.value = '';
                        filterLineageTable('');
                    }
                });
            }
            
            // Header buttons
            const aboutBtn = document.getElementById('about-btn');
            if (aboutBtn) {
                aboutBtn.addEventListener('click', openAbout);
            }
            
            const settingsBtn = document.getElementById('settings-btn');
            if (settingsBtn) {
                settingsBtn.addEventListener('click', openSettings);
            }
            
            // Load more buttons
            const loadMoreBtn = document.getElementById('loadMoreBtn');
            if (loadMoreBtn) {
                loadMoreBtn.addEventListener('click', loadMoreRows);
            }
            
            const loadAllBtn = document.getElementById('loadAllBtn');
            if (loadAllBtn) {
                loadAllBtn.addEventListener('click', loadAllRows);
            }
            
            // Context menu
            const copyCellBtn = document.getElementById('copy-cell-btn');
            if (copyCellBtn) {
                copyCellBtn.addEventListener('click', copyCell);
            }
            
            // Hide context menu on click outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.context-menu')) {
                    hideContextMenu();
                }
            });
            
            // Hide context menu on scroll
            document.addEventListener('scroll', hideContextMenu, true);
        }
        
        function initializeTables() {
            // Initialize Data Table
            if (tableData.length > 0) {
                const columns = Object.keys(tableData[0]).map(key => ({
                    title: key,
                    field: key,
                    headerSort: true,
                    headerFilter: false
                }));
                
                dataTable = new Tabulator("#data-table", {
                    data: tableData,
                    columns: columns,
                    layout: "fitDataStretch",
                    pagination: true,
                    paginationSize: 100,
                    paginationSizeSelector: [25, 50, 100, 250, 500],
                    paginationCounter: "rows",
                    movableColumns: true,
                    resizableColumns: true
                });
                
                // Add context menu handler
                dataTable.on("cellContext", function(e, cell){
                    e.preventDefault();
                    showContextMenu(e, cell);
                });
            }
            
            // Initialize Schema Table
            if (schemaData.length > 0) {
                const schemaColumns = [
                    { title: "Name", field: "name", headerSort: true },
                    { title: "Type", field: "type", headerSort: true },
                    { title: "Extent", field: "extent", headerSort: true },
                    { title: "No. of Symbols", field: "noOfSymbols", headerSort: true },
                    { title: "Offset", field: "offset", headerSort: true },
                    { title: "Length", field: "length", headerSort: true },
                    { title: "Bit Offset", field: "bitOffset", headerSort: true },
                    { title: "Bit Width", field: "bitWidth", headerSort: true },
                    { title: "Bias", field: "bias", headerSort: true },
                    { title: "Tags", field: "tags", headerSort: true },
                    { title: "Comment", field: "comment", headerSort: true }
                ];
                
                schemaTable = new Tabulator("#schema-table", {
                    data: schemaData,
                    columns: schemaColumns,
                    layout: "fitDataStretch",
                    pagination: true,
                    paginationSize: 50,
                    paginationSizeSelector: [25, 50, 100],
                    paginationCounter: "rows",
                    resizableColumns: true
                });
                
                schemaTable.on("cellContext", function(e, cell){
                    e.preventDefault();
                    showContextMenu(e, cell);
                });
            }
            
            // Initialize Metadata Table
            if (metadataData.length > 0) {
                const metadataColumns = [
                    { title: "Property", field: "key", headerSort: true, width: 250 },
                    { title: "Value", field: "value", headerSort: false }
                ];
                
                metadataTable = new Tabulator("#metadata-table", {
                    data: metadataData,
                    columns: metadataColumns,
                    layout: "fitDataStretch",
                    pagination: true,
                    paginationSize: 50,
                    paginationSizeSelector: [25, 50, 100],
                    paginationCounter: "rows",
                    resizableColumns: true
                });
                
                metadataTable.on("cellContext", function(e, cell){
                    e.preventDefault();
                    showContextMenu(e, cell);
                });
            }
            
            // Initialize Lineage Table
            if (lineageData.length > 0) {
                const lineageColumns = [
                    { title: "#", field: "index", headerSort: false, width: 60 },
                    { title: "Discriminator", field: "discriminator", headerSort: false, widthGrow: 3 },
                    { title: "Statement", field: "statement", headerSort: false, widthGrow: 2 }
                ];
                
                lineageTable = new Tabulator("#lineage-table", {
                    data: lineageData,
                    columns: lineageColumns,
                    layout: "fitDataStretch",
                    pagination: true,
                    paginationSize: 25,
                    paginationSizeSelector: [10, 25, 50],
                    paginationCounter: "rows",
                    resizableColumns: true
                });
                
                lineageTable.on("cellContext", function(e, cell){
                    e.preventDefault();
                    showContextMenu(e, cell);
                });
            }
        }
        
        // Tab switching
        function switchTab(event, tabName) {
            // Update tab buttons
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            
            // Update tab content
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(tabName + '-tab').classList.add('active');
            
            // Redraw the table to fix any layout issues
            setTimeout(() => {
                if (tabName === 'data' && dataTable) dataTable.redraw();
                if (tabName === 'schema' && schemaTable) schemaTable.redraw();
                if (tabName === 'metadata' && metadataTable) metadataTable.redraw();
                if (tabName === 'lineage' && lineageTable) lineageTable.redraw();
            }, 10);
        }
        
        // Filter functions
        function filterDataTable(searchText) {
            if (dataTable) {
                if (searchText) {
                    // Use custom filter function for OR logic across all columns
                    dataTable.setFilter(function(data) {
                        const search = searchText.toLowerCase();
                        return Object.values(data).some(value => 
                            String(value).toLowerCase().includes(search)
                        );
                    });
                } else {
                    dataTable.clearFilter();
                }
            }
        }
        
        function filterSchemaTable(searchText) {
            if (schemaTable) {
                if (searchText) {
                    const search = searchText.toLowerCase();
                    schemaTable.setFilter(function(data) {
                        return (
                            String(data.name || '').toLowerCase().includes(search) ||
                            String(data.type || '').toLowerCase().includes(search) ||
                            String(data.tags || '').toLowerCase().includes(search) ||
                            String(data.comment || '').toLowerCase().includes(search)
                        );
                    });
                } else {
                    schemaTable.clearFilter();
                }
            }
        }
        
        function filterMetadataTable(searchText) {
            if (metadataTable) {
                if (searchText) {
                    const search = searchText.toLowerCase();
                    metadataTable.setFilter(function(data) {
                        return (
                            String(data.key || '').toLowerCase().includes(search) ||
                            String(data.value || '').toLowerCase().includes(search)
                        );
                    });
                } else {
                    metadataTable.clearFilter();
                }
            }
        }
        
        function filterLineageTable(searchText) {
            if (lineageTable) {
                if (searchText) {
                    const search = searchText.toLowerCase();
                    lineageTable.setFilter(function(data) {
                        return (
                            String(data.discriminator || '').toLowerCase().includes(search) ||
                            String(data.statement || '').toLowerCase().includes(search)
                        );
                    });
                } else {
                    lineageTable.clearFilter();
                }
            }
        }
        
        // Message handlers
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
        
        // Context menu handlers
        function showContextMenu(e, cell) {
            e.preventDefault();
            currentContextCell = cell;
            const menu = document.getElementById('context-menu');
            menu.style.display = 'block';
            menu.style.left = e.pageX + 'px';
            menu.style.top = e.pageY + 'px';
        }
        
        function hideContextMenu() {
            document.getElementById('context-menu').style.display = 'none';
            currentContextCell = null;
        }
        
        function copyCell() {
            if (currentContextCell) {
                const value = currentContextCell.getValue();
                vscode.postMessage({ 
                    command: 'copyToClipboard',
                    text: String(value)
                });
            }
            hideContextMenu();
        }
    </script>
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
