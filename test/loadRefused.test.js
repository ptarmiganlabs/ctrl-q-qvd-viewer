const assert = require("assert");
const path = require("path");
const vscode = require("vscode");
const { recordingWebview } = require("./fakes");

// Import the editor provider
let QvdEditorProvider;

const root = path.join(__dirname, "..");

/**
 * An editor provider whose reader fails every read, and whose files' headers
 * don't read either
 * @param {string} error - The failure's message
 * @param {string} [errorReason] - Its reason, a memory refusal unless given
 * @returns {object} The provider, with headersAsked: how often a header was asked for
 */
function refusingProvider(error, errorReason = "memory") {
  const provider = new QvdEditorProvider({
    extensionPath: root,
    extensionUri: vscode.Uri.file(root),
  });
  provider.headersAsked = 0;
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
    readHeader: async () => {
      provider.headersAsked++;
      throw Object.assign(new Error("The XML header contains no usable QvdTableHeader element"), {
        name: "QvdCorruptedError",
      });
    },
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

    await provider.updateWebview("refused.qvd", webview, 0, { keepPageOnFailure: true });

    assert.strictEqual(webview.html, "<p>the page with its rows</p>");
    assert.deepStrictEqual(messages, [{ command: "loadRefused" }]);
  });

  test("Load More on a file that has gone keeps the page, and says why", async () => {
    // The API as the provider imports it: on VS Code 1.101.0 that is another object than require() gives
    const api = await import("vscode");
    const showWarningMessage = api.window.showWarningMessage;
    const warnings = [];
    const provider = new QvdEditorProvider({
      extensionPath: root,
      extensionUri: vscode.Uri.file(root),
    });
    const messages = [];
    const webview = recordingWebview(messages);
    webview.html = "<p>the page with its rows</p>";
    const gone = path.join(root, "test-data", "lego", "gone-since-it-opened.qvd");

    try {
      api.window.showWarningMessage = async (message, ...items) => {
        warnings.push({ message, items });
        return undefined;
      };
      await provider.updateWebview(gone, webview, 10000, { keepPageOnFailure: true });
    } finally {
      api.window.showWarningMessage = showWarningMessage;
    }

    assert.strictEqual(webview.html, "<p>the page with its rows</p>");
    assert.deepStrictEqual(messages, [{ command: "loadRefused" }]);
    assert.deepStrictEqual(warnings, [
      {
        message: `The file can't be found. There is no file at ${gone}.`,
        items: ["Show Logs"],
      },
    ]);
  });

  test("Opening a file refused for memory, whose header doesn't read either, shows the error page", async () => {
    const provider = refusingProvider(
      "Reading 5,000 of this QVD's 30,000,000 rows needs more memory than VS Code gives its extensions."
    );
    const messages = [];
    const webview = recordingWebview(messages);

    await provider.updateWebview("refused.qvd", webview, 5000);

    // The header was asked for first: only the rows of a memory refusal failed
    assert.strictEqual(provider.headersAsked, 1);
    assert.ok(webview.html.includes('data-kind="memory"'));
    assert.ok(webview.html.includes("needs more memory than VS Code gives its extensions"));
    assert.ok(!webview.html.includes("Ctrl-Q QVD File Viewer"));
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

    await provider.updateWebview("closed.qvd", webview, 0, { keepPageOnFailure: true });

    assert.strictEqual(webview.html, "<p>the page</p>");
    assert.deepStrictEqual(messages, []);
  });
});
