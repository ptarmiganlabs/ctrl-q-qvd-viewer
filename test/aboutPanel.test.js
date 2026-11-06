const assert = require("assert");
const path = require("path");
const vscode = require("vscode");
const { recordingWebview } = require("./fakes");

let AboutPanel;
let externalLink;

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
    ({ default: AboutPanel, externalLink } = await import("../src/aboutPanel.mjs"));
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
      assert.ok(
        urls.every((url) => externalLink(url)),
        urls.join(" ")
      );

      // The panel opens what its links ask for, and nothing else
      const opened = [];
      const openExternal = api.env.openExternal;
      try {
        api.env.openExternal = async (uri) => {
          opened.push(uri.toString());
          return true;
        };
        for (const url of [urls[0], "file:///etc/passwd", "command:workbench.action.terminal.new"]) {
          panel.webview.listener({ command: "openExternal", url });
        }
      } finally {
        api.env.openExternal = openExternal;
      }
      assert.deepStrictEqual(opened, [vscode.Uri.parse(urls[0]).toString()]);
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
