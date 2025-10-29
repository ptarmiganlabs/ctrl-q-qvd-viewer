#!/usr/bin/env node

/**
 * Script to create demonstration visuals for the QVD Viewer extension
 * This creates realistic mockup screenshots showing the extension in action
 */

const fs = require('fs');
const path = require('path');
const QvdReader = require('../src/qvdReader');

async function createDemoData() {
  const reader = new QvdReader();
  const qvdPath = path.join(__dirname, '../test-data/stockholm_temp.qvd');
  
  console.log('Reading QVD file...');
  const result = await reader.read(qvdPath, 100);
  
  // Create HTML demonstration page
  const demoHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QVD Viewer Demo</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            margin: 0;
            padding: 0;
            background: #1e1e1e;
            color: #cccccc;
        }
        .vscode-window {
            background: #1e1e1e;
            border: 1px solid #3c3c3c;
            border-radius: 8px;
            overflow: hidden;
            margin: 20px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        .title-bar {
            background: #2d2d30;
            padding: 8px 12px;
            display: flex;
            align-items: center;
            border-bottom: 1px solid #3c3c3c;
        }
        .title-bar .file-name {
            color: #ffffff;
            font-size: 13px;
            margin-left: 8px;
        }
        .content {
            padding: 20px;
        }
        .section {
            margin-bottom: 30px;
        }
        .section-title {
            color: #4ec9b0;
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            border-bottom: 1px solid #3c3c3c;
            padding-bottom: 8px;
        }
        .metadata-grid {
            display: grid;
            grid-template-columns: 200px 1fr;
            gap: 10px;
            background: #252526;
            padding: 15px;
            border-radius: 4px;
        }
        .metadata-label {
            color: #9cdcfe;
            font-weight: 500;
        }
        .metadata-value {
            color: #ce9178;
        }
        .field-list {
            background: #252526;
            padding: 15px;
            border-radius: 4px;
        }
        .field-item {
            display: flex;
            justify-content: space-between;
            padding: 8px;
            border-bottom: 1px solid #3c3c3c;
        }
        .field-item:last-child {
            border-bottom: none;
        }
        .field-name {
            color: #4fc1ff;
            font-weight: 500;
        }
        .field-type {
            color: #b5cea8;
            font-style: italic;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background: #252526;
            border-radius: 4px;
            overflow: hidden;
        }
        th {
            background: #2d2d30;
            color: #4ec9b0;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            border-bottom: 2px solid #3c3c3c;
        }
        td {
            padding: 10px 12px;
            border-bottom: 1px solid #3c3c3c;
            color: #cccccc;
        }
        tr:last-child td {
            border-bottom: none;
        }
        tr:hover {
            background: #2a2d2e;
        }
        .pagination {
            margin-top: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            background: #252526;
            border-radius: 4px;
        }
        .page-info {
            color: #9cdcfe;
        }
        .button {
            background: #0e639c;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
        }
        .button:hover {
            background: #1177bb;
        }
    </style>
</head>
<body>
    <div class="vscode-window">
        <div class="title-bar">
            <span style="color: #4ec9b0;">📊</span>
            <span class="file-name">stockholm_temp.qvd — Ctrl-Q QVD Viewer</span>
        </div>
        <div class="content">
            <div class="section">
                <div class="section-title">📄 File Metadata</div>
                <div class="metadata-grid">
                    <div class="metadata-label">Creator Document:</div>
                    <div class="metadata-value">${result.metadata?.creatorDoc || 'Unknown'}</div>
                    <div class="metadata-label">File Name:</div>
                    <div class="metadata-value">stockholm_temp.qvd</div>
                    <div class="metadata-label">Total Fields:</div>
                    <div class="metadata-value">${result.fields?.length || 0}</div>
                    <div class="metadata-label">Preview Rows:</div>
                    <div class="metadata-value">${result.data?.length || 0}</div>
                </div>
            </div>

            <div class="section">
                <div class="section-title">🏷️ Field Information</div>
                <div class="field-list">
                    ${result.fields?.slice(0, 5).map(field => `
                        <div class="field-item">
                            <span class="field-name">${field.name}</span>
                            <span class="field-type">${field.type || 'TEXT'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="section">
                <div class="section-title">📊 Data Preview</div>
                <table>
                    <thead>
                        <tr>
                            ${result.fields?.map(f => `<th>${f.name}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${result.data?.slice(0, 10).map(row => `
                            <tr>
                                ${result.fields?.map(f => `<td>${row[f.name] ?? ''}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="pagination">
                    <div class="page-info">Showing 1-10 of ${result.data?.length} rows loaded</div>
                    <button class="button">Load More Rows</button>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;

  // Save the HTML file
  const outputPath = path.join(__dirname, '../media/demo-preview.html');
  fs.writeFileSync(outputPath, demoHtml);
  console.log(`Demo HTML saved to: ${outputPath}`);
  
  return result;
}

createDemoData().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
