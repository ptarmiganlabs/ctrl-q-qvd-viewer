const assert = require("assert");
const { spawn } = require("child_process");
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
let PAGE_SIZE_SETTING;
let createPageServer;
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
// Whether chmod can stop this account reading a file: not on Windows, where it sets
// only the read-only attribute, and not as root, who reads it anyway. Windows refuses
// a file its account may not read with EPERM, not EACCES, and the page can't tell
// that from a lock, so the tests of EACCES and its page have no case there.
const canBeRefused = process.platform !== "win32" && process.getuid?.() !== 0;
// How long PowerShell may take to start and hold a file
const HOLD_WAIT_MS = 30000;

/**
 * Hold a file open from another program, with no sharing, as a Qlik reload holds a
 * QVD it is storing: until it lets go, Windows won't let any other program open it
 * @param {string} filePath - The file
 * @returns {{held: Promise<void>, release: function(): Promise<void>}} held: settles
 *   once PowerShell holds the file, or has failed to; release: ends PowerShell, which
 *   lets the file go, and resolves once it has
 */
function holdOpen(filePath) {
  // The path comes in an environment variable, so that it needs no quoting. A failed
  // .NET call ends only its own statement, so without Stop the script would say it
  // holds a file it couldn't open
  const script =
    "$ErrorActionPreference = 'Stop'; " +
    "$held = [System.IO.File]::Open($env:QVD_HELD, 'Open', 'Read', 'None'); " +
    "[Console]::Out.WriteLine('held'); [Console]::Out.Flush(); Start-Sleep -Seconds 120";
  const powershell = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env, QVD_HELD: filePath },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const ended = new Promise((resolve) => {
    powershell.once("exit", resolve);
    powershell.once("error", resolve);
  });
  let said = "";
  powershell.stderr.setEncoding("utf8").on("data", (chunk) => (said += chunk));
  const held = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`PowerShell didn't hold ${filePath} within ${HOLD_WAIT_MS} ms`)),
      HOLD_WAIT_MS
    );
    let output = "";
    powershell.stdout.setEncoding("utf8").on("data", (chunk) => {
      output += chunk;
      if (output.includes("held")) {
        clearTimeout(timer);
        resolve();
      }
    });
    ended.then((how) => {
      clearTimeout(timer);
      reject(new Error(`PowerShell ended before it held ${filePath} (${how}): ${said.trim()}`));
    });
  });
  return {
    held,
    release: async () => {
      powershell.kill();
      await ended;
    },
  };
}

/**
 * Make a file one that can't be opened, though it stays as it is: on Windows held
 * open from another program, and elsewhere with no read permission
 * @param {string} filePath - The file
 * @returns {Promise<function(): Promise<void>>} Makes it one that opens again
 */
async function makeUnopenable(filePath) {
  if (process.platform === "win32") {
    const hold = holdOpen(filePath);
    try {
      await hold.held;
    } catch (error) {
      await hold.release();
      throw error;
    }
    return hold.release;
  }
  fs.chmodSync(filePath, 0o000);
  return async () => fs.chmodSync(filePath, 0o644);
}

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
 * @param {object} [provider] - The editor provider, the real reader's unless given
 * @returns {Promise<string>} The page's HTML
 */
async function pageFor(filePath, provider = realProvider()) {
  const webview = recordingWebview();
  await provider.updateWebview(filePath, webview);
  return webview.html;
}

/**
 * Ask for a file's first page, the way the Data tab's grid does, and give the answer
 * @param {string} filePath - The file
 * @returns {Promise<object>} The message that answers it
 */
async function firstPageFor(filePath) {
  const messages = [];
  const pages = createPageServer({ filePath, webview: recordingWebview(messages) });
  try {
    await pages.servePage({ requestId: 1, offset: 0, limit: 100 });
  } finally {
    await pages.close();
  }
  return messages.find((message) => message.requestId === 1 && message.command !== "pageProgress");
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
    ({ PAGE_SIZE_SETTING } = await import("../src/webview/pageSize.mjs"));
    ({ createPageServer } = await import("../src/webview/pageServer.mjs"));
    ({ getErrorHtml } = await import("../src/webview/templates/errorTemplate.mjs"));
    ({ escapeHtml } = await import("../src/webview/templates/escaping.mjs"));
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

  test("A file another program holds on Windows reads as a lock, and its page says so", async function () {
    // Only Windows refuses to open a file another program holds: elsewhere a lock is
    // advisory, and the read goes ahead
    if (process.platform !== "win32") {
      this.skip();
    }
    this.timeout(HOLD_WAIT_MS + 30000);
    const heldFile = path.join(dir, "held.qvd");
    fs.copyFileSync(sets, heldFile);
    const hold = holdOpen(heldFile);
    try {
      await hold.held;
      // A file held with no sharing is a sharing violation, which Windows reports as
      // EBUSY: EPERM would be the page of a file this account may not read
      const { result, failure } = await failedRead(heldFile);
      assert.strictEqual(result.errorName, "QvdIOError");
      assert.strictEqual(result.errorCode, "EBUSY");
      assert.strictEqual(failure.kind, "locked");
      assert.strictEqual(failure.title, "The file is in use by another program");
      assertSays(getErrorHtml(failure), "locked", failure.title);
      // The editor shows that page
      assertSays(await pageFor(heldFile), "locked", "The file is in use by another program");
    } finally {
      await hold.release();
    }
  });

  test("A memory refusal says what didn't fit, and offers a smaller page and the setting", () => {
    const refused = {
      error: guard.describePageRefusal({ offset: 0, rows: 1000, neededBytes: 3 * 2 ** 30, leftBytes: 2 ** 30 }),
      errorName: "QvdValidationError",
      errorReason: "memory",
      refusal: { rows: 1000, totalRows: 30000000, fitRows: 0, forCaller: false, neededBytes: 0, leftBytes: 0 },
    };

    const failure = describeReadFailure(refused, { filePath: "/data/huge.qvd" });
    assert.strictEqual(failure.kind, "memory");
    assert.strictEqual(failure.title, "Not enough memory to show these rows");
    assert.strictEqual(
      failure.summary,
      "Showing rows 1 to 1,000 needs about 3.0 GiB of memory, and about 1.0 GiB is left in what VS Code gives its extensions."
    );
    assert.ok(failure.advice.some((line) => line.includes("smaller page size")));
    assert.ok(
      failure.actions.some((action) => action.command === "openSettings" && action.setting === PAGE_SIZE_SETTING)
    );
    // No button reads a row count of its own: the grid's page size says how many
    assert.ok(failure.actions.every((action) => !("rows" in action)));
    assert.strictEqual(failure.dataOnly, true);
    // Not qvdjs's own advice, which a VS Code user can't follow
    const said = [failure.summary, ...failure.advice].join(" ");
    assert.ok(!said.includes("limit parameter") && !said.includes("max-old-space-size"));
  });

  test("An option refusal names pageSize only for a page's rows", () => {
    const refused = (errorOption) => ({
      error: `${errorOption} must be a number of 0 or more, not -1`,
      errorName: "QvdValidationError",
      errorReason: "option",
      errorOption,
    });
    const rows = describeReadFailure(refused("limit"), { filePath: "/data/sets.qvd" });
    assert.ok(rows.advice[0].includes(PAGE_SIZE_SETTING));
    assert.ok(rows.actions.some((action) => action.setting === PAGE_SIZE_SETTING));
    // A setting put right takes effect on a retry
    assert.ok(rows.actions.some((action) => action.command === "retry"));

    const cost = describeReadFailure(refused("bytesPerCell"), { filePath: "/data/sets.qvd" });
    assert.ok(cost.summary.includes("bytesPerCell"));
    assert.ok(!cost.advice.join(" ").includes(PAGE_SIZE_SETTING));
    assert.ok(!cost.actions.some((action) => action.command === "openSettings"));
    // No setting gives it, so a retry would fail the same way: it is a bug to report
    assert.deepStrictEqual(
      cost.actions.map((action) => action.command),
      ["showLogs", "reportIssue"]
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

  test("A file whose rows are damaged opens with its header, and its first page says why", async () => {
    for (const name of ["truncated", "lastByte", "badIndex"]) {
      const html = await pageFor(files[name]);
      assert.ok(isViewer(html), `${name} opens in the viewer`);
      // The schema tab has the header's fields, and the page reads no rows itself
      assert.ok(html.includes('"name":"set_num"') && html.includes('"name":"num_parts"'), name);
      assert.ok(!html.includes('class="read-failure"'), name);

      const answer = await firstPageFor(files[name]);
      assert.strictEqual(answer.command, "pageFailed", name);
      assert.strictEqual(answer.failure.kind, "damaged", name);
      assert.ok(answer.html.includes('data-kind="damaged"'), name);
      assert.ok(answer.html.includes("The file's header could still be read"), name);
      // Its header read, so it is a QVD: the notice doesn't suggest it might not be
      assert.ok(answer.html.includes("could read the header of"), name);
      assert.ok(!answer.html.includes("not a QVD") && !answer.html.includes("renamed .qvd"), name);
    }
  });

  test("A page too large for the memory left says so, with the page size to lower", async () => {
    // qvdjs's budget is known once a read has asked for it
    (await new QvdReader().read(colors, 1)).release();
    const release = guard.bookHeap(guard.knownBudget().bytes);
    let answer;
    try {
      answer = await firstPageFor(sets);
    } finally {
      release();
    }
    assert.strictEqual(answer.command, "pageFailed");
    assert.strictEqual(answer.failure.kind, "memory");
    assert.match(answer.failure.summary, /^Showing rows 1 to 100 needs about .+ of memory, and about .+ is left/);
    assert.ok(answer.html.includes(`data-setting="${PAGE_SIZE_SETTING}"`));
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
    // Nor can it send a form, or change where its links lead, as the viewer's pages can't
    assert.ok(html.includes("form-action 'none'; base-uri 'none';"));
    assert.ok(html.includes(`<script nonce="${nonce}">`));
    assert.ok(html.includes(`<style nonce="${nonce}">`));
    assert.strictEqual((html.match(/<script/g) ?? []).length, 1, "one script, the page's own");
    assert.ok(!html.includes("<b>sets</b>"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.ok(html.includes('data-command="retry"') && html.includes('data-command="showLogs"'));
    assert.ok(html.includes("wireFailureButtons(acquireVsCodeApi());"));
  });

  test("Retry shows the file again, as opening it would", async () => {
    const panel = { webview: recordingWebview() };
    const updates = [];
    const signal = new AbortController().signal;
    setupMessageHandler(panel, sets, new QvdReader(), {}, async (...update) => updates.push(update), null, signal);
    await panel.webview.listener({ command: "retry" });
    // A row count a page might send is no longer the viewer's to take
    await panel.webview.listener({ command: "retry", rows: 1200 });
    assert.deepStrictEqual(
      updates.map(([filePath, webview, options]) => [filePath, webview === panel.webview, options]),
      [
        [sets, true, { signal }],
        [sets, true, { signal }],
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
    setupMessageHandler(panel, sets, new QvdReader(), {}, async () => {}, null);
    try {
      api.commands.executeCommand = async (...command) => commands.push(command);
      logger.show = () => shown++;
      await panel.webview.listener({ command: "showLogs" });
      await panel.webview.listener({ command: "openSettings", setting: PAGE_SIZE_SETTING });
      // Only the extension's own settings
      await panel.webview.listener({ command: "openSettings", setting: "security.workspace.trust.enabled" });
      await panel.webview.listener({ command: "openSettings" });
    } finally {
      api.commands.executeCommand = executeCommand;
      logger.show = show;
    }
    assert.strictEqual(shown, 1);
    assert.deepStrictEqual(commands, [
      ["workbench.action.openSettings", PAGE_SIZE_SETTING],
      ["workbench.action.openSettings", "ctrl-q-qvd-viewer"],
      ["workbench.action.openSettings", "ctrl-q-qvd-viewer"],
    ]);
  });

  test("Retry opens a file that has turned up since", async () => {
    const late = path.join(dir, "late.qvd");
    const provider = realProvider();
    const webview = recordingWebview();
    await provider.updateWebview(late, webview);
    assertSays(webview.html, "missing", "The file can't be found");

    fs.copyFileSync(sets, late);
    setupMessageHandler(
      { webview },
      late,
      provider.qvdReader,
      provider.context,
      provider.updateWebview.bind(provider),
      null
    );
    await webview.listener({ command: "retry" });
    assert.ok(isViewer(webview.html));
    assert.ok(!webview.html.includes('class="read-failure"'));
  });

  test("A page the viewer can't build is the viewer's failure, not the file's", async () => {
    // sets.qvd reads, but this extension folder has none of the libraries its pages inline
    const html = await pageFor(sets, realProvider(files.noLibraries));
    assertSays(html, "viewer", "The viewer couldn't show this file");
    // The library's ENOENT is in the details, and isn't taken for the QVD's
    assert.ok(html.includes("ENOENT"));
    assert.ok(!html.includes(escapeHtml("The file can't be found")));

    const thrown = Object.assign(new Error("ENOENT: no such file, open 'tabulator.min.js'"), { code: "ENOENT" });
    const failure = describeViewerFailure(thrown, { filePath: sets });
    assert.strictEqual(failure.kind, "viewer");
    // The viewer's own failure is a bug, so its page has a button that reports one
    assert.deepStrictEqual(
      failure.actions.map((action) => action.command),
      ["retry", "showLogs", "reportIssue"]
    );
    assert.ok(html.includes('data-command="reportIssue"'));
  });

  test("Report Issue on a page opens the issue reporter, and Help the user guide", async () => {
    const api = await import("vscode");
    const executeCommand = api.commands.executeCommand;
    const panel = { webview: recordingWebview() };
    const commands = [];
    setupMessageHandler(panel, sets, new QvdReader(), {}, async () => {}, null);
    try {
      api.commands.executeCommand = async (...command) => commands.push(command);
      await panel.webview.listener({ command: "reportIssue" });
      await panel.webview.listener({ command: "openDocumentation" });
    } finally {
      api.commands.executeCommand = executeCommand;
    }
    assert.deepStrictEqual(commands, [["ctrl-q-qvd-viewer.reportIssue"], ["ctrl-q-qvd-viewer.openDocumentation"]]);
  });

  test("A damaged file's page that can't be built is the viewer's failure too", async () => {
    // Its header reads, so its rows' damage is for its first page to find
    const html = await pageFor(files.truncated, realProvider(files.noLibraries));
    assert.ok(!isViewer(html));
    assertSays(html, "viewer", "The viewer couldn't show this file");
  });

  test("Closing the editor while its header is read leaves the page alone", async () => {
    const closed = new AbortController();
    const header = await new QvdReader().readHeader(sets);
    const provider = realProvider();
    provider.qvdReader = {
      // The editor closes as the header arrives
      readHeader: async () => {
        closed.abort();
        return header;
      },
    };
    const webview = recordingWebview();
    webview.html = "<p>the page</p>";

    await provider.updateWebview(sets, webview, { signal: closed.signal });

    assert.strictEqual(webview.html, "<p>the page</p>");
  });

  test("Closing the editor while a header that fails is read leaves the page alone", async () => {
    const closed = new AbortController();
    const provider = realProvider();
    provider.qvdReader = {
      readHeader: async () => {
        closed.abort();
        throw Object.assign(new Error("The XML header contains no usable QvdTableHeader element"), {
          name: "QvdCorruptedError",
        });
      },
    };
    const webview = recordingWebview();
    webview.html = "<p>the page</p>";

    await provider.updateWebview(sets, webview, { signal: closed.signal });

    assert.strictEqual(webview.html, "<p>the page</p>");
  });

  test("A page set as its editor closes is given up, without a second try", async () => {
    const closed = new AbortController();
    const provider = realProvider();
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

    await provider.updateWebview(colors, webview, { signal: closed.signal });

    assert.strictEqual(tries, 1);
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
    // On Windows the file is held open instead of having its read permission taken
    if (process.platform !== "win32" && !canBeRefused) {
      this.skip();
    }
    this.timeout(HOLD_WAIT_MS + 30000);
    const reader = new QvdReader();
    const read = await reader.read(files.kept, 10);
    assert.strictEqual(read.errorName, "QvdCorruptedError");

    // The file can't be opened now, but it is the same version: the header the read kept is used
    const reopenable = await makeUnopenable(files.kept);
    try {
      const header = await reader.readHeader(files.kept);
      assert.strictEqual(header.totalRows, 11673);
      assert.deepStrictEqual(header.columns, ["set_num", "name", "year", "theme_id", "num_parts"]);
      // Each caller gets a copy, so the one kept can't be changed
      header.metadata.fields.length = 0;
      assert.strictEqual((await reader.readHeader(files.kept)).metadata.fields.length, 5);
    } finally {
      await reopenable();
    }
  });
});
