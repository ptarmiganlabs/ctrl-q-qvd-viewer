const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

let help;
let logger;

suite("Help Test Suite", () => {
  suiteSetup(async () => {
    help = await import("../src/help.mjs");
    ({ default: logger } = await import("../src/logger.mjs"));
  });

  test("The help links are the ones the Marketplace shows", () => {
    assert.strictEqual(help.EXTENSION_ID, `${packageJson.publisher}.${packageJson.name}`);
    assert.strictEqual(help.DOCUMENTATION_URL, packageJson.homepage);
    assert.strictEqual(help.ISSUES_URL, packageJson.bugs.url);
    assert.strictEqual(help.DISCUSSIONS_URL, packageJson.qna);
  });

  test("Each help command is in the Command Palette, and registered", async () => {
    const contributed = packageJson.contributes.commands.map((command) => command.command);
    const ext = vscode.extensions.getExtension(help.EXTENSION_ID);
    if (ext && !ext.isActive) {
      await ext.activate();
    }
    const registered = await vscode.commands.getCommands(true);
    for (const command of [
      "ctrl-q-qvd-viewer.openDocumentation",
      "ctrl-q-qvd-viewer.askQuestion",
      "ctrl-q-qvd-viewer.reportIssue",
    ]) {
      assert.ok(contributed.includes(command), `${command} is contributed`);
      assert.ok(registered.includes(command), `${command} is registered`);
    }
  });

  test("Open Documentation and Ask a Question open their pages", async () => {
    const api = await import("vscode");
    const openExternal = api.env.openExternal;
    const opened = [];
    try {
      api.env.openExternal = async (uri) => opened.push(uri.toString(true));
      await help.openDocumentation();
      await help.askQuestion();
    } finally {
      api.env.openExternal = openExternal;
    }
    assert.deepStrictEqual(opened, [help.DOCUMENTATION_URL, help.DISCUSSIONS_URL]);
  });

  test("Report Issue opens VS Code's issue reporter with this extension picked", async () => {
    const api = await import("vscode");
    const executeCommand = api.commands.executeCommand;
    const commands = [];
    try {
      api.commands.executeCommand = async (...command) => commands.push(command);
      await help.reportIssue();
    } finally {
      api.commands.executeCommand = executeCommand;
    }
    assert.deepStrictEqual(commands, [
      ["workbench.action.openIssueReporter", { extensionId: help.EXTENSION_ID, issueBody: help.ISSUE_BODY }],
    ]);
    assert.ok(help.ISSUE_BODY.includes("public"), "the body says the issue is public");
  });

  test("Without the issue reporter, Report Issue opens GitHub's new-issue page, with the versions only", async () => {
    const api = await import("vscode");
    const executeCommand = api.commands.executeCommand;
    const openExternal = api.env.openExternal;
    const warn = logger.warn;
    const opened = [];
    const warned = [];
    try {
      api.commands.executeCommand = async () => {
        throw new Error("command 'workbench.action.openIssueReporter' not found");
      };
      // As the browser gets it: VS Code opens an extension's Uri as
      // encodeURI(uri.toString(true)), its parts decoded, then the whole encoded again
      api.env.openExternal = async (uri) => opened.push(encodeURI(uri.toString(true)));
      logger.warn = (message) => warned.push(message);
      await help.reportIssue();
    } finally {
      api.commands.executeCommand = executeCommand;
      api.env.openExternal = openExternal;
      logger.warn = warn;
    }
    assert.strictEqual(opened.length, 1);
    assert.strictEqual(warned.length, 1);
    const page = new URL(opened[0]);
    assert.strictEqual(`${page.origin}${page.pathname}`, `${help.ISSUES_URL}/new`);
    const body = page.searchParams.get("body");
    assert.ok(body.startsWith(help.ISSUE_BODY), body);
    // encodeURI() leaves these as they are, and in a query each would end the body or
    // change it, so the body has none
    assert.ok(!/[&#+=]/.test(help.ISSUE_BODY), help.ISSUE_BODY);
    assert.ok(body.includes(`${api.env.appName} version: ${api.version}`), body);
    assert.ok(body.includes(`OS: ${process.platform} ${process.arch}`), body);
    // Nothing of the machine but its versions: no user name, home folder or workspace
    assert.ok(!body.includes(require("os").homedir()), body);
  });
});
