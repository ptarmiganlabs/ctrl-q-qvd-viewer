const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Import the message handler and the exporters
let setupMessageHandler;
let DataExporter;

/**
 * Export rows to Parquet through the message handler, with VS Code's dialogs and
 * messages answered here, and put back afterwards
 * @param {Array<Object>} rows - The rows the read gives
 * @param {object} answers
 * @param {function(Array): *} answers.pick - Answers each QuickPick, given its items
 * @param {string} [answers.timeZone] - What the exportTimeZone setting holds
 * @returns {Promise<{filePath: string, messages: Array<string>, errors: Array<{message: string, items: Array<string>}>}>}
 *   Where the export was saved, as VS Code names it, and the messages and errors it showed
 */
async function exportThroughHandler(rows, { pick, timeZone = "" }) {
  // The API as the handler imports it: on VS Code 1.101.0 a module's import of vscode
  // gets another object than require() does
  const vscode = await import("vscode");
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "qvd-viewer-export-read-"));
  // Where the save dialog answers. The export names it by its fsPath, which on
  // Windows has its drive letter in lower case: c:\Users, not C:\Users
  const saveUri = vscode.Uri.file(path.join(outputDir, "zoned.parquet"));
  const messages = [];
  const errors = [];
  const saved = {
    showQuickPick: vscode.window.showQuickPick,
    showSaveDialog: vscode.window.showSaveDialog,
    showInformationMessage: vscode.window.showInformationMessage,
    showErrorMessage: vscode.window.showErrorMessage,
    getConfiguration: vscode.workspace.getConfiguration,
  };
  let onMessage;
  const panel = { webview: { onDidReceiveMessage: (listener) => (onMessage = listener) } };
  const reader = {
    read: async () => ({ data: rows, columns: Object.keys(rows[0]), release: () => {}, error: null, errorReason: null }),
    afterLargeReads: async () => {},
  };
  try {
    vscode.window.showQuickPick = async (items) => pick(items);
    vscode.window.showSaveDialog = async () => saveUri;
    vscode.window.showInformationMessage = async (message) => {
      messages.push(message);
      return undefined;
    };
    vscode.window.showErrorMessage = async (message, ...items) => {
      errors.push({ message, items });
      return undefined;
    };
    vscode.workspace.getConfiguration = () => ({
      get: (key, fallback) => (key === "exportTimeZone" ? timeZone : fallback),
    });
    setupMessageHandler(panel, "zoned.qvd", reader, {}, async () => {}, 25);
    await onMessage({ command: "exportData", format: "parquet" });
    return { filePath: saveUri.fsPath, messages, errors };
  } finally {
    Object.assign(vscode.window, {
      showQuickPick: saved.showQuickPick,
      showSaveDialog: saved.showSaveDialog,
      showInformationMessage: saved.showInformationMessage,
      showErrorMessage: saved.showErrorMessage,
    });
    vscode.workspace.getConfiguration = saved.getConfiguration;
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

suite("Export Read Test Suite", () => {
  // Load the modules before running tests
  suiteSetup(async () => {
    // Import the ESM modules
    ({ setupMessageHandler } = await import("../src/webview/messageHandler.mjs"));
    ({ default: DataExporter } = await import("../src/exporters/index.mjs"));
  });

  test("An export reads dates as dates for a format with date types, and as text for the others", async () => {
    let onMessage;
    const panel = { webview: { onDidReceiveMessage: (listener) => (onMessage = listener) } };
    // A reader that notes how an export asks it to read, then gives the read up, as
    // a closed editor does, so that no dialog opens
    const asked = {};
    let format;
    const reader = {
      read: async (filePath, maxRows, options) => {
        asked[format] = options.dates;
        return { errorReason: "aborted", release: () => {} };
      },
    };
    setupMessageHandler(panel, "dates.qvd", reader, {}, async () => {}, 25);

    // PostgreSQL and Qlik inline ask for a row count before they read
    const formats = DataExporter.getExportFormats()
      .map(({ name }) => name)
      .filter((name) => name !== "postgres" && name !== "qlik");
    for (format of formats) {
      await onMessage({ command: "exportData", format });
    }

    assert.deepStrictEqual(asked, {
      arrow: true,
      avro: true,
      csv: false,
      excel: true,
      json: false,
      parquet: true,
      sqlite: true,
      xml: false,
      yaml: false,
    });
  });

  test("An export's message says how many timestamps the time zone's clocks skipped or showed twice", async () => {
    // A trip in the hour Chicago's clocks skipped, and two in the hour they showed twice
    const rows = [
      { at: new Date(Date.UTC(2016, 2, 13, 2, 30)) },
      { at: new Date(Date.UTC(2016, 10, 6, 1, 30)) },
      { at: new Date(Date.UTC(2016, 10, 6, 1, 45)) },
    ];
    // America/Chicago, from the list of every zone
    const { filePath, messages, errors } = await exportThroughHandler(rows, {
      pick: (items) =>
        typeof items[0] === "string" ? "America/Chicago" : items.find((item) => item.label === "Other time zone…"),
    });
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(messages, [
      `Data exported to ${filePath}. Of the timestamps read in America/Chicago, 1 fell in time its clocks ` +
        "skipped going forward, and was moved past it, and 2 fell in time its clocks showed twice going " +
        "back, and were taken as the first. A clock there never shows a skipped time, so check that they " +
        "were read in America/Chicago.",
    ]);
  });

  test("An export refused for the time zone in the settings offers to open them", async () => {
    const rows = [{ at: new Date(Date.UTC(2016, 0, 13, 6, 15)) }];
    const { messages, errors } = await exportThroughHandler(rows, {
      pick: () => assert.fail("An export that is refused shouldn't ask anything"),
      timeZone: "America/Chicgo",
    });
    assert.deepStrictEqual(messages, []);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /^Export failed: The setting ctrl-q-qvd-viewer\.exportTimeZone names "America\/Chicgo", /);
    assert.deepStrictEqual(errors[0].items, ["Open Settings"]);
  });
});
