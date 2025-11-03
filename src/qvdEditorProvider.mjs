import * as vscode from "vscode";
import QvdReader from "./qvdReader.mjs";
import DataExporter from "./exporters/index.mjs";
import { profileFields, generateQvsScript, shouldWarnLargeFile } from "./qvdProfiler.mjs";
import { readFileSync, writeFileSync } from "fs";
import { basename, dirname, extname, join } from "path";

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
        case "exportData":
          // Export data to selected format
          try {
            const result = await this.qvdReader.read(filePath, 0); // Read all data
            if (result.error) {
              vscode.window.showErrorMessage(
                `Failed to read QVD for export: ${result.error}`
              );
              break;
            }

            let maxRows = 0; // Default: export all rows

            // For Qlik inline script and PostgreSQL, ask for row count
            if (message.format === "qlik" || message.format === "postgres") {
              const totalRows = result.data.length;
              const formatLabel =
                message.format === "qlik" ? "Qlik Inline Script" : "PostgreSQL";
              const rowCountInput = await vscode.window.showQuickPick(
                [
                  { label: "100 rows", value: "100" },
                  { label: "500 rows", value: "500" },
                  { label: "1,000 rows", value: "1000" },
                  { label: "5,000 rows", value: "5000" },
                  { label: "10,000 rows", value: "10000" },
                  {
                    label: `All rows (${totalRows.toLocaleString()})`,
                    value: "0",
                  },
                  { label: "Custom...", value: "custom" },
                ],
                {
                  placeHolder: "Select number of rows to export",
                  title: `${formatLabel} Export`,
                }
              );

              if (!rowCountInput) {
                // User cancelled
                break;
              }

              if (rowCountInput.value === "custom") {
                // Ask for custom value
                const customInput = await vscode.window.showInputBox({
                  prompt: "Enter number of rows to export",
                  placeHolder: "e.g., 500",
                  validateInput: (value) => {
                    const num = parseInt(value, 10);
                    if (isNaN(num) || num < 1) {
                      return "Please enter a positive integer";
                    }
                    if (num > totalRows) {
                      return `Value cannot exceed total rows (${totalRows})`;
                    }
                    return null;
                  },
                });

                if (!customInput) {
                  // User cancelled
                  break;
                }

                maxRows = parseInt(customInput, 10);
              } else {
                maxRows = parseInt(rowCountInput.value, 10);
              }
            }

            const fileName = basename(filePath, extname(filePath));
            const workspaceFolder =
              vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const savedPath = await DataExporter.exportData(
              result.data,
              message.format,
              fileName,
              vscode,
              workspaceFolder,
              maxRows
            );

            if (savedPath) {
              const action = await vscode.window.showInformationMessage(
                `Data exported to ${savedPath}`,
                "Open Folder"
              );

              if (action === "Open Folder") {
                const folderPath = dirname(savedPath);
                vscode.commands.executeCommand(
                  "revealFileInOS",
                  vscode.Uri.file(folderPath)
                );
              }
            }
          } catch (error) {
            vscode.window.showErrorMessage(`Export failed: ${error.message}`);
          }
          break;
        case "profileFields":
          // Profile selected fields and return distribution data
          try {
            const result = await this.qvdReader.read(filePath, 0); // Read all data
            if (result.error) {
              webviewPanel.webview.postMessage({
                command: "profilingError",
                error: `Failed to read QVD: ${result.error}`,
              });
              break;
            }

            const profilingResults = profileFields(
              result.data,
              message.fieldNames,
              message.maxUniqueValues || 1000
            );

            webviewPanel.webview.postMessage({
              command: "profilingResults",
              results: profilingResults,
            });
          } catch (error) {
            webviewPanel.webview.postMessage({
              command: "profilingError",
              error: `Profiling failed: ${error.message}`,
            });
          }
          break;
        case "exportProfilingQvs":
          // Export profiling data as QVS script
          try {
            const fileName = basename(filePath, extname(filePath));
            const defaultName = `${fileName}_profiling.qvs`;
            
            // Ask for delimiter
            const delimiterChoice = await vscode.window.showQuickPick(
              [
                { label: "Tab (\\t)", value: "tab", description: "Good general purpose delimiter" },
                { label: "Pipe (|)", value: "pipe", description: "Recommended when data contains commas" },
                { label: "Comma (,)", value: "comma", description: "Standard CSV-style" },
                { label: "Semicolon (;)", value: "semicolon", description: "Alternative to comma" },
              ],
              {
                placeHolder: "Select delimiter for QVS script",
                title: "QVS Export - Delimiter"
              }
            );
            
            if (!delimiterChoice) {
              // User cancelled
              break;
            }
            
            // Ask for max rows per field
            const maxRowsChoice = await vscode.window.showQuickPick(
              [
                { label: "Top 20 values", value: "20" },
                { label: "Top 100 values", value: "100" },
                { label: "Top 1,000 values", value: "1000" },
                { label: "Top 10,000 values", value: "10000" },
                { label: "All values (complete)", value: "0" },
              ],
              {
                placeHolder: "Select how many values to export per field",
                title: "QVS Export - Rows per Field"
              }
            );
            
            if (!maxRowsChoice) {
              // User cancelled
              break;
            }
            
            const saveUri = await vscode.window.showSaveDialog({
              defaultUri: vscode.Uri.file(
                join(dirname(filePath), defaultName)
              ),
              filters: {
                "Qlik Script Files": ["qvs"],
                "All Files": ["*"],
              },
            });

            if (saveUri) {
              const qvsContent = generateQvsScript(
                message.profilingResults,
                basename(filePath),
                {
                  delimiter: delimiterChoice.value,
                  maxRows: parseInt(maxRowsChoice.value, 10)
                }
              );
              writeFileSync(saveUri.fsPath, qvsContent, "utf8");
              
              const action = await vscode.window.showInformationMessage(
                `Profiling script exported to ${basename(saveUri.fsPath)}`,
                "Open Folder"
              );

              if (action === "Open Folder") {
                const folderPath = dirname(saveUri.fsPath);
                vscode.commands.executeCommand(
                  "revealFileInOS",
                  vscode.Uri.file(folderPath)
                );
              }
            }
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to export profiling script: ${error.message}`
            );
          }
          break;
        case "openProfilingInWindow":
          // Open profiling results in a new editor window
          try {
            const fieldResult = message.fieldResult;
            const displayType = message.displayType || 'markdown';
            const fileName = basename(filePath, extname(filePath));
            
            if (displayType === 'markdown') {
              // Create markdown content with profiling results
              let markdownContent = `# Profiling: ${fieldResult.fieldName}\n\n`;
              markdownContent += `**Source:** ${basename(filePath)}\n\n`;
              markdownContent += `## Statistics\n\n`;
              markdownContent += `- **Total Rows:** ${fieldResult.totalRows.toLocaleString()}\n`;
              markdownContent += `- **Unique Values:** ${fieldResult.uniqueValues.toLocaleString()}\n`;
              markdownContent += `- **NULL/Empty:** ${fieldResult.nullCount.toLocaleString()}\n`;
              
              if (fieldResult.truncated) {
                markdownContent += `\n> **Note:** Distribution truncated to top ${fieldResult.truncatedAt} values\n`;
              }
              
              markdownContent += `\n## Value Distribution\n\n`;
              markdownContent += `| Value | Count | Percentage |\n`;
              markdownContent += `|-------|-------|------------|\n`;
              
              fieldResult.distributions.forEach(dist => {
                markdownContent += `| ${dist.value} | ${dist.count.toLocaleString()} | ${dist.percentage}% |\n`;
              });
              
              // Create a new untitled document with markdown content
              const doc = await vscode.workspace.openTextDocument({
                content: markdownContent,
                language: 'markdown'
              });
              
              // Show the document in a new editor column (to the side)
              await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, false);
            } else if (displayType === 'visual') {
              // Open visual analysis in a webview panel
              const panel = vscode.window.createWebviewPanel(
                'qvdProfilingVisual',
                `Profiling: ${fieldResult.fieldName}`,
                vscode.ViewColumn.Beside,
                {
                  enableScripts: true,
                  localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, "media"),
                  ],
                }
              );
              
              // Generate HTML for the visual analysis
              panel.webview.html = this.getVisualAnalysisHtml(panel.webview, fieldResult, fileName);
            }
            
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to open profiling in window: ${error.message}`
            );
          }
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
                h1 {
                    color: var(--vscode-errorForeground);
                    margin-bottom: 20px;
                }
                .error {
                    color: var(--vscode-errorForeground);
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    padding: 15px;
                    border-radius: 4px;
                    margin-bottom: 15px;
                }
                .error-details {
                    background-color: var(--vscode-textBlockQuote-background);
                    border-left: 4px solid var(--vscode-inputValidation-errorBorder);
                    padding: 12px;
                    margin-top: 15px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: 0.9em;
                }
                .error-details strong {
                    display: block;
                    margin-bottom: 8px;
                    color: var(--vscode-foreground);
                }
                p {
                    line-height: 1.5;
                    margin: 10px 0;
                }
                ul {
                    margin: 10px 0;
                    padding-left: 20px;
                }
                li {
                    margin: 5px 0;
                }
            </style>
        </head>
        <body>
            <h1>Unable to Load QVD File</h1>
            <div class="error">
                <strong>⚠️ This QVD file appears to be corrupted or damaged</strong>
                <p>The file structure could not be read properly. This can happen if:</p>
                <ul>
                    <li>The file was not saved correctly by Qlik Sense/QlikView</li>
                    <li>The file was modified by an external program</li>
                    <li>The file transfer was interrupted or corrupted</li>
                    <li>The file format is not a valid QVD file</li>
                </ul>
            </div>
            <div class="error-details">
                <strong>Technical Error Details:</strong>
                ${this.escapeHtml(errorMessage)}
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
    const tabulatorPath = join(
      this.context.extensionPath,
      "media",
      "tabulator",
      "tabulator.min.js"
    );
    return readFileSync(tabulatorPath, "utf8");
  }

  /**
   * Get Tabulator CSS inlined as string
   */
  getTabulatorCss() {
    const tabulatorCssPath = join(
      this.context.extensionPath,
      "media",
      "tabulator",
      "tabulator.min.css"
    );
    return readFileSync(tabulatorCssPath, "utf8");
  }

  /**
   * Get Chart.js library inlined as string
   */
  getChartJs() {
    const chartPath = join(
      this.context.extensionPath,
      "media",
      "chart.js",
      "chart.min.js"
    );
    return readFileSync(chartPath, "utf8");
  }

  /**
   * Generate HTML for visual analysis webview
   */
  getVisualAnalysisHtml(webview, fieldResult, qvdFileName) {
    const nonce = this.getNonce();
    const tabulatorJs = this.getTabulatorJs();
    const tabulatorCss = this.getTabulatorCss();
    const chartJs = this.getChartJs();
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Profiling: ${this.escapeHtml(fieldResult.fieldName)}</title>
    <style nonce="${nonce}">
        ${tabulatorCss}
        
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        
        h1 {
            font-size: 1.5em;
            margin: 0 0 10px 0;
            color: var(--vscode-foreground);
        }
        
        .source {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
            margin-bottom: 20px;
        }
        
        .stats-container {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
            padding: 15px;
            background-color: var(--vscode-textBlockQuote-background);
            border-radius: 4px;
        }
        
        .stat-item {
            display: flex;
            flex-direction: column;
        }
        
        .stat-label {
            color: var(--vscode-descriptionForeground);
            font-size: 0.85em;
            margin-bottom: 4px;
        }
        
        .stat-value {
            font-weight: 600;
            font-size: 1.1em;
            color: var(--vscode-foreground);
        }
        
        .chart-container {
            margin-bottom: 30px;
            background-color: var(--vscode-editor-background);
            padding: 20px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }
        
        .chart-container canvas {
            max-height: 500px;
        }
        
        .table-container {
            margin-top: 20px;
        }
        
        .table-title {
            font-size: 1.1em;
            font-weight: 600;
            margin-bottom: 10px;
            color: var(--vscode-foreground);
        }
    </style>
</head>
<body>
    <h1>📊 ${this.escapeHtml(fieldResult.fieldName)}</h1>
    <div class="source">Source: ${this.escapeHtml(qvdFileName)}</div>
    
    <div class="stats-container">
        <div class="stat-item">
            <span class="stat-label">Total Rows</span>
            <span class="stat-value">${fieldResult.totalRows.toLocaleString()}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Unique Values</span>
            <span class="stat-value">${fieldResult.uniqueValues.toLocaleString()}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">NULL/Empty</span>
            <span class="stat-value">${fieldResult.nullCount.toLocaleString()}</span>
        </div>
    </div>
    
    ${fieldResult.truncated ? `
    <div style="padding: 10px; background-color: var(--vscode-inputValidation-warningBackground); border-left: 4px solid var(--vscode-inputValidation-warningBorder); margin-bottom: 20px; border-radius: 2px;">
        ⚠️ Distribution truncated to top ${fieldResult.truncatedAt} values
    </div>
    ` : ''}
    
    <div class="chart-container">
        <canvas id="profiling-chart"></canvas>
    </div>
    
    <div class="table-container">
        <div class="table-title">Value Distribution</div>
        <div id="profiling-table"></div>
    </div>
    
    <script nonce="${nonce}">
        ${tabulatorJs}
    </script>
    
    <script nonce="${nonce}">
        ${chartJs}
    </script>
    
    <script nonce="${nonce}">
        const fieldResult = ${JSON.stringify(fieldResult)};
        
        // Create chart
        const ctx = document.getElementById('profiling-chart').getContext('2d');
        const topN = Math.min(20, fieldResult.distributions.length);
        const chartData = fieldResult.distributions.slice(0, topN);
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.map(d => d.value),
                datasets: [{
                    label: 'Count',
                    data: chartData.map(d => d.count),
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: \`Top \${topN} Values by Frequency\`,
                        color: getComputedStyle(document.body).getPropertyValue('--vscode-foreground')
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: getComputedStyle(document.body).getPropertyValue('--vscode-foreground')
                        },
                        grid: {
                            color: 'rgba(128, 128, 128, 0.2)'
                        }
                    },
                    x: {
                        ticks: {
                            color: getComputedStyle(document.body).getPropertyValue('--vscode-foreground'),
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: {
                            color: 'rgba(128, 128, 128, 0.2)'
                        }
                    }
                }
            }
        });
        
        // Create table
        const tableColumns = [
            { title: 'Value', field: 'value', headerSort: false, widthGrow: 2 },
            { title: 'Count', field: 'count', headerSort: false, widthGrow: 1 },
            { title: 'Percentage', field: 'percentage', headerSort: false, widthGrow: 1, 
              formatter: (cell) => cell.getValue() + '%' }
        ];
        
        new Tabulator('#profiling-table', {
            data: fieldResult.distributions,
            columns: tableColumns,
            layout: 'fitDataStretch',
            pagination: true,
            paginationSize: 25,
            paginationSizeSelector: [10, 25, 50, 100],
            paginationCounter: 'rows',
            height: '500px'
        });
    </script>
</body>
</html>`;
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

    // Generate export menu items dynamically
    const exportFormats = DataExporter.getExportFormats();
    const stableFormats = exportFormats
      .filter((f) => !f.beta)
      .sort((a, b) => a.label.localeCompare(b.label));
    const betaFormats = exportFormats
      .filter((f) => f.beta)
      .sort((a, b) => a.label.localeCompare(b.label));

    const exportMenuItems = [
      ...stableFormats.map(
        (format) =>
          `<div class="export-dropdown-item" data-format="${format.name}">${format.label}</div>`
      ),
      betaFormats.length > 0
        ? '<div class="export-dropdown-separator"></div>'
        : "",
      ...betaFormats.map(
        (format) =>
          `<div class="export-dropdown-item" data-format="${format.name}">${format.label} <span class="beta-badge">BETA</span></div>`
      ),
    ]
      .filter(Boolean)
      .join("\n                        ");

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
            overflow: auto;
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
            background-color: var(--vscode-list-activeSelectionBackground);
            border-bottom: 2px solid var(--vscode-contrastBorder, var(--vscode-panel-border));
        }
        
        .tabulator .tabulator-header .tabulator-col {
            background-color: var(--vscode-list-activeSelectionBackground);
            border-right: 1px solid var(--vscode-contrastBorder, var(--vscode-panel-border));
        }
        
        .tabulator .tabulator-header .tabulator-col .tabulator-col-content {
            padding: 8px;
            color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground));
            font-weight: 600;
        }
        
        .tabulator .tabulator-tableholder .tabulator-table {
            background-color: var(--vscode-editor-background);
            color: var(--vscode-foreground);
        }
        
        .tabulator-row {
            background-color: var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.15));
            border-bottom: 1px solid var(--vscode-contrastBorder, var(--vscode-panel-border));
            color: var(--vscode-foreground);
        }
        
        .tabulator-row.tabulator-row-even {
            background-color: var(--vscode-list-inactiveSelectionBackground, rgba(128, 128, 128, 0.25));
        }
        
        .tabulator-row:hover {
            background-color: var(--vscode-list-hoverBackground) !important;
            color: var(--vscode-list-hoverForeground, var(--vscode-foreground)) !important;
        }
        
        .tabulator-cell {
            border-right: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
            padding: 6px 8px;
            color: var(--vscode-foreground);
        }
        
        .tabulator-footer {
            background-color: var(--vscode-sideBar-background, var(--vscode-editor-background)) !important;
            border-top: 2px solid var(--vscode-contrastBorder, var(--vscode-panel-border)) !important;
            color: var(--vscode-foreground) !important;
            padding: 10px 8px !important;
            font-weight: 600 !important;
        }
        
        .tabulator-footer .tabulator-page {
            background-color: var(--vscode-button-background) !important;
            color: var(--vscode-button-foreground) !important;
            border: 1px solid var(--vscode-contrastBorder, var(--vscode-button-border)) !important;
            margin: 0 3px;
            border-radius: 3px;
            padding: 6px 10px;
            font-weight: 600 !important;
            min-width: 32px;
            text-align: center;
        }
        
        .tabulator-footer .tabulator-page:not(.disabled) {
            cursor: pointer;
        }
        
        .tabulator-footer .tabulator-page:not(.disabled):hover {
            background-color: var(--vscode-button-hoverBackground) !important;
            border-color: var(--vscode-focusBorder, var(--vscode-button-border)) !important;
        }
        
        .tabulator-footer .tabulator-page.active {
            background-color: var(--vscode-button-hoverBackground) !important;
            border-color: var(--vscode-focusBorder) !important;
            font-weight: 700 !important;
        }
        
        .tabulator-footer .tabulator-page.disabled {
            opacity: 0.4 !important;
            cursor: not-allowed;
        }
        
        /* Override Tabulator's hardcoded #555 color for paginator */
        .tabulator .tabulator-footer .tabulator-paginator {
            color: var(--vscode-foreground) !important;
        }
        
        /* Improve pagination text visibility */
        .tabulator .tabulator-footer .tabulator-page-counter {
            color: var(--vscode-foreground) !important;
            font-weight: 600 !important;
            opacity: 1 !important;
        }
        
        .tabulator .tabulator-footer .tabulator-page-size {
            color: var(--vscode-foreground) !important;
            font-weight: 600 !important;
        }
        
        .tabulator .tabulator-footer .tabulator-page-size label {
            color: var(--vscode-foreground) !important;
            font-weight: 600 !important;
            margin-right: 6px;
        }
        
        .tabulator .tabulator-footer .tabulator-page-size select {
            background-color: var(--vscode-dropdown-background) !important;
            color: var(--vscode-dropdown-foreground) !important;
            border: 1px solid var(--vscode-dropdown-border, var(--vscode-contrastBorder)) !important;
            padding: 4px 8px;
            border-radius: 3px;
            font-weight: 600;
        }
        
        .tabulator-footer .tabulator-pages {
            margin: 0 10px;
        }
        
        /* Force all footer text elements to be visible */
        .tabulator-footer * {
            color: var(--vscode-foreground) !important;
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
        
        /* Export dropdown menu */
        .export-dropdown {
            position: relative;
            display: inline-block;
        }
        
        .export-dropdown-content {
            display: none;
            position: absolute;
            right: 0;
            background-color: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            border-radius: 2px;
            padding: 4px 0;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            min-width: 240px;
            white-space: nowrap;
        }
        
        .export-dropdown-content.show {
            display: block;
        }
        
        .export-dropdown-item {
            padding: 6px 16px;
            cursor: pointer;
            color: var(--vscode-menu-foreground);
            font-size: 0.9em;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .export-dropdown-item:hover {
            background-color: var(--vscode-menu-selectionBackground);
            color: var(--vscode-menu-selectionForeground);
        }

        .export-dropdown-separator {
            height: 1px;
            background-color: var(--vscode-menu-border);
            margin: 4px 0;
        }

        .beta-badge {
            font-size: 0.7em;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 3px;
            margin-left: 8px;
            background-color: var(--vscode-statusBarItem-warningBackground, #f59e0b);
            color: var(--vscode-statusBarItem-warningForeground, #000);
        }
        
        /* Profiling Tab Styles */
        .profiling-controls {
            margin-bottom: 20px;
            flex-shrink: 0;
        }
        
        .profiling-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .profiling-header h2 {
            font-size: 1.1em;
            margin: 0;
            color: var(--vscode-foreground);
        }
        
        .warning-banner {
            border-left-color: var(--vscode-inputValidation-warningBorder) !important;
            background-color: var(--vscode-inputValidation-warningBackground);
        }
        
        .field-selector-container {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 15px;
        }
        
        .field-selector-container label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        
        .field-checkboxes {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 8px;
            margin-bottom: 12px;
            max-height: 200px;
            overflow-y: auto;
            padding: 8px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
        }
        
        .field-checkbox-item {
            display: flex;
            align-items: center;
            padding: 4px;
            cursor: pointer;
        }
        
        .field-checkbox-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .field-checkbox-item input[type="checkbox"] {
            margin-right: 8px;
            cursor: pointer;
        }
        
        .field-checkbox-item label {
            margin: 0;
            font-weight: normal;
            cursor: pointer;
            flex: 1;
        }
        
        .field-unique-count {
            color: var(--vscode-descriptionForeground);
            font-size: 0.85em;
            margin-left: 4px;
        }
        
        .profiling-buttons {
            display: flex;
            gap: 10px;
        }
        
        .profiling-status {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 12px 15px;
            margin-bottom: 15px;
            color: var(--vscode-foreground);
        }
        
        .profiling-results {
            flex-shrink: 0;
        }
        
        .field-profiling-card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 20px;
            margin-bottom: 20px;
        }
        
        .field-profiling-card h3 {
            margin: 0 0 15px 0;
            font-size: 1em;
            color: var(--vscode-foreground);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .open-in-window-dropdown {
            position: relative;
            display: inline-block;
        }
        
        .open-in-window-btn {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 4px 10px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 0.85em;
            white-space: nowrap;
        }
        
        .open-in-window-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .open-window-dropdown-content {
            display: none;
            position: absolute;
            right: 0;
            background-color: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            border-radius: 2px;
            padding: 4px 0;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            min-width: 180px;
            white-space: nowrap;
        }
        
        .open-window-dropdown-content.show {
            display: block;
        }
        
        .open-window-dropdown-item {
            padding: 6px 16px;
            cursor: pointer;
            color: var(--vscode-menu-foreground);
            font-size: 0.9em;
        }
        
        .open-window-dropdown-item:hover {
            background-color: var(--vscode-menu-selectionBackground);
            color: var(--vscode-menu-selectionForeground);
        }
        
        .field-stats {
            display: flex;
            gap: 20px;
            margin-bottom: 15px;
            padding: 10px;
            background-color: var(--vscode-textBlockQuote-background);
            border-radius: 2px;
            font-size: 0.9em;
        }
        
        .field-stat-item {
            display: flex;
            flex-direction: column;
        }
        
        .field-stat-label {
            color: var(--vscode-descriptionForeground);
            font-size: 0.85em;
            margin-bottom: 2px;
        }
        
        .field-stat-value {
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        
        .profiling-chart-container {
            margin-bottom: 20px;
            background-color: var(--vscode-editor-background);
            padding: 15px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 2px;
        }
        
        .profiling-chart-container canvas {
            max-height: 400px;
        }
        
        .profiling-table-container {
            margin-top: 15px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header-container">
            <h1><img src="${logoUri}" alt="Ctrl-Q Logo" class="logo" />Ctrl-Q QVD File Viewer</h1>
            <div class="header-buttons">
                <div class="export-dropdown">
                    <button class="header-button" id="export-btn">📤 Export ▼</button>
                    <div class="export-dropdown-content" id="export-dropdown">
                        ${exportMenuItems}
                    </div>
                </div>
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
                <button class="tab-button" data-tab="profiling">📊 Profiling</button>
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
            
            <!-- Profiling Tab -->
            <div id="profiling-tab" class="tab-content">
                <div class="profiling-controls">
                    <div class="profiling-header">
                        <h2>📊 Field Value Distribution Analysis</h2>
                        <button class="header-button" id="export-qvs-btn" style="display: none;">💾 Export to QVS Script</button>
                    </div>
                    ${
                      totalRows > 100000
                        ? `
                    <div class="info-banner warning-banner">
                        ⚠️ <strong>Large File Warning:</strong> This QVD contains ${totalRows.toLocaleString()} rows. 
                        Profiling will load all data into memory, which may take some time and use significant resources.
                        <br/>Click "Run Profiling" below to proceed.
                    </div>
                    `
                        : ""
                    }
                    <div class="field-selector-container">
                        <label for="field-checkboxes">Select fields to profile (1-3):</label>
                        <div id="field-checkboxes" class="field-checkboxes">
                            ${
                              metadata && metadata.fields
                                ? metadata.fields
                                    .map(
                                      (field) =>
                                        `<div class="field-checkbox-item">
                                            <input type="checkbox" 
                                                   id="field-${this.escapeHtml(field.name)}" 
                                                   name="field-checkbox" 
                                                   value="${this.escapeHtml(field.name)}">
                                            <label for="field-${this.escapeHtml(field.name)}">
                                                ${this.escapeHtml(field.name)}
                                                <span class="field-unique-count">(${field.noOfSymbols} unique values)</span>
                                            </label>
                                        </div>`
                                    )
                                    .join("\n")
                                : ""
                            }
                        </div>
                        <div class="profiling-buttons">
                            <button class="header-button" id="run-profiling-btn">▶️ Run Profiling</button>
                            <button class="header-button" id="clear-profiling-btn">✕ Clear Results</button>
                        </div>
                    </div>
                </div>
                <div id="profiling-status" class="profiling-status" style="display: none;"></div>
                <div id="profiling-results" class="profiling-results"></div>
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
        /* Chart.js library - inlined */
        ${this.getChartJs()}
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
        
        // Available field names for profiling
        const availableFields = ${JSON.stringify(
          metadata && metadata.fields
            ? metadata.fields.map((f) => f.name)
            : []
        )};
        
        let currentContextCell = null;
        let dataTable, schemaTable, metadataTable, lineageTable;
        let profilingCharts = [];
        let currentProfilingResults = null;
        
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
            
            // Export button and dropdown
            const exportBtn = document.getElementById('export-btn');
            const exportDropdown = document.getElementById('export-dropdown');
            if (exportBtn && exportDropdown) {
                exportBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    exportDropdown.classList.toggle('show');
                });
                
                // Close dropdown when clicking outside
                document.addEventListener('click', function(e) {
                    if (!e.target.closest('.export-dropdown')) {
                        exportDropdown.classList.remove('show');
                    }
                });
                
                // Handle export format selection
                const exportItems = document.querySelectorAll('.export-dropdown-item');
                exportItems.forEach(item => {
                    item.addEventListener('click', function() {
                        const format = this.getAttribute('data-format');
                        exportDropdown.classList.remove('show');
                        exportData(format);
                    });
                });
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
            
            // Profiling tab event listeners
            const runProfilingBtn = document.getElementById('run-profiling-btn');
            if (runProfilingBtn) {
                runProfilingBtn.addEventListener('click', runProfiling);
            }
            
            const clearProfilingBtn = document.getElementById('clear-profiling-btn');
            if (clearProfilingBtn) {
                clearProfilingBtn.addEventListener('click', clearProfiling);
            }
            
            const exportQvsBtn = document.getElementById('export-qvs-btn');
            if (exportQvsBtn) {
                exportQvsBtn.addEventListener('click', exportProfilingQvs);
            }
            
            // Add checkbox validation for profiling fields
            const fieldCheckboxes = document.querySelectorAll('input[name="field-checkbox"]');
            fieldCheckboxes.forEach(checkbox => {
                checkbox.addEventListener('change', validateFieldSelection);
            });
            
            // Close open window dropdowns when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.open-in-window-dropdown')) {
                    document.querySelectorAll('.open-window-dropdown-content').forEach(dd => {
                        dd.classList.remove('show');
                    });
                }
            });
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
        
        function exportData(format) {
            vscode.postMessage({ 
                command: 'exportData',
                format: format
            });
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
        
        // Profiling functions
        function runProfiling() {
            const checkboxes = document.querySelectorAll('input[name="field-checkbox"]:checked');
            const selectedFields = Array.from(checkboxes).map(cb => cb.value);
            
            if (selectedFields.length === 0) {
                showProfilingStatus('⚠️ Please select at least one field to profile.', 'warning');
                return;
            }
            
            if (selectedFields.length > 3) {
                showProfilingStatus('⚠️ Please select a maximum of 3 fields to profile.', 'warning');
                return;
            }
            
            showProfilingStatus('⏳ Loading all data and computing value distributions...', 'info');
            
            // Send message to extension to compute profiling
            vscode.postMessage({
                command: 'profileFields',
                fieldNames: selectedFields,
                maxUniqueValues: 1000
            });
        }
        
        function clearProfiling() {
            // Clear results
            currentProfilingResults = null;
            document.getElementById('profiling-results').innerHTML = '';
            document.getElementById('profiling-status').style.display = 'none';
            document.getElementById('export-qvs-btn').style.display = 'none';
            
            // Destroy existing charts
            profilingCharts.forEach(chart => chart.destroy());
            profilingCharts = [];
            
            // Clear field selection
            const checkboxes = document.querySelectorAll('input[name="field-checkbox"]');
            checkboxes.forEach(cb => cb.checked = false);
        }
        
        function validateFieldSelection() {
            const checkedBoxes = document.querySelectorAll('input[name="field-checkbox"]:checked');
            
            if (checkedBoxes.length > 3) {
                // Show warning and uncheck the last selected checkbox
                showProfilingStatus('⚠️ Maximum of 3 fields can be selected for profiling. Please unselect one field before selecting another.', 'warning');
                
                // Uncheck this checkbox
                this.checked = false;
            } else if (checkedBoxes.length === 0) {
                // Clear any warning when no fields are selected
                const statusDiv = document.getElementById('profiling-status');
                if (statusDiv && statusDiv.textContent.includes('Maximum of 3 fields')) {
                    statusDiv.style.display = 'none';
                }
            }
        }
        
        function exportProfilingQvs() {
            if (!currentProfilingResults || !currentProfilingResults.fields) {
                showProfilingStatus('⚠️ No profiling results to export.', 'warning');
                return;
            }
            
            vscode.postMessage({
                command: 'exportProfilingQvs',
                profilingResults: currentProfilingResults.fields
            });
        }
        
        function showProfilingStatus(message, type = 'info') {
            const statusDiv = document.getElementById('profiling-status');
            statusDiv.textContent = message;
            statusDiv.style.display = 'block';
            
            // Add type-specific styling
            statusDiv.style.borderLeftColor = type === 'warning' 
                ? 'var(--vscode-inputValidation-warningBorder)' 
                : 'var(--vscode-textBlockQuote-border)';
        }
        
        function displayProfilingResults(results) {
            if (results.error) {
                showProfilingStatus('❌ ' + results.error, 'warning');
                return;
            }
            
            currentProfilingResults = results;
            const resultsDiv = document.getElementById('profiling-results');
            resultsDiv.innerHTML = '';
            
            // Destroy existing charts
            profilingCharts.forEach(chart => chart.destroy());
            profilingCharts = [];
            
            // Display results for each field
            results.fields.forEach((fieldResult, index) => {
                const card = document.createElement('div');
                card.className = 'field-profiling-card';
                
                // Header
                const headerContainer = document.createElement('div');
                headerContainer.style.display = 'flex';
                headerContainer.style.justifyContent = 'space-between';
                headerContainer.style.alignItems = 'center';
                headerContainer.style.marginBottom = '15px';
                
                const header = document.createElement('h3');
                header.style.margin = '0';
                header.innerHTML = \`📊 \${fieldResult.fieldName}\`;
                if (fieldResult.truncated) {
                    header.innerHTML += \` <span style="color: var(--vscode-descriptionForeground); font-size: 0.85em;">(showing top \${fieldResult.truncatedAt} values)</span>\`;
                }
                
                const openButton = document.createElement('div');
                openButton.className = 'open-in-window-dropdown';
                openButton.innerHTML = \`
                    <button class="open-in-window-btn" id="open-window-btn-\${index}">
                        🔗 Open in new Window ▼
                    </button>
                    <div class="open-window-dropdown-content" id="open-window-dropdown-\${index}">
                        <div class="open-window-dropdown-item" data-type="markdown" data-field-index="\${index}">
                            📝 Markdown
                        </div>
                        <div class="open-window-dropdown-item" data-type="visual" data-field-index="\${index}">
                            📊 Visual Analysis
                        </div>
                    </div>
                \`;
                
                // Add dropdown toggle functionality
                const btnElement = openButton.querySelector(\`#open-window-btn-\${index}\`);
                const dropdownElement = openButton.querySelector(\`#open-window-dropdown-\${index}\`);
                
                btnElement.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Close all other dropdowns
                    document.querySelectorAll('.open-window-dropdown-content').forEach(dd => {
                        if (dd !== dropdownElement) {
                            dd.classList.remove('show');
                        }
                    });
                    dropdownElement.classList.toggle('show');
                });
                
                // Handle menu item clicks
                openButton.querySelectorAll('.open-window-dropdown-item').forEach(item => {
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const displayType = item.getAttribute('data-type');
                        dropdownElement.classList.remove('show');
                        openProfilingInWindow(fieldResult, displayType);
                    });
                });
                
                headerContainer.appendChild(header);
                headerContainer.appendChild(openButton);
                card.appendChild(headerContainer);
                
                // Stats
                const statsDiv = document.createElement('div');
                statsDiv.className = 'field-stats';
                statsDiv.innerHTML = \`
                    <div class="field-stat-item">
                        <span class="field-stat-label">Total Rows</span>
                        <span class="field-stat-value">\${fieldResult.totalRows.toLocaleString()}</span>
                    </div>
                    <div class="field-stat-item">
                        <span class="field-stat-label">Unique Values</span>
                        <span class="field-stat-value">\${fieldResult.uniqueValues.toLocaleString()}</span>
                    </div>
                    <div class="field-stat-item">
                        <span class="field-stat-label">NULL/Empty</span>
                        <span class="field-stat-value">\${fieldResult.nullCount.toLocaleString()}</span>
                    </div>
                \`;
                card.appendChild(statsDiv);
                
                // Chart
                const chartContainer = document.createElement('div');
                chartContainer.className = 'profiling-chart-container';
                const canvas = document.createElement('canvas');
                canvas.id = \`profiling-chart-\${index}\`;
                chartContainer.appendChild(canvas);
                card.appendChild(chartContainer);
                
                // Table
                const tableContainer = document.createElement('div');
                tableContainer.className = 'profiling-table-container';
                const tableDiv = document.createElement('div');
                tableDiv.id = \`profiling-table-\${index}\`;
                tableContainer.appendChild(tableDiv);
                card.appendChild(tableContainer);
                
                resultsDiv.appendChild(card);
                
                // Create chart
                const ctx = canvas.getContext('2d');
                const topN = Math.min(20, fieldResult.distributions.length);
                const chartData = fieldResult.distributions.slice(0, topN);
                
                const chart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: chartData.map(d => d.value),
                        datasets: [{
                            label: 'Count',
                            data: chartData.map(d => d.count),
                            backgroundColor: 'rgba(54, 162, 235, 0.6)',
                            borderColor: 'rgba(54, 162, 235, 1)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: {
                                display: false
                            },
                            title: {
                                display: true,
                                text: \`Top \${topN} Values by Frequency\`,
                                color: getComputedStyle(document.body).getPropertyValue('--vscode-foreground')
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    color: getComputedStyle(document.body).getPropertyValue('--vscode-foreground')
                                },
                                grid: {
                                    color: 'rgba(128, 128, 128, 0.2)'
                                }
                            },
                            x: {
                                ticks: {
                                    color: getComputedStyle(document.body).getPropertyValue('--vscode-foreground'),
                                    maxRotation: 45,
                                    minRotation: 45
                                },
                                grid: {
                                    color: 'rgba(128, 128, 128, 0.2)'
                                }
                            }
                        }
                    }
                });
                
                profilingCharts.push(chart);
                
                // Create table with Tabulator
                const tableColumns = [
                    { title: 'Value', field: 'value', headerSort: false, widthGrow: 2 },
                    { title: 'Count', field: 'count', headerSort: false, widthGrow: 1 },
                    { title: 'Percentage', field: 'percentage', headerSort: false, widthGrow: 1, 
                      formatter: (cell) => cell.getValue() + '%' }
                ];
                
                const profilingTable = new Tabulator(\`#profiling-table-\${index}\`, {
                    data: fieldResult.distributions,
                    columns: tableColumns,
                    layout: 'fitDataStretch',
                    pagination: true,
                    paginationSize: 25,
                    paginationSizeSelector: [10, 25, 50, 100],
                    paginationCounter: 'rows',
                    height: '400px'
                });
            });
            
            showProfilingStatus(\`✅ Profiling complete for \${results.fields.length} field(s)\`, 'info');
            document.getElementById('export-qvs-btn').style.display = 'inline-block';
        }
        
        function openProfilingInWindow(fieldResult, displayType) {
            // Send message to extension to open profiling in new window
            vscode.postMessage({
                command: 'openProfilingInWindow',
                fieldResult: fieldResult,
                displayType: displayType || 'markdown'
            });
        }
        
        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'profilingResults':
                    displayProfilingResults(message.results);
                    break;
                case 'profilingError':
                    showProfilingStatus('❌ ' + message.error, 'warning');
                    break;
            }
        });
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

export default QvdEditorProvider;
