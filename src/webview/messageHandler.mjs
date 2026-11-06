import * as vscode from "vscode";
import { basename, dirname, extname, join } from "path";
import { writeFileSync } from "fs";
import DataExporter from "../exporters/index.mjs";
import { profileFields, generateQvsScript } from "../qvdProfiler.mjs";
import { getVisualAnalysisHtml } from "./templates/visualAnalysisTemplate.mjs";
import { getLoadMoreRowCount } from "./loadMore.mjs";
import {
  EXPORT_BYTES_PER_CELL,
  PROFILE_BYTES_PER_VALUE,
  describeExportRefusal,
  exportCost,
  exportHeapBytes,
  tryBookHeap,
} from "../memoryGuard.mjs";
import logger from "../logger.mjs";

/**
 * An export format's name as the user sees it
 * @param {string} format - The format, such as "excel"
 * @returns {string} Such as "Excel"
 */
function exportLabel(format) {
  const known = DataExporter.getExportFormats().find((entry) => entry.name === format);
  return known ? known.label.replace(/^Export to /, "") : format;
}

/**
 * Create and configure the message handler for webview messages
 * @param {object} webviewPanel - The webview panel
 * @param {string} filePath - The QVD file path
 * @param {object} qvdReader - The QVD reader instance
 * @param {object} context - The extension context
 * @param {Function} updateWebviewFn - Function to update the webview
 * @param {number} maxRows - Maximum rows to display
 * @param {AbortSignal} [signal] - Aborted once the editor is closed, giving its reads up
 */
export function setupMessageHandler(
  webviewPanel,
  filePath,
  qvdReader,
  context,
  updateWebviewFn,
  maxRows,
  signal
) {
  webviewPanel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case "log":
        // Handle logging from webview
        const level = message.level || "log";
        const logMessage = `[Webview] ${message.message}`;

        switch (level) {
          case "error":
            logger.error(logMessage, message.data);
            break;
          case "warn":
            logger.warn(logMessage, message.data);
            break;
          default:
            logger.log(logMessage, message.data);
        }
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
          : getLoadMoreRowCount(currentRows);
        await updateWebviewFn(filePath, webviewPanel.webview, newMaxRows, {
          keepPageOnMemoryRefusal: true,
          signal,
        });
        break;
      case "copyToClipboard":
        // Copy text to clipboard using VS Code API
        await vscode.env.clipboard.writeText(message.text);
        break;
      case "exportData": {
        // Export data to selected format
        let releaseExportedRows = () => {};
        try {
          // What the exporter builds per cell is priced into the read, so that an
          // export too large for memory is refused before every row is read. It is
          // booked only once the dialogs are answered and the export begins.
          let result = await qvdReader.read(filePath, 0, {
            signal,
            bytesPerCell: exportCost(EXPORT_BYTES_PER_CELL, message.format),
            holdCallerBytes: false,
          }); // Read all data
          releaseExportedRows = result.release;
          if (result.errorReason === "aborted") {
            break;
          }
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
          const columnCount = result.columns.length;
          const savedPath = await DataExporter.exportData(
            result.data,
            message.format,
            fileName,
            vscode,
            workspaceFolder,
            maxRows,
            {
              // Priced from the rows to be written, their text included, once
              // every dialog is answered: an export that won't fit is refused
              // before anything is written
              reserve: (rows, limit) => {
                const needed = exportHeapBytes(message.format, rows, columnCount, limit);
                const booking = tryBookHeap(needed.bytes);
                if (!booking.release) {
                  throw new Error(
                    describeExportRefusal(
                      exportLabel(message.format),
                      needed.rows,
                      needed.bytes,
                      booking.leftBytes
                    )
                  );
                }
                return booking.release;
              },
            }
          );
          // The rows, and the exporter's copy, are done with: later reads may have the heap
          result = null;
          releaseExportedRows();

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
        } finally {
          releaseExportedRows();
        }
        break;
      }
      case "profileFields": {
        // Profile selected fields and return distribution data
        let releaseProfiledRows = () => {};
        try {
          // What profiling builds from each profiled field is priced too
          const result = await qvdReader.read(filePath, 0, {
            signal,
            bytesPerRow: PROFILE_BYTES_PER_VALUE * (message.fieldNames?.length || 1),
          }); // Read all data
          releaseProfiledRows = result.release;
          if (result.errorReason === "aborted") {
            break;
          }
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
          releaseProfiledRows();

          webviewPanel.webview.postMessage({
            command: "profilingResults",
            results: profilingResults,
          });
        } catch (error) {
          webviewPanel.webview.postMessage({
            command: "profilingError",
            error: `Profiling failed: ${error.message}`,
          });
        } finally {
          releaseProfiledRows();
        }
        break;
      }
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

            // Add temporal analysis for date fields
            if (
              fieldResult.isDate &&
              fieldResult.temporalAnalysis &&
              fieldResult.temporalAnalysis.isDate
            ) {
              const temporal = fieldResult.temporalAnalysis;

              markdownContent += `\n## Temporal Analysis\n\n`;

              markdownContent += `### Date Range\n\n`;
              markdownContent += `| Metric | Value |\n`;
              markdownContent += `|--------|-------|\n`;
              markdownContent += `| Earliest | ${
                temporal.range.earliest
                  ? new Date(temporal.range.earliest)
                      .toISOString()
                      .split("T")[0]
                  : "N/A"
              } |\n`;
              markdownContent += `| Latest | ${
                temporal.range.latest
                  ? new Date(temporal.range.latest).toISOString().split("T")[0]
                  : "N/A"
              } |\n`;
              markdownContent += `| Time Span | ${temporal.range.spanDescription} |\n`;
              markdownContent += `| Format | ${temporal.range.format.formatDescription} |\n`;

              // Yearly distribution
              if (
                temporal.distribution &&
                temporal.distribution.byYear &&
                temporal.distribution.byYear.length > 0
              ) {
                markdownContent += `\n### Yearly Distribution\n\n`;
                markdownContent += `| Year | Count |\n`;
                markdownContent += `|------|-------|\n`;
                temporal.distribution.byYear.slice(0, 10).forEach((item) => {
                  markdownContent += `| ${
                    item.period
                  } | ${item.count.toLocaleString()} |\n`;
                });
              }

              // Monthly distribution
              if (
                temporal.distribution &&
                temporal.distribution.byMonth &&
                temporal.distribution.byMonth.length > 0
              ) {
                markdownContent += `\n### Monthly Distribution\n\n`;
                markdownContent += `| Month | Count |\n`;
                markdownContent += `|-------|-------|\n`;
                temporal.distribution.byMonth.forEach((item) => {
                  markdownContent += `| ${
                    item.period
                  } | ${item.count.toLocaleString()} |\n`;
                });
              }

              // Day of week distribution
              if (
                temporal.distribution &&
                temporal.distribution.byDayOfWeek &&
                temporal.distribution.byDayOfWeek.length > 0
              ) {
                markdownContent += `\n### Day of Week Distribution\n\n`;
                markdownContent += `| Day | Count |\n`;
                markdownContent += `|-----|-------|\n`;
                temporal.distribution.byDayOfWeek.forEach((item) => {
                  markdownContent += `| ${
                    item.period
                  } | ${item.count.toLocaleString()} |\n`;
                });
              }

              // Gap analysis
              if (temporal.gaps) {
                markdownContent += `\n### Gap Analysis\n\n`;
                markdownContent += `| Metric | Value |\n`;
                markdownContent += `|--------|-------|\n`;
                markdownContent += `| Has Gaps | ${
                  temporal.gaps.hasGaps ? "Yes" : "No"
                } |\n`;
                markdownContent += `| Gap Count | ${temporal.gaps.gapCount} |\n`;
                markdownContent += `| Coverage | ${temporal.gaps.coverage.toFixed(
                  1
                )}% |\n`;
                if (temporal.gaps.largestGap) {
                  markdownContent += `| Largest Gap | ${temporal.gaps.largestGap.days} days |\n`;
                }
              }

              // Trend analysis
              if (temporal.trends) {
                markdownContent += `\n### Trend Analysis\n\n`;
                markdownContent += `| Metric | Value |\n`;
                markdownContent += `|--------|-------|\n`;
                markdownContent += `| Trend Type | ${temporal.trends.trendType.replace(
                  /_/g,
                  " "
                )} |\n`;
                markdownContent += `| Description | ${temporal.trends.description} |\n`;
              }

              // Data quality
              if (temporal.quality) {
                markdownContent += `\n### Data Quality\n\n`;
                markdownContent += `| Metric | Value |\n`;
                markdownContent += `|--------|-------|\n`;
                markdownContent += `| Valid Dates | ${temporal.quality.validDateCount.toLocaleString()} |\n`;
                markdownContent += `| Invalid Dates | ${temporal.quality.invalidDateCount.toLocaleString()} |\n`;
                markdownContent += `| Null Count | ${temporal.quality.nullCount.toLocaleString()} |\n`;
                markdownContent += `| Valid % | ${temporal.quality.validPercentage.toFixed(
                  1
                )}% |\n`;
              }
            }

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
              if (stats.descriptive.mode && stats.descriptive.mode.length > 0) {
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
              markdownContent += `\n> **Note:** Distribution truncated to top ${fieldResult.truncatedAt} unique values\n`;
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
