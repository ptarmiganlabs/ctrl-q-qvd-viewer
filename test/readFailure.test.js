const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vscode = require("vscode");
const { recordingWebview } = require("./fakes");

// Import the reader, the failure's description and page, the editor provider,
// the message handler, the memory guard and the logger
let QvdReader;
let errorFacts;
let describeReadFailure;
let describeViewerFailure;
let PREVIEW_ROWS_SETTING;
let getErrorHtml;
let escapeHtml;
let QvdEditorProvider;
let setupMessageHandler;
let guard;
let logger;

const root = path.join(__dirname, "..");
const testData = path.join(root, "test-data");
const sets = path.join(testData, "lego", "sets.qvd");
const colors = path.join(testData, "lego", "colors.qvd");

// The cases, made in a temporary directory: damaged copies of sets.qvd, other
// files named .qvd, a folder named .qvd and a path with no file
let dir;
const files = {};
// Whether this account can be refused a file: not on Windows, and not as root
const canBeRefused = process.platform !== "win32" && process.getuid?.() !== 0;

/**
 * An editor provider with the real reader
 * @param {string} [extensionPath] - Where the extension's files are: an empty
 *   folder for one whose webview pages can't be built
 * @returns {object} The provider
 */
function realProvider(extensionPath = root) {
  return new QvdEditorProvider({ extensionPath, extensionUri: vscode.Uri.file(extensionPath) });
}

/**
 * Open a file the way the editor does, and give the page it shows
 * @param {string} filePath - The file
 * @param {number} [maxRows=5000] - Rows to open it with
 * @param {object} [provider] - The editor provider, the real reader's unless given
 * @returns {Promise<string>} The page's HTML
 */
async function pageFor(filePath, maxRows = 5000, provider = realProvider()) {
  const webview = recordingWebview();
  const shown = await provider.updateWebview(filePath, webview, maxRows);
  await shown?.rowsSent;
  return webview.html;
}

/**
 * What a page shows: its body, up to its scripts. Both pages keep their styles in
 * their head, and their scripts after their content.
 * @param {string} html - The page
 * @returns {string} That part of it
 */
function shown(html) {
  const body = html.indexOf("<body>");
  assert.ok(body >= 0, "the page has a body");
  const scripts = html.indexOf("<script", body);
  return html.slice(body, scripts >= 0 ? scripts : html.length);
}

/**
 * Check that a page says why a read failed, with the title of the failure's kind
 * @param {string} html - The page
 * @param {string} kind - The kind of failure
 * @param {string|RegExp} title - Its title
 */
function assertSays(html, kind, title) {
  const page = shown(html);
  assert.ok(page.includes(`data-kind="${kind}"`), `the page is for ${kind}`);
  if (title instanceof RegExp) {
    assert.match(page, title);
  } else {
    assert.ok(page.includes(escapeHtml(title)), `the page says "${title}"`);
  }
  // Only damage is corruption
  assert.strictEqual(/corrupt/i.test(page), kind === "damaged", `${kind} and the word corrupted`);
}

/**
 * Whether a page is the viewer, rather than the error page
 * @param {string} html - The page
 * @returns {boolean} Whether it is
 */
function isViewer(html) {
  return html.includes("Ctrl-Q QVD File Viewer");
}

/**
 * Read a failed read the way the page does
 * @param {string} filePath - The file
 * @param {number} [maxRows=10] - Rows to read
 * @returns {Promise<{result: object, failure: object}>} The read, and why it failed
 */
async function failedRead(filePath, maxRows = 10) {
  const result = await new QvdReader().read(filePath, maxRows);
  assert.notStrictEqual(result.error, null, `${filePath} should fail to read`);
  return { result, failure: describeReadFailure(result, { filePath }) };
}

suite("Read Failure Test Suite", () => {
  suiteSetup(async () => {
    // Import the ESM modules
    ({ default: QvdReader, errorFacts } = await import("../src/qvdReader.mjs"));
    ({ describeReadFailure, describeViewerFailure } = await import("../src/webview/readFailure.mjs"));
    ({ PREVIEW_ROWS_SETTING } = await import("../src/webview/loadMore.mjs"));
    ({ getErrorHtml, escapeHtml } = await import("../src/webview/templates/errorTemplate.mjs"));
    ({ default: QvdEditorProvider } = await import("../src/qvdEditorProvider.mjs"));
    ({ setupMessageHandler } = await import("../src/webview/messageHandler.mjs"));
    guard = await import("../src/memoryGuard.mjs");
    ({ default: logger } = await import("../src/logger.mjs"));

    dir = fs.mkdtempSync(path.join(os.tmpdir(), "qvd-viewer-failures-"));
    const bytes = fs.readFileSync(sets);
    const header = bytes.toString("latin1", 0, bytes.indexOf("</QvdTableHeader>"));
    const records = Number(/<NoOfRecords>(\d+)<\/NoOfRecords>/.exec(header)[1]);
    const recordSize = Number(/<RecordByteSize>(\d+)<\/RecordByteSize>/.exec(header)[1]);
    const write = (name, content) => {
      const filePath = path.join(dir, name);
      fs.writeFileSync(filePath, content);
      return filePath;
    };

    // The header whole, and the file cut off in its symbol table
    files.truncated = write("truncated.qvd", bytes.subarray(0, Math.floor(bytes.length / 2)));
    // The last byte of its index table missing
    files.lastByte = write("last-byte.qvd", bytes.subarray(0, bytes.length - 1));
    // Every record's symbol indexes past the end of their fields' symbols
    const badIndex = Buffer.from(bytes);
    badIndex.fill(0xff, bytes.length - records * recordSize);
    files.badIndex = write("bad-index.qvd", badIndex);
    // Files that aren't QVDs at all, named as if they were
    files.csv = write("sets-csv.qvd", fs.readFileSync(path.join(testData, "lego", "sets.csv")));
    files.parquet = write(
      "stockholm-parquet.qvd",
      fs.readFileSync(path.join(testData, "stockholm_temp", "stockholm_temp.parquet"))
    );
    files.damaged = path.join(testData, "misc", "damaged.qvd");
    files.missing = path.join(dir, "missing.qvd");
    files.folder = path.join(dir, "folder.qvd");
    fs.mkdirSync(files.folder);
    files.unreadable = write("unreadable.qvd", bytes);
    fs.chmodSync(files.unreadable, 0o000);
    // A truncated copy of its own, for the header a failed read keeps
    files.kept = write("kept.qvd", bytes.subarray(0, Math.floor(bytes.length / 2)));
    // An extension folder without the libraries its pages inline
    files.noLibraries = path.join(dir, "no-libraries");
    fs.mkdirSync(files.noLibraries);
  });

  suiteTeardown(() => {
    for (const name of ["unreadable", "kept"]) {
      if (files[name] && fs.existsSync(files[name])) {
        fs.chmodSync(files[name], 0o644);
      }
    }
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("A missing file and a folder give the system's code", async () => {
    const missing = await failedRead(files.missing);
    assert.strictEqual(missing.result.errorName, "QvdIOError");
    assert.strictEqual(missing.result.errorCode, "ENOENT");
    assert.strictEqual(missing.failure.kind, "missing");

    const folder = await failedRead(files.folder);
    assert.strictEqual(folder.result.errorCode, "EISDIR");
    assert.strictEqual(folder.failure.kind, "directory");
    // Retrying a folder does nothing
    assert.ok(!folder.failure.actions.some((action) => action.command === "retry"));
  });

  test("A file this account may not read gives EACCES", async function () {
    if (!canBeRefused) {
      this.skip();
    }
    const { result, failure } = await failedRead(files.unreadable);
    assert.strictEqual(result.errorName, "QvdIOError");
    assert.strictEqual(result.errorCode, "EACCES");
    assert.strictEqual(failure.kind, "permission");
  });

  test("A row limit that isn't a count names its option, and a null byte is a refused path", async () => {
    const option = await failedRead(sets, -5);
    assert.strictEqual(option.result.errorReason, "option");
    assert.strictEqual(option.result.errorOption, "maxRows");
    assert.strictEqual(option.failure.kind, "option");

    const nul = await failedRead(`${sets}\0.qvd`);
    assert.strictEqual(nul.result.errorName, "QvdSecurityError");
    assert.strictEqual(nul.result.errorReason, "null_byte");
    assert.strictEqual(nul.failure.kind, "path");
  });

  test("Truncated, bad-index and renamed files and damaged.qvd are damage, with no system code", async () => {
    for (const name of ["truncated", "lastByte", "badIndex", "csv", "parquet", "damaged"]) {
      const { result, failure } = await failedRead(files[name]);
      assert.ok(
        ["QvdCorruptedError", "QvdParseError"].includes(result.errorName),
        `${name}: ${result.errorName}`
      );
      assert.strictEqual(result.errorCode, null, name);
      assert.strictEqual(failure.kind, "damaged", name);
      assert.strictEqual(failure.dataOnly, true, name);
    }
  });

  test("The header alone reads as a full read's metadata, and reads where only the rows are damaged", async () => {
    const reader = new QvdReader();
    const read = await reader.read(sets, 1);
    try {
      const header = await reader.readHeader(sets);
      assert.deepStrictEqual(header.metadata, read.metadata);
      assert.deepStrictEqual(header.columns, read.columns);
      assert.strictEqual(header.totalRows, read.totalRows);
    } finally {
      read.release();
    }

    for (const name of ["truncated", "lastByte", "badIndex"]) {
      const header = await reader.readHeader(files[name]);
      assert.strictEqual(header.totalRows, 11673, name);
      assert.deepStrictEqual(header.columns, ["set_num", "name", "year", "theme_id", "num_parts"], name);
    }
    for (const name of ["csv", "parquet", "damaged"]) {
      await assert.rejects(reader.readHeader(files[name]), { name: "QvdCorruptedError" }, name);
    }
  });

  test("The system's code is kept, and never qvdjs's or Node's own", () => {
    const qvdjs = { name: "QvdIOError", code: "QVD_IO_ERROR", context: { code: "ENOENT" } };
    assert.strictEqual(errorFacts(qvdjs).errorCode, "ENOENT");
    assert.strictEqual(errorFacts({ name: "QvdIOError", code: "QVD_IO_ERROR", cause: { code: "EBUSY" } }).errorCode, "EBUSY");
    assert.strictEqual(errorFacts(Object.assign(new Error("stat"), { code: "EPERM" })).errorCode, "EPERM");
    assert.strictEqual(errorFacts({ name: "TypeError", code: "ERR_INVALID_ARG_TYPE" }).errorCode, null);
    assert.strictEqual(errorFacts({ name: "QvdCorruptedError", code: "QVD_CORRUPTED_ERROR" }).errorCode, null);
    assert.deepStrictEqual(errorFacts({ name: "AbortError" }), {
      errorName: "AbortError",
      errorReason: "aborted",
      errorCode: null,
      errorOption: null,
    });
  });

  test("A file another program holds is a lock: EBUSY anywhere, and EPERM on Windows", () => {
    const io = (errorCode) => ({ error: `${errorCode}: resource busy or locked`, errorName: "QvdIOError", errorCode });
    const filePath = "C:\\Qlik\\QVDs\\sets.qvd";

    const busy = describeReadFailure(io("EBUSY"), { filePath, platform: "win32" });
    assert.strictEqual(busy.kind, "locked");
    assert.strictEqual(busy.title, "The file is in use by another program");
    assert.ok(busy.advice.some((line) => line.includes("reload")));
    assert.ok(busy.actions.some((action) => action.command === "retry"));

    const held = describeReadFailure(io("EPERM"), { filePath, platform: "win32" });
    assert.strictEqual(held.kind, "locked");
    // Windows says EPERM for a file it won't let the account read, too, so the
    // page doesn't say for certain that another program holds it
    assert.strictEqual(held.title, "Windows won't let VS Code read this file");
    assert.ok(!held.summary.startsWith("Another program holds"));
    assert.ok(held.summary.includes("your account may not read it"));
    assert.ok(held.advice.some((line) => line.includes("Windows account")));

    // Elsewhere, EPERM is a refusal, which on macOS can be its privacy protection
    const mac = describeReadFailure(io("EPERM"), { filePath: "/Users/me/sets.qvd", platform: "darwin" });
    assert.strictEqual(mac.kind, "permission");
    assert.ok(mac.advice.some((line) => line.includes("Privacy & Security")));
    assert.strictEqual(describeReadFailure(io("EPERM"), { filePath, platform: "linux" }).kind, "permission");
    assert.strictEqual(describeReadFailure(io("EBUSY"), { filePath, platform: "linux" }).kind, "locked");

    const page = getErrorHtml(busy);
    assertSays(page, "locked", busy.title);
    assert.ok(page.includes("EBUSY"));
  });

  test("A memory refusal says what didn't fit, and offers the rows that fit and the setting", () => {
    const refused = (fitRows) => ({
      error: guard.describeReadRefusal({ rows: 5000, totalRows: 30000000, fitRows, forCaller: false }),
      errorName: "QvdValidationError",
      errorReason: "memory",
      refusal: { rows: 5000, totalRows: 30000000, fitRows, forCaller: false, neededBytes: 0, leftBytes: 0 },
    });

    const some = describeReadFailure(refused(1200), { filePath: "/data/huge.qvd" });
    assert.strictEqual(some.kind, "memory");
    assert.strictEqual(some.title, "Not enough memory to show this many rows");
    assert.ok(some.summary.includes("needs more memory than VS Code gives its extensions"));
    assert.deepStrictEqual(
      some.actions.find((action) => action.rows),
      { command: "retry", label: "Open the first 1,200 rows", rows: 1200 }
    );
    assert.ok(
      some.actions.some((action) => action.command === "openSettings" && action.setting === PREVIEW_ROWS_SETTING)
    );
    assert.strictEqual(some.dataOnly, true);
    // Not qvdjs's own advice, which a VS Code user can't follow
    const said = [some.summary, ...some.advice].join(" ");
    assert.ok(!said.includes("limit parameter") && !said.includes("max-old-space-size"));

    const none = describeReadFailure(refused(0), { filePath: "/data/huge.qvd" });
    assert.strictEqual(none.title, "Not enough memory to read this file");
    assert.ok(!none.actions.some((action) => action.rows));
  });

  test("An option refusal names maxPreviewRows only for the rows to read", () => {
    const refused = (errorOption) => ({
      error: `${errorOption} must be a number of 0 or more, not -1`,
      errorName: "QvdValidationError",
      errorReason: "option",
      errorOption,
    });
    const rows = describeReadFailure(refused("maxRows"), { filePath: "/data/sets.qvd" });
    assert.ok(rows.advice[0].includes(PREVIEW_ROWS_SETTING));
    assert.ok(rows.actions.some((action) => action.setting === PREVIEW_ROWS_SETTING));
    // A setting put right takes effect on a retry
    assert.ok(rows.actions.some((action) => action.command === "retry"));

    const cost = describeReadFailure(refused("bytesPerCell"), { filePath: "/data/sets.qvd" });
    assert.ok(cost.summary.includes("bytesPerCell"));
    assert.ok(!cost.advice.join(" ").includes(PREVIEW_ROWS_SETTING));
    assert.ok(!cost.actions.some((action) => action.command === "openSettings"));
    // No setting gives it, so a retry would fail the same way
    assert.deepStrictEqual(
      cost.actions.map((action) => action.command),
      ["showLogs"]
    );
  });

  test("A failure of no known kind says the file couldn't be read, not that it is corrupted", () => {
    const failure = describeReadFailure(
      { error: "EIO: i/o error, read", errorName: "QvdIOError", errorCode: "EIO" },
      { filePath: "/mnt/share/sets.qvd" }
    );
    assert.strictEqual(failure.kind, "unknown");
    assert.ok(failure.summary.includes("EIO"));
    assertSays(getErrorHtml(failure), "unknown", "The file couldn't be read");
  });

  test("Opening each kind of failure shows its own page", async () => {
    assertSays(await pageFor(files.missing), "missing", "The file can't be found");
    assertSays(await pageFor(files.folder), "directory", "This is a folder, not a QVD file");
    assertSays(await pageFor(sets, -5), "option", "A setting or option isn't valid");
    assertSays(await pageFor(`${sets}\0.qvd`), "path", "The viewer refused this file's path");
    // A file with no QVD header has nothing else to show
    for (const name of ["csv", "parquet", "damaged"]) {
      const html = await pageFor(files[name]);
      assertSays(html, "damaged", "This QVD file appears to be corrupted or damaged");
      assert.ok(!isViewer(html), name);
    }
  });

  test("Opening a file this account may not read says so", async function () {
    if (!canBeRefused) {
      this.skip();
    }
    assertSays(await pageFor(files.unreadable), "permission", "You don't have permission to read this file");
  });

  test("A file whose rows are damaged opens with its header, and the damage in the Data tab", async () => {
    for (const name of ["truncated", "lastByte", "badIndex"]) {
      const html = await pageFor(files[name]);
      assert.ok(isViewer(html), `${name} opens in the viewer`);
      assertSays(html, "damaged", "This QVD file appears to be corrupted or damaged");
      // The schema tab has the header's fields
      assert.ok(html.includes('"name":"set_num"') && html.includes('"name":"num_parts"'), name);
      assert.ok(html.includes("The file's header could still be read"), name);
      // Its header read, so it is a QVD: the notice doesn't suggest it might not be
      assert.ok(html.includes("could read the header of"), name);
      assert.ok(!html.includes("not a QVD") && !html.includes("renamed .qvd"), name);
      // Neither Load More nor a wait for rows: the notice retries
      assert.ok(html.includes("let hasMoreRows = false;"), name);
      assert.ok(!html.includes('id="loading-indicator"'), name);
    }
  });

  test("Opening a file too large for the memory left shows its header, and why", async () => {
    // qvdjs's budget is known once a read has asked for it
    (await new QvdReader().read(colors, 1)).release();
    const release = guard.bookHeap(guard.knownBudget().bytes);
    let html;
    try {
      html = await pageFor(sets);
    } finally {
      release();
    }
    assert.ok(isViewer(html));
    assertSays(html, "memory", /Not enough memory to (read this file|show this many rows)/);
    assert.ok(html.includes("needs more memory than VS Code gives its extensions"));
    assert.ok(html.includes(`data-setting="${PREVIEW_ROWS_SETTING}"`));
  });

  test("The error page runs only its own script and style, and escapes what it shows", () => {
    const failure = describeReadFailure(
      { error: "<script>alert(1)</script>", errorName: "TypeError" },
      { filePath: "/data/<b>sets</b>.qvd" }
    );
    const html = getErrorHtml(failure);
    const nonce = /script-src 'nonce-([A-Za-z0-9]+)'/.exec(html)?.[1];
    assert.ok(nonce, "the CSP allows scripts by nonce only");
    assert.ok(html.includes(`default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`));
    assert.ok(html.includes(`<script nonce="${nonce}">`));
    assert.ok(html.includes(`<style nonce="${nonce}">`));
    assert.strictEqual((html.match(/<script/g) ?? []).length, 1, "one script, the page's own");
    assert.ok(!html.includes("<b>sets</b>"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.ok(html.includes('data-command="retry"') && html.includes('data-command="showLogs"'));
    assert.ok(html.includes("wireFailureButtons(acquireVsCodeApi());"));
  });

  test("Retry reads the file again, with the rows the setting asks for now or the rows offered", async () => {
    // The API as the handler imports it: on VS Code 1.101.0 that is another object than require() gives
    const api = await import("vscode");
    const getConfiguration = api.workspace.getConfiguration;
    const panel = { webview: recordingWebview() };
    const updates = [];
    const signal = new AbortController().signal;
    setupMessageHandler(
      panel,
      sets,
      new QvdReader(),
      {},
      async (...update) => updates.push(update),
      5000,
      signal
    );
    try {
      api.workspace.getConfiguration = () => ({
        get: (key, fallback) => (key === "maxPreviewRows" ? 300 : fallback),
      });
      await panel.webview.listener({ command: "retry" });
      await panel.webview.listener({ command: "retry", rows: 1200 });
      await panel.webview.listener({ command: "retry", rows: "1200" });
      await panel.webview.listener({ command: "retry", rows: 1e9 });
    } finally {
      api.workspace.getConfiguration = getConfiguration;
    }
    assert.deepStrictEqual(
      updates.map(([filePath, webview, rows, options]) => [filePath, webview === panel.webview, rows, options]),
      [
        [sets, true, 300, { signal }],
        [sets, true, 1200, { signal }],
        [sets, true, 300, { signal }],
        [sets, true, 100000, { signal }],
      ]
    );
  });

  test("Show Logs shows the log, and Open Settings opens the setting a page names", async () => {
    const api = await import("vscode");
    const executeCommand = api.commands.executeCommand;
    const show = logger.show;
    const panel = { webview: recordingWebview() };
    const commands = [];
    let shown = 0;
    setupMessageHandler(panel, sets, new QvdReader(), {}, async () => {}, 5000);
    try {
      api.commands.executeCommand = async (...command) => commands.push(command);
      logger.show = () => shown++;
      await panel.webview.listener({ command: "showLogs" });
      await panel.webview.listener({ command: "openSettings", setting: PREVIEW_ROWS_SETTING });
      // Only the extension's own settings
      await panel.webview.listener({ command: "openSettings", setting: "security.workspace.trust.enabled" });
      await panel.webview.listener({ command: "openSettings" });
    } finally {
      api.commands.executeCommand = executeCommand;
      logger.show = show;
    }
    assert.strictEqual(shown, 1);
    assert.deepStrictEqual(commands, [
      ["workbench.action.openSettings", PREVIEW_ROWS_SETTING],
      ["workbench.action.openSettings", "ctrl-q-qvd-viewer"],
      ["workbench.action.openSettings", "ctrl-q-qvd-viewer"],
    ]);
  });

  test("Retry opens a file that has turned up since", async () => {
    const late = path.join(dir, "late.qvd");
    const provider = realProvider();
    const webview = recordingWebview();
    await provider.updateWebview(late, webview, 5000);
    assertSays(webview.html, "missing", "The file can't be found");

    fs.copyFileSync(sets, late);
    setupMessageHandler(
      { webview },
      late,
      provider.qvdReader,
      provider.context,
      provider.updateWebview.bind(provider),
      5000
    );
    await webview.listener({ command: "retry" });
    assert.ok(isViewer(webview.html));
    assert.ok(!webview.html.includes('class="read-failure"'));
  });

  test("A page the viewer can't build is the viewer's failure, not the file's", async () => {
    // sets.qvd reads, but this extension folder has none of the libraries its pages inline
    const html = await pageFor(sets, 5000, realProvider(files.noLibraries));
    assertSays(html, "viewer", "The viewer couldn't show this file");
    // The library's ENOENT is in the details, and isn't taken for the QVD's
    assert.ok(html.includes("ENOENT"));
    assert.ok(!html.includes(escapeHtml("The file can't be found")));

    const thrown = Object.assign(new Error("ENOENT: no such file, open 'tabulator.min.js'"), { code: "ENOENT" });
    assert.strictEqual(describeViewerFailure(thrown, { filePath: sets }).kind, "viewer");
  });

  test("A header page that can't be built gives way to the error page, which says why the rows failed", async () => {
    const html = await pageFor(files.truncated, 5000, realProvider(files.noLibraries));
    assert.ok(!isViewer(html));
    assertSays(html, "damaged", "This QVD file appears to be corrupted or damaged");
  });

  test("Closing the editor while a failure's header is read leaves the page alone", async () => {
    const closed = new AbortController();
    const header = await new QvdReader().readHeader(sets);
    const provider = realProvider();
    provider.qvdReader = {
      read: async () => ({
        error: "Symbol index out of range",
        errorName: "QvdCorruptedError",
        errorReason: null,
        errorCode: null,
        release: () => {},
      }),
      // The editor closes as the header arrives
      readHeader: async () => {
        closed.abort();
        return header;
      },
    };
    const webview = recordingWebview();
    webview.html = "<p>the page</p>";

    await provider.updateWebview(sets, webview, 5000, { signal: closed.signal });

    assert.strictEqual(webview.html, "<p>the page</p>");
  });

  test("Closing the editor once its rows are read leaves the page alone, and lets their memory go", async () => {
    const closed = new AbortController();
    const read = await new QvdReader().read(colors, 5);
    let released = 0;
    const provider = realProvider();
    provider.qvdReader = {
      // The editor closes as the rows arrive
      read: async () => {
        closed.abort();
        return { ...read, release: () => released++ };
      },
    };
    const webview = recordingWebview();
    webview.html = "<p>the page</p>";

    const shown = await provider.updateWebview(colors, webview, 5, { signal: closed.signal });
    read.release();

    assert.strictEqual(shown, undefined);
    assert.strictEqual(webview.html, "<p>the page</p>");
    assert.strictEqual(released, 1);
  });

  test("A page set as its editor closes is given up, without a second try", async () => {
    const closed = new AbortController();
    const read = await new QvdReader().read(colors, 5);
    let released = 0;
    const provider = realProvider();
    provider.qvdReader = { read: async () => ({ ...read, release: () => released++ }) };
    let tries = 0;
    const webview = recordingWebview();
    // VS Code's webview throws once its panel is disposed, which also aborts the editor's signal
    Object.defineProperty(webview, "html", {
      get: () => "",
      set: () => {
        tries++;
        closed.abort();
        throw new Error("Webview is disposed");
      },
    });

    await provider.updateWebview(colors, webview, 5, { signal: closed.signal });
    read.release();

    assert.strictEqual(tries, 1);
    assert.strictEqual(released, 1);
  });

  test("The page shown when opening fails has buttons only when something hears them", async () => {
    /**
     * Open sets.qvd in an editor whose first page can't be built
     * @param {object} webview - The editor's webview
     * @returns {Promise<object>} The webview, once opening has failed
     */
    const openFailing = async (webview) => {
      const provider = realProvider();
      provider.updateWebview = async () => {
        throw new Error("The page couldn't be built");
      };
      const panel = { webview, onDidDispose: () => ({ dispose: () => {} }) };
      await assert.rejects(provider.resolveCustomEditor({ uri: vscode.Uri.file(sets) }, panel, {}));
      return webview;
    };

    // The handler is set up before the first page, so the error page's buttons reach it
    const heard = await openFailing(recordingWebview());
    assert.strictEqual(typeof heard.listener, "function");
    assertSays(heard.html, "viewer", "The viewer couldn't show this file");
    assert.ok(heard.html.includes('data-command="retry"'));

    // Where the handler couldn't be set up, the page has no buttons that would do nothing
    const deaf = recordingWebview();
    delete deaf.onDidReceiveMessage;
    const unheard = await openFailing(deaf);
    assertSays(unheard.html, "viewer", "The viewer couldn't show this file");
    assert.ok(!unheard.html.includes("data-command="));
  });

  test("The header a failed read has just read isn't read again", async function () {
    if (!canBeRefused) {
      this.skip();
    }
    const reader = new QvdReader();
    const read = await reader.read(files.kept, 10);
    assert.strictEqual(read.errorName, "QvdCorruptedError");

    // The file can't be opened now, but it is the same version: the header the read kept is used
    fs.chmodSync(files.kept, 0o000);
    try {
      const header = await reader.readHeader(files.kept);
      assert.strictEqual(header.totalRows, 11673);
      assert.deepStrictEqual(header.columns, ["set_num", "name", "year", "theme_id", "num_parts"]);
      // Each caller gets a copy, so the one kept can't be changed
      header.metadata.fields.length = 0;
      assert.strictEqual((await reader.readHeader(files.kept)).metadata.fields.length, 5);
    } finally {
      fs.chmodSync(files.kept, 0o644);
    }
  });
});
