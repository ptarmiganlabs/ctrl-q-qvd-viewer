import {
  getNonce,
  getTabulatorJs,
  getTabulatorCss,
  getChartJs,
} from "../assetLoader.mjs";
import { escapeHtml } from "./errorTemplate.mjs";
import { createHelpIconHtml } from "../qualityMetricHelp.mjs";

/**
 * Generate HTML for visual analysis webview
 * @param {object} webview - The webview object
 * @param {string} extensionPath - The extension path
 * @param {object} fieldResult - The field profiling result
 * @param {string} qvdFileName - The QVD file name
 * @returns {string} HTML content for visual analysis
 */
export function getVisualAnalysisHtml(
  webview,
  extensionPath,
  fieldResult,
  qvdFileName
) {
  const nonce = getNonce();
  const tabulatorJs = getTabulatorJs(extensionPath);
  const tabulatorCss = getTabulatorCss(extensionPath);
  const chartJs = getChartJs(extensionPath);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
      webview.cspSource
    } 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Profiling: ${escapeHtml(fieldResult.fieldName)}</title>
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
            flex-wrap: wrap;
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
            display: flex;
            align-items: center;
            gap: 4px;
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
        
        .tabulator .tabulator-footer .tabulator-paginator {
            color: var(--vscode-foreground) !important;
        }
        
        .tabulator .tabulator-footer .tabulator-page-counter {
            color: var(--vscode-foreground) !important;
            font-weight: 600 !important;
            opacity: 1 !important;
        }
        
        .tabulator .tabulator-footer .tabulator-page-size {
            color: var(--vscode-foreground) !important;
            font-weight: 600 !important;
        }
        
        /* Quality metrics styles */
        .quality-card {
            background-color: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 20px;
        }
        
        .quality-card.quality-good {
            border-left: 4px solid #10b981;
        }
        
        .quality-card.quality-warning {
            border-left: 4px solid #f59e0b;
        }
        
        .quality-card.quality-error {
            border-left: 4px solid #ef4444;
        }
        
        .quality-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .quality-score {
            font-size: 1.2em;
            font-weight: 700;
            padding: 4px 12px;
            border-radius: 4px;
        }
        
        .quality-score.good {
            background-color: #10b981;
            color: #fff;
        }
        
        .quality-score.warning {
            background-color: #f59e0b;
            color: #000;
        }
        
        .quality-score.error {
            background-color: #ef4444;
            color: #fff;
        }
        
        .quality-section {
            margin-bottom: 12px;
        }
        
        .quality-metric-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
            margin-top: 8px;
        }
        
        .quality-metric-item {
            background-color: var(--vscode-input-background);
            padding: 8px 12px;
            border-radius: 3px;
            border: 1px solid var(--vscode-input-border);
        }
        
        .quality-metric-label {
            color: var(--vscode-descriptionForeground);
            font-size: 0.85em;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .quality-metric-help {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            font-size: 10px;
            font-weight: bold;
            cursor: help;
            position: relative;
            flex-shrink: 0;
        }
        
        .quality-metric-help:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .quality-metric-tooltip {
            visibility: hidden;
            position: absolute;
            z-index: 10000;
            background-color: var(--vscode-editorHoverWidget-background);
            border: 1px solid var(--vscode-editorHoverWidget-border);
            color: var(--vscode-editorHoverWidget-foreground);
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 0.85em;
            line-height: 1.4;
            max-width: 300px;
            width: max-content;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            left: 20px;
            top: 50%;
            transform: translateY(-50%);
            white-space: pre-line;
            pointer-events: none;
        }
        
        /* Invisible bridge to keep tooltip open when moving mouse */
        .quality-metric-tooltip::before {
            content: '';
            position: absolute;
            right: 100%;
            top: 0;
            bottom: 0;
            width: 20px;
        }
        
        .quality-metric-help:hover .quality-metric-tooltip,
        .quality-metric-tooltip:hover {
            visibility: visible;
            pointer-events: auto;
        }
        
        .quality-metric-tooltip a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        
        .quality-metric-tooltip a:hover {
            text-decoration: underline;
        }
        
        .quality-metric-value {
            font-weight: 600;
            color: var(--vscode-foreground);
            font-size: 1em;
        }
        
        .quality-recommendation {
            margin-top: 12px;
            padding: 10px;
            background-color: var(--vscode-input-background);
            border-left: 3px solid var(--vscode-focusBorder);
            border-radius: 2px;
            font-size: 0.9em;
        }
        
        .quality-issues {
            margin-top: 12px;
        }
        
        .quality-issue-item {
            padding: 6px 10px;
            margin-bottom: 6px;
            border-radius: 3px;
            font-size: 0.9em;
        }
        
        .quality-issue-item.error {
            background-color: rgba(239, 68, 68, 0.1);
            border-left: 3px solid #ef4444;
        }
        
        .quality-issue-item.warning {
            background-color: rgba(245, 158, 11, 0.1);
            border-left: 3px solid #f59e0b;
        }
    </style>
</head>
<body>
    <h1>📊 ${escapeHtml(fieldResult.fieldName)}</h1>
    <div class="source">Source: ${escapeHtml(qvdFileName)}</div>
    
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
    
    ${
      fieldResult.truncated
        ? `
    <div style="padding: 10px; background-color: var(--vscode-inputValidation-warningBackground); border-left: 4px solid var(--vscode-inputValidation-warningBorder); margin-bottom: 20px; border-radius: 2px;">
        ⚠️ Distribution truncated to top ${fieldResult.truncatedAt} values
    </div>
    `
        : ""
    }
    
    ${
      fieldResult.isNumeric &&
      fieldResult.statistics &&
      fieldResult.statistics.isNumeric
        ? `
    <div style="background-color: var(--vscode-textBlockQuote-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 15px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 15px 0; font-size: 1.2em;">📈 Statistical Analysis</h2>
        
        <h3 style="margin: 0 0 10px 0; font-size: 1em; color: var(--vscode-descriptionForeground);">Descriptive Statistics</h3>
        <div class="stats-container" style="margin-bottom: 15px;">
            <div class="stat-item">
                <span class="stat-label">Min</span>
                <span class="stat-value">${fieldResult.statistics.descriptive.min.toLocaleString()}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Max</span>
                <span class="stat-value">${fieldResult.statistics.descriptive.max.toLocaleString()}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Mean</span>
                <span class="stat-value">${fieldResult.statistics.descriptive.mean.toFixed(
                  2
                )}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Median</span>
                <span class="stat-value">${fieldResult.statistics.descriptive.median.toFixed(
                  2
                )}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Sum</span>
                <span class="stat-value">${fieldResult.statistics.descriptive.sum.toLocaleString()}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Count</span>
                <span class="stat-value">${fieldResult.statistics.descriptive.count.toLocaleString()}</span>
            </div>
        </div>
        
        <h3 style="margin: 15px 0 10px 0; font-size: 1em; color: var(--vscode-descriptionForeground);">Spread Measures</h3>
        <div class="stats-container" style="margin-bottom: 15px;">
            <div class="stat-item">
                <span class="stat-label">Range</span>
                <span class="stat-value">${fieldResult.statistics.spread.range.toFixed(
                  2
                )}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Std Dev</span>
                <span class="stat-value">${fieldResult.statistics.spread.stdDev.toFixed(
                  2
                )}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Variance</span>
                <span class="stat-value">${fieldResult.statistics.spread.variance.toFixed(
                  2
                )}</span>
            </div>
        </div>
        
        <h3 style="margin: 15px 0 10px 0; font-size: 1em; color: var(--vscode-descriptionForeground);">Distribution Metrics</h3>
        <div class="stats-container" style="margin-bottom: 15px;">
            <div class="stat-item">
                <span class="stat-label">10th %ile</span>
                <span class="stat-value">${fieldResult.statistics.distribution.percentiles.p10.toFixed(
                  2
                )}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">50th %ile (Median)</span>
                <span class="stat-value">${fieldResult.statistics.distribution.percentiles.p50.toFixed(
                  2
                )}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">90th %ile</span>
                <span class="stat-value">${fieldResult.statistics.distribution.percentiles.p90.toFixed(
                  2
                )}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Skewness</span>
                <span class="stat-value">${
                  fieldResult.statistics.distribution.skewness !== null
                    ? fieldResult.statistics.distribution.skewness.toFixed(3)
                    : "N/A"
                }</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Kurtosis</span>
                <span class="stat-value">${
                  fieldResult.statistics.distribution.kurtosis !== null
                    ? fieldResult.statistics.distribution.kurtosis.toFixed(3)
                    : "N/A"
                }</span>
            </div>
        </div>
    </div>
    `
        : ""
    }
    
    ${
      fieldResult.isDate &&
      fieldResult.temporalAnalysis &&
      fieldResult.temporalAnalysis.isDate
        ? `
    <div style="background-color: var(--vscode-textBlockQuote-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 15px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 15px 0; font-size: 1.2em;">📅 Temporal Analysis</h2>
        
        <h3 style="margin: 0 0 10px 0; font-size: 1em; color: var(--vscode-descriptionForeground);">Date Range</h3>
        <div class="stats-container" style="margin-bottom: 15px;">
            <div class="stat-item">
                <span class="stat-label">
                    Earliest
                    ${createHelpIconHtml("temporalEarliest")}
                </span>
                <span class="stat-value">${fieldResult.temporalAnalysis.range.earliest ? new Date(fieldResult.temporalAnalysis.range.earliest).toISOString().split('T')[0] : 'N/A'}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">
                    Latest
                    ${createHelpIconHtml("temporalLatest")}
                </span>
                <span class="stat-value">${fieldResult.temporalAnalysis.range.latest ? new Date(fieldResult.temporalAnalysis.range.latest).toISOString().split('T')[0] : 'N/A'}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">
                    Time Span
                    ${createHelpIconHtml("temporalTimeSpan")}
                </span>
                <span class="stat-value">${fieldResult.temporalAnalysis.range.spanDescription}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">
                    Format
                    ${createHelpIconHtml("temporalFormat")}
                </span>
                <span class="stat-value">${fieldResult.temporalAnalysis.range.format.formatDescription}</span>
            </div>
        </div>
        
        ${fieldResult.temporalAnalysis.distribution.byYear.length > 0 ? `
        <h3 style="margin: 15px 0 10px 0; font-size: 1em; color: var(--vscode-descriptionForeground);">
            Yearly Distribution
            ${createHelpIconHtml("temporalYearlyDistribution")}
        </h3>
        <div class="stats-container" style="margin-bottom: 15px; max-height: 200px; overflow-y: auto;">
            ${fieldResult.temporalAnalysis.distribution.byYear.slice(0, 10).map(item => `
            <div class="stat-item">
                <span class="stat-label">${item.period}</span>
                <span class="stat-value">${item.count.toLocaleString()}</span>
            </div>
            `).join('')}
        </div>
        ` : ''}
        
        ${fieldResult.temporalAnalysis.distribution.byMonth.length > 0 ? `
        <h3 style="margin: 15px 0 10px 0; font-size: 1em; color: var(--vscode-descriptionForeground);">
            Monthly Distribution
            ${createHelpIconHtml("temporalMonthlyDistribution")}
        </h3>
        <div class="stats-container" style="margin-bottom: 15px;">
            ${fieldResult.temporalAnalysis.distribution.byMonth.map(item => `
            <div class="stat-item">
                <span class="stat-label">${item.period}</span>
                <span class="stat-value">${item.count.toLocaleString()}</span>
            </div>
            `).join('')}
        </div>
        ` : ''}
        
        ${fieldResult.temporalAnalysis.distribution.byDayOfWeek.length > 0 ? `
        <h3 style="margin: 15px 0 10px 0; font-size: 1em; color: var(--vscode-descriptionForeground);">
            Day of Week Distribution
            ${createHelpIconHtml("temporalDayOfWeekDistribution")}
        </h3>
        <div class="stats-container" style="margin-bottom: 15px;">
            ${fieldResult.temporalAnalysis.distribution.byDayOfWeek.map(item => `
            <div class="stat-item">
                <span class="stat-label">${item.period}</span>
                <span class="stat-value">${item.count.toLocaleString()}</span>
            </div>
            `).join('')}
        </div>
        ` : ''}
        
        ${fieldResult.temporalAnalysis.gaps ? `
        <h3 style="margin: 15px 0 10px 0; font-size: 1em; color: var(--vscode-descriptionForeground);">Gap Analysis</h3>
        <div class="stats-container" style="margin-bottom: 15px;">
            <div class="stat-item">
                <span class="stat-label">
                    Has Gaps
                    ${createHelpIconHtml("temporalHasGaps")}
                </span>
                <span class="stat-value">${fieldResult.temporalAnalysis.gaps.hasGaps ? 'Yes' : 'No'}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">
                    Gap Count
                    ${createHelpIconHtml("temporalGapCount")}
                </span>
                <span class="stat-value">${fieldResult.temporalAnalysis.gaps.gapCount}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">
                    Coverage
                    ${createHelpIconHtml("temporalCoverage")}
                </span>
                <span class="stat-value">${fieldResult.temporalAnalysis.gaps.coverage.toFixed(1)}%</span>
            </div>
            ${fieldResult.temporalAnalysis.gaps.largestGap ? `
            <div class="stat-item">
                <span class="stat-label">
                    Largest Gap
                    ${createHelpIconHtml("temporalLargestGap")}
                </span>
                <span class="stat-value">${fieldResult.temporalAnalysis.gaps.largestGap.days} days</span>
            </div>
            ` : ''}
        </div>
        ` : ''}
        
        ${fieldResult.temporalAnalysis.trends ? `
        <h3 style="margin: 15px 0 10px 0; font-size: 1em; color: var(--vscode-descriptionForeground);">Trend Analysis</h3>
        <div class="stats-container" style="margin-bottom: 15px;">
            <div class="stat-item">
                <span class="stat-label">
                    Trend Type
                    ${createHelpIconHtml("temporalTrendType")}
                </span>
                <span class="stat-value">${fieldResult.temporalAnalysis.trends.trendType.replace(/_/g, ' ')}</span>
            </div>
            <div class="stat-item" style="grid-column: span 2;">
                <span class="stat-label">
                    Description
                    ${createHelpIconHtml("temporalTrendDescription")}
                </span>
                <span class="stat-value">${fieldResult.temporalAnalysis.trends.description}</span>
            </div>
        </div>
        ` : ''}
        
        <h3 style="margin: 15px 0 10px 0; font-size: 1em; color: var(--vscode-descriptionForeground);">Data Quality</h3>
        <div class="stats-container">
            <div class="stat-item">
                <span class="stat-label">
                    Valid Dates
                    ${createHelpIconHtml("temporalValidDates")}
                </span>
                <span class="stat-value">${fieldResult.temporalAnalysis.quality.validDateCount.toLocaleString()}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">
                    Invalid Dates
                    ${createHelpIconHtml("temporalInvalidDates")}
                </span>
                <span class="stat-value">${fieldResult.temporalAnalysis.quality.invalidDateCount.toLocaleString()}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Null Count</span>
                <span class="stat-value">${fieldResult.temporalAnalysis.quality.nullCount.toLocaleString()}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">
                    Valid %
                    ${createHelpIconHtml("temporalValidPercentage")}
                </span>
                <span class="stat-value">${fieldResult.temporalAnalysis.quality.validPercentage.toFixed(1)}%</span>
            </div>
        </div>
    </div>
    `
        : ""
    }
    
    ${
      fieldResult.qualityMetrics && !fieldResult.qualityMetrics.error
        ? `
    <div class="quality-card quality-${
      fieldResult.qualityMetrics.assessment.color === "green"
        ? "good"
        : fieldResult.qualityMetrics.assessment.color === "yellow"
        ? "warning"
        : "error"
    }">
        <div class="quality-header">
            <h2 style="margin: 0; font-size: 1.2em;">🎯 Data Quality Assessment</h2>
            <span class="quality-score ${
              fieldResult.qualityMetrics.assessment.color === "green"
                ? "good"
                : fieldResult.qualityMetrics.assessment.color === "yellow"
                ? "warning"
                : "error"
            }">
                ${fieldResult.qualityMetrics.assessment.qualityScore}/100 - ${
            fieldResult.qualityMetrics.assessment.qualityLevel
          }
            </span>
        </div>
        
        ${
          fieldResult.qualityMetrics.assessment.issues.length > 0
            ? `
        <div class="quality-issues">
            ${fieldResult.qualityMetrics.assessment.issues
              .map(
                (issue) =>
                  `<div class="quality-issue-item error">❌ ${issue}</div>`
              )
              .join("")}
        </div>
        `
            : ""
        }
        
        ${
          fieldResult.qualityMetrics.assessment.warnings.length > 0
            ? `
        <div class="quality-issues">
            ${fieldResult.qualityMetrics.assessment.warnings
              .map(
                (warning) =>
                  `<div class="quality-issue-item warning">⚠️ ${warning}</div>`
              )
              .join("")}
        </div>
        `
            : ""
        }
        
        <div class="quality-section">
            <h3 style="margin: 10px 0; font-size: 1em; color: var(--vscode-descriptionForeground);">📋 Completeness</h3>
            <div class="quality-metric-grid">
                <div class="quality-metric-item">
                    <div class="quality-metric-label">
                        <span>Non-Null %</span>
                        ${createHelpIconHtml("nonNullPercentage")}
                    </div>
                    <div class="quality-metric-value">${fieldResult.qualityMetrics.completeness.nonNullPercentage.toFixed(
                      1
                    )}%</div>
                </div>
                <div class="quality-metric-item">
                    <div class="quality-metric-label">
                        <span>Fill Rate</span>
                        ${createHelpIconHtml("fillRate")}
                    </div>
                    <div class="quality-metric-value">${fieldResult.qualityMetrics.completeness.fillRate.toFixed(
                      1
                    )}%</div>
                </div>
                <div class="quality-metric-item">
                    <div class="quality-metric-label">
                        <span>Missing Values</span>
                        ${createHelpIconHtml("missingValues")}
                    </div>
                    <div class="quality-metric-value">${fieldResult.qualityMetrics.completeness.missingCount.toLocaleString()} (${fieldResult.qualityMetrics.completeness.missingPercentage.toFixed(
            1
          )}%)</div>
                </div>
                ${
                  fieldResult.qualityMetrics.completeness.emptyStringCount > 0
                    ? `
                <div class="quality-metric-item">
                    <div class="quality-metric-label">
                        <span>Empty Strings</span>
                        ${createHelpIconHtml("emptyStrings")}
                    </div>
                    <div class="quality-metric-value">${fieldResult.qualityMetrics.completeness.emptyStringCount.toLocaleString()} (${fieldResult.qualityMetrics.completeness.emptyStringPercentage.toFixed(
                        1
                      )}%)</div>
                </div>
                `
                    : ""
                }
            </div>
        </div>
        
        <div class="quality-section">
            <h3 style="margin: 10px 0; font-size: 1em; color: var(--vscode-descriptionForeground);">🔢 Cardinality</h3>
            <div class="quality-metric-grid">
                <div class="quality-metric-item">
                    <div class="quality-metric-label">
                        <span>Cardinality Ratio</span>
                        ${createHelpIconHtml("cardinalityRatio")}
                    </div>
                    <div class="quality-metric-value">${(
                      fieldResult.qualityMetrics.cardinality.ratio * 100
                    ).toFixed(2)}%</div>
                </div>
                <div class="quality-metric-item">
                    <div class="quality-metric-label">
                        <span>Classification</span>
                        ${createHelpIconHtml("classification")}
                    </div>
                    <div class="quality-metric-value">${
                      fieldResult.qualityMetrics.cardinality.level
                    }</div>
                </div>
            </div>
            <div class="quality-recommendation">
                💡 <strong>Recommendation:</strong> ${
                  fieldResult.qualityMetrics.cardinality.recommendation
                }
            </div>
        </div>
        
        <div class="quality-section">
            <h3 style="margin: 10px 0; font-size: 1em; color: var(--vscode-descriptionForeground);">🔍 Uniqueness</h3>
            <div class="quality-metric-grid">
                <div class="quality-metric-item">
                    <div class="quality-metric-label">
                        <span>Unique Values</span>
                        ${createHelpIconHtml("uniqueValues")}
                    </div>
                    <div class="quality-metric-value">${fieldResult.qualityMetrics.uniqueness.uniquePercentage.toFixed(
                      1
                    )}%</div>
                </div>
                <div class="quality-metric-item">
                    <div class="quality-metric-label">
                        <span>Duplicate Count</span>
                        ${createHelpIconHtml("duplicateCount")}
                    </div>
                    <div class="quality-metric-value">${fieldResult.qualityMetrics.uniqueness.duplicateCount.toLocaleString()} (${fieldResult.qualityMetrics.uniqueness.duplicatePercentage.toFixed(
            1
          )}%)</div>
                </div>
                ${
                  fieldResult.qualityMetrics.uniqueness
                    .duplicatedDistinctValues > 0
                    ? `
                <div class="quality-metric-item">
                    <div class="quality-metric-label">
                        <span>Duplicated Distinct Values</span>
                        ${createHelpIconHtml("duplicatedDistinctValues")}
                    </div>
                    <div class="quality-metric-value">${fieldResult.qualityMetrics.uniqueness.duplicatedDistinctValues.toLocaleString()}</div>
                </div>
                `
                    : ""
                }
            </div>
            ${
              fieldResult.qualityMetrics.uniqueness.topDuplicates &&
              fieldResult.qualityMetrics.uniqueness.topDuplicates.length > 0
                ? `
            <div style="margin-top: 10px;">
                <div style="font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 6px;">Top Duplicated Values:</div>
                <div style="max-height: 200px; overflow-y: auto;">
                    ${fieldResult.qualityMetrics.uniqueness.topDuplicates
                      .map(
                        (dup) => `
                    <div style="display: flex; justify-content: space-between; padding: 4px 8px; font-size: 0.85em; border-bottom: 1px solid var(--vscode-panel-border);">
                        <span>${dup.value}</span>
                        <span>${dup.count.toLocaleString()} (${
                          dup.percentage
                        }%)</span>
                    </div>
                    `
                      )
                      .join("")}
                </div>
            </div>
            `
                : ""
            }
        </div>
        
        <div class="quality-section">
            <h3 style="margin: 10px 0; font-size: 1em; color: var(--vscode-descriptionForeground);">📊 Distribution Quality</h3>
            <div class="quality-metric-grid">
                <div class="quality-metric-item">
                    <div class="quality-metric-label">
                        <span>Evenness Score</span>
                        ${createHelpIconHtml("evennessScore")}
                    </div>
                    <div class="quality-metric-value">${(
                      fieldResult.qualityMetrics.distribution.evennessScore *
                      100
                    ).toFixed(1)}%</div>
                </div>
                <div class="quality-metric-item">
                    <div class="quality-metric-label">
                        <span>Distribution Type</span>
                        ${createHelpIconHtml("distributionType")}
                    </div>
                    <div class="quality-metric-value">${
                      fieldResult.qualityMetrics.distribution.skewness
                    }</div>
                </div>
                <div class="quality-metric-item">
                    <div class="quality-metric-label">
                        <span>Shannon Entropy</span>
                        ${createHelpIconHtml("shannonEntropy")}
                    </div>
                    <div class="quality-metric-value">${fieldResult.qualityMetrics.distribution.shannonEntropy.toFixed(
                      3
                    )}</div>
                </div>
            </div>
        </div>
    </div>
    `
        : ""
    }
    
    ${
      fieldResult.isNumeric &&
      fieldResult.statistics &&
      fieldResult.statistics.isNumeric
        ? `
    <div style="margin: 15px 0; display: flex; gap: 10px; justify-content: center;">
        <button id="btn-histogram" class="chart-toggle-btn active" style="padding: 8px 16px; border: 1px solid var(--vscode-button-border); background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; border-radius: 3px;">Histogram</button>
        <button id="btn-frequency" class="chart-toggle-btn" style="padding: 8px 16px; border: 1px solid var(--vscode-button-border); background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); cursor: pointer; border-radius: 3px;">Frequency Chart</button>
    </div>
    `
        : ""
    }
    
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
        let currentChart = null;
        let currentTable = null;
        
        function createHistogram() {
            if (currentChart) {
                currentChart.destroy();
            }
            
            const stats = fieldResult.statistics;
            
            // Extract numeric values from distribution (unique values only, no expansion)
            const uniqueNumericValues = [];
            fieldResult.distributions.forEach(dist => {
                const value = parseFloat(dist.value);
                if (!isNaN(value)) {
                    uniqueNumericValues.push(value);
                }
            });
            
            if (uniqueNumericValues.length === 0) {
                return;
            }
            
            // Use min/max from the actual values in distribution, not theoretical stats
            const min = Math.min(...uniqueNumericValues);
            const max = Math.max(...uniqueNumericValues);
            
            // Use total count for bin calculation (excluding nulls)
            const totalCount = fieldResult.totalRows - fieldResult.nullCount;
            const binCount = Math.min(20, Math.ceil(Math.sqrt(totalCount)));
            const binWidth = (max - min) / binCount;
            
            // Initialize bins
            const bins = Array(binCount).fill(0);
            const binLabels = [];
            
            // Create bin labels
            for (let i = 0; i < binCount; i++) {
                const binStart = min + i * binWidth;
                const binEnd = min + (i + 1) * binWidth;
                binLabels.push(\`\${binStart.toFixed(1)}-\${binEnd.toFixed(1)}\`);
            }
            
            // Count values in each bin using distribution counts
            fieldResult.distributions.forEach(dist => {
                const value = parseFloat(dist.value);
                if (!isNaN(value)) {
                    let binIndex;
                    if (binWidth === 0) {
                        binIndex = 0;
                    } else {
                        binIndex = Math.floor((value - min) / binWidth);
                        if (binIndex >= binCount) binIndex = binCount - 1;
                    }
                    bins[binIndex] += dist.count;
                }
            });
            
            currentChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: binLabels,
                    datasets: [{
                        label: 'Frequency',
                        data: bins,
                        backgroundColor: 'rgba(75, 192, 192, 0.6)',
                        borderColor: 'rgba(75, 192, 192, 1)',
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
                            text: 'Histogram: Value Distribution',
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
                            },
                            title: {
                                display: true,
                                text: 'Frequency',
                                color: getComputedStyle(document.body).getPropertyValue('--vscode-foreground')
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
                            },
                            title: {
                                display: true,
                                text: 'Value Range',
                                color: getComputedStyle(document.body).getPropertyValue('--vscode-foreground')
                            }
                        }
                    }
                }
            });
            
            // Update table with histogram data (using totalCount already declared above)
            const histogramData = binLabels.map((label, i) => {
                // Split the range label into from and to
                const [from, to] = label.split('-');
                return {
                    from: from,
                    to: to,
                    count: bins[i],
                    percentage: totalCount > 0 ? ((bins[i] / totalCount) * 100).toFixed(2) : '0.00'
                };
            });
            
            if (currentTable) {
                currentTable.destroy();
            }
            
            currentTable = new Tabulator('#profiling-table', {
                data: histogramData,
                columns: [
                    { title: 'From', field: 'from', headerSort: true, widthGrow: 1 },
                    { title: 'To', field: 'to', headerSort: true, widthGrow: 1 },
                    { title: 'Count', field: 'count', headerSort: true, widthGrow: 1 },
                    { title: 'Percentage', field: 'percentage', headerSort: true, widthGrow: 1, 
                      formatter: (cell) => cell.getValue() + '%' }
                ],
                layout: 'fitDataStretch',
                pagination: true,
                paginationSize: 50,
                paginationSizeSelector: [25, 50, 100],
                paginationCounter: 'rows',
                resizableColumns: true
            });
        }
        
        function createFrequencyChart() {
            if (currentChart) {
                currentChart.destroy();
            }
            
            const topN = Math.min(20, fieldResult.distributions.length);
            const chartData = fieldResult.distributions.slice(0, topN);
            
            currentChart = new Chart(ctx, {
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
            
            // Update table with frequency data
            if (currentTable) {
                currentTable.destroy();
            }
            
            currentTable = new Tabulator('#profiling-table', {
                data: fieldResult.distributions,
                columns: [
                    { title: 'Value', field: 'value', headerSort: true, widthGrow: 2 },
                    { title: 'Count', field: 'count', headerSort: true, widthGrow: 1 },
                    { title: 'Percentage', field: 'percentage', headerSort: true, widthGrow: 1, 
                      formatter: (cell) => cell.getValue() + '%' }
                ],
                layout: 'fitDataStretch',
                pagination: true,
                paginationSize: 50,
                paginationSizeSelector: [25, 50, 100],
                paginationCounter: 'rows',
                resizableColumns: true
            });
        }
        
        // Create initial chart based on field type
        if (fieldResult.isNumeric && fieldResult.statistics && fieldResult.statistics.isNumeric) {
            createHistogram();
            
            // Add event listeners for chart toggle buttons
            document.getElementById('btn-histogram').addEventListener('click', function() {
                createHistogram();
                document.querySelectorAll('.chart-toggle-btn').forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                this.style.background = 'var(--vscode-button-background)';
                this.style.color = 'var(--vscode-button-foreground)';
                document.getElementById('btn-frequency').style.background = 'var(--vscode-button-secondaryBackground)';
                document.getElementById('btn-frequency').style.color = 'var(--vscode-button-secondaryForeground)';
            });
            
            document.getElementById('btn-frequency').addEventListener('click', function() {
                createFrequencyChart();
                document.querySelectorAll('.chart-toggle-btn').forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                this.style.background = 'var(--vscode-button-background)';
                this.style.color = 'var(--vscode-button-foreground)';
                document.getElementById('btn-histogram').style.background = 'var(--vscode-button-secondaryBackground)';
                document.getElementById('btn-histogram').style.color = 'var(--vscode-button-secondaryForeground)';
            });
        } else {
            createFrequencyChart();
        }
    </script>
</body>
</html>`;
}
