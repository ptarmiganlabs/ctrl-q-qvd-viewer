const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const vscode = require("vscode");
const { recordingWebview } = require("./fakes");
// The one table of escapes, from the file the extension imports and the page inlines
const { HTML_ESCAPES } = require("../src/webview/client/html.js");

// qvdjs's writer, for the crafted file, and the modules that put its text into pages
let QvdDataFrame;
let QvdReader;
let QvdEditorProvider;
let getVisualAnalysisHtml;
let getHtmlForWebview;
let getErrorHtml;
let failureNoticeHtml;
let createPageServer;
let profileFields;
let escapeHtml;
let html;
let trustedHtml;
let scriptJson;
let markdownText;
let setupMessageHandler;
let metricHelpContent;
let createHelpIconHtml;
let helpIconsHtml;

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

// A file with nothing to escape, whose fields get each of the profiling cards: numbers,
// dates, and strings that are email addresses, duplicates, prefixes and suffixes
const PLAIN_FIELDS = ["Amount", "When", "Name"];
const PLAIN = Array.from({ length: 30 }, (_, i) => ({
  Amount: i * 1.5,
  When: `2024-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
  Name: `user${i % 5}@example.com`,
}));
// Plain strings of each format the profiler detects, some of them blank, and a field
// mostly null: profiled with a limit of 4 unique values, their cards show each of the
// parts the cards above don't, from issues and warnings to a truncated distribution
const CONTACTS = ["user@example.com", "555-123-4567", "https://example.com/page", "123-45-6789", "01/02/2024", "", ""];
const BRANCHED_FIELDS = ["Contact", "Sparse"];
const BRANCHED = Array.from({ length: 40 }, (_, i) => ({
  Contact: CONTACTS[i % CONTACTS.length],
  Sparse: i % 4 === 0 ? `v${i % 3}` : null,
}));
const BRANCHED_LIMIT = 4;
// Those parts, as the cards show them
const PARTS = [
  "quality-issue-item error",
  "quality-issue-item warning",
  "Empty Strings",
  "Duplicated Distinct Values",
  "Top Duplicated Values:",
  "Phone Numbers",
  "SSN/ID Numbers",
  "URLs",
  "Date Strings",
  "Sample Phone Numbers:",
  "Sample URLs:",
  `Showing top ${BRANCHED_LIMIT} unique values`,
];
// Markup shown as text: what a literal that isn't html\`...\` gives, put into one that is
const ESCAPED_TAG = /&lt;\/?[a-z]/i;
// The cards each kind of field gets
const CARDS = ["📈 Statistical Analysis", "📅 Temporal Analysis", "📝 String Analysis", "🎯 Data Quality Assessment"];

/**
 * The plain files' fields, profiled as the extension does it: between them, they get
 * every card and every part of one
 * @returns {Array<object>} Each field's result
 */
function plainFields() {
  return [
    ...profileFields(PLAIN, PLAIN_FIELDS).fields,
    ...profileFields(BRANCHED, BRANCHED_FIELDS, BRANCHED_LIMIT).fields,
  ];
}

/**
 * Open a file the way the editor does
 * @param {string} filePath - The file
 * @returns {Promise<{html: string, messages: Array<object>}>} The page, and what was posted to it
 */
async function openPage(filePath) {
  const messages = [];
  const webview = recordingWebview(messages);
  const provider = new QvdEditorProvider({ extensionPath: root, extensionUri: vscode.Uri.file(root) });
  await provider.updateWebview(filePath, webview);
  return { html: webview.html, messages };
}

/**
 * Answer the page's requests for pages of a file, as the editor does
 * @param {object} page - The page, as fakePage() makes it
 * @param {string} filePath - The file
 * @returns {Promise<Array<object>>} What the extension posted back, once each request is answered
 */
async function answerPages(page, filePath) {
  const messages = [];
  const pages = createPageServer({ filePath, webview: recordingWebview(messages) });
  try {
    for (const request of page.posted.filter((message) => message.command === "page")) {
      await pages.servePage(request);
    }
  } finally {
    await pages.close();
  }
  for (const message of messages) {
    page.dispatch("message", { data: message });
  }
  return messages;
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
 * A page's markup, without its scripts: each is cut where scriptsOf() finds it, from
 * its start tag to the end of the first </script after it, as the HTML parser cuts it
 * @param {string} html - The page
 * @returns {string} Its markup
 */
function markupOf(html) {
  const lower = html.toLowerCase();
  const pieces = [];
  let from = 0;
  for (let start = lower.indexOf("<script", from); start >= 0; start = lower.indexOf("<script", from)) {
    pieces.push(html.slice(from, start));
    const end = lower.indexOf("</script", start);
    assert.ok(end >= 0, "each script ends");
    from = lower.indexOf(">", end) + 1;
    assert.ok(from > 0, "each script's end tag ends");
  }
  pieces.push(html.slice(from));
  return pieces.join("");
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
  const page = { written: [], untagged: [], created: [], tables: [], posted: [], listeners: {}, elements: new Map() };
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
      append(...children) {
        this.children.push(...children);
      },
      replaceChildren(...children) {
        this.children = children;
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
        // HTML the page's script wrote other than with html\`...\`, whose values it escapes
        if (html !== "" && value?.constructor?.name !== "HtmlMarkup") {
          page.untagged.push(html);
        }
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
      setPage() {}
      getPage() {
        return 1;
      }
    },
    Chart: class {
      destroy() {}
    },
    acquireVsCodeApi: () => ({ postMessage: (message) => page.posted.push(message) }),
    getComputedStyle: () => ({ backgroundColor: "rgb(30, 30, 30)", getPropertyValue: () => "#cccccc" }),
    setTimeout: () => 0,
    clearTimeout: () => {},
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
    ({ getHtmlForWebview } = await import("../src/webview/templates/mainTemplate.mjs"));
    ({ getErrorHtml, failureNoticeHtml } = await import("../src/webview/templates/errorTemplate.mjs"));
    ({ createPageServer } = await import("../src/webview/pageServer.mjs"));
    ({ profileFields } = await import("../src/qvdProfiler.mjs"));
    ({ escapeHtml, html, trustedHtml, scriptJson, markdownText } = await import("../src/webview/templates/escaping.mjs"));
    ({ setupMessageHandler } = await import("../src/webview/messageHandler.mjs"));
    ({ metricHelpContent, createHelpIconHtml, helpIconsHtml } = await import("../src/webview/qualityMetricHelp.mjs"));

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
    // What JSON has no literal for, the script reads as undefined, as it did before
    for (const value of [undefined, () => 1]) {
      assert.strictEqual(scriptJson(value), "undefined");
    }
  });

  test("html escapes every value put into it, but not the HTML it made", () => {
    assert.strictEqual(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#039;");
    // The characters in the table, and no others
    for (let code = 0; code < 128; code++) {
      const c = String.fromCharCode(code);
      assert.strictEqual(escapeHtml(c), HTML_ESCAPES[c] ?? c, `character ${code}`);
    }
    // And whatever the table holds: with ], \, ^ and - in it too, which mean something
    // else in a regex's character class, each character is escaped as the table says
    const source = fs.readFileSync(path.join(root, "src", "webview", "client", "html.js"), "utf8");
    const entry = `"'": "&#039;",`;
    assert.ok(source.includes(entry), "the table ends with the apostrophe");
    const wider = vm.createContext({});
    vm.runInContext(source.replace(entry, `${entry} "]": "&#93;", "\\\\": "&#92;", "^": "&#94;", "-": "&#45;",`), wider);
    const [table, escape] = vm.runInContext("[HTML_ESCAPES, escapeHtml]", wider);
    assert.strictEqual(Object.keys(table).length, 9);
    for (let code = 0; code < 128; code++) {
      const c = String.fromCharCode(code);
      assert.strictEqual(escape(c), table[c] ?? c, `character ${code}, with more in the table`);
    }
    assert.strictEqual(String(html`<p title="${VALUE}">${EMAIL}</p>`), `<p title="${escapeHtml(VALUE)}">${escapeHtml(EMAIL)}</p>`);
    for (const value of [null, undefined, 0, 42, false]) {
      assert.strictEqual(String(html`<b>${value}</b>`), `<b>${String(value)}</b>`);
    }
    // HTML it made, lists of it, and what trustedHtml() vouches for go in as they are
    const items = [EMAIL, VALUE].map((value) => html`<li>${value}</li>`);
    assert.strictEqual(
      String(html`<ul>${items}</ul>`),
      `<ul><li>${escapeHtml(EMAIL)}</li><li>${escapeHtml(VALUE)}</li></ul>`
    );
    assert.strictEqual(String(html`${trustedHtml("<hr>")}${[VALUE]}`), `<hr>${escapeHtml(VALUE)}`);
    // A string of HTML isn't HTML to it: it is text
    assert.strictEqual(String(html`${"<hr>"}`), "&lt;hr&gt;");
  });

  test("markdownText() writes text that can't change a Markdown report's structure, or add to it", () => {
    const cases = [
      ["a|b", "a\\|b"],
      ["back\\slash", "back\\\\slash"],
      ['<img src="https://tracker.example/x">', '\\<img src="https://tracker.example/x">'],
      ["![i](https://tracker.example/y)", "!\\[i\\](https://tracker.example/y)"],
      ["AT&T", "AT\\&T"],
      [`one\r\ntwo\nthree\rfour${LS}five${PS}six${String.fromCharCode(0x85)}`, "one two three four five six "],
      [42, "42"],
      [null, "null"],
    ];
    for (const [text, markdown] of cases) {
      assert.strictEqual(markdownText(text), markdown, String(text));
    }
  });

  test("The editor page's escapeHtml() and html are the extension's", () => {
    // The page inlines the file the extension imports, as it is
    const shipped = fs.readFileSync(path.join(root, "dist", "webview", "html.js"), "utf8");
    assert.strictEqual(shipped, fs.readFileSync(path.join(root, "src", "webview", "client", "html.js"), "utf8"));
    assert.ok(!/<\/script|<!--/i.test(shipped), "it can't end the script it is inlined in");
    const context = vm.createContext({});
    vm.runInContext(shipped, context);
    const page = vm.runInContext("({ escapeHtml, html, trustedHtml })", context);
    for (const text of [...MARKUP, `&<>"'`, "plain", 42, null]) {
      assert.strictEqual(page.escapeHtml(text), escapeHtml(text), String(text));
      assert.strictEqual(String(page.html`<b>${text}</b>`), String(html`<b>${text}</b>`), String(text));
    }
  });

  test("A help icon escapes its text and its link, and the editor page gets the extension's", () => {
    metricHelpContent.craftedForTest = { text: COMMENT, link: `https://example.com/?a="b"&c=${VALUE}` };
    try {
      const icon = String(createHelpIconHtml("craftedForTest"));
      assertNoMarkupFrom(icon);
      assert.ok(icon.includes(escapeHtml(COMMENT)), icon);
      assert.ok(icon.includes(`href="https://example.com/?a=&quot;b&quot;&amp;c=${escapeHtml(VALUE)}"`), icon);
      assert.strictEqual(helpIconsHtml().craftedForTest, icon);
    } finally {
      delete metricHelpContent.craftedForTest;
    }
    assert.strictEqual(String(createHelpIconHtml("noSuchMetric")), "");
    assert.deepStrictEqual(Object.keys(helpIconsHtml()), Object.keys(metricHelpContent));
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
    // Tabulator, Chart.js, the histogram view, the Data tab's grid and the page's own
    assertScriptsWhole(html, 5);
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
    // Its help icons are the extension's
    assert.deepStrictEqual(page.read("HELP_ICONS"), helpIconsHtml());
  });

  test("The editor page writes the file's field names and values into the page as text", async () => {
    const { html, messages } = await openPage(crafted);
    const page = fakePage();
    page.load(html);
    page.dispatch("DOMContentLoaded");
    assert.deepStrictEqual(messages, [], "nothing is sent until the grid asks");

    // The grid asks for its first page, as Tabulator's remote pagination does, and
    // takes the rows as the extension sends them
    const table = page.tables.find((built) => built.options.paginationMode === "remote");
    assert.ok(table, "the Data tab's grid pages remotely");
    const loaded = table.options.ajaxRequestFunc("qvd:rows", {}, { page: 1, size: 100 });
    // As JSON, which is how VS Code sends it: the page's objects are its own realm's.
    // With the version of the file the page was made from
    const headerKey = page.read("headerKey");
    assert.strictEqual(typeof headerKey, "string");
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(page.posted.filter((message) => message.command === "page"))),
      [{ command: "page", requestId: 1, offset: 0, limit: 100, headerKey }]
    );
    const answers = await answerPages(page, crafted);
    assert.strictEqual(answers.at(-1).command, "pageRows", "the rows are sent");
    const shownRows = JSON.parse(JSON.stringify((await loaded).data));
    assert.deepStrictEqual(
      shownRows.map((row) => [row.c0, row.c1]),
      rows.slice(0, 100).map((row) => [row[FIELD], row.Id])
    );

    // Each column's title is its field's name, which goes into the header as a text
    // node; the cells are Tabulator's plaintext, which escapes them
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
    // Each column is keyed by its field's place in the file, never by its name,
    // which Tabulator would read as a path, and an object would put first if it were a number
    assert.deepStrictEqual(
      columns.map((column) => column.field),
      ["c0", "c1"]
    );
    assert.strictEqual(table.options.nestedFieldSeparator, false);

    // Profiled as the extension does it, the field's markup is in its prefixes,
    // suffixes, email addresses and duplicates
    const results = profileFields(rows, [FIELD, "Id"]);
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

    // What the cards write
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
    // All the HTML the page wrote, since it loaded, written with html\`...\`, which
    // escapes each value
    assert.deepStrictEqual(page.untagged, []);
    // With nothing gone wrong on the page
    assert.deepStrictEqual(
      page.posted.filter((message) => message.level === "error").map((message) => message.message),
      []
    );
  });

  test("The editor page writes each profiling card with html, and none shows markup as text", async () => {
    const { html: pageHtml } = await openPage(crafted);
    const page = fakePage();
    page.load(pageHtml);
    page.dispatch("DOMContentLoaded");
    const fields = plainFields();
    assert.deepStrictEqual(
      fields.map(({ isNumeric, isDate, isString, truncated }) => [isNumeric, isDate, isString, truncated]),
      [
        [true, false, false, false],
        [false, true, false, false],
        [false, false, true, false],
        [false, false, true, true],
        [false, false, true, false],
      ]
    );

    // What the cards write
    page.written.length = 0;
    page.dispatch("message", { data: { command: "profilingResults", results: { fields } } });
    assert.match(page.elements.get("profiling-status").textContent, /^✅ Profiling complete/);
    const written = page.written.join("\n");
    for (const part of [...CARDS, ...PARTS]) {
      assert.ok(written.includes(part), part);
    }
    // All the HTML the page wrote, since it loaded, html\`...\`, and each piece inside
    // it too: a literal that isn't would be escaped, and show its markup as text
    assert.deepStrictEqual(page.untagged, []);
    assert.doesNotMatch(written, ESCAPED_TAG);
    assert.ok(written.includes(String(createHelpIconHtml("temporalEarliest"))), "help icons go in as HTML");
    assert.ok(written.includes(`<div style="padding: 2px 0;">user0@example.com</div>`), "the samples are listed");
    assert.ok(written.includes(`<div style="padding: 2px 0;">555-123-4567</div>`), "the samples are listed");
    assert.deepStrictEqual(
      page.posted.filter((message) => message.level === "error").map((message) => message.message),
      []
    );
  });

  test("The editor page and the read-failure notice write their own markup with html, and none shows as text", () => {
    // A failure, a header and rows with nothing to escape, in every case the pages
    // write markup for: the grid's status, too many rows to profile lightly, rows
    // that couldn't be read, lineage or none, and the error page
    const failure = {
      kind: "memory",
      title: "Not enough memory",
      summary: "The rows didn't fit",
      advice: ["Close other files", "Try fewer rows"],
      actions: [
        { command: "retry", label: "Retry" },
        { command: "showLogs", label: "Show Logs" },
        { command: "openSetting", label: "Settings", setting: "ctrl-q-qvd-viewer.maxPreviewRows" },
      ],
      detail: "Error: out of memory",
    };
    const metadata = {
      fields: [{ name: "Amount", noOfSymbols: 3 }],
      tableName: "Plain",
      offset: 0,
      length: 0,
      lineage: [{ Discriminator: "STORE;", Statement: "LOAD 1" }],
    };
    const webview = recordingWebview();
    const context = { extensionPath: root, extensionUri: vscode.Uri.file(root) };
    const markup = [
      getHtmlForWebview({ metadata, columns: ["Amount"], totalRows: 200000, fileSize: 10 }, webview, context),
      getHtmlForWebview({ metadata: { ...metadata, lineage: [] }, columns: ["Amount"], totalRows: 1, fileSize: 10 }, webview, context),
      // As a page that failed says why, in the Data tab
      String(failureNoticeHtml(failure, { headerShown: true, heading: "h3" })),
      getErrorHtml(failure),
    ]
      .map(markupOf)
      .join("\n");

    // Each part of it is there as markup, and none of it as text, which a literal
    // that isn't html\`...\` would give, put into one that is
    const parts = [
      'id="data-grid-status"',
      '<div class="export-dropdown-item" data-format="csv">',
      '<div class="export-dropdown-separator">',
      '<span class="beta-badge">BETA</span>',
      'class="info-banner warning-banner"',
      '<div class="field-checkbox-item">',
      'id="lineage-search"',
      "No lineage information available",
      "<p>The file's header could still be read",
      '<ul class="read-failure-advice">',
      "<li>Close other files</li>",
      'data-setting="ctrl-q-qvd-viewer.maxPreviewRows"',
      "<pre>Error: out of memory</pre>",
    ];
    for (const part of parts) {
      assert.ok(markup.includes(part), part);
    }
    assert.doesNotMatch(markup, ESCAPED_TAG);
  });

  test("The visual-analysis panel shows a field's result as text, and its script reads it whole", () => {
    const [fieldResult] = profileFields(rows, [FIELD]).fields;
    const html = getVisualAnalysisHtml(root, fieldResult, "<b>crafted</b>");

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

  test("The visual-analysis panel writes each card with html, and none shows markup as text", () => {
    const bodies = plainFields().map((fieldResult) => {
      const page = getVisualAnalysisHtml(root, fieldResult, "plain.qvd");
      const body = page.slice(page.indexOf("<body>"), page.indexOf("<script"));
      assert.ok(
        CARDS.slice(0, 3).some((card) => body.includes(card)),
        `${fieldResult.fieldName} gets its card`
      );
      assert.ok(body.includes(CARDS[3]), `${fieldResult.fieldName} gets the quality card`);
      assert.doesNotMatch(body, ESCAPED_TAG, fieldResult.fieldName);
      assert.ok(body.includes(String(createHelpIconHtml("totalRowsProfiling"))), "help icons go in as HTML");
      return body;
    });
    // Between them, every part of a card
    for (const part of PARTS) {
      assert.ok(
        bodies.some((body) => body.includes(part)),
        part
      );
    }
  });

  test("The Markdown report shows a field's name and values as text, one row each", async () => {
    // A field whose name and values would add rows, columns, markup, links and images
    const name = "Name|<b>x</b>\n# Heading";
    const values = ["a|b", "ends\\", "line\nbreak", '<img src="https://tracker.example/x">', "![i](https://tracker.example/y)"];
    const [fieldResult] = profileFields(
      values.map((value) => ({ [name]: value })),
      [name]
    ).fields;

    // The report is an untitled document, opened beside the viewer: it is read as
    // VS Code opened it, then closed
    const panel = { webview: recordingWebview() };
    const opened = [];
    const errors = [];
    const { showErrorMessage } = vscode.window;
    const listening = vscode.workspace.onDidOpenTextDocument((document) => opened.push(document));
    try {
      vscode.window.showErrorMessage = async (message) => {
        errors.push(message);
        return undefined;
      };
      setupMessageHandler(panel, path.join(dir, "a|<i>b.qvd"), new QvdReader(), {}, async () => {}, null);
      await panel.webview.listener({ command: "openProfilingInWindow", fieldResult, displayType: "markdown" });
    } finally {
      listening.dispose();
      vscode.window.showErrorMessage = showErrorMessage;
    }
    const reports = opened.filter((document) => document.isUntitled && document.languageId === "markdown");
    try {
      assert.deepStrictEqual(errors, []);
      assert.strictEqual(reports.length, 1);
      const report = reports[0].getText();
      const lines = report.split("\n");
      // The heading and the source are one line each, their text escaped
      assert.strictEqual(lines[0], `# Profiling: ${markdownText(name)}`);
      assert.strictEqual(lines[2], `**Source:** ${markdownText("a|<i>b.qvd")}`);
      // Each value is one row of three columns, its text escaped
      for (const value of values) {
        const row = lines.find((line) => line.startsWith(`| ${markdownText(value)} |`));
        assert.ok(row, value);
        assert.strictEqual(row.match(/(?<!\\)\|/g).length, 4, row);
      }
      // And nothing in the report is markup, a link or an image
      assert.doesNotMatch(report, /(?<!\\)[<[]/);
    } finally {
      for (const document of reports) {
        await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
      }
    }
  });
});
