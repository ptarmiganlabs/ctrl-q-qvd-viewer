# Ctrl-Q QVD Viewer - Copilot Instructions

## Project Overview

This is a Visual Studio Code extension for viewing Qlik Sense and QlikView QVD files directly within VS Code. The extension provides:

- QVD file viewing with metadata display
- Data preview with pagination
- Export functionality to multiple formats (CSV, Excel, JSON, Parquet, Arrow, Avro, SQLite, XML, YAML, Qlik Inline Script)
- Custom editor for `.qvd` files

## Technology Stack

- **Language**: JavaScript (Node.js)
- **Platform**: VS Code Extension API
- **Key Dependencies**:
  - `qvdjs` - QVD file parsing
  - `apache-arrow`, `avsc`, `papaparse`, `parquetjs` - Data export formats
  - `exceljs` - Excel export
  - `sql.js` - SQLite export
- **Testing**: VS Code Test framework with Mocha
- **Linting**: ESLint
- **Build Tool**: vsce (VS Code Extension Packager)

## Repository Structure

```
.
├── src/
│   ├── extension.js           # Main extension entry point
│   ├── qvdEditorProvider.js   # Custom editor provider for QVD files
│   ├── qvdReader.js           # QVD file reading logic
│   ├── aboutPanel.js          # About panel implementation
│   ├── exporters/             # Data export implementations
│   └── webview/               # Webview UI components
├── test/
│   └── extension.test.js      # Extension tests
├── test-data/                 # Sample QVD files for testing
├── .github/
│   ├── workflows/             # CI/CD workflows
│   └── agents/                # Custom agent definitions (do not modify)
└── docs/                      # Documentation
```

## Development Workflow

### Setup

```bash
npm install
```

### Linting

```bash
npm run lint
```

Always run linting before committing. The project uses ESLint with a custom configuration in `eslint.config.mjs`.

### Testing

```bash
npm test
```

Tests require a virtual display (xvfb) on Linux systems. Tests are automatically run in CI/CD.

### Building

```bash
npm run package
```

This creates a `.vsix` file that can be installed in VS Code.

### Local Development

1. Open the project in VS Code
2. Press F5 to start debugging - this opens a new VS Code window with the extension loaded
3. Open a `.qvd` file to test the extension
4. Make changes and reload the extension window (Ctrl+R or Cmd+R)

## Coding Standards

### Code Style

- Use modern JavaScript (ES6+) features
- Follow existing code formatting and structure
- Use descriptive variable and function names
- Keep functions focused and single-purpose
- Use `async/await` for asynchronous operations

### Comments

- Add JSDoc comments for exported functions and classes
- Include inline comments for complex logic
- Keep comments concise and meaningful
- Match the style of existing comments in the file

### Error Handling

- Always handle errors gracefully
- Provide meaningful error messages to users via VS Code notifications
- Log errors to the console for debugging
- Use try-catch blocks for operations that might fail

### VS Code Extension Best Practices

- Use the VS Code API appropriately
- Dispose of resources properly (event listeners, panels, etc.)
- Follow VS Code UX guidelines for notifications and UI
- Use configuration settings for user preferences
- Test with different file sizes and edge cases

## File Naming and Structure

- Use camelCase for file names (e.g., `qvdReader.js`)
- Group related functionality in directories (e.g., `exporters/`)
- Keep webview code separate from extension logic
- Place UI components in the `webview/` directory

## Dependencies

### Adding New Dependencies

- Only add dependencies when absolutely necessary
- Prefer well-maintained packages with good documentation
- Check for security vulnerabilities before adding
- Update `package.json` with appropriate version constraints
- Run `npm install` after adding dependencies

### Security

- Never commit secrets or API keys
- Use VS Code's secret storage for sensitive data
- Keep dependencies up to date
- Run security audits regularly

## Testing Guidelines

- Write tests for new features and bug fixes
- Follow the pattern in existing tests
- Test edge cases and error conditions
- Ensure tests run in the CI/CD environment
- Use sample QVD files from `test-data/` directory

## Documentation

- Update README.md for user-facing changes
- Update CHANGELOG.md following Keep a Changelog format
- Add inline code documentation for complex logic
- Include examples in documentation

## Common Tasks and How to Approach Them

### Adding a New Export Format

1. Create a new exporter in `src/exporters/`
2. Implement the export logic
3. Add the new format to the export dropdown in the webview
4. Update README.md with the new format
5. Test with various QVD files

### Modifying the UI

1. Update the webview HTML/CSS/JavaScript in `src/webview/`
2. Ensure responsive design
3. Test in both light and dark VS Code themes
4. Follow VS Code's design guidelines

### Adding Configuration Options

1. Add the setting to `contributes.configuration` in `package.json`
2. Access the setting using `vscode.workspace.getConfiguration()`
3. Document the setting in README.md
4. Provide sensible defaults

### Bug Fixes

1. Reproduce the bug locally
2. Add a test case if possible
3. Fix the issue with minimal changes
4. Verify the fix doesn't break existing functionality
5. Update documentation if needed

## CI/CD

The repository uses GitHub Actions for CI/CD:

- **PR Validation** (`pr-validation.yaml`): Runs on pull requests
  - Linting
  - Tests
  - Package build check
  - Size check
  - Breaking change detection

- **CI Pipeline** (`ci.yaml`): Runs on push to main
  - Linting and tests
  - Release Please for version management
  - Publishing to VS Code Marketplace
  - SBOM generation

All PRs must pass validation before merging.

## Version Management

- Uses Release Please for automated versioning
- Follows Conventional Commits for commit messages
- CHANGELOG.md is automatically updated
- Version numbers follow Semantic Versioning

## Git Workflow

- Create feature branches from `main`
- Use descriptive branch names (e.g., `feature/add-json-export`, `fix/metadata-display`)
- Write clear commit messages following Conventional Commits
- Keep commits focused and atomic
- Rebase on main before creating PR

## Important Notes

- **Do not modify files in `.github/agents/`** - These contain custom agent definitions
- **Test with real QVD files** - Use files from `test-data/` or create test files
- **Consider file size** - QVD files can be large, test performance with different sizes
- **VS Code API changes** - Be aware of VS Code version compatibility
- **Webview security** - Follow VS Code webview security best practices

## Useful Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [qvdjs Documentation](https://www.npmjs.com/package/qvdjs)
- [Butler Family Tools](https://ptarmiganlabs.com/the-butler-family/)

## Getting Help

- Check existing issues on GitHub
- Review the README.md for user documentation
- Look at existing code for patterns and examples
- Refer to VS Code API documentation
