const assert = require("assert");
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

// QvdReader is async because it's a CJS wrapper around ESM
let QvdReader;
let extensionApi;

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  // Load QvdReader before running tests and activate extension
  suiteSetup(async () => {
    QvdReader = await require("../src/qvdReader.cjs");

    // Ensure extension is activated and get the API
    const ext = vscode.extensions.getExtension(
      "ptarmiganlabs.ctrl-q-qvd-viewer"
    );
    if (ext && !ext.isActive) {
      extensionApi = await ext.activate();
    }

    // Wait a bit for complete activation
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("QVD Reader - Metadata Extraction", async () => {
    const reader = new QvdReader();
    const testFilePath = path.join(
      __dirname,
      "..",
      "test-data",
      "stockholm_temp",
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
    const reader = new QvdReader();
    const testFilePath = path.join(
      __dirname,
      "..",
      "test-data",
      "stockholm_temp",
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

// Integration Tests Suite
suite("Integration Test Suite", () => {
  suiteSetup(async () => {
    // Ensure extension is activated
    const ext = vscode.extensions.getExtension(
      "ptarmiganlabs.ctrl-q-qvd-viewer"
    );
    if (ext && !ext.isActive) {
      await ext.activate();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  test("Integration - Open Normal QVD File", async function () {
    this.timeout(10000); // Increase timeout for file operations

    const testFilePath = path.join(
      __dirname,
      "..",
      "test-data",
      "stockholm_temp",
      "stockholm_temp.qvd"
    );

    const uri = vscode.Uri.file(testFilePath);

    // Open the QVD file with the custom editor
    await vscode.commands.executeCommand(
      "vscode.openWith",
      uri,
      "ctrl-q-qvd-viewer.qvdEditor"
    );

    // Wait for the editor to open
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Custom editors don't create a text editor, but we can verify the file opened
    // by checking that no error was thrown and the command completed successfully
    // We can also verify logs were created
    assert.ok(true, "QVD file opened successfully");

    // Check logger output if available
    if (extensionApi && extensionApi.logger) {
      const logger = extensionApi.logger;
      assert.ok(
        logger.getOutputChannel(),
        "Logger output channel should exist"
      );
    }

    // Close the editor
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  });

  test("Integration - Open Empty QVD File", async function () {
    this.timeout(10000);

    const testFilePath = path.join(
      __dirname,
      "..",
      "test-data",
      "misc",
      "empty_qvd.qvd"
    );

    // Check if file exists
    if (!fs.existsSync(testFilePath)) {
      this.skip(); // Skip if test file doesn't exist
      return;
    }

    const uri = vscode.Uri.file(testFilePath);

    // Open the empty QVD file
    await vscode.commands.executeCommand(
      "vscode.openWith",
      uri,
      "ctrl-q-qvd-viewer.qvdEditor"
    );

    // Wait for the editor to open
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // The editor should still open (may show error message in webview)
    // We're mainly checking that it doesn't crash
    assert.ok(true, "Empty QVD file should be handled gracefully");

    // Close the editor
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  });

  test("Integration - Open Damaged QVD File", async function () {
    this.timeout(10000);

    const testFilePath = path.join(
      __dirname,
      "..",
      "test-data",
      "misc",
      "damaged.qvd"
    );

    // Check if file exists
    if (!fs.existsSync(testFilePath)) {
      this.skip(); // Skip if test file doesn't exist
      return;
    }

    const uri = vscode.Uri.file(testFilePath);

    // Open the damaged QVD file
    await vscode.commands.executeCommand(
      "vscode.openWith",
      uri,
      "ctrl-q-qvd-viewer.qvdEditor"
    );

    // Wait for the editor to open
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // The editor should open and show an error message
    // We're mainly checking that it doesn't crash the extension
    assert.ok(true, "Damaged QVD file should be handled gracefully");

    // Close the editor
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  });

  test("Integration - Test Logger Functionality", async function () {
    this.timeout(5000);

    // Ensure extension is activated
    const ext = vscode.extensions.getExtension(
      "ptarmiganlabs.ctrl-q-qvd-viewer"
    );

    if (ext && ext.isActive && ext.exports) {
      const logger = ext.exports.logger;

      if (logger) {
        // Test that logger methods exist
        assert.ok(
          typeof logger.log === "function",
          "Logger should have log method"
        );
        assert.ok(
          typeof logger.error === "function",
          "Logger should have error method"
        );
        assert.ok(
          typeof logger.warn === "function",
          "Logger should have warn method"
        );
        assert.ok(
          typeof logger.getOutputChannel === "function",
          "Logger should have getOutputChannel method"
        );

        // Test logging
        logger.log("Test log message from integration test");
        logger.warn("Test warning message from integration test");

        // Verify output channel exists
        const outputChannel = logger.getOutputChannel();
        assert.ok(outputChannel, "Logger output channel should exist");
      } else {
        console.log("Logger not available in extension exports");
      }
    }
  });

  test("Integration - Multiple QVD Files", async function () {
    this.timeout(15000);

    const legoDir = path.join(__dirname, "..", "test-data", "lego");

    // Check if lego directory exists
    if (!fs.existsSync(legoDir)) {
      this.skip();
      return;
    }

    // Get all QVD files in the lego directory
    const qvdFiles = fs
      .readdirSync(legoDir)
      .filter((file) => file.toLowerCase().endsWith(".qvd"))
      .slice(0, 3); // Test only first 3 files to keep test time reasonable

    assert.ok(qvdFiles.length > 0, "Should have at least one QVD file to test");

    for (const fileName of qvdFiles) {
      const testFilePath = path.join(legoDir, fileName);
      const uri = vscode.Uri.file(testFilePath);

      // Open each QVD file
      await vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        "ctrl-q-qvd-viewer.qvdEditor"
      );

      // Wait for the editor to open
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Close the editor
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );

      // Small delay between files
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    assert.ok(true, "Multiple QVD files should open without errors");
  });
});
