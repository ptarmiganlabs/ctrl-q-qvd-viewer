const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const vscode = require("vscode");
const { recordingWebview } = require("./fakes");

// qvdjs's writer, for the crafted file, and the modules that put its text into pages
let QvdDataFrame;
let QvdReader;
let QvdEditorProvider;
let getVisualAnalysisHtml;
let profileFields;
let escapeHtml;
let scriptJson;
let ESCAPE_HTML_JS;

const root = path.join(__dirname, "..");

// U+2028 and U+2029, which JSON allows in a string and JavaScript before ES2019 doesn't
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

// What a crafted QVD's header says: a field named with a style element that hides the
// viewer's tabs; a field comment that ends a script and starts markup of its own; a
// table name that ends a script; and a table comment, creator document and lineage
// statement that change where the HTML parser ends one
const FIELD = "<style>.tabs{display:none!important}</style>Amount";
const COMMENT = '</script><h1 id="injected-comment">Injected</h1>';
const TABLE_NAME = "</script>";
const ESCAPE = "<!--<script>";
const STATEMENT = "</SCRIPT ><b>lineage</b>";
// What its rows say: an email address that is also a common prefix, suffix and
// duplicate full of markup, a duplicate that ends a script, and line separators
const EMAIL = "<b>me</b>@example.<i>com</i>";
const VALUE = '</script><img id="injected-value">';
const LINES = `two${LS}lines${PS}`;
const ROWS = [
  [EMAIL, 1],
  [EMAIL, 2],
  [EMAIL, 3],
  [VALUE, 4],
  [VALUE, 5],
  [LINES, 6],
];
// The file's text that would be markup in a page, were it not escaped
const MARKUP = [FIELD, COMMENT, ESCAPE, STATEMENT, EMAIL, VALUE];

/**
 * Open a file the way the editor does
 * @param {string} filePath - The file
 * @returns {Promise<{html: string, messages: Array<object>}>} The page, and what was posted to it
 */
async function openPage(filePath) {
  const messages = [];
  const webview = recordingWebview(messages);
  const provider = new QvdEditorProvider({ extensionPath: root, extensionUri: vscode.Uri.file(root) });
  const shown = await provider.updateWebview(filePath, webview, 5000);
  await shown?.rowsSent;
  return { html: webview.html, messages };
}

/**
 * The nonce a page's scripts and styles run by
 * @param {string} html - The page
 * @returns {string} The nonce
 */
function nonceOf(html) {
  const nonce = /script-src 'nonce-([A-Za-z0-9]+)'/.exec(html)?.[1];
  assert.ok(nonce, "the page's CSP runs scripts by nonce");
  return nonce;
}

/**
 * A page's script elements as the HTML parser finds them: each runs from its start
 * tag to the first </script after it, whatever that means to the script
 * @param {string} html - The page
 * @returns {Array<{tag: string, code: string}>} Its scripts
 */
function scriptsOf(html) {
  const lower = html.toLowerCase();
  const start = /<script\b[^>]*>/gi;
  const scripts = [];
  let match;
  while ((match = start.exec(html))) {
    const from = match.index + match[0].length;
    const end = lower.indexOf("</script", from);
    assert.ok(end >= 0, "each script ends");
    scripts.push({ tag: match[0], code: html.slice(from, end) });
    start.lastIndex = end;
  }
  return scripts;
}

/**
 * Check that a page has its own scripts and no others, each whole: none ended early,
 * none without the nonce, and each parses
 * @param {string} html - The page
 * @param {number} count - Its own scripts
 */
function assertScriptsWhole(html, count) {
  const nonce = nonceOf(html);
  const scripts = scriptsOf(html);
  assert.strictEqual(scripts.length, count, "the page's own scripts, and no more");
  scripts.forEach(({ tag, code }, index) => {
    assert.strictEqual(tag, `<script nonce="${nonce}">`, `script ${index} runs by nonce`);
    // After a <!--, the HTML parser may not end a script where the script ends
    assert.ok(!code.includes("<!--"), `script ${index} has no <!--`);
    assert.ok(!code.includes(LS) && !code.includes(PS), `script ${index} has no line separators`);
    assert.doesNotThrow(() => new vm.Script(code, { filename: `script ${index}` }), `script ${index} parses`);
  });
  assert.strictEqual((html.match(/<\/script/gi) ?? []).length, count, "no script is ended twice");
}

/**
 * Check that HTML has none of the file's text that would be markup, but escaped
 * @param {string} html - The HTML
 */
function assertNoMarkupFrom(html) {
  for (const text of MARKUP) {
    assert.ok(!html.includes(text), `${text} is only there escaped`);
  }
}

/**
 * Check that a page lets only its own style element style it, and can't send a form or
 * change its base
 * @param {string} html - The page
 */
function assertStrictCsp(html) {
  const nonce = nonceOf(html);
  assert.ok(html.includes(`style-src-elem 'nonce-${nonce}';`), "style elements by nonce only");
  assert.ok(html.includes("form-action 'none'; base-uri 'none';"));
  assert.ok(!/style-src(-elem)? [^;]*'unsafe-inline'/.test(html), "no style element without the nonce");
  assert.deepStrictEqual(html.match(/<style\b[^>]*>/gi), [`<style nonce="${nonce}">`], "one style element, the page's own");
}

/**
 * A page for a webview's own scripts to run in: just enough of the DOM, Tabulator and
 * Chart.js for them. It keeps the HTML they write, the elements they make, the tables
 * they build and what they post to the extension.
 * @returns {object} The page
 */
function fakePage() {
  const page = { written: [], created: [], tables: [], posted: [], listeners: {}, elements: new Map() };
  const element = (tagName = "div") => {
    let html = "";
    const el = {
      tagName: tagName.toUpperCase(),
      style: {},
      dataset: {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      children: [],
      textContent: "",
      value: "",
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      addEventListener() {},
      querySelector: () => element(),
      querySelectorAll: () => [],
      getContext: () => ({}),
      getAttribute: () => null,
      getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }),
    };
    Object.defineProperty(el, "innerHTML", {
      get: () => html,
      set: (value) => {
        html = String(value);
        page.written.push(html);
      },
    });
    page.created.push(el);
    return el;
  };
  const document = {
    body: element("body"),
    getElementById(id) {
      if (!page.elements.has(id)) {
        page.elements.set(id, element());
      }
      return page.elements.get(id);
    },
    createElement: element,
    createTextNode: (data) => ({ nodeType: 3, data }),
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const context = vm.createContext({
    document,
    Tabulator: class {
      constructor(selector, options) {
        page.tables.push({ selector, options });
      }
      on() {}
      destroy() {}
      redraw() {}
      setFilter() {}
      clearFilter() {}
    },
    Chart: class {
      destroy() {}
    },
    acquireVsCodeApi: () => ({ postMessage: (message) => page.posted.push(message) }),
    getComputedStyle: () => ({ backgroundColor: "rgb(30, 30, 30)", getPropertyValue: () => "#cccccc" }),
    setTimeout: () => 0,
    innerWidth: 1200,
    console: { log() {}, warn() {}, error() {} },
    addEventListener: (type, listener) => (page.listeners[type] ??= []).push(listener),
  });
  context.window = context;
  // Each script the page runs after Tabulator's and Chart.js's, which are its first two
  page.load = (html) => {
    for (const { code } of scriptsOf(html).slice(2)) {
      vm.runInContext(code, context);
    }
  };
  page.dispatch = (type, event = {}) => (page.listeners[type] ?? []).forEach((listener) => listener(event));
  // A value of the page's script, as it reads it
  page.read = (name) => JSON.parse(vm.runInContext(`JSON.stringify(${name})`, context));
  return page;
}

suite("Page Escaping Test Suite", () => {
  let dir;
  let crafted;
  let rows;

  suiteSetup(async () => {
    ({ QvdDataFrame } = await import("qvdjs"));
    ({ default: QvdReader } = await import("../src/qvdReader.mjs"));
    ({ default: QvdEditorProvider } = await import("../src/qvdEditorProvider.mjs"));
    ({ getVisualAnalysisHtml } = await import("../src/webview/templates/visualAnalysisTemplate.mjs"));
    ({ profileFields } = await import("../src/qvdProfiler.mjs"));
    ({ escapeHtml, scriptJson, ESCAPE_HTML_JS } = await import("../src/webview/templates/escaping.mjs"));

    // The crafted file, written by qvdjs's own writer
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "qvd-viewer-escaping-"));
    crafted = path.join(dir, "crafted.qvd");
    const df = new QvdDataFrame(ROWS, [FIELD, "Id"]);
    df.setFieldMetadata(FIELD, { comment: COMMENT });
    df.setFileMetadata({
      tableName: TABLE_NAME,
      comment: `${ESCAPE}${LS}${PS}`,
      creatorDoc: ESCAPE,
      lineage: { LineageInfo: [{ Discriminator: "STORE;", Statement: STATEMENT }] },
    });
    await df.toQvd(crafted, { allowedDir: dir });

    const read = await new QvdReader().read(crafted, 0);
    assert.strictEqual(read.error, null);
    rows = read.data;
    read.release();
  });

  suiteTeardown(() => {
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("scriptJson() writes values that can't end a script, and the script reads them as they were", () => {
    const values = [COMMENT, TABLE_NAME, ESCAPE, STATEMENT, "</script\t>", LINES, `å & ' " 😀`, { [FIELD]: [VALUE, null, 1.5, true] }];
    for (const value of values) {
      const literal = scriptJson(value);
      assert.ok(!literal.includes("<"), literal);
      assert.ok(!literal.includes(LS) && !literal.includes(PS), literal);
      assert.deepStrictEqual(JSON.parse(vm.runInNewContext(`JSON.stringify(${literal})`)), value);
    }
  });

  test("The page's own escapeHtml() escapes as the extension's does", () => {
    const context = vm.createContext({});
    vm.runInContext(ESCAPE_HTML_JS, context);
    const pageEscapeHtml = vm.runInContext("escapeHtml", context);
    for (const text of [...MARKUP, `&<>"'`, "plain", 42, null]) {
      assert.strictEqual(pageEscapeHtml(text), escapeHtml(text), String(text));
    }
    assert.strictEqual(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#039;");
  });

  test("The file reads as it was written", () => {
    assert.deepStrictEqual(
      rows.map((row) => [row[FIELD], row.Id]),
      ROWS
    );
  });

  test("A QVD's header can't end the editor page's scripts, or add to its markup", async () => {
    const { html } = await openPage(crafted);
    assert.ok(html.includes("Ctrl-Q QVD File Viewer"), "the file opens in the viewer");
    // Tabulator, Chart.js, the histogram view and the page's own
    assertScriptsWhole(html, 4);
    assertNoMarkupFrom(html);
    assertStrictCsp(html);
    // The field list to profile names the field, as text
    assert.ok(html.includes(`value="${escapeHtml(FIELD)}"`));

    // The page's script reads the header as the file says it
    const page = fakePage();
    page.load(html);
    const [field] = page.read("schemaData");
    assert.strictEqual(field.name, FIELD);
    assert.strictEqual(field.comment, COMMENT);
    const metadata = Object.fromEntries(page.read("metadataData").map(({ key, value }) => [key, value]));
    assert.strictEqual(metadata["Table Name"], TABLE_NAME);
    assert.strictEqual(metadata["Comment"], `${ESCAPE}${LS}${PS}`);
    assert.strictEqual(metadata["Creator Document"], ESCAPE);
    assert.strictEqual(page.read("lineageData")[0].statement, STATEMENT);
    assert.deepStrictEqual(page.read("availableFields"), [FIELD, "Id"]);
  });

  test("The editor page writes the file's field names and values into the page as text", async () => {
    const { html, messages } = await openPage(crafted);
    const page = fakePage();
    page.load(html);
    page.dispatch("DOMContentLoaded");
    const initial = messages.find((message) => message.command === "loadInitialData");
    assert.ok(initial, "the rows are sent");
    page.dispatch("message", { data: initial });

    // Each column's title is its field's name, which goes into the header as a text
    // node; the cells are Tabulator's plaintext, which escapes them
    const table = page.tables.find((built) => built.selector === "#data-table");
    const columns = [...table.options.columns];
    assert.deepStrictEqual(
      columns.map((column) => column.title),
      [FIELD, "Id"]
    );
    assert.deepStrictEqual(
      columns.map((column) => column.titleFormatter()),
      [
        { nodeType: 3, data: FIELD },
        { nodeType: 3, data: "Id" },
      ]
    );
    assert.ok(columns.every((column) => column.formatter === undefined));

    // Profiled as the extension does it, the field's markup is in its prefixes,
    // suffixes, email addresses and duplicates
    const results = profileFields(initial.data, [FIELD, "Id"]);
    const strings = results.fields[0].stringAnalysis;
    const duplicates = results.fields[0].qualityMetrics.uniqueness.topDuplicates;
    const prefixes = strings.patterns.prefixes.slice(0, 5).map(({ prefix }) => prefix);
    const suffixes = strings.patterns.suffixes.slice(0, 5).map(({ suffix }) => suffix);
    const emails = strings.formatDetection.email.samples.slice(0, 3);
    assert.ok(prefixes.some((prefix) => prefix.startsWith("<b>")), prefixes.join(" "));
    assert.ok(suffixes.some((suffix) => suffix.endsWith("</i>")), suffixes.join(" "));
    assert.ok(emails.includes(EMAIL), emails.join(" "));
    assert.deepStrictEqual(
      duplicates.map(({ value }) => value),
      [EMAIL, VALUE]
    );

    page.written.length = 0;
    page.dispatch("message", { data: { command: "profilingResults", results } });
    assert.match(page.elements.get("profiling-status").textContent, /^✅ Profiling complete/);

    // Each card's heading is its field's name, as text
    assert.deepStrictEqual(
      page.created.filter((el) => el.tagName === "H3").map((heading) => heading.textContent),
      [`📊 ${FIELD}`, "📊 Id"]
    );
    // And the cards show the file's text escaped
    const written = page.written.join("\n");
    assertNoMarkupFrom(written);
    for (const prefix of prefixes) {
      assert.ok(written.includes(`"${escapeHtml(prefix)}"`), prefix);
    }
    for (const suffix of suffixes) {
      assert.ok(written.includes(`"${escapeHtml(suffix)}"`), suffix);
    }
    for (const email of emails) {
      assert.ok(written.includes(`>${escapeHtml(email)}</div>`), email);
    }
    for (const { value } of duplicates) {
      assert.ok(written.includes(`<span>${escapeHtml(value)}</span>`), value);
    }
    // With nothing gone wrong on the page
    assert.deepStrictEqual(
      page.posted.filter((message) => message.level === "error").map((message) => message.message),
      []
    );
  });

  test("The visual-analysis panel shows a field's result as text, and its script reads it whole", () => {
    const [fieldResult] = profileFields(rows, [FIELD]).fields;
    const html = getVisualAnalysisHtml(recordingWebview(), root, fieldResult, "<b>crafted</b>");

    // Tabulator, Chart.js, the histogram view and the page's own
    assertScriptsWhole(html, 4);
    assertNoMarkupFrom(html);
    assertStrictCsp(html);
    assert.ok(!html.includes("<b>crafted</b>"));
    assert.ok(html.includes(`<h1>📊 ${escapeHtml(FIELD)}</h1>`));
    for (const { value } of fieldResult.qualityMetrics.uniqueness.topDuplicates) {
      assert.ok(html.includes(`<span>${escapeHtml(value)}</span>`), value);
    }
    for (const { prefix } of fieldResult.stringAnalysis.patterns.prefixes.slice(0, 5)) {
      assert.ok(html.includes(`"${escapeHtml(prefix)}"`), prefix);
    }

    // Its script reads the result as the profiler gave it, and shows the values in a
    // table whose cells are Tabulator's plaintext, which escapes them
    const page = fakePage();
    page.load(html);
    assert.deepStrictEqual(page.read("fieldResult"), JSON.parse(JSON.stringify(fieldResult)));
    const table = page.tables.find((built) => built.selector === "#profiling-table");
    const value = [...table.options.columns].find((column) => column.field === "value");
    assert.strictEqual(value.formatter, undefined);
  });
});
