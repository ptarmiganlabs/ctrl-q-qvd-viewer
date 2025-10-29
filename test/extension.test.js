const assert = require("assert");
const vscode = require("vscode");
const path = require("path");

// Make vscode available globally for ESM modules
globalThis.vscode = vscode;

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("QVD Reader - Metadata Extraction", async () => {
    // Dynamically import the ESM module
    const { QvdReader } = await import("../src/qvdReader.mjs");
    const reader = new QvdReader();
    const testFilePath = path.join(
      __dirname,
      "..",
      "test-data",
      "stockholm_temp.qvd"
    );

    const result = await reader.read(testFilePath, 10);

    // Check that metadata was extracted
    assert.strictEqual(result.error, null);
    assert.notStrictEqual(result.metadata, null);
    // Note: Using actual data from stockholm_temp.qvd file
    assert.ok(result.metadata.noOfRecords > 0);
    assert.ok(result.columns.length > 0);
    assert.ok(result.metadata.fields.length > 0);
  });

  test("QVD Reader - Field Information", async () => {
    // Dynamically import the ESM module
    const { QvdReader } = await import("../src/qvdReader.mjs");
    const reader = new QvdReader();
    const testFilePath = path.join(
      __dirname,
      "..",
      "test-data",
      "stockholm_temp.qvd"
    );

    const result = await reader.read(testFilePath, 10);

    // Check field names - verify we have some fields with actual names
    const fieldNames = result.metadata.fields.map((f) => f.name);
    assert.ok(fieldNames.length > 0, "Should have at least one field");
    assert.ok(
      fieldNames.every((name) => typeof name === "string" && name.length > 0),
      "All field names should be non-empty strings"
    );
  });

  test("Extension Activation", async () => {
    // Check that the extension is activated
    const ext = vscode.extensions.getExtension(
      "ptarmiganlabs.ctrl-q-qvd-viewer"
    );
    assert.ok(ext);
  });

  test("About Command Registration", async () => {
    // Ensure extension is activated first
    const ext = vscode.extensions.getExtension(
      "ptarmiganlabs.ctrl-q-qvd-viewer"
    );
    if (ext && !ext.isActive) {
      await ext.activate();
    }

    // Wait a bit for command registration to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check that the about command is registered
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("ctrl-q-qvd-viewer.about"),
      "About command should be registered"
    );
  });
});
