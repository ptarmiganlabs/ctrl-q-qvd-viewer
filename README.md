# QVD Viewer for VS Code

A Visual Studio Code extension for viewing Qlik Sense and QlikView QVD (QlikView Data) files directly within VS Code.

## Features

- **View QVD Files**: Open and view QVD files created by Qlik Sense or QlikView
- **Display Metadata**: View comprehensive metadata about QVD files including:
  - File creation information
  - Table creator details
  - Total number of records
  - Field definitions with types, symbols, and technical details
- **Data Preview**: View sample data from QVD files in a formatted table
- **Configurable Display**: Customize the number of rows displayed (default: 25)
- **Read-Only Access**: Safe viewing without modifying original QVD files

## Installation

### From VSIX (Local Installation)

1. Clone this repository
2. Install dependencies: `npm install`
3. Package the extension: `npm run package` (or use `vsce package`)
4. Install in VS Code: Extensions → Install from VSIX

### From Source (Development)

See [Development](#development) section below.

## Usage

### Opening QVD Files

There are two ways to open a QVD file:

1. **From File Explorer**: Click on any `.qvd` or `.QVD` file in the VS Code Explorer sidebar
2. **Using Command Palette**: 
   - Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
   - Type "Open QVD File" and select the command
   - Choose a QVD file from the file picker

### What You'll See

The extension displays QVD files in three sections:

**1. File Metadata**
```
Creator Document: QVD4VSCode Test
Created (UTC): 2025-10-20 16:00:00
Table Creator: QVD4VSCode
Total Records: 3
```

**2. Field Information**
Each field shows:
- Field name
- Data type (INTEGER, TEXT, etc.)
- Number of unique symbols
- Bit width for data storage

**3. Data Preview**
A formatted table showing the first N rows (configurable) with all columns from the QVD file.

### Example Output

When you open a QVD file, you'll see:
- File metadata at the top
- Field information with types and statistics
- Data preview in a table format below

## Extension Settings

This extension contributes the following settings:

* `qvd4vscode.maxPreviewRows`: Maximum number of rows to display in the QVD preview (default: 25, min: 1, max: 1000)

To change this setting:
1. Go to File → Preferences → Settings (or `Ctrl+,`)
2. Search for "QVD"
3. Adjust the "Max Preview Rows" value

## QVD File Format

QVD files are a proprietary tabular format used by Qlik Sense and QlikView. They consist of:
- An XML header containing metadata about the file and field definitions
- Binary data section containing the actual table data

For more information about the QVD format:
- [qvd4js Library](https://github.com/MuellerConstantin/qvd4js)
- [PyQVD Documentation](https://pyqvd.readthedocs.io/latest/guide/qvd-file-format.html)

## Development

### Prerequisites

- Node.js 18.x or later
- npm 8.x or later
- Visual Studio Code 1.105.0 or later

### Building the Extension

1. Clone the repository:
   ```bash
   git clone https://github.com/ptarmiganlabs/qvd4vscode.git
   cd qvd4vscode
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run linting:
   ```bash
   npm run lint
   ```

### Testing the Extension Locally

1. Open the project in VS Code:
   ```bash
   code .
   ```

2. Press `F5` to start debugging
   - This will open a new VS Code window with the extension loaded
   - The extension will be in development mode

3. In the new window:
   - Open a QVD file or use Command Palette → "Open QVD File"
   - The QVD viewer should display the file contents

4. Make changes to the code and reload the extension window (`Ctrl+R` or `Cmd+R`)

### Creating a Test QVD File

A sample QVD file is provided in `test-data/sample.qvd` for testing the metadata display. To create your own test QVD files, you can:

1. Export data as QVD from Qlik Sense or QlikView
2. Use the qvd4js library programmatically
3. Use other QVD creation tools

### Project Structure

```
qvd4vscode/
├── extension.js           # Main extension entry point
├── qvdReader.js          # QVD file reader and metadata extractor
├── qvdEditorProvider.js  # Custom editor provider for QVD files
├── package.json          # Extension manifest
├── test-data/            # Sample QVD files for testing
└── test/                 # Test files
```

## Known Issues

- Binary data reading depends on the qvd4js library and may not work with all QVD file variations
- Large QVD files (>10,000 rows) may take longer to load; use the maxPreviewRows setting to limit display
- The extension currently provides read-only access to QVD files

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

See LICENSE file for details.

## Release Notes

### 0.0.1

Initial release:
- QVD file viewer with metadata display
- Data preview with configurable row limit
- Custom editor integration
- Field information display

---

**Enjoy viewing your QVD files in VS Code!**
