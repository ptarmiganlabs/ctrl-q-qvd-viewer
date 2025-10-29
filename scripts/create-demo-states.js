#!/usr/bin/env node

/**
 * Script to create multiple demonstration HTML files showing different states
 * of the QVD Viewer extension for creating animated GIFs
 */

const fs = require('fs');
const path = require('path');
const QvdReader = require('../src/qvdReader');

const VS_COLORS = {
  bg: '#1e1e1e',
  sidebar: '#252526',
  titleBar: '#2d2d30',
  border: '#3c3c3c',
  text: '#cccccc',
  textBright: '#ffffff',
  blue: '#4fc1ff',
  green: '#4ec9b0',
  yellow: '#dcdcaa',
  orange: '#ce9178',
  lightBlue: '#9cdcfe',
  darkGreen: '#b5cea8',
  buttonBg: '#0e639c',
  buttonHover: '#1177bb',
  hover: '#2a2d2e'
};

function createBaseHTML(title, content, showHighlight = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            margin: 0;
            padding: 20px;
            background: ${VS_COLORS.bg};
            color: ${VS_COLORS.text};
        }
        .vscode-container {
            max-width: 1400px;
            margin: 0 auto;
            background: ${VS_COLORS.bg};
            border: 1px solid ${VS_COLORS.border};
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
            overflow: hidden;
        }
        .title-bar {
            background: ${VS_COLORS.titleBar};
            padding: 10px 16px;
            display: flex;
            align-items: center;
            border-bottom: 1px solid ${VS_COLORS.border};
        }
        .file-icon {
            font-size: 18px;
            margin-right: 8px;
        }
        .file-name {
            color: ${VS_COLORS.textBright};
            font-size: 13px;
            font-weight: 500;
        }
        .content {
            padding: 24px;
        }
        .section {
            margin-bottom: 32px;
            ${showHighlight ? `animation: highlight 1s ease-in-out;` : ''}
        }
        @keyframes highlight {
            0%, 100% { background: transparent; }
            50% { background: rgba(78, 201, 176, 0.1); }
        }
        .section-title {
            color: ${VS_COLORS.green};
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 16px;
            border-bottom: 1px solid ${VS_COLORS.border};
            padding-bottom: 10px;
            display: flex;
            align-items: center;
        }
        .section-icon {
            margin-right: 8px;
        }
        .metadata-grid {
            display: grid;
            grid-template-columns: 220px 1fr;
            gap: 12px;
            background: ${VS_COLORS.sidebar};
            padding: 20px;
            border-radius: 6px;
            border: 1px solid ${VS_COLORS.border};
        }
        .metadata-label {
            color: ${VS_COLORS.lightBlue};
            font-weight: 500;
            font-size: 13px;
        }
        .metadata-value {
            color: ${VS_COLORS.orange};
            font-family: 'Courier New', monospace;
            font-size: 13px;
        }
        .field-list {
            background: ${VS_COLORS.sidebar};
            padding: 16px;
            border-radius: 6px;
            border: 1px solid ${VS_COLORS.border};
        }
        .field-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            border-bottom: 1px solid ${VS_COLORS.border};
            transition: background 0.2s;
        }
        .field-item:last-child {
            border-bottom: none;
        }
        .field-item:hover {
            background: ${VS_COLORS.hover};
        }
        .field-name {
            color: ${VS_COLORS.blue};
            font-weight: 500;
            font-size: 14px;
        }
        .field-type {
            color: ${VS_COLORS.darkGreen};
            font-style: italic;
            font-size: 13px;
            background: rgba(181, 206, 168, 0.1);
            padding: 2px 8px;
            border-radius: 3px;
        }
        .table-container {
            background: ${VS_COLORS.sidebar};
            border-radius: 6px;
            overflow: hidden;
            border: 1px solid ${VS_COLORS.border};
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            background: ${VS_COLORS.titleBar};
            color: ${VS_COLORS.green};
            padding: 14px 16px;
            text-align: left;
            font-weight: 600;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 2px solid ${VS_COLORS.border};
        }
        td {
            padding: 12px 16px;
            border-bottom: 1px solid ${VS_COLORS.border};
            color: ${VS_COLORS.text};
            font-size: 13px;
            font-family: 'Courier New', monospace;
        }
        tr:last-child td {
            border-bottom: none;
        }
        tbody tr:hover {
            background: ${VS_COLORS.hover};
        }
        .pagination-bar {
            margin-top: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 16px;
            background: ${VS_COLORS.sidebar};
            border-radius: 6px;
            border: 1px solid ${VS_COLORS.border};
        }
        .page-info {
            color: ${VS_COLORS.lightBlue};
            font-size: 13px;
        }
        .button {
            background: ${VS_COLORS.buttonBg};
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: background 0.2s;
        }
        .button:hover {
            background: ${VS_COLORS.buttonHover};
        }
        .button-group {
            display: flex;
            gap: 8px;
        }
    </style>
</head>
<body>
    ${content}
</body>
</html>`;
}

async function createDemoStates() {
  const reader = new QvdReader();
  const qvdPath = path.join(__dirname, '../test-data/stockholm_temp.qvd');
  
  console.log('Reading QVD file...');
  const result = await reader.read(qvdPath, 100);
  
  console.log('Creating demo state HTML files...');

  // State 1: Initial load - showing metadata
  const state1Content = `
    <div class="vscode-container">
        <div class="title-bar">
            <span class="file-icon">📊</span>
            <span class="file-name">stockholm_temp.qvd — Ctrl-Q QVD Viewer</span>
        </div>
        <div class="content">
            <div class="section">
                <div class="section-title">
                    <span class="section-icon">📄</span>
                    File Metadata
                </div>
                <div class="metadata-grid">
                    <div class="metadata-label">Creator Document:</div>
                    <div class="metadata-value">${result.metadata?.creatorDoc || 'N/A'}</div>
                    <div class="metadata-label">File Name:</div>
                    <div class="metadata-value">stockholm_temp.qvd</div>
                    <div class="metadata-label">Total Fields:</div>
                    <div class="metadata-value">${result.fields?.length || 0}</div>
                    <div class="metadata-label">Data Rows Loaded:</div>
                    <div class="metadata-value">${result.data?.length || 0}</div>
                    <div class="metadata-label">File Size:</div>
                    <div class="metadata-value">2.1 MB</div>
                </div>
            </div>
        </div>
    </div>`;
  
  fs.writeFileSync(
    path.join(__dirname, '../media/demo-state1.html'),
    createBaseHTML('QVD Viewer - Metadata', state1Content)
  );

  // State 2: Showing field information
  const state2Content = `
    <div class="vscode-container">
        <div class="title-bar">
            <span class="file-icon">📊</span>
            <span class="file-name">stockholm_temp.qvd — Ctrl-Q QVD Viewer</span>
        </div>
        <div class="content">
            <div class="section">
                <div class="section-title">
                    <span class="section-icon">📄</span>
                    File Metadata
                </div>
                <div class="metadata-grid">
                    <div class="metadata-label">Creator Document:</div>
                    <div class="metadata-value">${result.metadata?.creatorDoc || 'N/A'}</div>
                    <div class="metadata-label">File Name:</div>
                    <div class="metadata-value">stockholm_temp.qvd</div>
                    <div class="metadata-label">Total Fields:</div>
                    <div class="metadata-value">${result.fields?.length || 0}</div>
                    <div class="metadata-label">Data Rows Loaded:</div>
                    <div class="metadata-value">${result.data?.length || 0}</div>
                </div>
            </div>
            <div class="section">
                <div class="section-title">
                    <span class="section-icon">🏷️</span>
                    Field Information
                </div>
                <div class="field-list">
                    ${result.fields?.map(field => `
                        <div class="field-item">
                            <span class="field-name">${field.name}</span>
                            <span class="field-type">${field.type || 'TEXT'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    </div>`;
  
  fs.writeFileSync(
    path.join(__dirname, '../media/demo-state2.html'),
    createBaseHTML('QVD Viewer - Fields', state2Content, true)
  );

  // State 3: Showing data preview with pagination
  const state3Content = `
    <div class="vscode-container">
        <div class="title-bar">
            <span class="file-icon">📊</span>
            <span class="file-name">stockholm_temp.qvd — Ctrl-Q QVD Viewer</span>
        </div>
        <div class="content">
            <div class="section">
                <div class="section-title">
                    <span class="section-icon">📊</span>
                    Data Preview
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                ${result.fields?.map(f => `<th>${f.name}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${result.data?.slice(0, 15).map(row => `
                                <tr>
                                    ${result.fields?.map(f => `<td>${row[f.name] ?? ''}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="pagination-bar">
                    <div class="page-info">Showing rows 1-15 of ${result.data?.length} loaded</div>
                    <div class="button-group">
                        <button class="button">⟨ Previous</button>
                        <button class="button">Next ⟩</button>
                        <button class="button">Load More Rows</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
  
  fs.writeFileSync(
    path.join(__dirname, '../media/demo-state3.html'),
    createBaseHTML('QVD Viewer - Data', state3Content, true)
  );

  console.log('✓ Created demo state files:');
  console.log('  - media/demo-state1.html (Metadata view)');
  console.log('  - media/demo-state2.html (Fields view)');
  console.log('  - media/demo-state3.html (Data preview)');
}

createDemoStates().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
