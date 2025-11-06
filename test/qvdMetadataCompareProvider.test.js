const assert = require("assert");
const vscode = require("vscode");
const path = require("path");

// QvdMetadataCompareProvider needs to be imported as ESM via dynamic import
let QvdMetadataCompareProvider;

suite("QVD Metadata Compare Provider Test Suite", () => {
  let provider;
  let testFilePath;

  // Load the provider before running tests
  suiteSetup(async () => {
    // Import the ESM module
    const module = await import("../src/qvdMetadataCompareProvider.mjs");
    QvdMetadataCompareProvider = module.default;

    // Setup test file path
    testFilePath = path.join(
      __dirname,
      "..",
      "test-data",
      "stockholm_temp",
      "stockholm_temp.qvd"
    );
  });

  setup(() => {
    provider = new QvdMetadataCompareProvider();
  });

  teardown(() => {
    if (provider) {
      provider.dispose();
    }
  });

  test("Provider initialization", () => {
    assert.ok(provider, "Provider should be created");
    assert.ok(provider.qvdReader, "Provider should have QvdReader instance");
    assert.ok(provider.onDidChange, "Provider should have onDidChange event");
  });

  test("Scheme constant", () => {
    assert.strictEqual(
      QvdMetadataCompareProvider.scheme,
      "qvd-metadata",
      "Scheme should be 'qvd-metadata'"
    );
  });

  test("Provide text document content - valid QVD file", async () => {
    // Create a URI with the file path as query
    const uri = vscode.Uri.parse(
      `${QvdMetadataCompareProvider.scheme}://metadata?${testFilePath}`
    );

    const content = await provider.provideTextDocumentContent(uri);

    // Verify content is returned
    assert.ok(content, "Content should be returned");
    assert.ok(typeof content === "string", "Content should be a string");
    assert.ok(content.length > 0, "Content should not be empty");

    // Verify expected sections are present
    assert.ok(
      content.includes("QVD METADATA"),
      "Content should include 'QVD METADATA' header"
    );
    assert.ok(
      content.includes("FILE METADATA"),
      "Content should include 'FILE METADATA' section"
    );
    assert.ok(
      content.includes("LINEAGE"),
      "Content should include 'LINEAGE' section"
    );
    assert.ok(
      content.includes("FIELD METADATA"),
      "Content should include 'FIELD METADATA' section"
    );
    assert.ok(
      content.includes("stockholm_temp"),
      "Content should include table name"
    );
  });

  test("Provide text document content - field information", async () => {
    const uri = vscode.Uri.parse(
      `${QvdMetadataCompareProvider.scheme}://metadata?${testFilePath}`
    );

    const content = await provider.provideTextDocumentContent(uri);

    // Verify field details are included
    assert.ok(content.includes("Field 1:"), "Content should include field information");
    assert.ok(content.includes("Type:"), "Content should include field type");
    assert.ok(content.includes("Symbols:"), "Content should include symbol count");
    assert.ok(content.includes("Tags:"), "Content should include field tags");
  });

  test("Provide text document content - performance check", async () => {
    const uri = vscode.Uri.parse(
      `${QvdMetadataCompareProvider.scheme}://metadata?${testFilePath}`
    );

    const startTime = Date.now();
    await provider.provideTextDocumentContent(uri);
    const elapsedTime = Date.now() - startTime;

    // Performance requirement: reasonable extraction time
    // Note: Actual performance depends on file size, disk I/O, and system load
    // Should be significantly faster than loading all data
    assert.ok(
      elapsedTime < 1000,
      `Metadata extraction should complete in reasonable time (took ${elapsedTime}ms)`
    );
  });

  test("Provide text document content - missing file path", async () => {
    // Create a URI without query parameter
    const uri = vscode.Uri.parse(
      `${QvdMetadataCompareProvider.scheme}://metadata`
    );

    const content = await provider.provideTextDocumentContent(uri);

    // Should return error message
    assert.ok(content.includes("Error"), "Content should include error message");
    assert.ok(
      content.includes("No file path"),
      "Error should mention missing file path"
    );
  });

  test("Provide text document content - invalid file", async () => {
    const invalidPath = path.join(__dirname, "..", "test-data", "nonexistent.qvd");
    const uri = vscode.Uri.parse(
      `${QvdMetadataCompareProvider.scheme}://metadata?${invalidPath}`
    );

    const content = await provider.provideTextDocumentContent(uri);

    // Should return error message
    assert.ok(content.includes("Error"), "Content should include error message");
  });

  test("Format metadata - structure validation", async () => {
    const uri = vscode.Uri.parse(
      `${QvdMetadataCompareProvider.scheme}://metadata?${testFilePath}`
    );

    const content = await provider.provideTextDocumentContent(uri);
    const lines = content.split("\n");

    // Verify structure
    assert.ok(
      lines.some(line => line.includes("Table Name:")),
      "Should include Table Name"
    );
    assert.ok(
      lines.some(line => line.includes("Record Count:")),
      "Should include Record Count"
    );
    assert.ok(
      lines.some(line => line.includes("Total Fields:")),
      "Should include Total Fields count"
    );
  });

  test("Format metadata - diff-friendly format", async () => {
    const uri = vscode.Uri.parse(
      `${QvdMetadataCompareProvider.scheme}://metadata?${testFilePath}`
    );

    const content = await provider.provideTextDocumentContent(uri);

    // Verify format is consistent and diff-friendly
    // Each section should have clear delimiters
    assert.ok(
      content.includes("-".repeat(80)),
      "Should use consistent line separators"
    );
    assert.ok(
      content.includes("=".repeat(80)),
      "Should use consistent section separators"
    );

    // Fields should be consistently labeled
    const fieldMatches = content.match(/Field \d+:/g);
    assert.ok(
      fieldMatches && fieldMatches.length > 0,
      "Should have numbered field entries"
    );
  });

  test("Event emitter - notifyChange", () => {
    let eventFired = false;
    const uri = vscode.Uri.parse(
      `${QvdMetadataCompareProvider.scheme}://metadata?${testFilePath}`
    );

    // Subscribe to change event
    const disposable = provider.onDidChange(() => {
      eventFired = true;
    });

    // Trigger change notification
    provider.notifyChange(uri);

    // Verify event was fired
    assert.ok(eventFired, "Change event should be fired");

    disposable.dispose();
  });
});
