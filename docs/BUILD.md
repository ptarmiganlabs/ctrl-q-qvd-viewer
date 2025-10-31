# Build and Development Guide

This guide provides detailed instructions for building, testing, and developing the Ctrl-Q QVD Viewer extension.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 18.x or later
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify installation: `node --version`
- **npm**: Version 8.x or later (comes with Node.js)
  - Verify installation: `npm --version`
- **Visual Studio Code**: Version 1.105.0 or later

  - Download from [code.visualstudio.com](https://code.visualstudio.com/)

- **Git**: For version control
  - Download from [git-scm.com](https://git-scm.com/)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer.git
cd ctrl-q-qvd-viewer
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required dependencies including:

- `qvdjs` - QVD file reading library
- Development dependencies for linting and testing

## Development Workflow

### Running the Extension in Development Mode

1. Open the project in VS Code:

   ```bash
   code .
   ```

2. Press `F5` or go to **Run → Start Debugging**

   - This launches a new VS Code window titled "[Extension Development Host]"
   - The extension is loaded and active in this window

3. In the Extension Development Host window:

   - Open a QVD file from the file explorer, or
   - Use Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → "Open QVD File"

4. Make changes to the code in the main VS Code window

5. Reload the extension in the Extension Development Host window:
   - Press `Ctrl+R` (Windows/Linux) or `Cmd+R` (Mac)
   - Or use Command Palette → "Developer: Reload Window"

### Code Structure

```
ctrl-q-qvd-viewer/
├── src/
│   ├── extension.js              # Extension entry point and activation
│   ├── qvdReader.js             # Core QVD file reading and metadata extraction
│   ├── qvdEditorProvider.js     # Custom editor provider for webview
│   └── webview/
│       └── pagination.js        # Client-side pagination logic
├── package.json                 # Extension manifest and dependencies
├── test/
│   └── extension.test.js        # Automated tests
└── test-data/
    └── sample.qvd               # Sample QVD file for testing
```

### Key Components

- **src/extension.js**:

  - Handles extension activation
  - Registers custom editor provider
  - Registers commands

- **src/qvdReader.js**:

  - Reads QVD files
  - Extracts metadata using qvdjs
  - Returns structured metadata and data

- **src/qvdEditorProvider.js**:
  - Implements VS Code custom editor provider
  - Generates HTML webview with QVD data
  - Handles configuration settings

## Linting

The project uses ESLint for code quality. Run linting with:

```bash
npm run lint
```

This will check all JavaScript files for style and potential issues.

To fix auto-fixable issues:

```bash
npx eslint . --fix
```

## Testing

### Running Automated Tests

```bash
npm test
```

This will:

1. Run the linter
2. Execute automated tests in VS Code test environment

### Manual Testing

1. Start the extension in development mode (press `F5`)
2. Test the following scenarios:

   **Scenario 1: Open QVD from Explorer**

   - Navigate to the test-data folder
   - Click on `sample.qvd`
   - Verify metadata and fields are displayed

   **Scenario 2: Open QVD via Command**

   - Press `Ctrl+Shift+P` / `Cmd+Shift+P`
   - Type "Open QVD File"
   - Select a QVD file
   - Verify it opens in the custom viewer

   **Scenario 3: Configuration**

   - Go to Settings → search for "Ctrl-Q QVD"
   - Change "Max Preview Rows" value
   - Open a QVD file with more rows
   - Verify the row limit is respected

### Creating Test QVD Files

To test with real QVD files:

1. Export QVD files from Qlik Sense or QlikView
2. Place them in the `test-data` directory
3. Open them using the extension

## Building for Distribution

### Package the Extension

To create a `.vsix` package for distribution:

1. Install `vsce` (VS Code Extension CLI) globally:

   ```bash
   npm install -g @vscode/vsce
   ```

2. Package the extension:

   ```bash
   npm run package
   # or directly:
   vsce package
   ```

3. This creates a `.vsix` file in the project root (e.g., `ctrl-q-qvd-viewer-0.0.1.vsix`)

### Install the Package Locally

To install the packaged extension:

1. Open VS Code
2. Go to Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Click the "..." menu → "Install from VSIX..."
4. Select the `.vsix` file

### Publish to VS Code Marketplace

To publish the extension to the VS Code Marketplace:

1. Create a publisher account at [marketplace.visualstudio.com](https://marketplace.visualstudio.com/)

2. Get a Personal Access Token (PAT) from Azure DevOps

3. Login with vsce:

   ```bash
   vsce login <publisher-name>
   ```

4. Publish:
   ```bash
   vsce publish
   ```

## Debugging

### Debug Output

The extension logs to the VS Code Debug Console. To view:

1. In the main VS Code window (where you're developing)
2. Open Debug Console (`Ctrl+Shift+Y` / `Cmd+Shift+Y`)
3. Look for console.log output from the extension

### Breakpoints

Set breakpoints in any JavaScript file:

1. Click in the gutter next to a line number
2. Press `F5` to start debugging
3. Execution will pause at breakpoints

### Webview Debugging

To debug the webview content:

1. In the Extension Development Host window
2. Open a QVD file
3. Press `Ctrl+Shift+P` / `Cmd+Shift+P`
4. Type "Developer: Open Webview Developer Tools"
5. Use browser DevTools to inspect the webview

## Common Issues

### Issue: Extension not loading

**Solution**:

- Check the Output panel for errors
- Ensure all dependencies are installed: `npm install`
- Reload the Extension Development Host window

### Issue: QVD file not opening

**Solution**:

- Verify the file is a valid QVD file
- Check the Debug Console for error messages
- Ensure the file has read permissions

### Issue: Linter errors

**Solution**:

- Run `npm run lint` to see all errors
- Fix errors or run `npx eslint . --fix` for auto-fixable issues

## Best Practices

1. **Always run linter before committing**:

   ```bash
   npm run lint
   ```

2. **Test with various QVD files**:

   - Small files (< 100 rows)
   - Large files (> 10,000 rows)
   - Files with different field types

3. **Keep dependencies updated**:

   ```bash
   npm outdated
   npm update
   ```

4. **Follow VS Code extension guidelines**:
   - [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
   - [Extension API](https://code.visualstudio.com/api)

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [qvdjs Documentation](https://github.com/ptarmiganlabs/qvdjs)

## Getting Help

If you encounter issues:

1. Check existing GitHub issues
2. Create a new issue with:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Error messages from Debug Console
   - VS Code version and OS

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linter
5. Submit a pull request

See [README.md](README.md) for more information.
