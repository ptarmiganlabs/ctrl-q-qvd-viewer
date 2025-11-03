import * as vscode from "vscode";
import { basename, dirname, extname, join } from "path";
import { writeFileSync } from "fs";
import DataExporter from "../exporters/index.mjs";
import { profileFields, generateQvsScript } from "../qvdProfiler.mjs";
import { getVisualAnalysisHtml } from "./templates/visualAnalysisTemplate.mjs";

/**
 * Create and configure the message handler for webview messages
 * @param {object} webviewPanel - The webview panel
 * @param {string} filePath - The QVD file path
 * @param {object} qvdReader - The QVD reader instance
 * @param {object} context - The extension context
 * @param {Function} updateWebviewFn - Function to update the webview
 * @param {number} maxRows - Maximum rows to display
 */
export function setupMessageHandler(
  webviewPanel,
  filePath,
  qvdReader,
  context,
  updateWebviewFn,
  maxRows
) {
  webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "refresh":
          await updateWebviewFn(filePath, webviewPanel.webview, maxRows);
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
          await updateWebviewFn(filePath, webviewPanel.webview, newMaxRows);
          break;
        case "copyToClipboard":
          // Copy text to clipboard using VS Code API
          await vscode.env.clipboard.writeText(message.text);
          break;
        case "exportData":
          // Export data to selected format
          try {
            const result = await qvdReader.read(filePath, 0); // Read all data
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
            const result = await qvdReader.read(filePath, 0); // Read all data
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
                {
                  label: "Tab (\\t)",
                  value: "tab",
                  description: "Good general purpose delimiter",
                },
                {
                  label: "Pipe (|)",
                  value: "pipe",
                  description: "Recommended when data contains commas",
                },
                {
                  label: "Comma (,)",
                  value: "comma",
                  description: "Standard CSV-style",
                },
                {
                  label: "Semicolon (;)",
                  value: "semicolon",
                  description: "Alternative to comma",
                },
              ],
              {
                placeHolder: "Select delimiter for QVS script",
                title: "QVS Export - Delimiter",
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
                title: "QVS Export - Rows per Field",
              }
            );

            if (!maxRowsChoice) {
              // User cancelled
              break;
            }

            const saveUri = await vscode.window.showSaveDialog({
              defaultUri: vscode.Uri.file(join(dirname(filePath), defaultName)),
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
                  maxRows: parseInt(maxRowsChoice.value, 10),
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
            const displayType = message.displayType || "markdown";
            const fileName = basename(filePath, extname(filePath));

            if (displayType === "markdown") {
              // Create markdown content with profiling results
              let markdownContent = `# Profiling: ${fieldResult.fieldName}\n\n`;
              markdownContent += `**Source:** ${basename(filePath)}\n\n`;
              markdownContent += `## Statistics\n\n`;
              markdownContent += `- **Total Rows:** ${fieldResult.totalRows.toLocaleString()}\n`;
              markdownContent += `- **Unique Values:** ${fieldResult.uniqueValues.toLocaleString()}\n`;
              markdownContent += `- **NULL/Empty:** ${fieldResult.nullCount.toLocaleString()}\n`;

              // Add statistical analysis for numeric fields
              if (
                fieldResult.isNumeric &&
                fieldResult.statistics &&
                fieldResult.statistics.isNumeric
              ) {
                const stats = fieldResult.statistics;

                markdownContent += `\n## Statistical Analysis\n\n`;

                markdownContent += `### Descriptive Statistics\n\n`;
                markdownContent += `| Metric | Value |\n`;
                markdownContent += `|--------|-------|\n`;
                markdownContent += `| Min | ${stats.descriptive.min.toLocaleString()} |\n`;
                markdownContent += `| Max | ${stats.descriptive.max.toLocaleString()} |\n`;
                markdownContent += `| Mean | ${stats.descriptive.mean.toFixed(
                  2
                )} |\n`;
                markdownContent += `| Median | ${stats.descriptive.median.toFixed(
                  2
                )} |\n`;
                if (
                  stats.descriptive.mode &&
                  stats.descriptive.mode.length > 0
                ) {
                  markdownContent += `| Mode | ${stats.descriptive.mode
                    .map((m) => m.toFixed(2))
                    .join(", ")} |\n`;
                }
                markdownContent += `| Sum | ${stats.descriptive.sum.toLocaleString()} |\n`;
                markdownContent += `| Count | ${stats.descriptive.count.toLocaleString()} |\n`;

                markdownContent += `\n### Spread Measures\n\n`;
                markdownContent += `| Metric | Value |\n`;
                markdownContent += `|--------|-------|\n`;
                markdownContent += `| Range | ${stats.spread.range.toFixed(
                  2
                )} |\n`;
                markdownContent += `| Standard Deviation | ${stats.spread.stdDev.toFixed(
                  2
                )} |\n`;
                markdownContent += `| Variance | ${stats.spread.variance.toFixed(
                  2
                )} |\n`;

                markdownContent += `\n### Distribution Metrics\n\n`;
                markdownContent += `| Metric | Value |\n`;
                markdownContent += `|--------|-------|\n`;
                markdownContent += `| 10th percentile | ${stats.distribution.percentiles.p10.toFixed(
                  2
                )} |\n`;
                markdownContent += `| 50th percentile (Median) | ${stats.distribution.percentiles.p50.toFixed(
                  2
                )} |\n`;
                markdownContent += `| 90th percentile | ${stats.distribution.percentiles.p90.toFixed(
                  2
                )} |\n`;
                if (stats.distribution.skewness !== null) {
                  markdownContent += `| Skewness | ${stats.distribution.skewness.toFixed(
                    3
                  )} |\n`;
                }
                if (stats.distribution.kurtosis !== null) {
                  markdownContent += `| Kurtosis | ${stats.distribution.kurtosis.toFixed(
                    3
                  )} |\n`;
                }
              }

              if (fieldResult.truncated) {
                markdownContent += `\n> **Note:** Distribution truncated to top ${fieldResult.truncatedAt} values\n`;
              }

              markdownContent += `\n## Value Distribution\n\n`;
              markdownContent += `| Value | Count | Percentage |\n`;
              markdownContent += `|-------|-------|------------|\n`;

              fieldResult.distributions.forEach((dist) => {
                markdownContent += `| ${
                  dist.value
                } | ${dist.count.toLocaleString()} | ${dist.percentage}% |\n`;
              });

              // Create a new untitled document with markdown content
              const doc = await vscode.workspace.openTextDocument({
                content: markdownContent,
                language: "markdown",
              });

              // Show the document in a new editor column (to the side)
              await vscode.window.showTextDocument(
                doc,
                vscode.ViewColumn.Beside,
                false
              );
            } else if (displayType === "visual") {
              // Open visual analysis in a webview panel
              const panel = vscode.window.createWebviewPanel(
                "qvdProfilingVisual",
                `Profiling: ${fieldResult.fieldName}`,
                vscode.ViewColumn.Beside,
                {
                  enableScripts: true,
                  localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, "media"),
                  ],
                }
              );

              // Generate HTML for the visual analysis
              panel.webview.html = getVisualAnalysisHtml(
                panel.webview,
                context.extensionPath,
                fieldResult,
                fileName
              );
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
