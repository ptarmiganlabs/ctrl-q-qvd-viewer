const assert = require("assert");
const path = require("path");
const vscode = require("vscode");

// Import the editor provider
let QvdEditorProvider;

const root = path.join(__dirname, "..");

/**
 * A webview that records what is posted to it
 * @param {Array<object>} messages - Where to record
 * @returns {object} The webview
 */
function recordingWebview(messages) {
  return {
    html: "",
    cspSource: "",
    asWebviewUri: (uri) => uri,
    postMessage: async (message) => {
      messages.push(message);
      return true;
    },
  };
}

/**
 * An editor provider whose reader fails every read
 * @param {string} error - The failure's message
 * @param {string} [errorReason] - Its reason, a memory refusal unless given
 * @returns {object} The provider
 */
function refusingProvider(error, errorReason = "memory") {
  const provider = new QvdEditorProvider({
    extensionPath: root,
    extensionUri: vscode.Uri.file(root),
  });
  provider.qvdReader = {
    read: async () => ({
      metadata: null,
      data: [],
      columns: [],
      totalRows: 0,
      error,
      errorName: errorReason === "aborted" ? "AbortError" : "QvdValidationError",
      errorReason,
      release: () => {},
    }),
  };
  return provider;
}

suite("Load Refused Test Suite", () => {
  // Load the module before running tests
  suiteSetup(async () => {
    // Import the ESM module
    ({ default: QvdEditorProvider } = await import("../src/qvdEditorProvider.mjs"));
  });

  test("Load All refused for memory keeps the page and puts its buttons back", async () => {
    const provider = refusingProvider(
      "Reading all 1,975,108 rows of this QVD needs more memory than VS Code gives its extensions."
    );
    const messages = [];
    const webview = recordingWebview(messages);
    webview.html = "<p>the page with its rows</p>";

    await provider.updateWebview("refused.qvd", webview, 0, { keepPageOnMemoryRefusal: true });

    assert.strictEqual(webview.html, "<p>the page with its rows</p>");
    assert.deepStrictEqual(messages, [{ command: "loadRefused" }]);
  });

  test("Opening a file refused for memory shows the error page", async () => {
    const provider = refusingProvider(
      "Reading 5,000 of this QVD's 30,000,000 rows needs more memory than VS Code gives its extensions."
    );
    const messages = [];
    const webview = recordingWebview(messages);

    await provider.updateWebview("refused.qvd", webview, 5000);

    assert.ok(webview.html.includes("needs more memory than VS Code gives its extensions"));
    assert.deepStrictEqual(messages, []);
  });

  test("Closing the editor while it opens leaves the closed panel alone", async () => {
    const provider = new QvdEditorProvider({
      extensionPath: root,
      extensionUri: vscode.Uri.file(root),
    });
    // A read that waits until the editor's signal gives it up
    provider.qvdReader = {
      read: (_path, _rows, { signal }) =>
        new Promise((resolve) =>
          signal.addEventListener("abort", () =>
            resolve({
              metadata: null,
              data: [],
              columns: [],
              totalRows: 0,
              error: "The read was given up, because its editor was closed.",
              errorName: "AbortError",
              errorReason: "aborted",
              release: () => {},
            })
          )
        ),
    };
    // VS Code's panel throws once it is disposed, as the real one does
    let disposed = false;
    let dispose;
    const webview = recordingWebview([]);
    const panel = {
      get webview() {
        if (disposed) {
          throw new Error("Webview is disposed");
        }
        return webview;
      },
      onDidDispose: (listener) => {
        dispose = listener;
        return { dispose: () => {} };
      },
    };

    const opening = provider.resolveCustomEditor(
      { uri: vscode.Uri.file(path.join(root, "test-data", "lego", "colors.qvd")) },
      panel,
      {}
    );
    disposed = true;
    dispose();

    // It neither throws nor touches the panel
    await opening;
  });

  test("A read given up because its editor closed leaves the page alone", async () => {
    const provider = refusingProvider("The read was given up, because its editor was closed.", "aborted");
    const messages = [];
    const webview = recordingWebview(messages);
    webview.html = "<p>the page</p>";

    await provider.updateWebview("closed.qvd", webview, 0, { keepPageOnMemoryRefusal: true });

    assert.strictEqual(webview.html, "<p>the page</p>");
    assert.deepStrictEqual(messages, []);
  });
});
