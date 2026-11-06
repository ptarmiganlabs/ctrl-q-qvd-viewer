const assert = require("assert");
const path = require("path");
const { constants } = require("buffer");
const vscode = require("vscode");

// Import the batching module and the editor provider
let rowBatches;
let QvdEditorProvider;

const root = path.join(__dirname, "..");

/**
 * Build rows of an id and a name
 * @param {number} count - Number of rows
 * @returns {Array<Object>} Rows
 */
function makeRows(count) {
  return Array.from({ length: count }, (_, i) => ({ id: i, name: `Item ${i}` }));
}

suite("Row Batch Test Suite", () => {
  // Load the modules before running tests
  suiteSetup(async () => {
    // Import the ESM modules
    rowBatches = await import("../src/webview/rowBatches.mjs");
    ({ default: QvdEditorProvider } = await import("../src/qvdEditorProvider.mjs"));
  });

  test("Every row, in order, in batches near the target size", () => {
    const rows = makeRows(10000);
    const batches = rowBatches.splitRowsIntoBatches(rows, 25000);

    assert.ok(batches.length > 1);
    assert.deepStrictEqual(batches.flat(), rows);
    for (const batch of batches) {
      assert.ok(JSON.stringify(batch).length <= 25000 * 1.5);
    }
  });

  test("No rows - one empty batch", () => {
    assert.deepStrictEqual(rowBatches.splitRowsIntoBatches([]), [[]]);
  });

  test("A row larger than the target goes in a batch of its own", () => {
    const rows = [{ text: "x".repeat(1000) }, { text: "y".repeat(1000) }];
    assert.deepStrictEqual(rowBatches.splitRowsIntoBatches(rows, 100), [
      [rows[0]],
      [rows[1]],
    ]);
  });

  test("A batch is far below the longest string Node allows", () => {
    assert.ok(rowBatches.BATCH_JSON_CHARS * 10 < constants.MAX_STRING_LENGTH);
  });

  test("Opening a file does not wait for the webview to take the rows", async () => {
    const provider = new QvdEditorProvider({
      extensionPath: root,
      extensionUri: vscode.Uri.file(root),
    });
    // Until a custom editor's webview exists, VS Code holds its messages and
    // resolves them only once it does, which is after resolveCustomEditor returns
    let createWebview;
    const created = new Promise((resolve) => (createWebview = resolve));
    const commands = [];
    const webview = {
      html: "",
      cspSource: "",
      asWebviewUri: (uri) => uri,
      postMessage: async (message) => {
        commands.push(message.command);
        await created;
        return true;
      },
    };

    const filePath = path.join(root, "test-data", "stockholm_temp", "stockholm_temp.qvd");
    const { rowsSent } = await provider.updateWebview(filePath, webview, 5000);
    assert.ok(webview.html.length > 0);
    assert.deepStrictEqual(commands, ["loadInitialData"]);

    createWebview();
    await rowsSent;
  });

  test("Load All sends every row to the webview, in batches", async () => {
    const provider = new QvdEditorProvider({
      extensionPath: root,
      extensionUri: vscode.Uri.file(root),
    });
    // Serialise each message as VS Code does
    const messages = [];
    const webview = {
      html: "",
      cspSource: "",
      asWebviewUri: (uri) => uri,
      postMessage: async (message) => {
        messages.push(JSON.stringify(message));
        return true;
      },
    };

    const filePath = path.join(root, "test-data", "lego", "inventory_parts.qvd");
    const { rowsSent } = await provider.updateWebview(filePath, webview, 0);
    await rowsSent;

    const [first, ...rest] = messages.map((json) => JSON.parse(json));
    assert.strictEqual(first.command, "loadInitialData");
    assert.strictEqual(first.loadedRows, 580251);
    assert.strictEqual(first.hasMoreRows, false);
    assert.ok(rest.length > 0);
    assert.ok(rest.every((message) => message.command === "appendRows"));
    assert.strictEqual(
      first.data.length + rest.reduce((sum, message) => sum + message.data.length, 0),
      580251
    );
    for (const json of messages) {
      assert.ok(json.length < rowBatches.BATCH_JSON_CHARS * 1.5);
    }
  });
});
