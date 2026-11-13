const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vscode = require("vscode");
const { recordingWebview } = require("./fakes");

// The ESM modules, imported in suiteSetup
let openPager;
let MAX_PAGE_ROWS;
let FileChangedError;
let createPageServer;
let setupMessageHandler;
let QvdReader;
let QvdEditorProvider;
let guard;
let pageSizeModule;

const root = path.join(__dirname, "..");
const testData = path.join(root, "test-data");
const inventoryParts = path.join(testData, "lego", "inventory_parts.qvd");
const stockholm = path.join(testData, "stockholm_temp", "stockholm_temp.qvd");
const colors = path.join(testData, "lego", "colors.qvd");
const sets = path.join(testData, "lego", "sets.qvd");

/**
 * Every row of a file, as a full read gives them, as arrays in field order
 * @param {string} filePath - The file
 * @returns {Promise<Array<Array<*>>>} The rows
 */
async function everyRow(filePath) {
  const result = await new QvdReader().read(filePath, 0);
  assert.strictEqual(result.error, null);
  const rows = result.data.map((row) => result.columns.map((column) => row[column]));
  result.release();
  return rows;
}

/**
 * A page server whose pager's pages wait until they are given up
 * @param {Array<object>} messages - Where the webview records what is posted
 * @returns {{pages: object, pager: object}} The server, and its pager
 */
function waitingServer(messages) {
  const pager = {
    closes: 0,
    page: ({ signal }) =>
      new Promise((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException("Given up", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => reject(new DOMException("Given up", "AbortError")), {
          once: true,
        });
      }),
    close: async () => {
      pager.closes++;
    },
  };
  const pages = createPageServer({
    filePath: "waiting.qvd",
    webview: recordingWebview(messages),
    openPager: async () => pager,
  });
  return { pages, pager };
}

suite("Page Test Suite", () => {
  let dir;
  // Rows of the files the tests page through, read whole once
  const rows = {};

  suiteSetup(async function () {
    this.timeout(60000);
    ({ openPager, MAX_PAGE_ROWS, FileChangedError } = await import("../src/qvdPager.mjs"));
    ({ createPageServer } = await import("../src/webview/pageServer.mjs"));
    ({ setupMessageHandler } = await import("../src/webview/messageHandler.mjs"));
    ({ default: QvdReader } = await import("../src/qvdReader.mjs"));
    ({ default: QvdEditorProvider } = await import("../src/qvdEditorProvider.mjs"));
    guard = await import("../src/memoryGuard.mjs");
    pageSizeModule = await import("../src/webview/pageSize.mjs");
    rows.inventoryParts = await everyRow(inventoryParts);
    rows.stockholm = await everyRow(stockholm);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "qvd-viewer-pages-"));
  });

  suiteTeardown(() => {
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("A page holds the rows a full read has there, wherever it is in the file", async () => {
    for (const [filePath, all, offsets] of [
      [inventoryParts, rows.inventoryParts, [0, 100, 290000, 580200]],
      [stockholm, rows.stockholm, [0, 50000, 98500]],
    ]) {
      const pager = await openPager(filePath);
      try {
        assert.strictEqual(pager.totalRows, all.length);
        for (const offset of offsets) {
          const page = await pager.page({ offset, limit: 100 });
          assert.strictEqual(page.offset, offset);
          assert.strictEqual(page.totalRows, all.length);
          assert.deepStrictEqual(page.rows, all.slice(offset, offset + 100), `${filePath} from ${offset}`);
        }
      } finally {
        await pager.close();
      }
    }
  });

  test("A page past the last row is empty, and a page is a whole number of rows up to 1,000", async () => {
    const pager = await openPager(colors);
    try {
      const total = pager.totalRows;
      assert.deepStrictEqual((await pager.page({ offset: total, limit: 100 })).rows, []);
      assert.deepStrictEqual((await pager.page({ offset: total + 5000, limit: 100 })).rows, []);
      assert.strictEqual((await pager.page({ offset: 0, limit: MAX_PAGE_ROWS })).rows.length, Math.min(total, 1000));
      for (const [page, option] of [
        [{ offset: 0, limit: MAX_PAGE_ROWS + 1 }, "limit"],
        [{ offset: -1, limit: 100 }, "offset"],
        [{ offset: 0, limit: 2.5 }, "limit"],
        [{ offset: "0", limit: 100 }, "offset"],
      ]) {
        await assert.rejects(pager.page(page), (error) => {
          assert.strictEqual(error.name, "QvdValidationError");
          assert.deepStrictEqual(error.context, { reason: "option", option });
          return true;
        });
      }
    } finally {
      await pager.close();
    }
  });

  test("Opened afresh once it holds more than it may, a pager gives the same rows", async () => {
    // It may hold nothing, so each page after the first opens the file afresh
    const pager = await openPager(inventoryParts, { heldBytes: 1 });
    try {
      for (const offset of [0, 400000, 100, 580200]) {
        const page = await pager.page({ offset, limit: 100 });
        assert.deepStrictEqual(page.rows, rows.inventoryParts.slice(offset, offset + 100), `from ${offset}`);
        assert.ok(pager.heldBytes > 0, "what it holds is booked");
      }
    } finally {
      await pager.close();
    }
  });

  test("Closing a pager lets its memory go, and gives up its later pages", async () => {
    const before = guard.bookedBytes();
    const pager = await openPager(inventoryParts);
    await pager.page({ offset: 0, limit: 100 });
    assert.ok(guard.bookedBytes() > before, "an open file's values are booked");
    await pager.close();
    assert.ok(Math.abs(guard.bookedBytes() - before) < 1, "and let go once it is closed");
    assert.strictEqual(pager.closed, true);
    await assert.rejects(pager.page({ offset: 0, limit: 100 }), { name: "AbortError" });
    // Closing it again does nothing
    await pager.close();
  });

  test("A page given up before its turn is an AbortError, and holds nothing", async () => {
    const before = guard.bookedBytes();
    const pager = await openPager(colors);
    const given = new AbortController();
    given.abort();
    try {
      await assert.rejects(pager.page({ offset: 0, limit: 100, signal: given.signal }), { name: "AbortError" });
      assert.strictEqual(pager.heldBytes, 0);
    } finally {
      await pager.close();
    }
    assert.ok(Math.abs(guard.bookedBytes() - before) < 1);
  });

  test("A file rewritten since it was opened is found changed, not read under its old header", async () => {
    const copy = path.join(dir, "rewritten.qvd");
    fs.copyFileSync(colors, copy);
    const pager = await openPager(copy);
    try {
      await pager.page({ offset: 0, limit: 10 });
      // As a reload storing the QVD again would
      fs.copyFileSync(sets, copy);
      await assert.rejects(pager.page({ offset: 0, limit: 10 }), (error) => {
        assert.ok(error instanceof FileChangedError);
        assert.strictEqual(error.name, "QvdFileChangedError");
        return true;
      });
    } finally {
      await pager.close();
    }
  });

  test("A page that doesn't fit in the memory left is refused, and fits once memory is free", async () => {
    // qvdjs's budget is known once a read has asked for it
    (await new QvdReader().read(colors, 1)).release();
    const pager = await openPager(sets);
    const release = guard.bookHeap(guard.knownBudget().bytes);
    try {
      await assert.rejects(pager.page({ offset: 200, limit: 50 }), (error) => {
        assert.strictEqual(error.name, "QvdValidationError");
        assert.strictEqual(error.context.reason, "memory");
        assert.strictEqual(guard.memoryRefusalOf(error)?.rows, 50);
        assert.match(error.message, /^Showing rows 201 to 250 needs about .+ of memory, and about .+ is left/);
        return true;
      });
      assert.strictEqual(pager.heldBytes, 0, "nothing is booked for a refused page");
    } finally {
      release();
    }
    try {
      assert.strictEqual((await pager.page({ offset: 200, limit: 50 })).rows.length, 50);
    } finally {
      await pager.close();
    }
  });

  test("The page server answers with the page's rows, after saying how far its first page got", async () => {
    const messages = [];
    const pages = createPageServer({ filePath: stockholm, webview: recordingWebview(messages) });
    try {
      await pages.servePage({ requestId: 7, offset: 98500, limit: 100 });
    } finally {
      await pages.close();
    }
    const answer = messages.at(-1);
    assert.strictEqual(answer.command, "pageRows");
    assert.strictEqual(answer.requestId, 7);
    assert.strictEqual(answer.offset, 98500);
    assert.strictEqual(answer.totalRows, rows.stockholm.length);
    assert.deepStrictEqual(answer.rows, rows.stockholm.slice(98500, 98600));
    // Every column walked, the last walk always told
    const progress = messages.filter((message) => message.command === "pageProgress");
    assert.ok(progress.length > 0);
    assert.ok(progress.every((message) => message.requestId === 7));
    assert.strictEqual(progress.at(-1).current, progress.at(-1).total);
    // VS Code sends each message as JSON
    assert.doesNotThrow(() => JSON.stringify(messages));
  });

  test("A page superseded by the next isn't answered, and a cancelled one is answered pageCancelled", async () => {
    const messages = [];
    const { pages } = waitingServer(messages);
    const first = pages.servePage({ requestId: 1, offset: 0, limit: 100 });
    const second = pages.servePage({ requestId: 2, offset: 100, limit: 100 });
    // Cancelling one that no longer runs does nothing
    pages.cancel(1);
    await new Promise((resolve) => setImmediate(resolve));
    pages.cancel(2);
    await Promise.all([first, second]);
    assert.deepStrictEqual(messages, [{ command: "pageCancelled", requestId: 2 }]);
  });

  test("Closing the page server gives up its page without an answer, and closes its file", async () => {
    const messages = [];
    const { pages, pager } = waitingServer(messages);
    const running = pages.servePage({ requestId: 1, offset: 0, limit: 100 });
    await new Promise((resolve) => setImmediate(resolve));
    await pages.close();
    await running;
    await pages.servePage({ requestId: 2, offset: 0, limit: 100 });
    assert.deepStrictEqual(messages, []);
    assert.strictEqual(pager.closes, 1);
  });

  test("A file that has gone says so, and one changed on disk is shown again", async () => {
    const messages = [];
    const gone = path.join(dir, "gone-since-it-opened.qvd");
    const missing = createPageServer({ filePath: gone, webview: recordingWebview(messages) });
    await missing.servePage({ requestId: 1, offset: 0, limit: 100 });
    await missing.close();
    const [answer] = messages;
    assert.strictEqual(answer.command, "pageFailed");
    assert.strictEqual(answer.failure.kind, "missing");
    assert.ok(answer.html.includes('data-kind="missing"'));
    assert.ok(answer.html.includes('data-command="retry"'));

    // A pager that finds its file changed is closed, and the file shown afresh
    const changed = [];
    let shownAgain = 0;
    let closes = 0;
    const pages = createPageServer({
      filePath: "changed.qvd",
      webview: recordingWebview(changed),
      onFileChanged: async () => shownAgain++,
      openPager: async () => ({
        page: async () => {
          throw new FileChangedError("changed.qvd");
        },
        close: async () => closes++,
      }),
    });
    await pages.servePage({ requestId: 1, offset: 0, limit: 100 });
    assert.deepStrictEqual(changed, []);
    assert.strictEqual(shownAgain, 1);
    assert.strictEqual(closes, 1);
    await pages.close();
  });

  test("A failure of the viewer's own is the viewer's, not the file's", async () => {
    const messages = [];
    const pages = createPageServer({
      filePath: "fine.qvd",
      webview: recordingWebview(messages),
      openPager: async () => ({
        page: async () => {
          throw new TypeError("Cannot read properties of undefined (reading 'rows')");
        },
        close: async () => {},
      }),
    });
    await pages.servePage({ requestId: 3, offset: 0, limit: 100 });
    await pages.close();
    assert.strictEqual(messages[0].command, "pageFailed");
    assert.strictEqual(messages[0].failure.kind, "viewer");
  });

  test("The message handler takes the grid's page and cancelPage messages to the page server", async () => {
    const asked = [];
    const panel = { webview: recordingWebview() };
    const pages = {
      servePage: async (message) => asked.push(["page", message.requestId]),
      cancel: (requestId) => asked.push(["cancel", requestId]),
    };
    setupMessageHandler(panel, sets, new QvdReader(), {}, async () => {}, pages);
    await panel.webview.listener({ command: "page", requestId: 4, offset: 0, limit: 100 });
    await panel.webview.listener({ command: "cancelPage", requestId: 4 });
    assert.deepStrictEqual(asked, [
      ["page", 4],
      ["cancel", 4],
    ]);
  });

  test("Opening a file shows its header at once, and reads none of its rows", async () => {
    const provider = new QvdEditorProvider({ extensionPath: root, extensionUri: vscode.Uri.file(root) });
    const reader = provider.qvdReader;
    provider.qvdReader = {
      readHeader: (...args) => reader.readHeader(...args),
      read: async () => assert.fail("opening a file reads no rows"),
    };
    const messages = [];
    const webview = recordingWebview(messages);

    await provider.updateWebview(inventoryParts, webview);

    assert.ok(webview.html.includes("Ctrl-Q QVD File Viewer"));
    assert.ok(webview.html.includes("const totalRowsInFile = 580251;"));
    assert.ok(webview.html.includes("const pageSize = 100;"));
    assert.ok(webview.html.includes('const availableFields = ["inventory_id","part_num","color_id","quantity","is_spare"];'));
    // The grid asks for its rows; nothing is sent until it does
    assert.deepStrictEqual(messages, []);
    // Nor is there a Load More, or a wait for every row
    assert.ok(!webview.html.includes("loadMoreBtn") && !webview.html.includes('id="loading-indicator"'));
  });

  test("Closing the editor while it opens leaves the closed panel alone", async () => {
    const provider = new QvdEditorProvider({ extensionPath: root, extensionUri: vscode.Uri.file(root) });
    // A header that waits until the editor's signal gives it up
    provider.qvdReader = {
      readHeader: (_path, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new DOMException("Given up", "AbortError")))
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

    const opening = provider.resolveCustomEditor({ uri: vscode.Uri.file(colors) }, panel, {});
    disposed = true;
    dispose();

    // It neither throws nor touches the panel
    await opening;
    assert.strictEqual(webview.html, "");
  });

  test("The page size comes from its setting, a whole number from 10 to 1,000", async () => {
    const { pageSizeFromSetting, pageSize, pageSizesOffered, PAGE_SIZE_SETTING } = pageSizeModule;
    assert.strictEqual(PAGE_SIZE_SETTING, "ctrl-q-qvd-viewer.pageSize");
    assert.strictEqual(pageSizeFromSetting(250), 250);
    assert.strictEqual(pageSizeFromSetting(33.4), 33);
    assert.strictEqual(pageSizeFromSetting(0), 10);
    assert.strictEqual(pageSizeFromSetting(5000), 1000);
    for (const value of [undefined, null, "500", NaN, Infinity]) {
      assert.strictEqual(pageSizeFromSetting(value), 100, String(value));
    }
    const withSetting = (value) => ({
      workspace: { getConfiguration: () => ({ get: (key) => (key === "pageSize" ? value : undefined) }) },
    });
    assert.strictEqual(pageSize(withSetting(40)), 40);
    assert.strictEqual(pageSize(withSetting(undefined)), 100);
    // The setting's own size is among those the grid offers
    assert.deepStrictEqual(pageSizesOffered(100), [25, 50, 100, 250, 500, 1000]);
    assert.deepStrictEqual(pageSizesOffered(40), [25, 40, 50, 100, 250, 500, 1000]);
  });
});
