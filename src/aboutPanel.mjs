import * as vscode from "vscode";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import logger from "./logger.mjs";
import { getNonce } from "./webview/assetLoader.mjs";
import { html } from "./webview/templates/escaping.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * The page a link on the About panel opens, if it is one to open: a web page at an
 * https: address. The panel's links are all such pages, and a message that asks for
 * anything else, a file or a command say, is refused.
 * @param {unknown} url - The link's address, as the panel sent it
 * @returns {vscode.Uri|null} The address, or null when it isn't one to open
 */
export function externalLink(url) {
  if (typeof url !== "string") {
    return null;
  }
  try {
    const uri = vscode.Uri.parse(url, true);
    return uri.scheme === "https" && uri.authority ? uri : null;
  } catch {
    return null;
  }
}

/**
 * The repository's web page, from package.json's repository URL. npm writes that URL
 * as git+https://….git, as npm pkg fix does and npm publish suggests, and neither the
 * git+ nor the .git is part of the page's address: externalLink() refuses a git+https:
 * address, and the .git one is the clone's.
 * @param {string} url - The repository's URL, as package.json gives it
 * @returns {string} The repository's web page
 */
export function repositoryPage(url) {
  return String(url).replace(/^git\+/, "").replace(/\.git$/, "");
}

// Of a refused link, as many characters as the log shows
const LOGGED_LINK_LENGTH = 200;

// What JSON.stringify() leaves as it is that a log viewer may still take for a line
// break, or that reorders the text around it: the C1 controls, NEL among them, the
// line and paragraph separators, and the bidirectional marks, embeddings, overrides
// and isolates
const LOG_UNSAFE = /[\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

/**
 * A refused link as the log shows it: quoted, on one line, and cut short. It is
 * whatever the page sent, so it gets no line of the log to itself, and can't change
 * how the log around it reads. It is cut by character before it is quoted, so that
 * neither an escape nor a character is cut in two.
 * @param {unknown} url - The link's address, as the panel sent it
 * @returns {string} The address for the log
 */
export function linkForLog(url) {
  const text = String(url);
  // Twice as many UTF-16 units as characters shown is enough for them, however wide
  const shown = Array.from(text.slice(0, 2 * LOGGED_LINK_LENGTH))
    .slice(0, LOGGED_LINK_LENGTH)
    .join("");
  const quoted = JSON.stringify(shown).replace(
    LOG_UNSAFE,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
  return shown.length < text.length ? `${quoted}…` : quoted;
}

/**
 * Manages the About panel webview
 */
class AboutPanel {
  static currentPanel = undefined;
  static viewType = "ctrl-q-qvd-viewer.about";

  constructor(panel, context) {
    this._panel = panel;
    this._context = context;
    this._disposables = [];

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "openExternal": {
            const link = externalLink(message.url);
            if (link) {
              vscode.env.openExternal(link);
            } else {
              logger.warn(`The About panel asked to open a link that isn't a web page: ${linkForLog(message.url)}`);
            }
            break;
          }
        }
      },
      null,
      this._disposables
    );
  }

  /**
   * Show the About panel
   * @param {vscode.ExtensionContext} context - Extension context
   * @returns {void}
   */
  static show(context) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (AboutPanel.currentPanel) {
      AboutPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      AboutPanel.viewType,
      "About Ctrl-Q QVD Viewer",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        // The logos, and nothing else of the extension's or the workspace's
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      }
    );

    AboutPanel.currentPanel = new AboutPanel(panel, context);
  }

  /**
   * Clean up resources
   * @returns {void}
   */
  dispose() {
    AboutPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Update the webview content
   * @returns {Promise<void>}
   */
  async _update() {
    this._panel.title = "About Ctrl-Q QVD Viewer";
    this._panel.webview.html = await this._getHtmlContent();
  }

  /**
   * Get the HTML content for the About page
   * @returns {Promise<string>} HTML content
   */
  async _getHtmlContent() {
    // Get the extension version from package.json
    // In ESM, we need to read package.json dynamically
    const packageJsonPath = join(__dirname, "..", "package.json");
    let version = "unknown";
    let displayName = "Ctrl-Q QVD Viewer";
    let description =
      "View Qlik Sense and QlikView QVD files from within VS Code";
    let repository = "https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer";
    let license = "MIT";

    try {
      // Use async readFile from fs/promises
      const packageJsonContent = await readFile(packageJsonPath, "utf8");
      const packageJson = JSON.parse(packageJsonContent);
      version = packageJson.version;
      displayName = packageJson.displayName;
      description = packageJson.description;
      repository = repositoryPage(packageJson.repository.url);
      license = packageJson.license;
    } catch (error) {
      logger.error("Failed to read package.json:", error);
    }

    // Get URIs for logo images
    const ctrlqLogoUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._context.extensionUri,
        "media",
        "ctrl-q-logo.png"
      )
    );
    const ptarmiganLogoUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._context.extensionUri,
        "media",
        "ptarmigan-logo.png"
      )
    );

    // The page's body is an html`...` literal, so each value in it, from package.json,
    // is escaped. Scripts and style elements run by nonce only, so the page's links
    // open through its one script rather than handlers of their own. Style attributes are allowed,
    // as the page's markup sets many of them.
    const nonce = getNonce();
    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src-elem 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${
              this._panel.webview.cspSource
            }; form-action 'none'; base-uri 'none';">
            <title>About Ctrl-Q QVD Viewer</title>
            <style nonce="${nonce}">
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 0;
                    margin: 0;
                }
                
                .container {
                    max-width: 900px;
                    margin: 0 auto;
                    padding: 40px 20px;
                }
                
                .header {
                    margin-bottom: 50px;
                }
                
                .header-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    padding: 30px 20px;
                    background: linear-gradient(135deg, var(--vscode-editor-background) 0%, var(--vscode-sideBar-background) 100%);
                    border-radius: 8px;
                    border: 1px solid var(--vscode-panel-border);
                    margin-bottom: 30px;
                    gap: 40px;
                    flex-wrap: wrap;
                }
                
                .header-left {
                    flex: 1;
                    min-width: 300px;
                }
                
                .header-right {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                    gap: 10px;
                }
                
                .logo-wrapper {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                
                .logo {
                    height: auto;
                    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
                }
                
                .logo.ctrl-q {
                    max-width: 200px;
                    margin-bottom: 15px;
                }
                
                .logo.ptarmigan {
                    max-width: 160px;
                }
                
                .sponsor-text {
                    color: var(--vscode-descriptionForeground);
                    font-size: 0.8em;
                    text-transform: uppercase;
                    letter-spacing: 1.5px;
                    opacity: 0.7;
                    text-align: right;
                    margin-bottom: 8px;
                }
                
                h1 {
                    font-size: 2em;
                    margin: 0 0 8px 0;
                    color: var(--vscode-foreground);
                    font-weight: 600;
                    line-height: 1.2;
                }
                
                .version {
                    color: var(--vscode-descriptionForeground);
                    font-size: 1em;
                    margin: 5px 0;
                    font-weight: 500;
                }
                
                .description {
                    font-size: 1em;
                    color: var(--vscode-descriptionForeground);
                    line-height: 1.6;
                    margin-top: 12px;
                    max-width: 600px;
                }
                
                .section {
                    margin: 30px 0;
                }
                
                h2 {
                    font-size: 1.5em;
                    margin: 20px 0 15px 0;
                    color: var(--vscode-foreground);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 8px;
                }
                
                .feature-list {
                    list-style: none;
                    padding: 0;
                    margin: 15px 0;
                }
                
                .feature-list li {
                    padding: 10px 0;
                    padding-left: 30px;
                    position: relative;
                    line-height: 1.6;
                }
                
                .feature-list li:before {
                    content: "✓";
                    position: absolute;
                    left: 0;
                    color: var(--vscode-terminal-ansiGreen);
                    font-weight: bold;
                    font-size: 1.2em;
                }
                
                .link-section {
                    margin: 20px 0;
                }
                
                .link-button {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    padding: 10px 20px;
                    margin: 10px 10px 10px 0;
                    border-radius: 4px;
                    text-decoration: none;
                    cursor: pointer;
                    border: none;
                    font-size: 1em;
                    transition: background-color 0.2s;
                }
                
                .link-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .link-button:active {
                    opacity: 0.8;
                }
                
                .button-icon {
                    width: 16px;
                    height: 16px;
                    fill: currentColor;
                }
                
                .info-box {
                    background-color: var(--vscode-textBlockQuote-background);
                    border-left: 4px solid var(--vscode-textBlockQuote-border);
                    padding: 15px 20px;
                    margin: 20px 0;
                    border-radius: 4px;
                }
                
                .info-box p {
                    margin: 8px 0;
                    line-height: 1.6;
                }
                
                .info-box a {
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                    border-bottom: 1px solid transparent;
                    transition: border-bottom 0.2s;
                }
                
                .info-box a:hover {
                    border-bottom: 1px solid var(--vscode-textLink-foreground);
                }
                
                .footer {
                    margin-top: 50px;
                    padding-top: 20px;
                    border-top: 1px solid var(--vscode-panel-border);
                    text-align: center;
                    color: var(--vscode-descriptionForeground);
                }
                
                .tech-info {
                    margin: 10px 0;
                    color: var(--vscode-descriptionForeground);
                    font-size: 0.95em;
                }
                
                .tech-info strong {
                    color: var(--vscode-foreground);
                }
            </style>
        </head>
        <body>
            ${html`
            <div class="container">
                <div class="header">
                    <div class="header-top">
                        <div class="header-left">
                            <img src="${ctrlqLogoUri}" alt="Ctrl-Q Logo" class="logo ctrl-q">
                            <h1>${displayName}</h1>
                            <div class="version">Version ${version}</div>
                            <div class="description">${description}</div>
                        </div>
                        <div class="header-right">
                            <span class="sponsor-text">Sponsored by</span>
                            <img src="${ptarmiganLogoUri}" alt="Ptarmigan Labs Logo" class="logo ptarmigan">
                        </div>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Key Features at a Glance</h2>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 20px 0;">
                        <div class="info-box">
                            <h3 style="margin: 0 0 10px 0; font-size: 1.1em;">📊 Rich Data Viewing</h3>
                            <p style="margin: 5px 0;">View QVD metadata, field details, and paginated data previews with configurable row limits.</p>
                        </div>
                        <div class="info-box">
                            <h3 style="margin: 0 0 10px 0; font-size: 1.1em;">📈 Data Profiling</h3>
                            <p style="margin: 5px 0;">Analyze value distributions with interactive charts and tables. Export as Qlik scripts.</p>
                        </div>
                        <div class="info-box">
                            <h3 style="margin: 0 0 10px 0; font-size: 1.1em;">📤 11 Export Formats</h3>
                            <p style="margin: 5px 0;">Export to CSV, Excel, JSON, Parquet, Arrow, Avro, SQLite, PostgreSQL, XML, YAML, and Qlik scripts.</p>
                        </div>
                        <div class="info-box">
                            <h3 style="margin: 0 0 10px 0; font-size: 1.1em;">⚡ High Performance</h3>
                            <p style="margin: 5px 0;">Efficient pagination and configurable preview limits handle large datasets smoothly.</p>
                        </div>
                        <div class="info-box">
                            <h3 style="margin: 0 0 10px 0; font-size: 1.1em;">🔒 Safe & Secure</h3>
                            <p style="margin: 5px 0;">Read-only access ensures your original QVD files are never modified.</p>
                        </div>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Core QVD Viewing Features</h2>
                    <ul class="feature-list">
                        <li>View QVD files created by Qlik Sense or QlikView directly in VS Code</li>
                        <li>Display comprehensive metadata including file creation info, table creator, and record counts</li>
                        <li>View detailed field information with data types, symbols, and technical details</li>
                        <li>Data preview with configurable row limits (100-100,000 rows, default: 5,000)</li>
                        <li>Efficient pagination controls for navigating through large datasets</li>
                        <li>Safe read-only access to QVD files - no risk of modifying original data</li>
                    </ul>
                </div>
                
                <div class="section">
                    <h2>Data Profiling</h2>
                    <p style="color: var(--vscode-descriptionForeground); margin-bottom: 15px;">Understand value distributions and field characteristics - especially valuable for dimensional data in star schemas.</p>
                    
                    <ul class="feature-list">
                        <li><strong>Field Analysis</strong> - Profile 1-3 fields simultaneously to compare distributions</li>
                        <li><strong>Interactive Charts</strong> - View top 20 values in bar charts with VS Code theme integration</li>
                        <li><strong>Distribution Tables</strong> - Complete frequency data with counts and percentages, paginated for easy navigation</li>
                        <li><strong>Statistics</strong> - Total rows, unique values, and NULL counts for each field</li>
                        <li><strong>Export to QVS</strong> - Generate Qlik scripts with customizable delimiters and row limits</li>
                        <li><strong>Multiple Views</strong> - Open results as Markdown (text) or Visual Analysis (interactive charts/tables)</li>
                        <li><strong>Smart Warnings</strong> - Automatic alerts for large files (>100k rows) before loading all data</li>
                    </ul>
                    
                    <div class="info-box" style="margin-top: 15px;">
                        <p><strong>📖 Learn More:</strong></p>
                        <p style="margin: 10px 0;">
                            For detailed profiling documentation including use cases, export options, and best practices, see the 
                            <a href="#" data-url="https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/blob/main/docs/PROFILING.md" style="color: var(--vscode-textLink-foreground); text-decoration: underline;">Profiling Guide</a>.
                        </p>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Data Export Features</h2>
                    <p style="color: var(--vscode-descriptionForeground); margin-bottom: 15px;">Export QVD data to multiple formats for analysis and integration with other tools:</p>
                    
                    <h3 style="font-size: 1.1em; margin: 20px 0 10px 0; color: var(--vscode-foreground);">Production-Ready Formats</h3>
                    <ul class="feature-list">
                        <li><strong>CSV</strong> - Universal text format compatible with Excel and most data tools</li>
                        <li><strong>Excel (XLSX)</strong> - Native Excel format with styled headers and proper data types</li>
                        <li><strong>JSON</strong> - Structured format with pretty formatting, ideal for web applications and APIs</li>
                        <li><strong>Parquet</strong> - Efficient columnar format optimized for big data analytics</li>
                        <li><strong>Qlik Inline Script</strong> - Generate Qlik Sense/QlikView load scripts with inline tables (customizable row limits)</li>
                        <li><strong>XML</strong> - Structured markup format for enterprise integration</li>
                        <li><strong>YAML</strong> - Human-readable format perfect for configuration and data exchange</li>
                    </ul>
                    
                    <h3 style="font-size: 1.1em; margin: 20px 0 10px 0; color: var(--vscode-foreground);">Beta Export Formats</h3>
                    <ul class="feature-list">
                        <li><strong>Apache Arrow</strong> - High-performance columnar format for analytical workloads and in-memory processing</li>
                        <li><strong>Avro</strong> - Compact binary format with schema evolution support for Hadoop/Kafka ecosystems</li>
                        <li><strong>PostgreSQL</strong> - Direct export to PostgreSQL databases (beta destination)</li>
                        <li><strong>SQLite</strong> - Portable database files with full SQL query support</li>
                    </ul>
                    
                    <div class="info-box" style="margin-top: 15px;">
                        <p><strong>Export Notes:</strong></p>
                        <ul style="margin-left: 20px; line-height: 1.6;">
                            <li>All exports include the complete dataset from the QVD file</li>
                            <li>Data types are automatically detected and preserved in supported formats</li>
                            <li>Qlik Inline Script export allows you to select the number of rows (10, 100, 1K, 10K, All, or custom)</li>
                            <li>Beta formats are fully functional but may receive additional enhancements</li>
                        </ul>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Configuration & Settings</h2>
                    <div class="info-box">
                        <p><strong>Customize your viewing experience:</strong></p>
                        <ul style="margin-left: 20px; line-height: 1.8;">
                            <li><strong>Max Preview Rows</strong> - Control how many rows to load for preview and pagination
                                <ul style="margin-left: 20px; margin-top: 5px;">
                                    <li>Default: 5,000 rows</li>
                                    <li>Range: 100 - 100,000 rows</li>
                                    <li>Access via: Settings → Search "Ctrl-Q QVD Viewer"</li>
                                </ul>
                            </li>
                        </ul>
                        <p style="margin-top: 10px;"><em>Tip: Lower values improve performance for very large files, while higher values provide more data visibility.</em></p>
                    </div>
                </div>
                
                <div class="section">
                    <h2>About QVD Files</h2>
                    <div class="info-box">
                        <p><strong>QVD</strong> files are a proprietary tabular format used by Qlik Sense and QlikView for storing data tables.</p>
                        <p>Each file contains data from a single table exported from a Qlik application, together with metadata about the table structure and data types.</p>
                        <p>The files are optimized for fast loading by Qlik Sense and QlikView. This extension provides a convenient way to inspect these files without launching Qlik applications.</p>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Quick Start</h2>
                    <ol style="line-height: 2;">
                        <li>Open any <code>.qvd</code> file in your workspace</li>
                        <li>Or use Command Palette (Ctrl+Shift+P / Cmd+Shift+P) → "QVD: Open QVD File"</li>
                        <li>View metadata, field information, and data preview</li>
                        <li>Use pagination controls to navigate through larger datasets</li>
                        <li>Click the 📤 Export button to save data in various formats</li>
                    </ol>
                    
                    <div class="info-box" style="margin-top: 15px;">
                        <p><strong>💡 Pro Tip:</strong> Adjust the preview row limit in Settings (search for "Ctrl-Q QVD") to balance between performance and data visibility. Default is 5,000 rows.</p>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Part of the Butler & Ctrl-Q Suite</h2>
                    <div class="info-box">
                        <p>This extension is part of the <strong>Butler and Ctrl-Q suite</strong> of tools for Qlik Sense developers and administrators.</p>
                        <p>The Butler family includes tools for automation, monitoring, DevOps, and data management for Qlik Sense environments.</p>
                        <p><strong>Explore the suite:</strong></p>
                        <ul style="margin-left: 20px; line-height: 1.8;">
                            <li><strong><a href="#" data-url="https://github.com/ptarmiganlabs/ctrl-q" style="color: var(--vscode-textLink-foreground); text-decoration: none;">Ctrl-Q CLI</a></strong> - Command-line tool for automating tedious and error prone Qlik Sense admin tasks</li>
                            <li><strong><a href="#" data-url="https://github.com/ptarmiganlabs/butler" style="color: var(--vscode-textLink-foreground); text-decoration: none;">Butler</a></strong> - Adding superpowers to Qlik Sense. Real-time task alerts, Windows service monitoring, key-value store and much more</li>
                            <li><strong><a href="#" data-url="https://github.com/ptarmiganlabs/butler-sos" style="color: var(--vscode-textLink-foreground); text-decoration: none;">Butler SOS</a></strong> - Monitor real-time operational Qlik Sense metrics in Grafana</li>
                            <li><strong><a href="#" data-url="https://github.com/ptarmiganlabs/butler-sheet-icons" style="color: var(--vscode-textLink-foreground); text-decoration: none;">Butler Sheet Icons</a></strong> - Automatic thumbnail management for Qlik Sense sheets</li>
                            <li><strong><a href="#" data-url="https://ptarmiganlabs.com/the-butler-family/" style="color: var(--vscode-textLink-foreground); text-decoration: none;">And more...</a></strong> - Explore the full range of Butler tools and features</li>
                        </ul>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Resources & Links</h2>
                    <div class="link-section">
                        <button class="link-button" data-url="${repository}">
                            <svg class="button-icon" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                            </svg>
                            GitHub Repository
                        </button>
                        <button class="link-button" data-url="https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues">
                            🐛 Report Issue
                        </button>
                        <button class="link-button" data-url="https://ptarmiganlabs.com/the-butler-family/">
                            🛠️ Butler Suite
                        </button>
                        <button class="link-button" data-url="https://ptarmiganlabs.com">
                            🌐 Ptarmigan Labs
                        </button>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Technical Information</h2>
                    <div class="tech-info">
                        <p><strong>License:</strong> ${license}</p>
                    </div>
                </div>
                
                <div class="footer">
                    <p>Made with ❤️ by <a href="#" data-url="https://ptarmiganlabs.com" style="color: var(--vscode-textLink-foreground); text-decoration: none;">Ptarmigan Labs</a></p>
                    <p style="margin-top: 10px; font-size: 0.9em;">© 2025 Ptarmigan Labs. All rights reserved.</p>
                </div>
            </div>
            `}
            
            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();

                // Each link and button with a data-url opens its page in the browser
                document.querySelectorAll('[data-url]').forEach((link) => {
                    link.addEventListener('click', (event) => {
                        event.preventDefault();
                        vscode.postMessage({
                            command: 'openExternal',
                            url: link.dataset.url
                        });
                    });
                });
            </script>
        </body>
        </html>`;
  }
}

export default AboutPanel;
