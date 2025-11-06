# QVD Metadata Comparison Feature - Implementation Steps

This document outlines the implementation steps for adding QVD metadata comparison functionality to the Ctrl-Q QVD Viewer VS Code extension. The feature will integrate with VS Code's built-in "Select for compare" and "Compare with selected" context menu commands in the file browser.

## Overview

Users will be able to:
1. Right-click on a QVD file in the VS Code file explorer and select "Select for Compare"
2. Right-click on a second QVD file and select "Compare with Selected"
3. View a side-by-side diff of the QVD metadata (file-level and field-level properties)

## Prerequisites

- VS Code extension supports custom editors for `.qvd` files
- Existing `QvdReader` class can extract metadata by calling `read(filePath, 0)`
- ES module architecture using `.mjs` files
- Logger system available at `src/logger.mjs`

## Implementation Steps

### Step 1: Implement TextDocumentContentProvider for QVD Metadata

**Goal**: Create a content provider that can format QVD metadata as text for VS Code's diff viewer.

**Tasks**:
- Create new file `src/qvdMetadataCompareProvider.mjs`
- Implement `TextDocumentContentProvider` interface with:
  - `provideTextDocumentContent(uri)` method that extracts and formats metadata
  - Event emitter for document change notifications
- Format metadata in diff-friendly text format with clear sections:
  - File metadata (timestamps, record count, table name, lineage)
  - Field metadata (name, type, tags, cardinality)
- Integrate with `logger.mjs` for error tracking
- Use existing `QvdReader` with `maxRows=0` for fast metadata-only loading

**Files to create**:
- `src/qvdMetadataCompareProvider.mjs`

**Files to modify**:
- None (new feature)

**Acceptance criteria**:
- Provider can extract and format metadata from any valid QVD file
- Output is structured text suitable for diff comparison
- Handles errors gracefully with appropriate logging
- Performance is acceptable (<100ms for metadata extraction)

---

### Step 2: Register Content Provider and URI Scheme

**Goal**: Register the metadata provider with VS Code using a custom URI scheme.

**Tasks**:
- Modify `src/extension.mjs` to import and instantiate `QvdMetadataCompareProvider`
- Register the provider with VS Code using `workspace.registerTextDocumentContentProvider`
- Use URI scheme `qvd-metadata:` for virtual documents
- Add provider to extension subscriptions for proper cleanup

**Files to modify**:
- `src/extension.mjs`

**Acceptance criteria**:
- Provider is registered on extension activation
- Custom URI scheme `qvd-metadata:` is recognized
- Provider is properly disposed on extension deactivation

---

### Step 3: Implement Compare Command Handler

**Goal**: Create a command that opens VS Code's diff viewer for two QVD files.

**Tasks**:
- Add new command `ctrl-q-qvd-viewer.compareQvdMetadata` to `package.json`
- Implement command handler in `src/extension.mjs` that:
  - Accepts two QVD file URIs as parameters
  - Creates virtual document URIs for each file's metadata
  - Calls `vscode.commands.executeCommand('vscode.diff', uri1, uri2, title)`
- Generate descriptive title showing both filenames
- Handle edge cases (invalid files, missing files)

**Files to modify**:
- `package.json` (add command definition)
- `src/extension.mjs` (add command handler)

**Acceptance criteria**:
- Command opens VS Code's diff viewer with formatted metadata
- Title clearly identifies both files being compared
- Errors are handled and reported to user via notifications
- Command can be invoked programmatically

---

### Step 4: Integrate with VS Code's Compare Commands

**Goal**: Enable right-click "Select for compare" / "Compare with selected" workflow.

**Tasks**:
- Research VS Code's `CompareProvider` API or file comparison context
- Implement integration with VS Code's built-in compare selection mechanism
- Store selected file URI when user chooses "Select for Compare"
- Trigger metadata comparison when user chooses "Compare with Selected"
- Add menu contributions to `package.json` for `.qvd` files in explorer context

**Files to modify**:
- `package.json` (add menu contributions)
- `src/extension.mjs` (implement compare selection logic)

**Acceptance criteria**:
- "Select for Compare" stores the first QVD file URI
- "Compare with Selected" triggers metadata diff with stored URI
- Context menu items only appear for `.qvd` files
- User receives feedback if they try to compare without first selecting
- Comparison works for files in different directories

---

### Step 5: Add Quick Comparison Summary

**Goal**: Enhance the comparison output with a summary section highlighting key differences.

**Tasks**:
- Modify metadata formatting to include a "QUICK SUMMARY" section at the top
- Calculate and display:
  - Field count comparison (added/removed fields)
  - Record count difference
  - Timestamp differences
  - Schema version indicators (if available)
- Make summary easily scannable in diff viewer

**Files to modify**:
- `src/qvdMetadataCompareProvider.mjs`

**Acceptance criteria**:
- Summary section appears at top of comparison
- Key differences are clearly highlighted
- Summary remains concise (< 10 lines)
- Works correctly when files are identical

---

### Step 6: Add Configuration Options

**Goal**: Allow users to customize comparison behavior.

**Tasks**:
- Add configuration settings to `package.json`:
  - Option to include/exclude certain metadata sections
  - Option to show/hide storage-related fields (offsets, lengths)
  - Option to highlight only significant differences
- Respect user configuration in metadata formatting
- Document settings in README.md

**Files to modify**:
- `package.json` (add configuration schema)
- `src/qvdMetadataCompareProvider.mjs` (read and apply settings)
- `README.md` (document configuration options)

**Acceptance criteria**:
- Configuration options are available in VS Code settings
- Settings take effect immediately without reload
- Default values provide good out-of-box experience
- All settings are documented

---

### Step 7: Add Comprehensive Tests

**Goal**: Ensure feature works correctly and handles edge cases.

**Tasks**:
- Create test QVD files with known metadata differences
- Write unit tests for `QvdMetadataCompareProvider`:
  - Metadata extraction
  - Formatting logic
  - Error handling
- Write integration tests for comparison workflow:
  - Command invocation
  - URI handling
  - Diff viewer opening
- Add tests to existing test suite
- Ensure >80% code coverage for new code

**Files to create**:
- `test/qvdMetadataCompareProvider.test.js`
- `test/compareWorkflow.test.js`
- `test-data/comparison/*.qvd` (test fixtures)

**Files to modify**:
- Existing test configuration files as needed

**Acceptance criteria**:
- All tests pass in CI/CD pipeline
- Edge cases are covered (empty files, corrupted files, identical files)
- Test execution is reasonably fast (<5 seconds)
- Tests are maintainable and well-documented

---

### Step 8: Update Documentation

**Goal**: Provide clear documentation for users and future developers.

**Tasks**:
- Update README.md with:
  - Feature description and screenshots
  - Usage instructions for comparison workflow
  - Configuration options
- Update CHANGELOG.md with new feature
- Ensure `docs/QVD_COMPARISON_FEATURE.md` reflects actual implementation
- Add JSDoc comments to all new functions
- Create user-facing documentation with examples

**Files to modify**:
- `README.md`
- `CHANGELOG.md`
- `docs/QVD_COMPARISON_FEATURE.md`
- All new source files (add JSDoc comments)

**Acceptance criteria**:
- Documentation is clear and complete
- Screenshots show the feature in action
- Configuration options are fully documented
- Code is well-commented for maintainability

---

## Implementation Order

Recommended implementation sequence:

1. **Step 1** - Core functionality (metadata provider)
2. **Step 2** - VS Code integration (registration)
3. **Step 3** - Basic command (manual comparison)
4. **Step 7 (partial)** - Add tests for Steps 1-3
5. **Step 4** - Context menu integration
6. **Step 5** - Enhancement (summary)
7. **Step 6** - Configuration options
8. **Step 7 (complete)** - Full test coverage
9. **Step 8** - Documentation

## Success Metrics

- Feature works for all valid QVD files in test-data directory
- Comparison performance: <200ms total for two files
- Zero crashes or unhandled exceptions
- Positive user feedback on usability
- Code coverage >80% for new code

## Technical Notes

### VS Code API References

- **TextDocumentContentProvider**: https://code.visualstudio.com/api/references/vscode-api#TextDocumentContentProvider
- **executeCommand('vscode.diff')**: Built-in command for file comparison
- **Menu Contributions**: https://code.visualstudio.com/api/references/contribution-points#contributes.menus

### Performance Considerations

- Metadata-only loading (`maxRows=0`) is critical for performance
- Avoid loading data rows which can be GBs in size
- Cache metadata if same file is compared multiple times
- Use async/await throughout to keep UI responsive

### Error Scenarios to Handle

- Invalid QVD file format
- Corrupted metadata
- File read permissions
- Files being modified during comparison
- Very large metadata (thousands of fields)

## Related Documentation

- [QVD Format Specification](./QVD_FORMAT.md)
- [Comparison Feature Design](./QVD_COMPARISON_FEATURE.md)
- [VS Code Extension API](https://code.visualstudio.com/api)
