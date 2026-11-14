# QVD Metadata Compare Provider

## Overview

The `QvdMetadataCompareProvider` is a VS Code TextDocumentContentProvider that enables viewing and comparing QVD file metadata in VS Code's diff viewer.

## Features

- **Fast Metadata Extraction**: Extracts QVD metadata without loading full data (uses maxRows=1)
- **Diff-Friendly Format**: Structured text output optimized for side-by-side comparison
- **Comprehensive Metadata**: Includes file metadata, lineage, and field information
- **Error Handling**: Graceful error handling with integrated logging
- **Event Support**: Implements change notifications via EventEmitter

## Usage

### Registration

Register the provider during extension activation:

```javascript
import QvdMetadataCompareProvider from "./qvdMetadataCompareProvider.mjs";

const metadataProvider = new QvdMetadataCompareProvider();
const registration = vscode.workspace.registerTextDocumentContentProvider(
  QvdMetadataCompareProvider.scheme,
  metadataProvider
);
context.subscriptions.push(registration);
```

### Creating URIs

Create URIs for QVD files to view their metadata:

```javascript
const metadataUri = vscode.Uri.parse(
  `${QvdMetadataCompareProvider.scheme}://metadata?${filePath}`
);
```

### Opening Diff View

Compare metadata from two QVD files:

```javascript
await vscode.commands.executeCommand(
  "vscode.diff",
  metadataUri1,
  metadataUri2,
  "Compare QVD Metadata"
);
```

## Output Format

The provider formats metadata into three main sections:

### 1. File Metadata
- Table name
- Record count
- Record byte size
- QV build number
- Creator document ID
- Timestamps (created, source created, source file, stale)
- Source file information
- Compression details
- Comments and encryption info
- Table tags and profiling data

### 2. Lineage
- List of source files and transformations
- Discriminators and statements
- Chronological order of data lineage

### 3. Field Metadata
For each field:
- Name
- Type and extent
- Number of symbols (cardinality)
- Offset, length, bit offset, and bit width
- Bias value
- Number format (type, decimals, thousand separator, etc.)
- Tags (e.g., $numeric, $integer, $text)
- Comments

## Example Output

```
================================================================================
QVD METADATA: /path/to/file.qvd
================================================================================

FILE METADATA
--------------------------------------------------------------------------------
Table Name:           customer_data
Record Count:         10000
Record Byte Size:     8
QV Build Number:      50689
...

LINEAGE
--------------------------------------------------------------------------------
  [1] Discriminator: source_database.qvd
  [2] Discriminator: https://api.example.com/customers

FIELD METADATA
--------------------------------------------------------------------------------
Total Fields: 5

Field 1: customer_id
  Type:           N/A
  Symbols:        10000
  Tags:           $numeric, $integer
  ...
```

## Performance

- Target: <100ms for metadata extraction
- Actual: ~100-150ms depending on file size and disk I/O
- Significantly faster than loading full QVD data
- Uses minimal memory footprint

## Error Handling

The provider handles various error conditions:
- Missing file path in URI → Returns error message
- File not found → Returns QvdReader error
- Invalid QVD format → Returns parsing error
- I/O errors → Logged and returned as error message

All errors are logged via the centralized logger for debugging.

## Testing

Run the test suite:

```bash
npm test
```

Test coverage includes:
- Provider initialization
- Valid file metadata extraction
- Field information formatting
- Performance validation
- Error scenarios
- Event emitter functionality
- Format structure validation

## API Reference

### Static Properties

- `scheme` (string): URI scheme for QVD metadata documents (`"qvd-metadata"`)

### Instance Properties

- `qvdReader` (QvdReader): Instance of QvdReader for file operations
- `onDidChange` (Event): Event fired when document content changes

### Methods

#### `provideTextDocumentContent(uri: vscode.Uri): Promise<string>`

Provides formatted text content for a QVD file's metadata.

**Parameters:**
- `uri`: VS Code URI with file path in query parameter

**Returns:**
- Promise resolving to formatted metadata text

#### `formatMetadata(metadata: object, filePath: string): string`

Formats raw QVD metadata into structured text.

**Parameters:**
- `metadata`: Metadata object from QvdReader
- `filePath`: Path to the QVD file

**Returns:**
- Formatted metadata as string

#### `notifyChange(uri: vscode.Uri): void`

Notifies listeners that a document's content has changed.

**Parameters:**
- `uri`: URI of the changed document

#### `dispose(): void`

Cleans up resources and event listeners.

## Dependencies

- `vscode`: VS Code extension API
- `QvdReader`: QVD file reader (from `./qvdReader.mjs`)
- `logger`: Centralized logging (from `./logger.mjs`)

## Implementation Notes

- Uses `maxRows=1` for efficient metadata extraction (not `maxRows=0` which loads all rows)
- Formats output with consistent line lengths (80 characters) for readability
- Uses consistent separators (`=` for major sections, `-` for subsections)
- Aligns field labels for easy visual scanning
- Handles missing or null values gracefully with "N/A" placeholders
- Supports both array and object-based lineage formats

## Future Enhancements

Potential improvements:
- Add configuration for output formatting preferences
- Support filtering fields by tags or patterns
- Add statistics summary section
- Enable custom metadata sections
- Support diff highlighting of specific metadata changes
