import * as vscode from "vscode";
import {
  getNonce,
  getTabulatorJs,
  getTabulatorCss,
  getChartJs,
} from "../assetLoader.mjs";
import { escapeHtml } from "./errorTemplate.mjs";
import DataExporter from "../../exporters/index.mjs";
import { metricHelpContent } from "../qualityMetricHelp.mjs";

/**
 * Generate HTML for webview with tabbed interface and Tabulator
 * @param {object} result - The QVD read result
 * @param {object} webview - The webview object
 * @param {object} context - The extension context
 * @returns {string} HTML content for the main webview
 */
export function getHtmlForWebview(result, webview, context) {
  const { metadata, data, totalRows, dataError } = result;
  const hasMoreRows = data.length < totalRows;
  const nonce = getNonce();

  // Inline Tabulator for easier CSP compliance
  const tabulatorJs = getTabulatorJs(context.extensionPath);
  const tabulatorCss = getTabulatorCss(context.extensionPath);
  const chartJs = getChartJs(context.extensionPath);

  // Get the logo URI for the webview
  const logoUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      context.extensionUri,
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
        
        .statistics-card {
            background-color: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 15px;
        }
        
        .statistics-section {
            margin-bottom: 10px;
        }
        
        .statistics-section:last-child {
            margin-bottom: 0;
        }
        
        .quality-card {
            background-color: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 15px;
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
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
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
        
        .quality-section:last-child {
            margin-bottom: 0;
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
            color: var(--vscode-foreground);
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
        
        .quality-duplicates-list {
            margin-top: 8px;
            max-height: 200px;
            overflow-y: auto;
        }
        
        .quality-duplicate-item {
            display: flex;
            justify-content: space-between;
            padding: 4px 8px;
            font-size: 0.85em;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .quality-duplicate-item:last-child {
            border-bottom: none;
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
                    ⚠️ Unable to load data: ${escapeHtml(dataError)}
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
                                                   id="field-${escapeHtml(
                                                     field.name
                                                   )}" 
                                                   name="field-checkbox" 
                                                   value="${escapeHtml(
                                                     field.name
                                                   )}">
                                            <label for="field-${escapeHtml(
                                              field.name
                                            )}">
                                                ${escapeHtml(field.name)}
                                                <span class="field-unique-count">(${
                                                  field.noOfSymbols
                                                } unique values)</span>
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
        ${chartJs}
    </script>
    
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const totalRowsInFile = ${totalRows};
        const currentLoadedRows = ${data.length};
        
        // Logging helper - sends logs to extension
        const logger = {
            log: (message, data) => {
                vscode.postMessage({ command: 'log', level: 'log', message, data });
                console.log(message, data || '');
            },
            error: (message, data) => {
                vscode.postMessage({ command: 'log', level: 'error', message, data });
                console.error(message, data || '');
            },
            warn: (message, data) => {
                vscode.postMessage({ command: 'log', level: 'warn', message, data });
                console.warn(message, data || '');
            }
        };
        
        // Data for tables
        const tableData = ${JSON.stringify(data)};
        const schemaData = ${JSON.stringify(schemaData)};
        const metadataData = ${JSON.stringify(metadataKV)};
        const lineageData = ${JSON.stringify(lineageData)};
        
        // Available field names for profiling
        const availableFields = ${JSON.stringify(
          metadata && metadata.fields ? metadata.fields.map((f) => f.name) : []
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
            logger.log('Initializing tables...');
            logger.log('tableData length:', tableData ? tableData.length : 'undefined');
            logger.log('Tabulator available:', typeof Tabulator !== 'undefined');
            
            try {
                // Initialize Data Table
                if (tableData.length > 0) {
                    const columns = Object.keys(tableData[0]).map(key => ({
                        title: key,
                        field: key,
                        headerSort: true,
                        headerFilter: false
                    }));
                    
                    logger.log('Creating data table with', columns.length, 'columns');
                    
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
                    
                    logger.log('Data table created successfully');
                    
                    // Add context menu handler
                    dataTable.on("cellContext", function(e, cell){
                        e.preventDefault();
                        showContextMenu(e, cell);
                    });
                }
            } catch (error) {
                logger.error('Error initializing data table:', error);
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
            try {
                if (results.error) {
                    showProfilingStatus('❌ ' + results.error, 'warning');
                    return;
                }
                
                
                // Helper function to create help icon with tooltip
                function createHelpIcon(metricKey) {
                    const help = ${JSON.stringify(
                      metricHelpContent
                    )}[metricKey];
                    if (!help) return '';
                    
                    // Escape HTML special characters in the text
                    const escapedText = help.text
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;');
                    
                    return \`<span class="quality-metric-help">?
                        <span class="quality-metric-tooltip">
                            \${escapedText}
                            <br/><br/>
                            <a href="\${help.link}" target="_blank" rel="noopener noreferrer">Learn more →</a>
                        </span>
                    </span>\`;
                }
                
                currentProfilingResults = results;
                const resultsDiv = document.getElementById('profiling-results');
                resultsDiv.innerHTML = '';
                
                // Destroy existing charts
                profilingCharts.forEach(chart => chart.destroy());
                profilingCharts = [];
                
                // Display results for each field
                results.fields.forEach((fieldResult, index) => {
                logger.log(\`Processing field \${index}: \${fieldResult.fieldName}, isNumeric: \${fieldResult.isNumeric}, hasStats: \${!!fieldResult.statistics}\`);
                
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
                
                // Add statistics card for numeric fields
                if (fieldResult.isNumeric && fieldResult.statistics && fieldResult.statistics.isNumeric) {
                    const stats = fieldResult.statistics;
                    const statisticsCard = document.createElement('div');
                    statisticsCard.className = 'statistics-card';
                    statisticsCard.innerHTML = \`
                        <h4 style="margin: 0 0 15px 0; color: var(--vscode-foreground);">📈 Statistical Analysis</h4>
                        
                        <div class="statistics-section">
                            <h5 style="margin: 0 0 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">Descriptive Statistics</h5>
                            <div class="field-stats">
                                <div class="field-stat-item">
                                    <span class="field-stat-label">Min</span>
                                    <span class="field-stat-value">\${stats.descriptive.min.toLocaleString()}</span>
                                </div>
                                <div class="field-stat-item">
                                    <span class="field-stat-label">Max</span>
                                    <span class="field-stat-value">\${stats.descriptive.max.toLocaleString()}</span>
                                </div>
                                <div class="field-stat-item">
                                    <span class="field-stat-label">Mean</span>
                                    <span class="field-stat-value">\${stats.descriptive.mean.toFixed(2)}</span>
                                </div>
                                <div class="field-stat-item">
                                    <span class="field-stat-label">Median</span>
                                    <span class="field-stat-value">\${stats.descriptive.median.toFixed(2)}</span>
                                </div>
                                <div class="field-stat-item">
                                    <span class="field-stat-label">Sum</span>
                                    <span class="field-stat-value">\${stats.descriptive.sum.toLocaleString()}</span>
                                </div>
                                <div class="field-stat-item">
                                    <span class="field-stat-label">Count</span>
                                    <span class="field-stat-value">\${stats.descriptive.count.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="statistics-section" style="margin-top: 15px;">
                            <h5 style="margin: 0 0 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">Spread Measures</h5>
                            <div class="field-stats">
                                <div class="field-stat-item">
                                    <span class="field-stat-label">Range</span>
                                    <span class="field-stat-value">\${stats.spread.range.toFixed(2)}</span>
                                </div>
                                <div class="field-stat-item">
                                    <span class="field-stat-label">Std Dev</span>
                                    <span class="field-stat-value">\${stats.spread.stdDev.toFixed(2)}</span>
                                </div>
                                <div class="field-stat-item">
                                    <span class="field-stat-label">Variance</span>
                                    <span class="field-stat-value">\${stats.spread.variance.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="statistics-section" style="margin-top: 15px;">
                            <h5 style="margin: 0 0 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">Distribution Metrics</h5>
                            <div class="field-stats">
                                <div class="field-stat-item">
                                    <span class="field-stat-label">10th %ile</span>
                                    <span class="field-stat-value">\${stats.distribution.percentiles.p10.toFixed(2)}</span>
                                </div>
                                <div class="field-stat-item">
                                    <span class="field-stat-label">50th %ile (Median)</span>
                                    <span class="field-stat-value">\${stats.distribution.percentiles.p50.toFixed(2)}</span>
                                </div>
                                <div class="field-stat-item">
                                    <span class="field-stat-label">90th %ile</span>
                                    <span class="field-stat-value">\${stats.distribution.percentiles.p90.toFixed(2)}</span>
                                </div>
                                <div class="field-stat-item">
                                    <span class="field-stat-label">Skewness</span>
                                    <span class="field-stat-value">\${stats.distribution.skewness !== null ? stats.distribution.skewness.toFixed(3) : 'N/A'}</span>
                                </div>
                                <div class="field-stat-item">
                                    <span class="field-stat-label">Kurtosis</span>
                                    <span class="field-stat-value">\${stats.distribution.kurtosis !== null ? stats.distribution.kurtosis.toFixed(3) : 'N/A'}</span>
                                </div>
                            </div>
                        </div>
                    \`;
                    card.appendChild(statisticsCard);
                }
                
                // Add data quality metrics card
                if (fieldResult.qualityMetrics && !fieldResult.qualityMetrics.error) {
                    const quality = fieldResult.qualityMetrics;
                    const assessment = quality.assessment;
                    
                    const qualityCard = document.createElement('div');
                    qualityCard.className = \`quality-card quality-\${assessment.color === 'green' ? 'good' : assessment.color === 'yellow' ? 'warning' : 'error'}\`;
                    
                    let qualityHtml = \`
                        <div class="quality-header">
                            <h4 style="margin: 0; color: var(--vscode-foreground);">🎯 Data Quality Assessment</h4>
                            <span class="quality-score \${assessment.color === 'green' ? 'good' : assessment.color === 'yellow' ? 'warning' : 'error'}">
                                \${assessment.qualityScore}/100 - \${assessment.qualityLevel}
                            </span>
                        </div>
                    \`;
                    
                    // Show issues if any
                    if (assessment.issues.length > 0) {
                        qualityHtml += '<div class="quality-issues">';
                        assessment.issues.forEach(issue => {
                            qualityHtml += \`<div class="quality-issue-item error">❌ \${issue}</div>\`;
                        });
                        qualityHtml += '</div>';
                    }
                    
                    // Show warnings if any
                    if (assessment.warnings.length > 0) {
                        qualityHtml += '<div class="quality-issues">';
                        assessment.warnings.forEach(warning => {
                            qualityHtml += \`<div class="quality-issue-item warning">⚠️ \${warning}</div>\`;
                        });
                        qualityHtml += '</div>';
                    }
                    
                    // Completeness section
                    qualityHtml += \`
                        <div class="quality-section">
                            <h5 style="margin: 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">📋 Completeness</h5>
                            <div class="quality-metric-grid">
                                <div class="quality-metric-item">
                                    <div class="quality-metric-label">
                                        <span>Non-Null %</span>
                                        \${createHelpIcon('nonNullPercentage')}
                                    </div>
                                    <div class="quality-metric-value">\${quality.completeness.nonNullPercentage.toFixed(1)}%</div>
                                </div>
                                <div class="quality-metric-item">
                                    <div class="quality-metric-label">
                                        <span>Fill Rate</span>
                                        \${createHelpIcon('fillRate')}
                                    </div>
                                    <div class="quality-metric-value">\${quality.completeness.fillRate.toFixed(1)}%</div>
                                </div>
                                <div class="quality-metric-item">
                                    <div class="quality-metric-label">
                                        <span>Missing Values</span>
                                        \${createHelpIcon('missingValues')}
                                    </div>
                                    <div class="quality-metric-value">\${quality.completeness.missingCount.toLocaleString()} (\${quality.completeness.missingPercentage.toFixed(1)}%)</div>
                                </div>
                    \`;
                    
                    if (quality.completeness.emptyStringCount > 0) {
                        qualityHtml += \`
                                <div class="quality-metric-item">
                                    <div class="quality-metric-label">
                                        <span>Empty Strings</span>
                                        \${createHelpIcon('emptyStrings')}
                                    </div>
                                    <div class="quality-metric-value">\${quality.completeness.emptyStringCount.toLocaleString()} (\${quality.completeness.emptyStringPercentage.toFixed(1)}%)</div>
                                </div>
                        \`;
                    }
                    
                    qualityHtml += '</div></div>';
                    
                    // Cardinality section
                    qualityHtml += \`
                        <div class="quality-section">
                            <h5 style="margin: 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">🔢 Cardinality</h5>
                            <div class="quality-metric-grid">
                                <div class="quality-metric-item">
                                    <div class="quality-metric-label">
                                        <span>Cardinality Ratio</span>
                                        \${createHelpIcon('cardinalityRatio')}
                                    </div>
                                    <div class="quality-metric-value">\${(quality.cardinality.ratio * 100).toFixed(2)}%</div>
                                </div>
                                <div class="quality-metric-item">
                                    <div class="quality-metric-label">
                                        <span>Classification</span>
                                        \${createHelpIcon('classification')}
                                    </div>
                                    <div class="quality-metric-value">\${quality.cardinality.level}</div>
                                </div>
                            </div>
                            <div class="quality-recommendation">
                                💡 <strong>Recommendation:</strong> \${quality.cardinality.recommendation}
                            </div>
                        </div>
                    \`;
                    
                    // Uniqueness section
                    qualityHtml += \`
                        <div class="quality-section">
                            <h5 style="margin: 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">🔍 Uniqueness</h5>
                            <div class="quality-metric-grid">
                                <div class="quality-metric-item">
                                    <div class="quality-metric-label">
                                        <span>Unique Values</span>
                                        \${createHelpIcon('uniqueValues')}
                                    </div>
                                    <div class="quality-metric-value">\${quality.uniqueness.uniquePercentage.toFixed(1)}%</div>
                                </div>
                                <div class="quality-metric-item">
                                    <div class="quality-metric-label">
                                        <span>Duplicate Count</span>
                                        \${createHelpIcon('duplicateCount')}
                                    </div>
                                    <div class="quality-metric-value">\${quality.uniqueness.duplicateCount.toLocaleString()} (\${quality.uniqueness.duplicatePercentage.toFixed(1)}%)</div>
                                </div>
                    \`;
                    
                    if (quality.uniqueness.duplicatedDistinctValues > 0) {
                        qualityHtml += \`
                                <div class="quality-metric-item">
                                    <div class="quality-metric-label">
                                        <span>Duplicated Distinct Values</span>
                                        \${createHelpIcon('duplicatedDistinctValues')}
                                    </div>
                                    <div class="quality-metric-value">\${quality.uniqueness.duplicatedDistinctValues.toLocaleString()}</div>
                                </div>
                        \`;
                    }
                    
                    qualityHtml += '</div>';
                    
                    // Show top duplicates if any
                    if (quality.uniqueness.topDuplicates && quality.uniqueness.topDuplicates.length > 0) {
                        qualityHtml += \`
                            <div style="margin-top: 10px;">
                                <div style="font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 6px;">Top Duplicated Values:</div>
                                <div class="quality-duplicates-list">
                        \`;
                        
                        quality.uniqueness.topDuplicates.forEach(dup => {
                            qualityHtml += \`
                                <div class="quality-duplicate-item">
                                    <span>\${dup.value}</span>
                                    <span>\${dup.count.toLocaleString()} (\${dup.percentage}%)</span>
                                </div>
                            \`;
                        });
                        
                        qualityHtml += '</div></div>';
                    }
                    
                    qualityHtml += '</div>';
                    
                    // Distribution quality section
                    qualityHtml += \`
                        <div class="quality-section">
                            <h5 style="margin: 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">📊 Distribution Quality</h5>
                            <div class="quality-metric-grid">
                                <div class="quality-metric-item">
                                    <div class="quality-metric-label">
                                        <span>Evenness Score</span>
                                        \${createHelpIcon('evennessScore')}
                                    </div>
                                    <div class="quality-metric-value">\${(quality.distribution.evennessScore * 100).toFixed(1)}%</div>
                                </div>
                                <div class="quality-metric-item">
                                    <div class="quality-metric-label">
                                        <span>Distribution Type</span>
                                        \${createHelpIcon('distributionType')}
                                    </div>
                                    <div class="quality-metric-value">\${quality.distribution.skewness}</div>
                                </div>
                                <div class="quality-metric-item">
                                    <div class="quality-metric-label">
                                        <span>Shannon Entropy</span>
                                        \${createHelpIcon('shannonEntropy')}
                                    </div>
                                    <div class="quality-metric-value">\${quality.distribution.shannonEntropy.toFixed(3)}</div>
                                </div>
                            </div>
                        </div>
                    \`;
                    
                    qualityCard.innerHTML = qualityHtml;
                    card.appendChild(qualityCard);
                }
                
                // Add chart toggle buttons for numeric fields
                if (fieldResult.isNumeric && fieldResult.statistics && fieldResult.statistics.isNumeric) {
                    const toggleContainer = document.createElement('div');
                    toggleContainer.style.margin = '15px 0';
                    toggleContainer.style.display = 'flex';
                    toggleContainer.style.gap = '10px';
                    toggleContainer.style.justifyContent = 'center';
                    
                    const histogramBtn = document.createElement('button');
                    histogramBtn.id = \`btn-histogram-\${index}\`;
                    histogramBtn.className = 'chart-toggle-btn active';
                    histogramBtn.textContent = 'Histogram';
                    histogramBtn.style.padding = '8px 16px';
                    histogramBtn.style.border = '1px solid var(--vscode-button-border)';
                    histogramBtn.style.background = 'var(--vscode-button-background)';
                    histogramBtn.style.color = 'var(--vscode-button-foreground)';
                    histogramBtn.style.cursor = 'pointer';
                    histogramBtn.style.borderRadius = '3px';
                    
                    const frequencyBtn = document.createElement('button');
                    frequencyBtn.id = \`btn-frequency-\${index}\`;
                    frequencyBtn.className = 'chart-toggle-btn';
                    frequencyBtn.textContent = 'Frequency Chart';
                    frequencyBtn.style.padding = '8px 16px';
                    frequencyBtn.style.border = '1px solid var(--vscode-button-border)';
                    frequencyBtn.style.background = 'var(--vscode-button-secondaryBackground)';
                    frequencyBtn.style.color = 'var(--vscode-button-secondaryForeground)';
                    frequencyBtn.style.cursor = 'pointer';
                    frequencyBtn.style.borderRadius = '3px';
                    
                    toggleContainer.appendChild(histogramBtn);
                    toggleContainer.appendChild(frequencyBtn);
                    card.appendChild(toggleContainer);
                }
                
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
                
                // Create chart - histogram for numeric fields, bar chart for categorical
                const ctx = canvas.getContext('2d');
                let chart;
                let profilingTable = null;
                
                // Helper functions for creating different chart types
                const createHistogramChart = () => {
                    if (chart) {
                        chart.destroy();
                    }
                    
                    const stats = fieldResult.statistics;
                    
                    // Extract numeric values from distribution (don't expand by count to avoid stack overflow)
                    const uniqueNumericValues = [];
                    fieldResult.distributions.forEach(dist => {
                        const value = parseFloat(dist.value);
                        if (!isNaN(value)) {
                            uniqueNumericValues.push(value);
                        }
                    });
                    
                    if (uniqueNumericValues.length === 0) {
                        logger.error('No numeric values found for histogram');
                        return;
                    }
                    
                    // Calculate min/max from actual values we have
                    const min = Math.min(...uniqueNumericValues);
                    const max = Math.max(...uniqueNumericValues);
                    
                    // Use statistics count for bin calculation
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
                    
                    // Count values in each bin using the distribution counts
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
                    
                    chart = new Chart(ctx, {
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
                    
                    // Update chart in tracking array
                    const chartIndex = profilingCharts.findIndex(c => c.canvas === canvas);
                    if (chartIndex !== -1) {
                        profilingCharts[chartIndex] = chart;
                    }
                    
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
                    
                    if (profilingTable) {
                        profilingTable.destroy();
                    }
                    
                    profilingTable = new Tabulator(\`#profiling-table-\${index}\`, {
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
                };
                
                const createFrequencyChart = () => {
                    if (chart) {
                        chart.destroy();
                    }
                    
                    const topN = Math.min(20, fieldResult.distributions.length);
                    const chartData = fieldResult.distributions.slice(0, topN);
                    
                    chart = new Chart(ctx, {
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
                    
                    // Update chart in tracking array
                    const chartIndex = profilingCharts.findIndex(c => c.canvas === canvas);
                    if (chartIndex !== -1) {
                        profilingCharts[chartIndex] = chart;
                    }
                    
                    // Update table with frequency data
                    if (profilingTable) {
                        profilingTable.destroy();
                    }
                    
                    profilingTable = new Tabulator(\`#profiling-table-\${index}\`, {
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
                };
                
                if (fieldResult.isNumeric && fieldResult.statistics && fieldResult.statistics.isNumeric) {
                    // Create histogram by default
                    try {
                        createHistogramChart();
                    } catch (err) {
                        logger.error(\`Error creating histogram for field \${index} (\${fieldResult.fieldName}):\`, err);
                    }
                    
                    // Add event listeners for toggle buttons
                    const histogramBtn = document.getElementById(\`btn-histogram-\${index}\`);
                    const frequencyBtn = document.getElementById(\`btn-frequency-\${index}\`);
                    
                    if (histogramBtn && frequencyBtn) {
                        histogramBtn.addEventListener('click', function() {
                            createHistogramChart();
                            this.classList.add('active');
                            this.style.background = 'var(--vscode-button-background)';
                            this.style.color = 'var(--vscode-button-foreground)';
                            frequencyBtn.classList.remove('active');
                            frequencyBtn.style.background = 'var(--vscode-button-secondaryBackground)';
                            frequencyBtn.style.color = 'var(--vscode-button-secondaryForeground)';
                        });
                        
                        frequencyBtn.addEventListener('click', function() {
                            createFrequencyChart();
                            this.classList.add('active');
                            this.style.background = 'var(--vscode-button-background)';
                            this.style.color = 'var(--vscode-button-foreground)';
                            histogramBtn.classList.remove('active');
                            histogramBtn.style.background = 'var(--vscode-button-secondaryBackground)';
                            histogramBtn.style.color = 'var(--vscode-button-secondaryForeground)';
                        });
                    } else {
                        logger.error(\`Toggle buttons not found for field \${index}\`);
                    }
                } else {
                    // Create frequency chart for categorical fields
                    try {
                        createFrequencyChart();
                    } catch (err) {
                        logger.error(\`Error creating frequency chart for field \${index} (\${fieldResult.fieldName}):\`, err);
                    }
                }
                
                if (chart) {
                    profilingCharts.push(chart);
                }
            });
            
            showProfilingStatus(\`✅ Profiling complete for \${results.fields.length} field(s)\`, 'info');
            document.getElementById('export-qvs-btn').style.display = 'inline-block';
            } catch (error) {
                logger.error('Error displaying profiling results:', error);
                showProfilingStatus(\`❌ Error displaying results: \${error.message}\`, 'warning');
            }
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
