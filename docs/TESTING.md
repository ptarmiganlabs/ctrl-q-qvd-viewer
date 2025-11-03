# Testing Guide for Ctrl-Q QVD Viewer

This document explains the testing strategy and how to run tests for the Ctrl-Q QVD Viewer extension.

## Test Structure

The extension has two types of tests:

### 1. Unit Tests

Located in `test/extension.test.js` under "Extension Test Suite"

These tests verify:

- **QVD Reader functionality**: Tests the core QVD file reading logic
- **Metadata extraction**: Ensures QVD metadata is correctly parsed
- **Field information**: Validates field name extraction
- **Extension activation**: Verifies the extension loads properly
- **Command registration**: Checks that all commands are registered

### 2. Integration Tests

Located in `test/extension.test.js` under "Integration Test Suite"

These tests verify:

- **Opening normal QVD files**: Tests the full flow of opening and displaying a QVD file
- **Handling empty QVD files**: Ensures graceful handling of edge cases
- **Handling damaged/corrupted files**: Verifies error handling doesn't crash the extension
- **Logger functionality**: Tests the centralized logging system
- **Multiple file formats**: Opens various QVD files to ensure compatibility

## Running Tests

### Run All Tests

```bash
npm test
```

This will:

1. Run ESLint to check for code quality issues
2. Compile the test files
3. Launch the Extension Development Host
4. Execute all tests

### Run Tests from VS Code

1. Open the Command Palette (`Cmd+Shift+P` on macOS)
2. Select "Tasks: Run Test Task"
3. Choose `npm: test`

Alternatively, use the "Extension Tests" launch configuration:

1. Go to the Run and Debug view (`Cmd+Shift+D`)
2. Select "Extension Tests" from the dropdown
3. Click the green play button

## Viewing Test Output

### Terminal Output

Test results are shown in the terminal where you ran `npm test`.

### Extension Logs

The extension now includes a centralized logging system that captures runtime information:

1. Open the Output panel in VS Code (`Cmd+Shift+U`)
2. Select "Ctrl-Q QVD Viewer" from the dropdown
3. View all extension logs, including:
   - File opening operations
   - Error messages
   - Webview interactions
   - Debug information

### Extension Development Host

When tests run, a new VS Code window (Extension Development Host) opens. You can:

- Open its Developer Tools (Help > Toggle Developer Tools)
- View console logs
- Inspect network requests
- Debug webview issues

## Test Data

Test files are located in the `test-data/` directory:

- **stockholm_temp/**: Normal QVD file for standard tests
- **misc/**: Edge cases (empty files, damaged files)
- **lego/**: Various QVD files with different structures

## What Gets Tested

### ✅ Currently Tested

- QVD file reading and parsing
- Metadata extraction
- Extension activation
- Command registration
- Custom editor opening
- Error handling for damaged files
- Multiple file format support
- Logger functionality

### ⚠️ Not Yet Tested (Future Improvements)

- Export functionality (CSV, Excel, Parquet, etc.)
- Profiling features
- Webview UI interactions
- Pagination and "Load More" functionality
- Settings changes
- Copy to clipboard

## Writing New Tests

### Unit Test Example

```javascript
test("New Unit Test", async () => {
  const reader = new QvdReader();
  const result = await reader.read(filePath, 10);

  assert.strictEqual(result.error, null);
  assert.ok(result.metadata);
});
```

### Integration Test Example

```javascript
test("Integration - New Test", async function () {
  this.timeout(10000); // Increase timeout for async operations

  const uri = vscode.Uri.file(testFilePath);
  await vscode.commands.executeCommand(
    "vscode.openWith",
    uri,
    "ctrl-q-qvd-viewer.qvdEditor"
  );

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Verify expected behavior
  assert.ok(true);

  // Cleanup
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
});
```

## Debugging Tests

### Enable Verbose Logging

The extension logs are automatically captured. To see more detail:

1. Check the "Ctrl-Q QVD Viewer" output channel
2. Look for `[INFO]`, `[WARN]`, and `[ERROR]` messages
3. Review stack traces for errors

### Debug Individual Tests

1. Set breakpoints in your test code or extension code
2. Use the "Extension Tests" launch configuration
3. VS Code will pause at breakpoints during test execution

### Common Issues

**Tests timeout**: Increase the timeout in your test:

```javascript
test("My Test", async function () {
  this.timeout(15000); // 15 seconds
  // ...
});
```

**File not found**: Ensure test data files exist:

```javascript
if (!fs.existsSync(testFilePath)) {
  this.skip(); // Skip test if file doesn't exist
  return;
}
```

**Extension not activated**: Wait for activation:

```javascript
const ext = vscode.extensions.getExtension("ptarmiganlabs.ctrl-q-qvd-viewer");
if (ext && !ext.isActive) {
  await ext.activate();
}
await new Promise((resolve) => setTimeout(resolve, 500));
```

## CI/CD Integration

Tests run automatically on:

- Every push to the repository
- Pull requests
- Before publishing to the marketplace

See `.github/workflows/` for CI/CD configuration.

## Best Practices

1. **Always clean up**: Close editors, dispose resources
2. **Use appropriate timeouts**: Integration tests need more time than unit tests
3. **Test edge cases**: Empty files, large files, malformed data
4. **Check logs**: Verify no unexpected errors in the output channel
5. **Keep tests independent**: Each test should work standalone
6. **Skip when appropriate**: Use `this.skip()` for missing test data

## Troubleshooting

### Tests pass but extension fails in practice

This is the scenario that prompted these improvements! Now you can:

1. Check the "Ctrl-Q QVD Viewer" output channel for runtime logs
2. Add more integration tests that simulate user interactions
3. Test with your specific QVD files by adding them to `test-data/`

### Extension Development Host doesn't close

Sometimes the test window stays open. Close it manually or restart VS Code.

### TypeScript errors

Run `npm run compile-tests` to compile tests before running.

## Future Testing Improvements

Planned enhancements:

- Export functionality tests
- Profiling feature tests
- UI interaction tests using webview message protocol
- Performance tests for large files
- Accessibility tests

## Questions?

If you encounter issues or have suggestions for improving tests, please:

1. Check the output logs first
2. Review this documentation
3. Open an issue on GitHub with:
   - Test output
   - Extension logs (from output channel)
   - Steps to reproduce
