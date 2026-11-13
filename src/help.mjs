// Where a user finds help: the documentation, questions, and bug reports
import * as vscode from "vscode";
import logger from "./logger.mjs";

// The extension's id, as VS Code and the Marketplace know it: publisher.name
export const EXTENSION_ID = "ptarmiganlabs.ctrl-q-qvd-viewer";

const REPOSITORY_URL = "https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer";

// The user guide: the README, as the Marketplace and GitHub show it
export const DOCUMENTATION_URL = `${REPOSITORY_URL}#readme`;

// Where questions go
export const DISCUSSIONS_URL = `${REPOSITORY_URL}/discussions`;

// Where bugs go
export const ISSUES_URL = `${REPOSITORY_URL}/issues`;

// What a new issue starts with. The issue is public, so it says to leave out what isn't.
// It has no &, #, + or =: VS Code opens a Uri as encodeURI(uri.toString(true)), which
// leaves them as they are, and in newIssueUrl()'s query each would end the body or change it.
export const ISSUE_BODY = [
  "What happened:",
  "",
  "What you expected to happen:",
  "",
  "Where the QVD came from (Qlik Sense or QlikView, and which version), and roughly how many rows and fields it has:",
  "",
  "Lines from QVD: Show Extension Logs around the problem, if any:",
  "",
  "This issue is public: leave out data, file names and paths you can't share.",
].join("\n");

/**
 * Open the user guide in the browser
 * @returns {Promise<boolean>} Whether it opened
 */
export function openDocumentation() {
  return vscode.env.openExternal(vscode.Uri.parse(DOCUMENTATION_URL));
}

/**
 * Open the place to ask a question in the browser
 * @returns {Promise<boolean>} Whether it opened
 */
export function askQuestion() {
  return vscode.env.openExternal(vscode.Uri.parse(DISCUSSIONS_URL));
}

/**
 * A new issue's page on GitHub, its body started with the versions it is about: for an
 * editor without VS Code's issue reporter. The versions are all it says of the machine.
 * @param {string} extensionVersion - The extension's version
 * @returns {string} The page's address
 */
export function newIssueUrl(extensionVersion) {
  const body = [
    ISSUE_BODY,
    "",
    `Extension version: ${extensionVersion}`,
    `${vscode.env.appName} version: ${vscode.version}`,
    `OS: ${process.platform} ${process.arch}`,
  ].join("\n");
  return `${ISSUES_URL}/new?body=${encodeURIComponent(body)}`;
}

/**
 * Report an issue: VS Code's issue reporter, with this extension picked, which adds the
 * VS Code, OS and extension versions itself and files the issue on GitHub. An editor
 * without the reporter gets GitHub's new-issue page instead.
 * @returns {Promise<void>}
 */
export async function reportIssue() {
  try {
    await vscode.commands.executeCommand("workbench.action.openIssueReporter", {
      extensionId: EXTENSION_ID,
      issueBody: ISSUE_BODY,
    });
  } catch (error) {
    logger.warn(`VS Code's issue reporter didn't open, so GitHub's new-issue page opens instead: ${error?.message ?? error}`);
    const version = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON?.version ?? "unknown";
    await vscode.env.openExternal(vscode.Uri.parse(newIssueUrl(version)));
  }
}
