const assert = require("assert");
const path = require("path");
const vscode = require("vscode");
const { recordingWebview } = require("./fakes");

let AboutPanel;
let externalLink;
let linkForLog;
let repositoryPage;
let logger;

const root = path.join(__dirname, "..");
const context = { extensionUri: vscode.Uri.file(root) };

/**
 * A webview panel that keeps the page it is given, and the listener its webview gets
 * @returns {object} The panel
 */
function fakePanel() {
  return {
    webview: recordingWebview(),
    title: "",
    onDidDispose: () => ({ dispose: () => {} }),
    reveal() {},
    dispose() {},
  };
}

suite("About Panel Test Suite", () => {
  suiteSetup(async () => {
    ({ default: AboutPanel, externalLink, linkForLog, repositoryPage } = await import("../src/aboutPanel.mjs"));
    ({ default: logger } = await import("../src/logger.mjs"));
  });

  test("Only a web page at an https: address is a link to open", () => {
    for (const url of ["https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer.git", "https://ptarmiganlabs.com"]) {
      assert.strictEqual(externalLink(url)?.scheme, "https", url);
    }
    const refused = [
      "http://ptarmiganlabs.com",
      "file:///etc/passwd",
      "command:workbench.action.terminal.new",
      "vscode://settings/ctrl-q-qvd-viewer",
      "javascript:alert(1)",
      "https:no-authority",
      "ptarmiganlabs.com",
      "",
      undefined,
      42,
      { toString: () => "https://ptarmiganlabs.com" },
    ];
    for (const url of refused) {
      assert.strictEqual(externalLink(url), null, String(url));
    }
  });

  test("The repository's button opens its web page, however npm writes its URL", () => {
    const page = "https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer";
    for (const url of [`${page}.git`, `git+${page}.git`, `git+${page}`, page]) {
      assert.strictEqual(repositoryPage(url), page, url);
    }
    assert.ok(externalLink(repositoryPage(`git+${page}.git`)), "a page the panel opens");
  });

  test("A refused link goes into the log quoted, on one line, and cut short", () => {
    assert.strictEqual(linkForLog("file:///etc/passwd"), '"file:///etc/passwd"');
    assert.strictEqual(linkForLog("a\nERROR forged line"), '"a\\nERROR forged line"');
    assert.strictEqual(linkForLog(undefined), '"undefined"');
    // What JSON leaves as it is but a log viewer may break a line at, or reorder text by:
    // NEL, another C1 control, the line and paragraph separators, and a bidi override
    const unsafe = [0x85, 0x9b, 0x2028, 0x2029, 0x202e].map((code) => String.fromCharCode(code));
    assert.strictEqual(
      linkForLog(`a${unsafe.join("b")}c`),
      '"a\\u0085b\\u009bb\\u2028b\\u2029b\\u202ec"'
    );
    // 200 characters, quoted, then an ellipsis
    const long = linkForLog(`https://example.com/${"x".repeat(1000)}`);
    assert.strictEqual(long.length, 203);
    assert.ok(long.startsWith('"https://example.com/xxx') && long.endsWith('x"…'), long);
    // Cut by character, so a character outside the BMP isn't cut in two
    const emoji = linkForLog("😀".repeat(300));
    assert.strictEqual(emoji, `"${"😀".repeat(200)}"…`);
    assert.strictEqual(linkForLog("😀".repeat(200)), `"${"😀".repeat(200)}"`);
  });

  test("The About page runs only its own script and style, and its links open web pages only", async () => {
    const api = await import("vscode");
    const panel = fakePanel();
    const about = new AboutPanel(panel, context);
    try {
      const html = await about._getHtmlContent();
      const nonce = /script-src 'nonce-([A-Za-z0-9]+)'/.exec(html)?.[1];
      assert.ok(nonce, "the CSP runs scripts by nonce");
      assert.ok(
        html.includes(
          `default-src 'none'; style-src-elem 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; script-src 'nonce-${nonce}';`
        )
      );
      assert.ok(html.includes("form-action 'none'; base-uri 'none';"));
      assert.deepStrictEqual(html.match(/<script\b[^>]*>/gi), [`<script nonce="${nonce}">`]);
      assert.deepStrictEqual(html.match(/<style\b[^>]*>/gi), [`<style nonce="${nonce}">`]);
      // An event handler in the markup is a script the CSP won't run
      assert.ok(!/\son[a-z]+\s*=/i.test(html), "no event handlers in the markup");
      const urls = [...html.matchAll(/data-url="([^"]*)"/g)].map(([, url]) => url);
      assert.strictEqual(urls.length, 11);
      // The repository's web page, not its clone's .git address
      assert.ok(urls.includes("https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer"), urls.join(" "));
      assert.ok(
        urls.every((url) => externalLink(url)),
        urls.join(" ")
      );

      // The panel opens what its links ask for, and nothing else, and says so in the log
      const opened = [];
      const warned = [];
      const openExternal = api.env.openExternal;
      const warn = logger.warn;
      try {
        api.env.openExternal = async (uri) => {
          opened.push(uri.toString());
          return true;
        };
        logger.warn = (message) => warned.push(message);
        for (const url of [urls[0], "file:///etc/passwd", "command:x\nERROR forged line"]) {
          panel.webview.listener({ command: "openExternal", url });
        }
      } finally {
        api.env.openExternal = openExternal;
        logger.warn = warn;
      }
      assert.deepStrictEqual(opened, [vscode.Uri.parse(urls[0]).toString()]);
      assert.strictEqual(warned.length, 2);
      assert.ok(warned[0].endsWith('"file:///etc/passwd"'), warned[0]);
      assert.ok(!warned[1].includes("\n"), warned[1]);
    } finally {
      about.dispose();
    }
  });

  test("The About page can load the extension's media, and nothing else of its or the workspace's", async () => {
    const api = await import("vscode");
    const createWebviewPanel = api.window.createWebviewPanel;
    let options;
    try {
      api.window.createWebviewPanel = (viewType, title, column, given) => {
        options = given;
        return fakePanel();
      };
      AboutPanel.show(context);
    } finally {
      api.window.createWebviewPanel = createWebviewPanel;
      AboutPanel.currentPanel?.dispose();
    }
    assert.deepStrictEqual(
      options.localResourceRoots.map((uri) => uri.toString()),
      [vscode.Uri.joinPath(context.extensionUri, "media").toString()]
    );
  });
});
