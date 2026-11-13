import * as vscode from "vscode";
import {
  getNonce,
  getTabulatorJs,
  getTabulatorCss,
  getChartJs,
  getHistogramViewJs,
  getHtmlJs,
  getDataGridJs,
} from "../assetLoader.mjs";
import { FAILURE_NOTICE_CSS } from "./errorTemplate.mjs";
import { html, scriptJson } from "./escaping.mjs";
import DataExporter from "../../exporters/index.mjs";
import { helpIconsHtml } from "../qualityMetricHelp.mjs";
import { pageSizesOffered } from "../pageSize.mjs";

/**
 * Generate HTML for webview with tabbed interface and Tabulator
 * The page is made from the file's header alone. Its Data tab's grid then asks the
 * extension for its rows, a page at a time: see src/webview/client/dataGrid.js.
 * @param {object} header - The file's header, as QvdReader.readHeader() gives it,
 *   with the page's own settings
 * @param {object} header.metadata - The file's metadata and its fields'
 * @param {Array<string>} header.columns - Its field names, in file order
 * @param {number} header.totalRows - Its rows
 * @param {number} [header.fileSize] - Its size, for the chart of its structure; 0 leaves the chart out
 * @param {number} [header.pageSize=100] - Rows a page of the grid shows to begin with
 * @param {string|null} [header.key] - Which version of the file the header is, which
 *   the grid's pages are checked against
 * @param {object} webview - The webview object
 * @param {object} context - The extension context
 * @returns {string} HTML content for the main webview
 */
export function getHtmlForWebview(header, webview, context) {
  const { metadata, columns, totalRows, fileSize, pageSize = 100, key = null } = header;
  const nonce = getNonce();

  // Inline Tabulator for easier CSP compliance
  const tabulatorJs = getTabulatorJs(context.extensionPath);
  const tabulatorCss = getTabulatorCss(context.extensionPath);
  const chartJs = getChartJs(context.extensionPath);
  const histogramViewJs = getHistogramViewJs(context.extensionPath);
  const htmlJs = getHtmlJs(context.extensionPath);
  const dataGridJs = getDataGridJs(context.extensionPath);

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
          // A QVD field has no type of its own, only the number format Qlik shows it
          // in: its type, such as INTEGER, DATE or UNKNOWN, and its format string
          numberFormat: field.numberFormat?.type || "",
          format: field.numberFormat?.fmt || "",
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
        html`<div class="export-dropdown-item" data-format="${format.name}">${format.label}</div>`
    ),
    betaFormats.length > 0 ? html`<div class="export-dropdown-separator"></div>` : "",
    ...betaFormats.map(
      (format) =>
        html`<div class="export-dropdown-item" data-format="${format.name}">${format.label} <span class="beta-badge">BETA</span></div>`
    ),
  ];

  // Calculate QVD structure data for visualization
  const qvdStructureData =
    metadata && metadata.fields && metadata.fields.length > 0 && fileSize
      ? (() => {
          // Calculate symbol tables total size
          const symbolTablesSize = metadata.fields.reduce(
            (sum, field) => sum + (field.length || 0),
            0
          );
          // Index table size
          const indexTableSize = metadata.length || 0;

          // Correct calculation: header size = total file size - symbol tables - index table
          // Field offsets are RELATIVE to start of symbol tables section, not absolute
          const headerSize = fileSize - symbolTablesSize - indexTableSize;

          // Debug logging
          console.log("QVD Structure Debug:", {
            fileSize,
            symbolTablesSize,
            indexTableSize,
            calculatedHeaderSize: headerSize,
            indexTableOffset: metadata.offset,
            firstFieldOffset: metadata.fields[0]?.offset,
            verification: {
              sum: headerSize + symbolTablesSize + indexTableSize,
              matchesFileSize:
                headerSize + symbolTablesSize + indexTableSize === fileSize,
            },
          });

          return {
            headerSize: Math.max(0, headerSize),
            symbolTablesSize,
            indexTableSize,
          };
        })()
      : {
          headerSize: 0,
          symbolTablesSize: 0,
          indexTableSize: 0,
        };

  // The page's body is an html`...` literal, so every value in it, such as each
  // field's name in the list to profile, is escaped, and only HTML that html made goes
  // in as it is. Scripts and style elements run by nonce only. Style attributes are
  // allowed, as the page's own markup sets many of them; a style element that isn't
  // the page's own, say one written in a field's name, styles nothing.
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src-elem 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${
    webview.cspSource
  }; form-action 'none'; base-uri 'none';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ctrl-Q QVD Viewer</title>
    <style nonce="${nonce}">
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
        
        /* What the Data tab's grid waits for, with a Cancel button, or why a page failed */
        .data-grid-status {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 12px;
            flex-shrink: 0;
        }
        
        .data-grid-status[hidden] {
            display: none;
        }
        
        .data-grid-status.waiting,
        .data-grid-status.cancelled {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 8px 15px;
        }
        
        .data-grid-status.failed {
            display: block;
        }
        
        .data-grid-progress {
            flex: 1;
            max-width: 20em;
        }
        
        .data-grid-cancel,
        .data-grid-retry {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 4px 10px;
            border-radius: 2px;
            cursor: pointer;
        }
        
        .data-grid-cancel:hover,
        .data-grid-retry:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
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
        
        .tabulator-footer .tabulator-page:not(:disabled) {
            cursor: pointer;
        }

        .tabulator-footer .tabulator-page:not(:disabled):hover {
            background-color: var(--vscode-button-hoverBackground) !important;
            border-color: var(--vscode-focusBorder, var(--vscode-button-border)) !important;
        }

        .tabulator-footer .tabulator-page.active {
            background-color: var(--vscode-button-hoverBackground) !important;
            border-color: var(--vscode-focusBorder) !important;
            font-weight: 700 !important;
        }

        /* Tabulator disables a page button with the disabled attribute. Its own hover rule
           gives disabled buttons a pointer too, and outranks this one without !important */
        .tabulator-footer .tabulator-page:disabled {
            opacity: 0.4 !important;
            cursor: not-allowed !important;
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
        
        /* The page size <select> itself has class tabulator-page-size, and its label is a sibling */
        .tabulator .tabulator-footer .tabulator-paginator label {
            color: var(--vscode-foreground) !important;
            font-weight: 600 !important;
            margin-right: 6px;
        }

        .tabulator .tabulator-footer select.tabulator-page-size {
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
        
        .qvd-structure-chart {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 20px;
        }
        
        .qvd-structure-chart h3 {
            margin: 0 0 12px 0;
            font-size: 1.1em;
            color: var(--vscode-foreground);
        }
        
        .qvd-structure-content {
            display: flex;
            gap: 20px;
            align-items: center;
        }
        
        .qvd-structure-canvas-container {
            position: relative;
            height: 120px;
            flex: 1;
            min-width: 0;
        }
        
        .qvd-structure-table {
            flex-shrink: 0;
            min-width: 280px;
        }
        
        .qvd-structure-table table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9em;
        }
        
        .qvd-structure-table th {
            text-align: left;
            padding: 8px;
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
            font-weight: 600;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .qvd-structure-table td {
            padding: 6px 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .qvd-structure-table tr:last-child td {
            border-bottom: none;
        }
        
        .qvd-structure-table .section-name {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .qvd-structure-table .color-indicator {
            width: 12px;
            height: 12px;
            border-radius: 2px;
            display: inline-block;
        }
        
        .qvd-structure-table .size-value {
            text-align: right;
            font-family: monospace;
        }
        
        .qvd-structure-table .percent-value {
            text-align: right;
            color: var(--vscode-descriptionForeground);
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
        
        .stats-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
            margin-bottom: 15px;
        }
        
        .stat-item {
            display: flex;
            flex-direction: column;
            background-color: var(--vscode-input-background);
            padding: 8px 12px;
            border-radius: 3px;
            border: 1px solid var(--vscode-input-border);
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
        
        .quality-score-container {
            position: relative;
            display: inline-block;
        }
        
        .beta-badge-profiling {
            position: absolute;
            top: -6px;
            right: -8px;
            font-size: 0.55em;
            font-weight: 700;
            padding: 2px 5px;
            border-radius: 3px;
            background-color: var(--vscode-statusBarItem-warningBackground);
            color: var(--vscode-statusBarItem-warningForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
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
            opacity: 0;
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
            left: 25px;
            top: 50%;
            transform: translateY(-50%);
            white-space: pre-line;
            transition: opacity 0.15s ease-in-out, visibility 0s linear 0.2s;
        }
        
        /* When tooltip would overflow on the right, position it on the left */
        .quality-metric-help:last-child .quality-metric-tooltip,
        [style*="justify-content: space-between"] .quality-metric-help:last-of-type .quality-metric-tooltip {
            left: auto;
            right: 25px;
        }
        
        /* Invisible bridge to keep tooltip open when moving mouse - extends from icon to tooltip */
        .quality-metric-tooltip::before {
            content: '';
            position: absolute;
            left: -25px;
            top: -10px;
            bottom: -10px;
            width: 30px;
        }
        
        /* Bridge on the right side when tooltip is on the left of the icon */
        .quality-metric-help:last-child .quality-metric-tooltip::before,
        [style*="justify-content: space-between"] .quality-metric-help:last-of-type .quality-metric-tooltip::before {
            left: auto;
            right: -25px;
        }
        
        .quality-metric-help:hover .quality-metric-tooltip,
        .quality-metric-tooltip:hover {
            visibility: visible;
            opacity: 1;
            transition-delay: 0s;
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

        /* Why the file's rows couldn't be read, in the Data tab */
        ${FAILURE_NOTICE_CSS}
    </style>
</head>
<body>
    ${html`
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
                <!-- What the grid waits for, with a Cancel button, or why a page failed: see dataGrid.js -->
                <div class="data-grid-status" id="data-grid-status" role="status" aria-live="polite" hidden></div>
                <div class="search-container">
                    <input type="text" class="search-input" id="data-search" placeholder="🔍 Search this page..." />
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
                    ? html`
                <div class="search-container">
                    <input type="text" class="search-input" id="lineage-search" placeholder="🔍 Search in lineage..." />
                    <button class="clear-search-btn" id="clear-lineage-search">✕ Clear</button>
                </div>
                <div class="table-wrapper">
                    <div id="lineage-table"></div>
                </div>
                `
                    : html`
                <div class="info-banner">
                    ℹ️ No lineage information available for this QVD file.
                </div>
                `
                }
            </div>
            
            <!-- Profiling Tab -->
            <div id="profiling-tab" class="tab-content">
                <div class="profiling-controls">
                    <!-- QVD Structure Visualization -->
                    <div class="qvd-structure-chart">
                        <h3>📦 QVD File Structure</h3>
                        <div class="qvd-structure-content">
                            <div class="qvd-structure-canvas-container">
                                <canvas id="qvd-structure-canvas"></canvas>
                            </div>
                            <div class="qvd-structure-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Section</th>
                                            <th class="size-value">Size</th>
                                            <th class="percent-value">%</th>
                                        </tr>
                                    </thead>
                                    <tbody id="qvd-structure-table-body">
                                        <!-- Will be populated by JavaScript -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    
                    <div class="profiling-header">
                        <h2>📊 Field Value Distribution Analysis</h2>
                        <button class="header-button" id="export-qvs-btn" style="display: none;">💾 Export to QVS Script</button>
                    </div>
                    ${
                      totalRows > 100000
                        ? html`
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
                                ? metadata.fields.map(
                                    (field) =>
                                      html`<div class="field-checkbox-item">
                                            <input type="checkbox" 
                                                   id="field-${field.name}" 
                                                   name="field-checkbox" 
                                                   value="${field.name}">
                                            <label for="field-${field.name}">
                                                ${field.name}
                                                <span class="field-unique-count">(${field.noOfSymbols} unique values)</span>
                                            </label>
                                        </div>`
                                  )
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
    `}
    
    <script nonce="${nonce}">
        /* Tabulator library - inlined */
        ${tabulatorJs}
    </script>
    
    <script nonce="${nonce}">
        /* Chart.js library - inlined */
        ${chartJs}
    </script>
    
    <script nonce="${nonce}">
        /* Profiling histogram chart and table, shared with the visual-analysis panel - inlined */
        ${histogramViewJs}
    </script>
    
    <script nonce="${nonce}">
        /* The Data tab's grid, which asks for a page of rows at a time - inlined */
        ${dataGridJs}
    </script>
    
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const totalRowsInFile = ${totalRows};
        // Rows a page of the grid shows to begin with, and the sizes it offers
        const pageSize = ${pageSize};
        // The version of the file this page shows, which each page of the grid is checked against
        const headerKey = ${scriptJson(key)};
        const pageSizes = ${scriptJson(pageSizesOffered(pageSize))};
        
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
        
        // Data for tables, written by scriptJson(): what the file says can't end this script
        const schemaData = ${scriptJson(schemaData)};
        const metadataData = ${scriptJson(metadataKV)};
        const lineageData = ${scriptJson(lineageData)};

        // The file's field names, in file order: the grid's columns, and the fields to profile
        const availableFields = ${scriptJson(columns ?? (metadata?.fields ?? []).map((f) => f.name))};

        // escapeHtml() and the html tag, as the extension has them, for the HTML this
        // script writes: each value in an html\`...\` literal is escaped
        ${htmlJs}

        // The metrics' help icons, as the extension writes them: see createHelpIconHtml()
        const HELP_ICONS = ${scriptJson(helpIconsHtml())};

        /**
         * A metric's help icon, for an html\`...\` literal to put in as it is
         * @param {string} metricKey - The metric
         * @returns {HtmlMarkup} The icon and its tooltip
         */
        function createHelpIcon(metricKey) {
            return trustedHtml(HELP_ICONS[metricKey] ?? '');
        }

        let currentContextCell = null;
        let dataGrid, schemaTable, metadataTable, lineageTable;
        let profilingCharts = [];
        let currentProfilingResults = null;
        
        // Initialize tables on load
        window.addEventListener('DOMContentLoaded', function() {
            initializeTables();
            setupEventListeners();
            setupMessageListener();
            initQvdStructureChart();
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
                // Once typing pauses, not at every key
                let searchTimer = null;
                dataSearch.addEventListener('input', function() {
                    const text = this.value;
                    clearTimeout(searchTimer);
                    searchTimer = setTimeout(() => filterDataTable(text), 250);
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
        
        function setupMessageListener() {
            // Listen for messages from the extension: the grid's pages, the rest elsewhere
            window.addEventListener('message', event => {
                if (dataGrid && dataGrid.handleMessage(event.data)) {
                    return;
                }
            });
        }
        
        // QVD Structure Chart data (pre-calculated)
        const qvdStructureData = ${scriptJson(qvdStructureData)};
        
        // Initialize QVD Structure Chart
        function initQvdStructureChart() {
            if (!qvdStructureData) {
                logger.log('No QVD structure data available');
                return;
            }
            
            // Calculate sizes
            const headerSize = qvdStructureData.headerSize;
            const symbolTablesSize = qvdStructureData.symbolTablesSize;
            const indexTableSize = qvdStructureData.indexTableSize;
            
            // Total file size
            const totalSize = headerSize + symbolTablesSize + indexTableSize;
            
            // Calculate percentages
            const headerPercent = totalSize > 0 ? (headerSize / totalSize * 100).toFixed(1) : 0;
            const symbolPercent = totalSize > 0 ? (symbolTablesSize / totalSize * 100).toFixed(1) : 0;
            const indexPercent = totalSize > 0 ? (indexTableSize / totalSize * 100).toFixed(1) : 0;
            
            // Format sizes for display
            function formatBytes(bytes) {
                if (bytes === 0) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            }
            
            const ctx = document.getElementById('qvd-structure-canvas');
            if (!ctx) {
                logger.error('QVD structure canvas not found');
                return;
            }
            
            try {
                // Detect if we're in a light or dark theme by checking the computed background color
                const bodyBg = getComputedStyle(document.body).backgroundColor;
                const isLightTheme = bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && 
                                     (bodyBg.includes('255, 255, 255') || bodyBg.includes('rgb(255') || 
                                      parseInt(bodyBg.match(/\\d+/)?.[0] || '0') > 127);
                
                // Choose colors based on theme - much brighter for dark theme
                const colors = isLightTheme ? {
                    header: '#0E7490',        // Darker cyan for light theme
                    symbolTables: '#7C3AED',  // Darker purple for light theme
                    indexTable: '#DC2626'     // Darker red for light theme
                } : {
                    header: '#22D3EE',        // Very bright cyan for dark theme
                    symbolTables: '#A78BFA',  // Very bright purple for dark theme
                    indexTable: '#FB923C'     // Very bright orange for dark theme
                };
                
                // Populate the table with structure data
                const tableBody = document.getElementById('qvd-structure-table-body');
                if (tableBody) {
                    // A row of the table: a section, its colour, its size and its share
                    const row = (section, color, size, percent) =>
                        html\`<tr><td class="section-name"><span class="color-indicator" style="background-color: \${color};"></span>\${section}</td><td class="size-value">\${formatBytes(size)}</td><td class="percent-value">\${percent}%</td></tr>\`;
                    tableBody.innerHTML = html\`\${[
                        row('Header', colors.header, headerSize, headerPercent),
                        row('Symbol Tables', colors.symbolTables, symbolTablesSize, symbolPercent),
                        row('Index Table', colors.indexTable, indexTableSize, indexPercent),
                    ]}\`;
                }
                
                new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: ['QVD File Structure'],
                        datasets: [
                            {
                                label: 'Header',
                                data: [headerSize],
                                backgroundColor: colors.header,
                                borderColor: colors.header,
                                borderWidth: 1
                            },
                            {
                                label: 'Symbol Tables',
                                data: [symbolTablesSize],
                                backgroundColor: colors.symbolTables,
                                borderColor: colors.symbolTables,
                                borderWidth: 1
                            },
                            {
                                label: 'Index Table',
                                data: [indexTableSize],
                                backgroundColor: colors.indexTable,
                                borderColor: colors.indexTable,
                                borderWidth: 1
                            }
                        ]
                    },
                    options: {
                        indexAxis: 'y',
                        maintainAspectRatio: false,
                        responsive: true,
                        scales: {
                            x: {
                                stacked: true,
                                ticks: {
                                    callback: function(value) {
                                        return formatBytes(value);
                                    },
                                    color: '#CCCCCC'
                                },
                                grid: {
                                    color: 'rgba(255, 255, 255, 0.1)'
                                },
                                border: {
                                    color: 'rgba(255, 255, 255, 0.2)'
                                }
                            },
                            y: {
                                stacked: true,
                                ticks: {
                                    color: '#CCCCCC'
                                },
                                grid: {
                                    display: false
                                },
                                border: {
                                    color: 'rgba(255, 255, 255, 0.2)'
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: true,
                                position: 'bottom',
                                labels: {
                                    color: '#CCCCCC',
                                    padding: 15,
                                    font: {
                                        size: 12
                                    }
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const label = context.dataset.label || '';
                                        const value = context.parsed.x;
                                        const percent = context.datasetIndex === 0 ? headerPercent : 
                                                       context.datasetIndex === 1 ? symbolPercent : 
                                                       indexPercent;
                                        return label + ': ' + formatBytes(value) + ' (' + percent + '%)';
                                    }
                                },
                                backgroundColor: 'rgba(30, 30, 30, 0.95)',
                                titleColor: '#FFFFFF',
                                bodyColor: '#CCCCCC',
                                borderColor: 'rgba(255, 255, 255, 0.3)',
                                borderWidth: 1
                            }
                        }
                    }
                });
                
                logger.log('QVD structure chart initialized successfully');
            } catch (error) {
                logger.error('Error initializing QVD structure chart:', error);
            }
        }
        
        function initializeTables() {
            logger.log('Initializing tables...');
            logger.log('Tabulator available:', typeof Tabulator !== 'undefined');
            
            try {
                // The Data tab's grid, which asks for its rows a page at a time
                dataGrid = createDataGrid({
                    element: document.getElementById('data-table'),
                    status: document.getElementById('data-grid-status'),
                    fields: availableFields,
                    totalRows: totalRowsInFile,
                    pageSize,
                    pageSizes,
                    headerKey,
                    vscode,
                    onCellContext: showContextMenu
                });
            } catch (error) {
                logger.error('Error initializing data table:', error);
            }
            
            // Initialize Schema Table
            if (schemaData.length > 0) {
                const schemaColumns = [
                    { title: "Name", field: "name", headerSort: true },
                    { title: "Number Format", field: "numberFormat", headerSort: true },
                    { title: "Format", field: "format", headerSort: true },
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
                    paginationCounter: "rows"
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
                    paginationCounter: "rows"
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
                    paginationCounter: "rows"
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
                if (tabName === 'data' && dataGrid) dataGrid.table.redraw();
                if (tabName === 'schema' && schemaTable) schemaTable.redraw();
                if (tabName === 'metadata' && metadataTable) metadataTable.redraw();
                if (tabName === 'lineage' && lineageTable) lineageTable.redraw();
            }, 10);
        }
        
        // Filter functions
        function filterDataTable(searchText) {
            if (dataGrid) {
                dataGrid.search(searchText);
            }
        }
        
        function filterSchemaTable(searchText) {
            if (schemaTable) {
                if (searchText) {
                    const search = searchText.toLowerCase();
                    schemaTable.setFilter(function(data) {
                        return (
                            String(data.name || '').toLowerCase().includes(search) ||
                            String(data.numberFormat || '').toLowerCase().includes(search) ||
                            String(data.format || '').toLowerCase().includes(search) ||
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
                // A null copies as nothing, as it shows
                vscode.postMessage({ 
                    command: 'copyToClipboard',
                    text: cellText(currentContextCell.getValue())
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
                header.textContent = \`📊 \${fieldResult.fieldName}\`;
                
                const openButton = document.createElement('div');
                openButton.className = 'open-in-window-dropdown';
                openButton.innerHTML = html\`
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
                statsDiv.innerHTML = html\`
                    <div class="field-stat-item">
                        <span class="field-stat-label">
                            Total Rows
                            \${createHelpIcon('totalRowsProfiling')}
                        </span>
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
                    statisticsCard.innerHTML = html\`
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
                
                // Add temporal analysis card for date fields
                if (fieldResult.isDate && fieldResult.temporalAnalysis && fieldResult.temporalAnalysis.isDate) {
                    const temporal = fieldResult.temporalAnalysis;
                    const temporalCard = document.createElement('div');
                    temporalCard.className = 'statistics-card';
                    temporalCard.innerHTML = html\`
                        <h4 style="margin: 0 0 15px 0; color: var(--vscode-foreground); font-size: 1.1em;">📅 Temporal Analysis</h4>
                        
                        <div class="statistics-section">
                            <h5 style="margin: 0 0 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">Date Range</h5>
                            <div class="stats-container" style="margin-bottom: 15px;">
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Earliest
                                        \${createHelpIcon('temporalEarliest')}
                                    </span>
                                    <span class="stat-value">\${temporal.range.earliest ? new Date(temporal.range.earliest).toISOString().split('T')[0] : 'N/A'}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Latest
                                        \${createHelpIcon('temporalLatest')}
                                    </span>
                                    <span class="stat-value">\${temporal.range.latest ? new Date(temporal.range.latest).toISOString().split('T')[0] : 'N/A'}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Time Span
                                        \${createHelpIcon('temporalTimeSpan')}
                                    </span>
                                    <span class="stat-value">\${temporal.range.spanDescription}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Format
                                        \${createHelpIcon('temporalFormat')}
                                    </span>
                                    <span class="stat-value">\${temporal.range.format.formatDescription}</span>
                                </div>
                            </div>
                        </div>
                        
                        \${temporal.distribution && temporal.distribution.byYear && temporal.distribution.byYear.length > 0 ? html\`
                        <div class="statistics-section" style="margin-top: 15px;">
                            <h5 style="margin: 0 0 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">
                                Yearly Distribution
                                \${createHelpIcon('temporalYearlyDistribution')}
                            </h5>
                            <div class="stats-container" style="margin-bottom: 15px; max-height: 200px; overflow-y: auto; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));">
                                \${temporal.distribution.byYear.slice(0, 10).map(item => html\`
                                <div class="stat-item">
                                    <span class="stat-label">\${item.period}</span>
                                    <span class="stat-value">\${item.count.toLocaleString()}</span>
                                </div>
                                \`)}
                            </div>
                        </div>
                        \` : ''}
                        
                        \${temporal.distribution && temporal.distribution.byMonth && temporal.distribution.byMonth.length > 0 ? html\`
                        <div class="statistics-section" style="margin-top: 15px;">
                            <h5 style="margin: 0 0 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">
                                Monthly Distribution
                                \${createHelpIcon('temporalMonthlyDistribution')}
                            </h5>
                            <div class="stats-container" style="margin-bottom: 15px; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));">
                                \${temporal.distribution.byMonth.map(item => html\`
                                <div class="stat-item">
                                    <span class="stat-label">\${item.period}</span>
                                    <span class="stat-value">\${item.count.toLocaleString()}</span>
                                </div>
                                \`)}
                            </div>
                        </div>
                        \` : ''}
                        
                        \${temporal.distribution && temporal.distribution.byDayOfWeek && temporal.distribution.byDayOfWeek.length > 0 ? html\`
                        <div class="statistics-section" style="margin-top: 15px;">
                            <h5 style="margin: 0 0 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">
                                Day of Week Distribution
                                \${createHelpIcon('temporalDayOfWeekDistribution')}
                            </h5>
                            <div class="stats-container" style="margin-bottom: 15px; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));">
                                \${temporal.distribution.byDayOfWeek.map(item => html\`
                                <div class="stat-item">
                                    <span class="stat-label">\${item.period}</span>
                                    <span class="stat-value">\${item.count.toLocaleString()}</span>
                                </div>
                                \`)}
                            </div>
                        </div>
                        \` : ''}
                        
                        \${temporal.gaps ? html\`
                        <div class="statistics-section" style="margin-top: 15px;">
                            <h5 style="margin: 0 0 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">Gap Analysis</h5>
                            <div class="stats-container" style="margin-bottom: 15px;">
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Has Gaps
                                        \${createHelpIcon('temporalHasGaps')}
                                    </span>
                                    <span class="stat-value">\${temporal.gaps.hasGaps ? 'Yes' : 'No'}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Gap Count
                                        \${createHelpIcon('temporalGapCount')}
                                    </span>
                                    <span class="stat-value">\${temporal.gaps.gapCount}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Coverage
                                        \${createHelpIcon('temporalCoverage')}
                                    </span>
                                    <span class="stat-value">\${temporal.gaps.coverage.toFixed(1)}%</span>
                                </div>
                                \${temporal.gaps.largestGap ? html\`
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Largest Gap
                                        \${createHelpIcon('temporalLargestGap')}
                                    </span>
                                    <span class="stat-value">\${temporal.gaps.largestGap.days} days</span>
                                </div>
                                \` : ''}
                            </div>
                        </div>
                        \` : ''}
                        
                        \${temporal.trends ? html\`
                        <div class="statistics-section" style="margin-top: 15px;">
                            <h5 style="margin: 0 0 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">Trend Analysis</h5>
                            <div class="stats-container" style="margin-bottom: 15px;">
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Trend Type
                                        \${createHelpIcon('temporalTrendType')}
                                    </span>
                                    <span class="stat-value">\${temporal.trends.trendType.replace(/_/g, ' ')}</span>
                                </div>
                                <div class="stat-item" style="grid-column: span 2;">
                                    <span class="stat-label">
                                        Description
                                        \${createHelpIcon('temporalTrendDescription')}
                                    </span>
                                    <span class="stat-value">\${temporal.trends.description}</span>
                                </div>
                            </div>
                        </div>
                        \` : ''}
                        
                        \${temporal.quality ? html\`
                        <div class="statistics-section" style="margin-top: 15px;">
                            <h5 style="margin: 0 0 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">Data Quality</h5>
                            <div class="stats-container">
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Valid Dates
                                        \${createHelpIcon('temporalValidDates')}
                                    </span>
                                    <span class="stat-value">\${temporal.quality.validDateCount.toLocaleString()}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Invalid Dates
                                        \${createHelpIcon('temporalInvalidDates')}
                                    </span>
                                    <span class="stat-value">\${temporal.quality.invalidDateCount.toLocaleString()}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">Null Count</span>
                                    <span class="stat-value">\${temporal.quality.nullCount.toLocaleString()}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Valid %
                                        \${createHelpIcon('temporalValidPercentage')}
                                    </span>
                                    <span class="stat-value">\${temporal.quality.validPercentage.toFixed(1)}%</span>
                                </div>
                            </div>
                        </div>
                        \` : ''}
                    \`;
                    card.appendChild(temporalCard);
                }
                
                // Add string analysis card for string fields
                if (fieldResult.isString && fieldResult.stringAnalysis && fieldResult.stringAnalysis.isString) {
                    const strAnalysis = fieldResult.stringAnalysis;
                    const stringCard = document.createElement('div');
                    stringCard.className = 'statistics-card';
                    stringCard.innerHTML = html\`
                        <h4 style="margin: 0 0 15px 0; color: var(--vscode-foreground); font-size: 1.1em;">📝 String Analysis</h4>
                        
                        <div class="statistics-section">
                            <h5 style="margin: 0 0 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">Length Statistics</h5>
                            <div class="stats-container" style="margin-bottom: 15px;">
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Min Length
                                        \${createHelpIcon('stringMinLength')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.lengthStats.min.toLocaleString()}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Max Length
                                        \${createHelpIcon('stringMaxLength')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.lengthStats.max.toLocaleString()}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Avg Length
                                        \${createHelpIcon('stringAvgLength')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.lengthStats.average.toLocaleString()}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Most Common Length
                                        \${createHelpIcon('stringMostCommonLength')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.lengthStats.mostCommon} (\${strAnalysis.lengthStats.mostCommonCount}x)</span>
                                </div>
                            </div>
                        </div>
                        
                        \${strAnalysis.patterns && (strAnalysis.patterns.prefixes.length > 0 || strAnalysis.patterns.suffixes.length > 0) ? html\`
                        <div class="statistics-section" style="margin-top: 15px;">
                            <h5 style="margin: 0 0 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">Pattern Detection</h5>
                            \${strAnalysis.patterns.prefixes.length > 0 ? html\`
                            <div style="margin-bottom: 10px;">
                                <div style="font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 5px; display: flex; align-items: center; gap: 4px;">
                                    Common Prefixes:
                                    \${createHelpIcon('stringCommonPrefixes')}
                                </div>
                                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                    \${strAnalysis.patterns.prefixes.slice(0, 5).map(p => html\`
                                        <span style="background-color: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 4px 8px; border-radius: 3px; font-size: 0.85em;">
                                            "\${p.prefix}" (\${p.count}x, \${p.percentage}%)
                                        </span>
                                    \`)}
                                </div>
                            </div>
                            \` : ''}
                            \${strAnalysis.patterns.suffixes.length > 0 ? html\`
                            <div>
                                <div style="font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 5px; display: flex; align-items: center; gap: 4px;">
                                    Common Suffixes:
                                    \${createHelpIcon('stringCommonSuffixes')}
                                </div>
                                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                    \${strAnalysis.patterns.suffixes.slice(0, 5).map(s => html\`
                                        <span style="background-color: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 4px 8px; border-radius: 3px; font-size: 0.85em;">
                                            "\${s.suffix}" (\${s.count}x, \${s.percentage}%)
                                        </span>
                                    \`)}
                                </div>
                            </div>
                            \` : ''}
                        </div>
                        \` : ''}
                        
                        <div class="statistics-section" style="margin-top: 15px;">
                            <h5 style="margin: 0 0 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">Character Composition</h5>
                            <div class="stats-container" style="margin-bottom: 15px;">
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Alphanumeric
                                        \${createHelpIcon('stringAlphanumeric')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.characterComposition.alphanumericPercentage}%</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Alphabetic
                                        \${createHelpIcon('stringAlphabetic')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.characterComposition.alphabeticPercentage}%</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Numeric
                                        \${createHelpIcon('stringNumeric')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.characterComposition.numericPercentage}%</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Special Chars
                                        \${createHelpIcon('stringSpecialChars')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.characterComposition.specialCharPercentage}%</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Whitespace
                                        \${createHelpIcon('stringWhitespace')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.characterComposition.whitespacePercentage}%</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Non-ASCII
                                        \${createHelpIcon('stringNonAscii')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.characterComposition.nonAsciiPercentage}%</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Leading Whitespace
                                        \${createHelpIcon('stringLeadingWhitespace')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.characterComposition.leadingWhitespaceCount}</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Trailing Whitespace
                                        \${createHelpIcon('stringTrailingWhitespace')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.characterComposition.trailingWhitespaceCount}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="statistics-section" style="margin-top: 15px;">
                            <h5 style="margin: 0 0 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">Case Analysis</h5>
                            <div class="stats-container" style="margin-bottom: 15px;">
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Uppercase
                                        \${createHelpIcon('stringUppercase')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.caseAnalysis.uppercaseCount} (\${strAnalysis.caseAnalysis.uppercasePercentage}%)</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Lowercase
                                        \${createHelpIcon('stringLowercase')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.caseAnalysis.lowercaseCount} (\${strAnalysis.caseAnalysis.lowercasePercentage}%)</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Mixed Case
                                        \${createHelpIcon('stringMixedCase')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.caseAnalysis.mixedCaseCount} (\${strAnalysis.caseAnalysis.mixedCasePercentage}%)</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Title Case
                                        \${createHelpIcon('stringTitleCase')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.caseAnalysis.titleCaseCount} (\${strAnalysis.caseAnalysis.titleCasePercentage}%)</span>
                                </div>
                            </div>
                        </div>
                        
                        \${strAnalysis.formatDetection && (
                            strAnalysis.formatDetection.email.count > 0 ||
                            strAnalysis.formatDetection.phone.count > 0 ||
                            strAnalysis.formatDetection.ssn.count > 0 ||
                            strAnalysis.formatDetection.url.count > 0 ||
                            strAnalysis.formatDetection.dateString.count > 0
                        ) ? html\`
                        <div class="statistics-section" style="margin-top: 15px;">
                            <h5 style="margin: 0 0 10px 0; color: var(--vscode-descriptionForeground); font-size: 0.9em;">Format Detection</h5>
                            <div class="stats-container" style="margin-bottom: 15px;">
                                \${strAnalysis.formatDetection.email.count > 0 ? html\`
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Email Addresses
                                        \${createHelpIcon('stringEmailFormat')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.formatDetection.email.count} (\${strAnalysis.formatDetection.email.percentage}%)</span>
                                </div>
                                \` : ''}
                                \${strAnalysis.formatDetection.phone.count > 0 ? html\`
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Phone Numbers
                                        \${createHelpIcon('stringPhoneFormat')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.formatDetection.phone.count} (\${strAnalysis.formatDetection.phone.percentage}%)</span>
                                </div>
                                \` : ''}
                                \${strAnalysis.formatDetection.ssn.count > 0 ? html\`
                                <div class="stat-item">
                                    <span class="stat-label">
                                        SSN/ID Numbers
                                        \${createHelpIcon('stringSsnFormat')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.formatDetection.ssn.count} (\${strAnalysis.formatDetection.ssn.percentage}%)</span>
                                </div>
                                \` : ''}
                                \${strAnalysis.formatDetection.url.count > 0 ? html\`
                                <div class="stat-item">
                                    <span class="stat-label">
                                        URLs
                                        \${createHelpIcon('stringUrlFormat')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.formatDetection.url.count} (\${strAnalysis.formatDetection.url.percentage}%)</span>
                                </div>
                                \` : ''}
                                \${strAnalysis.formatDetection.dateString.count > 0 ? html\`
                                <div class="stat-item">
                                    <span class="stat-label">
                                        Date Strings
                                        \${createHelpIcon('stringDateFormat')}
                                    </span>
                                    <span class="stat-value">\${strAnalysis.formatDetection.dateString.count} (\${strAnalysis.formatDetection.dateString.percentage}%)</span>
                                </div>
                                \` : ''}
                            </div>
                            \${strAnalysis.formatDetection.email.samples.length > 0 ? html\`
                            <div style="margin-top: 10px;">
                                <div style="font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 5px;">Sample Email Addresses:</div>
                                <div style="font-family: var(--vscode-editor-font-family); font-size: 0.85em; color: var(--vscode-foreground);">
                                    \${strAnalysis.formatDetection.email.samples.slice(0, 3).map(s => html\`<div style="padding: 2px 0;">\${s}</div>\`)}
                                </div>
                            </div>
                            \` : ''}
                            \${strAnalysis.formatDetection.phone.samples.length > 0 ? html\`
                            <div style="margin-top: 10px;">
                                <div style="font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 5px;">Sample Phone Numbers:</div>
                                <div style="font-family: var(--vscode-editor-font-family); font-size: 0.85em; color: var(--vscode-foreground);">
                                    \${strAnalysis.formatDetection.phone.samples.slice(0, 3).map(s => html\`<div style="padding: 2px 0;">\${s}</div>\`)}
                                </div>
                            </div>
                            \` : ''}
                            \${strAnalysis.formatDetection.url.samples.length > 0 ? html\`
                            <div style="margin-top: 10px;">
                                <div style="font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 5px;">Sample URLs:</div>
                                <div style="font-family: var(--vscode-editor-font-family); font-size: 0.85em; color: var(--vscode-foreground);">
                                    \${strAnalysis.formatDetection.url.samples.slice(0, 3).map(s => html\`<div style="padding: 2px 0;">\${s}</div>\`)}
                                </div>
                            </div>
                            \` : ''}
                        </div>
                        \` : ''}
                    \`;
                    card.appendChild(stringCard);
                }
                
                // Add data quality metrics card
                if (fieldResult.qualityMetrics && !fieldResult.qualityMetrics.error) {
                    const quality = fieldResult.qualityMetrics;
                    const assessment = quality.assessment;
                    
                    const qualityCard = document.createElement('div');
                    qualityCard.className = \`quality-card quality-\${assessment.color === 'green' ? 'good' : assessment.color === 'yellow' ? 'warning' : 'error'}\`;
                    
                    qualityCard.innerHTML = html\`
                        <div class="quality-header">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <h4 style="margin: 0; color: var(--vscode-foreground);">🎯 Data Quality Assessment</h4>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div class="quality-score-container">
                                    <span class="quality-score \${assessment.color === 'green' ? 'good' : assessment.color === 'yellow' ? 'warning' : 'error'}">
                                        \${assessment.qualityScore}/100 - \${assessment.qualityLevel}
                                    </span>
                                    <span class="beta-badge-profiling">Beta</span>
                                </div>
                                \${createHelpIcon('dataQualityAssessment')}
                            </div>
                        </div>
                        \${assessment.issues.length > 0 ? html\`
                        <div class="quality-issues">
                            \${assessment.issues.map(issue => html\`<div class="quality-issue-item error">❌ \${issue}</div>\`)}
                        </div>
                        \` : ''}
                        \${assessment.warnings.length > 0 ? html\`
                        <div class="quality-issues">
                            \${assessment.warnings.map(warning => html\`<div class="quality-issue-item warning">⚠️ \${warning}</div>\`)}
                        </div>
                        \` : ''}
                        
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
                                \${quality.completeness.emptyStringCount > 0 ? html\`
                                <div class="quality-metric-item">
                                    <div class="quality-metric-label">
                                        <span>Empty Strings</span>
                                        \${createHelpIcon('emptyStrings')}
                                    </div>
                                    <div class="quality-metric-value">\${quality.completeness.emptyStringCount.toLocaleString()} (\${quality.completeness.emptyStringPercentage.toFixed(1)}%)</div>
                                </div>
                                \` : ''}
                            </div>
                        </div>
                        
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
                                \${quality.uniqueness.duplicatedDistinctValues > 0 ? html\`
                                <div class="quality-metric-item">
                                    <div class="quality-metric-label">
                                        <span>Duplicated Distinct Values</span>
                                        \${createHelpIcon('duplicatedDistinctValues')}
                                    </div>
                                    <div class="quality-metric-value">\${quality.uniqueness.duplicatedDistinctValues.toLocaleString()}</div>
                                </div>
                                \` : ''}
                            </div>
                            \${quality.uniqueness.topDuplicates && quality.uniqueness.topDuplicates.length > 0 ? html\`
                            <div style="margin-top: 10px;">
                                <div style="font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 6px;">Top Duplicated Values:</div>
                                <div class="quality-duplicates-list">
                                    \${quality.uniqueness.topDuplicates.map(dup => html\`
                                    <div class="quality-duplicate-item">
                                        <span>\${dup.value}</span>
                                        <span>\${dup.count.toLocaleString()} (\${dup.percentage}%)</span>
                                    </div>
                                    \`)}
                                </div>
                            </div>
                            \` : ''}
                        </div>
                        
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
                
                // Add table header with title and optional truncation notice
                const tableHeader = document.createElement('div');
                tableHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;';
                const tableTitle = document.createElement('h4');
                tableTitle.style.cssText = 'margin: 0; color: var(--vscode-foreground);';
                tableTitle.textContent = 'Value Distribution';
                tableHeader.appendChild(tableTitle);
                
                if (fieldResult.truncated) {
                    const truncationNotice = document.createElement('span');
                    truncationNotice.style.cssText = 'color: var(--vscode-descriptionForeground); font-size: 0.85em;';
                    truncationNotice.innerHTML = html\`Showing top \${fieldResult.truncatedAt} unique values \${createHelpIcon('truncatedDistribution')}\`;
                    tableHeader.appendChild(truncationNotice);
                }
                
                tableContainer.appendChild(tableHeader);
                
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
                    
                    // Bins over every numeric value, from the profiler
                    const histogram = fieldResult.statistics.histogram;
                    if (!histogram) {
                        logger.error('No numeric values found for histogram');
                        return;
                    }

                    // Shared with the visual-analysis panel: see histogramView.js
                    chart = renderHistogramChart(ctx, histogram);
                    
                    // Update chart in tracking array
                    const chartIndex = profilingCharts.findIndex(c => c.canvas === canvas);
                    if (chartIndex !== -1) {
                        profilingCharts[chartIndex] = chart;
                    }
                    
                    if (profilingTable) {
                        profilingTable.destroy();
                    }
                    
                    profilingTable = renderHistogramTable(\`#profiling-table-\${index}\`, histogram);
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
                        paginationCounter: 'rows'
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
            
            // Adjust tooltip positioning to prevent overflow
            setTimeout(() => {
                document.querySelectorAll('.quality-metric-help').forEach(helpIcon => {
                    const tooltip = helpIcon.querySelector('.quality-metric-tooltip');
                    if (!tooltip) return;
                    
                    helpIcon.addEventListener('mouseenter', () => {
                        const iconRect = helpIcon.getBoundingClientRect();
                        const tooltipRect = tooltip.getBoundingClientRect();
                        const windowWidth = window.innerWidth;
                        
                        // Check if tooltip would overflow on the right
                        if (iconRect.right + tooltipRect.width + 40 > windowWidth) {
                            // Position on the left instead
                            tooltip.style.left = 'auto';
                            tooltip.style.right = '20px';
                        } else {
                            // Position on the right (default)
                            tooltip.style.left = '20px';
                            tooltip.style.right = 'auto';
                        }
                    });
                });
            }, 100);
            
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
