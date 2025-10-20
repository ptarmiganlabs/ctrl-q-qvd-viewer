# QVD Viewer for VS Code

A Visual Studio Code extension for viewing QVD (QlikView Data) files created by Qlik Sense or QlikView.

## Features

- **View QVD Files**: Open and view QVD files directly in VS Code with a custom editor
- **Metadata Display**: See comprehensive metadata about QVD files including:
  - Table name
  - Record count
  - Field count
  - File size
  - Creator information
  - Creation timestamp
- **Field Information**: View detailed information about each field:
  - Field name
  - Data type
  - Number format
  - Tags
- **Data Preview**: View sample data from the QVD file (configurable number of rows, default 25)
- **Lineage Information**: See the data lineage and transformation history

## QVD File Format

QVD files are a tabular format consisting of:
- XML headers with metadata
- Binary symbol table with distinct field values
- Binary index table with record data

More information about the QVD file format:
- [qvd4js Library](https://github.com/MuellerConstantin/qvd4js)
- [PyQVD Documentation](https://pyqvd.readthedocs.io/latest/guide/qvd-file-format.html)

## Usage

1. Open a `.qvd` file in VS Code
2. The file will automatically open in the QVD Viewer
3. View metadata, field information, and sample data

## Extension Settings

This extension contributes the following settings:

* `qvd-viewer.previewRowCount`: Number of rows to display in the data preview (default: 25, min: 1, max: 10000)

## Building the Extension

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Build Instructions

1. Clone the repository:
   ```bash
   git clone https://github.com/ptarmiganlabs/qvd4vscode.git
   cd qvd4vscode
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Watch for changes during development:
   ```bash
   npm run watch
   ```

## Testing the Extension Locally

### Method 1: Using VS Code Extension Development Host

1. Open the project in VS Code
2. Press `F5` or go to Run → Start Debugging
3. This will open a new VS Code window with the extension loaded
4. In the new window, open a `.qvd` file to test the extension

### Method 2: Installing from VSIX

1. Package the extension:
   ```bash
   npx @vscode/vsce package
   ```

2. Install the generated `.vsix` file:
   - Go to Extensions view in VS Code
   - Click the `...` menu → Install from VSIX
   - Select the generated `.vsix` file

## Development

### Project Structure

```
qvd4vscode/
├── src/
│   ├── extension.ts           # Extension entry point
│   ├── qvdEditorProvider.ts   # Custom editor provider for QVD files
│   ├── qvdReader.ts           # QVD file parser and reader
│   └── types/
│       └── qvd4js.d.ts        # Type definitions for qvd4js
├── package.json                # Extension manifest
├── tsconfig.json              # TypeScript configuration
├── esbuild.js                 # Build configuration
└── README.md                  # This file
```

### Available Scripts

- `npm run compile` - Compile the extension
- `npm run watch` - Watch for changes and recompile
- `npm run lint` - Run ESLint
- `npm run test` - Run tests
- `npm run package` - Package for production

## Dependencies

- [qvd4js](https://www.npmjs.com/package/qvd4js) - Library for reading QVD files

## Known Issues

- Large QVD files may take some time to load
- The extension is read-only (editing QVD files is not supported)

## Release Notes

### 0.0.1

Initial release:
- View QVD files in VS Code
- Display file metadata
- Display field information
- Preview sample data
- Configurable row count

## License

See [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/ptarmiganlabs/qvd4vscode).
