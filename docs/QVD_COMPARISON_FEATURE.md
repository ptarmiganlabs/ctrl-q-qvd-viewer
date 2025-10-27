# QVD Comparison Feature - Implementation Guide

## Overview

This document explains how to implement a QVD comparison feature in the Ctrl-Q QVD Viewer extension by leveraging VS Code's built-in file comparison capabilities.

## Research Summary

**Question:** Is it possible to hook into VS Code's existing file comparison feature for text files?

**Answer:** Yes! VS Code provides a robust `vscode.diff` command and support for virtual documents through `TextDocumentContentProvider`, making it possible to create custom comparison views for QVD files.

## VS Code's Built-in Diff Capabilities

### 1. The `vscode.diff` Command

VS Code has a built-in command `vscode.diff` that opens the diff editor to compare two documents side by side. This command accepts:

- **Left URI** (`vscode.Uri`): The first file/resource (left side of diff)
- **Right URI** (`vscode.Uri`): The second file/resource (right side of diff)
- **Title** (`string`, optional): Custom title for the diff editor
- **Options** (`object`, optional): Editor options like `preview` or `preserveFocus`

**Basic usage example:**

```javascript
const vscode = require('vscode');

async function compareFiles() {
    const uri1 = vscode.Uri.file('/path/to/file1.txt');
    const uri2 = vscode.Uri.file('/path/to/file2.txt');
    
    await vscode.commands.executeCommand(
        'vscode.diff',
        uri1,
        uri2,
        'File Comparison',
        { preview: true }
    );
}
```

### 2. Virtual Documents with TextDocumentContentProvider

For comparing non-text files or dynamically generated content (like QVD metadata), VS Code supports virtual documents through the `TextDocumentContentProvider` interface.

**How it works:**

1. Register a content provider with a custom URI scheme
2. Implement `provideTextDocumentContent(uri)` to return content for URIs
3. Use the custom scheme URIs with `vscode.diff`

**Example implementation:**

```javascript
const vscode = require('vscode');

class QvdContentProvider {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChange = this._onDidChange.event;
    }

    provideTextDocumentContent(uri) {
        // Extract QVD file path and comparison type from URI
        const params = new URLSearchParams(uri.query);
        const filePath = params.get('file');
        const type = params.get('type'); // 'metadata' or 'data'
        
        // Return formatted content based on type
        if (type === 'metadata') {
            return this.formatMetadata(filePath);
        } else if (type === 'data') {
            return this.formatData(filePath);
        }
    }

    formatMetadata(filePath) {
        // Read and format QVD metadata as text
        // Return structured, readable format
    }

    formatData(filePath) {
        // Read and format QVD data as text
        // Return CSV or table format
    }
}

// Register the provider
function activate(context) {
    const provider = new QvdContentProvider();
    const registration = vscode.workspace.registerTextDocumentContentProvider(
        'qvd-compare',
        provider
    );
    context.subscriptions.push(registration);
}
```

## Recommended Implementation Approach

### Architecture Overview

The QVD comparison feature should consist of three main components:

1. **Command Registration**: Register a command to initiate QVD comparison
2. **Content Provider**: Provide formatted QVD content for the diff view
3. **Comparison Logic**: Extract and format QVD metadata and data for comparison

### Component 1: Command Registration

Add a new command to `package.json`:

```json
{
  "contributes": {
    "commands": [
      {
        "command": "ctrl-q-qvd-viewer.compareQvd",
        "title": "Compare QVD Files",
        "category": "QVD"
      }
    ]
  }
}
```

Implement the command in `extension.js`:

```javascript
const compareQvdCommand = vscode.commands.registerCommand(
    'ctrl-q-qvd-viewer.compareQvd',
    async () => {
        // Prompt user to select two QVD files
        const files = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            filters: {
                'QVD Files': ['qvd', 'QVD']
            },
            title: 'Select two QVD files to compare'
        });

        if (!files || files.length !== 2) {
            vscode.window.showErrorMessage('Please select exactly 2 QVD files to compare');
            return;
        }

        // Show comparison menu
        await showComparisonMenu(files[0], files[1]);
    }
);
```

### Component 2: Comparison Menu

Provide options for what to compare:

```javascript
async function showComparisonMenu(file1Uri, file2Uri) {
    const choice = await vscode.window.showQuickPick([
        {
            label: 'Compare Metadata',
            description: 'Compare XML metadata (file and field level)',
            value: 'metadata'
        },
        {
            label: 'Compare Data',
            description: 'Compare actual data rows',
            value: 'data'
        },
        {
            label: 'Compare Both',
            description: 'View metadata and data comparisons',
            value: 'both'
        }
    ], {
        placeHolder: 'What would you like to compare?'
    });

    if (!choice) return;

    if (choice.value === 'metadata' || choice.value === 'both') {
        await compareMetadata(file1Uri, file2Uri);
    }
    
    if (choice.value === 'data' || choice.value === 'both') {
        await compareData(file1Uri, file2Uri);
    }
}
```

### Component 3: Content Provider Implementation

Create a new file `src/qvdCompareProvider.js`:

```javascript
const vscode = require('vscode');
const QvdReader = require('./qvdReader');

class QvdCompareProvider {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChange = this._onDidChange.event;
        this.qvdReader = new QvdReader();
    }

    async provideTextDocumentContent(uri) {
        const params = new URLSearchParams(uri.query);
        const filePath = params.get('file');
        const compareType = params.get('type'); // 'metadata' or 'data'

        if (compareType === 'metadata') {
            return await this.formatMetadata(filePath);
        } else if (compareType === 'data') {
            return await this.formatData(filePath);
        }

        return 'Unknown comparison type';
    }

    async formatMetadata(filePath) {
        const result = await this.qvdReader.read(filePath, 0);
        
        if (result.error) {
            return `Error reading QVD file: ${result.error}`;
        }

        const { metadata } = result;
        const lines = [];

        // File-level metadata
        lines.push('=== FILE METADATA ===');
        lines.push('');
        lines.push(`QV Build No: ${metadata.qvBuildNo || '(empty)'}`);
        lines.push(`Creator Document: ${metadata.creatorDoc || '(empty)'}`);
        lines.push(`Created (UTC): ${metadata.createUtcTime || '(empty)'}`);
        lines.push(`Source Create (UTC): ${metadata.sourceCreateUtcTime || '(empty)'}`);
        lines.push(`Source File Time (UTC): ${metadata.sourceFileUtcTime || '(empty)'}`);
        lines.push(`Source File Size: ${metadata.sourceFileSize || '(empty)'}`);
        lines.push(`Stale Time (UTC): ${metadata.staleUtcTime || '(empty)'}`);
        lines.push(`Table Name: ${metadata.tableName || '(empty)'}`);
        lines.push(`Table Creator: ${metadata.tableCreator || '(empty)'}`);
        lines.push(`Compression: ${metadata.compression || '(empty)'}`);
        lines.push(`Record Byte Size: ${metadata.recordByteSize || '(empty)'}`);
        lines.push(`Total Records: ${metadata.noOfRecords}`);
        lines.push(`Offset: ${metadata.offset}`);
        lines.push(`Length: ${metadata.length}`);
        lines.push(`Comment: ${metadata.comment || '(empty)'}`);
        lines.push(`Encryption Info: ${metadata.encryptionInfo || '(empty)'}`);
        lines.push(`Table Tags: ${metadata.tableTags || '(empty)'}`);
        lines.push(`Profiling Data: ${metadata.profilingData || '(empty)'}`);
        
        // Lineage information
        if (metadata.lineage && metadata.lineage.LineageInfo) {
            lines.push('');
            lines.push('=== LINEAGE INFORMATION ===');
            lines.push('');
            const lineageItems = Array.isArray(metadata.lineage.LineageInfo) 
                ? metadata.lineage.LineageInfo 
                : [metadata.lineage.LineageInfo];
            
            lineageItems.forEach((item, idx) => {
                lines.push(`Lineage Item ${idx + 1}:`);
                if (item.Discriminator) {
                    lines.push(`  Discriminator: ${item.Discriminator}`);
                }
                if (item.Statement) {
                    lines.push(`  Statement:`);
                    lines.push(`    ${item.Statement.split('\n').join('\n    ')}`);
                }
                lines.push('');
            });
        }

        // Field-level metadata
        lines.push('');
        lines.push('=== FIELD METADATA ===');
        lines.push('');
        lines.push(`Total Fields: ${metadata.fields ? metadata.fields.length : 0}`);
        lines.push('');

        if (metadata.fields && metadata.fields.length > 0) {
            metadata.fields.forEach((field, idx) => {
                lines.push(`Field ${idx + 1}: ${field.name}`);
                lines.push(`  Type: ${field.type || '(empty)'}`);
                lines.push(`  Extent: ${field.extent || '(empty)'}`);
                lines.push(`  Number of Symbols: ${field.noOfSymbols}`);
                lines.push(`  Offset: ${field.offset}`);
                lines.push(`  Length: ${field.length}`);
                lines.push(`  Bit Offset: ${field.bitOffset}`);
                lines.push(`  Bit Width: ${field.bitWidth}`);
                lines.push(`  Bias: ${field.bias}`);
                lines.push(`  Tags: ${field.tags && field.tags.length > 0 ? field.tags.join(', ') : '(empty)'}`);
                lines.push(`  Comment: ${field.comment || '(empty)'}`);
                lines.push('');
            });
        }

        return lines.join('\n');
    }

    async formatData(filePath, maxRows = 1000) {
        const result = await this.qvdReader.read(filePath, maxRows);
        
        if (result.error) {
            return `Error reading QVD file: ${result.error}`;
        }

        if (result.dataError) {
            return `Error reading data: ${result.dataError}`;
        }

        const { data, columns, totalRows } = result;
        const lines = [];

        lines.push('=== DATA PREVIEW ===');
        lines.push('');
        lines.push(`Total Rows in File: ${totalRows}`);
        lines.push(`Rows Shown: ${data.length}`);
        
        if (data.length < totalRows) {
            lines.push(`WARNING: Showing limited rows. ${totalRows - data.length} rows not displayed.`);
        }
        
        lines.push('');

        // CSV-like format with proper escaping
        if (columns.length > 0) {
            // Header row
            lines.push(columns.map(col => this.escapeCSV(col)).join('|'));
            lines.push(columns.map(() => '---').join('|'));

            // Data rows
            data.forEach(row => {
                const rowValues = columns.map(col => {
                    const value = row[col];
                    return this.escapeCSV(value !== null && value !== undefined ? String(value) : '');
                });
                lines.push(rowValues.join('|'));
            });
        }

        return lines.join('\n');
    }

    escapeCSV(value) {
        // Simple escaping for table format
        return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    }
}

module.exports = QvdCompareProvider;
```

### Component 4: Comparison Functions

Implement the comparison functions:

```javascript
async function compareMetadata(file1Uri, file2Uri) {
    const file1Name = path.basename(file1Uri.fsPath);
    const file2Name = path.basename(file2Uri.fsPath);

    const uri1 = vscode.Uri.parse(
        `qvd-compare:${file1Name}?file=${encodeURIComponent(file1Uri.fsPath)}&type=metadata`
    );
    const uri2 = vscode.Uri.parse(
        `qvd-compare:${file2Name}?file=${encodeURIComponent(file2Uri.fsPath)}&type=metadata`
    );

    await vscode.commands.executeCommand(
        'vscode.diff',
        uri1,
        uri2,
        `Compare Metadata: ${file1Name} ↔ ${file2Name}`,
        { preview: false }
    );
}

async function compareData(file1Uri, file2Uri) {
    const file1Name = path.basename(file1Uri.fsPath);
    const file2Name = path.basename(file2Uri.fsPath);

    const uri1 = vscode.Uri.parse(
        `qvd-compare:${file1Name}?file=${encodeURIComponent(file1Uri.fsPath)}&type=data`
    );
    const uri2 = vscode.Uri.parse(
        `qvd-compare:${file2Name}?file=${encodeURIComponent(file2Uri.fsPath)}&type=data`
    );

    await vscode.commands.executeCommand(
        'vscode.diff',
        uri1,
        uri2,
        `Compare Data: ${file1Name} ↔ ${file2Name}`,
        { preview: false }
    );
}
```

## Handling Large Files and Differences

When comparing QVD files, there may be many differences, especially in data rows. Here are strategies to handle this:

### 1. Limit Rows Displayed

For data comparison, limit the number of rows to prevent performance issues:

```javascript
const MAX_COMPARISON_ROWS = 1000; // Configurable setting

// In formatData method:
const rowsToCompare = Math.min(data.length, MAX_COMPARISON_ROWS);
```

### 2. Add Summary Statistics

Before showing row-by-row differences, provide a summary:

```javascript
lines.push('=== COMPARISON SUMMARY ===');
lines.push('');
lines.push(`File 1 Total Rows: ${totalRows1}`);
lines.push(`File 2 Total Rows: ${totalRows2}`);
lines.push(`Row Count Difference: ${Math.abs(totalRows1 - totalRows2)}`);
lines.push('');
lines.push(`Comparing first ${MAX_COMPARISON_ROWS} rows...`);
lines.push('');
```

### 3. Provide Difference Filters

Add a configuration option to limit what's compared:

```json
{
  "ctrl-q-qvd-viewer.maxComparisonRows": {
    "type": "number",
    "default": 1000,
    "description": "Maximum number of rows to compare in QVD data comparison",
    "minimum": 100,
    "maximum": 100000
  }
}
```

### 4. Field-Level Comparison

For metadata, focus on key differences:

- Field count changes
- Field name changes
- Field type changes
- Field order changes

Consider adding a separate "Quick Summary" section at the top:

```javascript
lines.push('=== QUICK SUMMARY ===');
lines.push('');
lines.push(`Field Count: ${metadata.fields.length}`);
lines.push(`Record Count: ${metadata.noOfRecords}`);
lines.push(`Table Name: ${metadata.tableName}`);
lines.push('');
lines.push('=== DETAILED METADATA ===');
lines.push('');
// ... rest of metadata
```

## Alternative Approaches

### 1. Custom Webview Comparison

Instead of using VS Code's built-in diff, create a custom webview panel with side-by-side comparison:

**Pros:**
- More control over visualization
- Can highlight QVD-specific differences
- Can add interactive features (expand/collapse sections)
- Better formatting for tables and metadata

**Cons:**
- More code to write and maintain
- Need to implement diff algorithm
- Less integration with VS Code features

### 2. Hybrid Approach

Combine both approaches:
- Use `vscode.diff` for metadata (text-based comparison)
- Use custom webview for data comparison (table visualization)

This provides the best of both worlds.

## Implementation Checklist

To implement the QVD comparison feature:

- [ ] Create `src/qvdCompareProvider.js` with `TextDocumentContentProvider` implementation
- [ ] Register the provider in `src/extension.js` with scheme `qvd-compare`
- [ ] Add `compareQvd` command to `package.json`
- [ ] Implement command handler to prompt for two QVD files
- [ ] Implement comparison menu with metadata/data/both options
- [ ] Create `compareMetadata()` and `compareData()` functions
- [ ] Add configuration settings for max comparison rows
- [ ] Test with various QVD files
- [ ] Add error handling for invalid files or comparison failures
- [ ] Document the feature in README.md

## References

- [VS Code Commands API](https://code.visualstudio.com/api/extension-guides/command)
- [VS Code Virtual Documents](https://code.visualstudio.com/api/extension-guides/virtual-documents)
- [TextDocumentContentProvider API](https://code.visualstudio.com/api/references/vscode-api#TextDocumentContentProvider)
- [Stack Overflow: File Comparison API in VS Code](https://stackoverflow.com/questions/63196987/is-there-api-for-files-comparison-in-vscode)
- [Microsoft vscode-extension-samples](https://github.com/microsoft/vscode-extension-samples)

## Conclusion

**Yes, it is definitely possible to hook into VS Code's existing file comparison feature!** 

The `vscode.diff` command combined with `TextDocumentContentProvider` provides a robust foundation for implementing QVD file comparison. This approach:

- Leverages VS Code's built-in diff viewer
- Provides familiar UI for users
- Requires minimal custom UI code
- Integrates well with VS Code's existing features
- Can be enhanced with custom webviews if needed

The key is to format QVD metadata and data as text in a structured, diff-friendly format so that VS Code's diff viewer can highlight the differences effectively.
