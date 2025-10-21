const assert = require("assert");
const vscode = require("vscode");
const path = require("path");
const QvdReader = require("../src/qvdReader");

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("QVD Reader - Metadata Extraction", async () => {
    const reader = new QvdReader();
    const testFilePath = path.join(__dirname, "..", "test-data", "sample.qvd");

    const result = await reader.read(testFilePath, 10);

    // Check that metadata was extracted
    assert.strictEqual(result.error, null);
    assert.notStrictEqual(result.metadata, null);
    assert.strictEqual(result.metadata.noOfRecords, 3);
    assert.strictEqual(result.columns.length, 3);
    assert.strictEqual(result.metadata.fields.length, 3);
  });

  test("QVD Reader - Field Information", async () => {
    const reader = new QvdReader();
    const testFilePath = path.join(__dirname, "..", "test-data", "sample.qvd");

    const result = await reader.read(testFilePath, 10);

    // Check field names
    const fieldNames = result.metadata.fields.map((f) => f.name);
    assert.ok(fieldNames.includes("ID"));
    assert.ok(fieldNames.includes("Name"));
    assert.ok(fieldNames.includes("Age"));
  });

  test("Extension Activation", async () => {
    // Check that the extension is activated
    const ext = vscode.extensions.getExtension("ptarmiganlabs.ctrl-q-qvd-viewer");
    assert.ok(ext);
  });
});
