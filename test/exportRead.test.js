const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Import the message handler and the exporters
let setupMessageHandler;
let QvdReader;
let QvdDataFrame;
let QvdDual;

/**
 * A QVD of these rows: a Date is a dual of its serial and the text Qlik shows for a
 * timestamp, as a QVD holds one, such as 13/1/2016 06:15:00
 * @param {Array<Object>} rows - The rows, as objects
 * @param {string} filePath - Where to write it
 * @returns {Promise<void>}
 */
async function writeQvd(rows, filePath) {
  const columns = Object.keys(rows[0]);
  const values = rows.map((row) =>
    columns.map((column) => {
      const value = row[column];
      if (!(value instanceof Date)) {
        return value;
      }
      const serial = (value.getTime() - Date.UTC(1899, 11, 30)) / 864e5;
      const [day, time] = value.toISOString().slice(0, 19).split("T");
      const [year, month, date] = day.split("-").map(Number);
      return new QvdDual(serial, `${date}/${month}/${year} ${time}`);
    })
  );
  await new QvdDataFrame(values, columns).toQvd(filePath, { allowedDir: path.dirname(filePath) });
}

/**
 * Export a QVD of these rows through the message handler, with VS Code's dialogs and
 * messages answered here, and put back afterwards
 * @param {Array<Object>} rows - The QVD's rows
 * @param {object} answers
 * @param {function(Array): *} answers.pick - Answers each QuickPick, given its items
 * @param {string} [answers.timeZone] - What the exportTimeZone setting holds
 * @param {string} [answers.format] - The format to export to
 * @param {function(string): *} [answers.check] - Looks at the file written, before it is removed
 * @returns {Promise<{filePath: string, messages: Array<string>, errors: Array<{message: string, items: Array<string>}>}>}
 *   Where the export was saved, as VS Code names it, and the messages and errors it showed
 */
async function exportThroughHandler(rows, { pick, timeZone = "", format = "parquet", check }) {
  // The API as the handler imports it: on some VS Code versions, 1.103.0 among them, a module's
  // import of vscode gets another object than require() does
  const vscode = await import("vscode");
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "qvd-viewer-export-read-"));
  const qvdPath = path.join(outputDir, "zoned.qvd");
  await writeQvd(rows, qvdPath);
  // Where the save dialog answers. The export names it by its fsPath, which on
  // Windows has its drive letter in lower case: c:\Users, not C:\Users
  const saveUri = vscode.Uri.file(path.join(outputDir, `zoned.${format}`));
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
    setupMessageHandler(panel, qvdPath, new QvdReader(), {}, async () => {}, null);
    await onMessage({ command: "exportData", format });
    if (check) {
      await check(saveUri.fsPath);
    }
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
    ({ default: QvdReader } = await import("../src/qvdReader.mjs"));
    ({ QvdDataFrame, QvdDual } = await import("qvdjs"));
  });

  test("An export reads dates as dates for a format with date types, and as text for the others", async () => {
    // A timestamp, which Qlik shows as its text
    const rows = [{ at: new Date(Date.UTC(2016, 0, 13, 6, 15)) }];
    const noZone = (items) => items.find((item) => item.value === null);
    const csv = await exportThroughHandler(rows, {
      format: "csv",
      pick: () => assert.fail("A CSV export asks nothing"),
      check: (filePath) => assert.strictEqual(fs.readFileSync(filePath, "utf8"), '"at"\n"13/1/2016 06:15:00"'),
    });
    assert.deepStrictEqual(csv.errors, []);
    const json = await exportThroughHandler(rows, {
      format: "json",
      pick: () => assert.fail("A JSON export asks nothing"),
      check: (filePath) => assert.deepStrictEqual(JSON.parse(fs.readFileSync(filePath, "utf8")).data, [{ at: "13/1/2016 06:15:00" }]),
    });
    assert.deepStrictEqual(json.errors, []);
    // A format with date types writes it as a timestamp: SQLite as ISO text
    const sqlite = await exportThroughHandler(rows, {
      format: "sqlite",
      pick: noZone,
      check: (filePath) => {
        const { DatabaseSync } = require("node:sqlite");
        const db = new DatabaseSync(filePath, { readOnly: true });
        try {
          const rows = db.prepare("SELECT at FROM data").all().map((row) => ({ ...row }));
          assert.deepStrictEqual(rows, [{ at: "2016-01-13 06:15:00" }]);
        } finally {
          db.close();
        }
      },
    });
    assert.deepStrictEqual(sqlite.errors, []);
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

  test("An Arrow export is priced for the QVD's distinct values of its text, not one a row", async () => {
    const guard = await import("../src/memoryGuard.mjs");
    // 20,000 rows of a text field with three distinct values. Priced one a row, its
    // dictionary would need 20,000 times 84 bytes, 1.6 MiB
    const rows = Array.from({ length: 20000 }, (_, i) => ({ code: `c${i % 3}` }));
    const budget = guard.knownBudget();
    // 1 MiB left: room for a dictionary of three, not of 20,000
    guard.rememberBudget({ bytes: guard.bookedBytes() + 2 ** 20, factor: 1 });
    try {
      const { filePath, messages, errors } = await exportThroughHandler(rows, {
        format: "arrow",
        pick: () => assert.fail("An export without timestamps shouldn't ask anything"),
      });
      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(messages, [`Data exported to ${filePath}`]);
    } finally {
      guard.rememberBudget(budget);
    }
  });

  test("A SQLite export writes its database to the file, and isn't priced against the computer's memory", async () => {
    // The computer has 1 MiB more than the extension host uses. A database built in
    // memory from 20,000 rows of text would need more, and was refused while sql.js built it
    const os = (await import("os")).default;
    const { totalmem } = os;
    os.totalmem = () => process.memoryUsage().rss + 2 ** 20;
    let result;
    try {
      const rows = Array.from({ length: 20000 }, (_, i) => ({ code: `c${i % 3}` }));
      result = await exportThroughHandler(rows, {
        format: "sqlite",
        pick: () => assert.fail("An export without timestamps shouldn't ask anything"),
      });
    } finally {
      os.totalmem = totalmem;
    }
    assert.deepStrictEqual(result.errors, []);
    assert.deepStrictEqual(result.messages, [`Data exported to ${result.filePath}`]);
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
