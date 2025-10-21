const vscode = require("vscode");

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
          case "openExternal":
            vscode.env.openExternal(vscode.Uri.parse(message.url));
            break;
        }
      },
      null,
      this._disposables
    );
  }

  /**
   * Show the About panel
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
      }
    );

    AboutPanel.currentPanel = new AboutPanel(panel, context);
  }

  /**
   * Clean up resources
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
   */
  _update() {
    this._panel.title = "About Ctrl-Q QVD Viewer";
    this._panel.webview.html = this._getHtmlContent();
  }

  /**
   * Get the HTML content for the About page
   */
  _getHtmlContent() {
    // Get the extension version from package.json
    const packageJson = require("../package.json");
    const version = packageJson.version;
    const displayName = packageJson.displayName;
    const description = packageJson.description;
    const repository = packageJson.repository.url;
    const license = packageJson.license;

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

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src ${
              this._panel.webview.cspSource
            } https:;">
            <title>About Ctrl-Q QVD Viewer</title>
            <style>
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
            <div class="container">
                <div class="header">
                    <div class="header-top">
                        <div class="header-left">
                            <img src="${ctrlqLogoUri}" alt="Ctrl-Q Logo" class="logo ctrl-q">
                            <h1>${this.escapeHtml(displayName)}</h1>
                            <div class="version">Version ${this.escapeHtml(
                              version
                            )}</div>
                            <div class="description">${this.escapeHtml(
                              description
                            )}</div>
                        </div>
                        <div class="header-right">
                            <span class="sponsor-text">Sponsored by</span>
                            <img src="${ptarmiganLogoUri}" alt="Ptarmigan Labs Logo" class="logo ptarmigan">
                        </div>
                    </div>
                </div>
                
                <div class="section">
                    <h2>QVD Viewing Features</h2>
                    <ul class="feature-list">
                        <li>View QVD files created by Qlik Sense or QlikView directly in VS Code</li>
                        <li>Display full metadata including file creation info and field definitions</li>
                        <li>Preview data with configurable row limits</li>
                        <li>View field types, symbols, and technical details</li>
                        <li>Load all data for complete file viewing when needed</li>
                        <li>Safe read-only access to QVD files</li>
                        <li>Efficient pagination for large datasets</li>
                    </ul>
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
                    </ol>
                </div>
                
                <div class="section">
                    <h2>Part of the Butler & Ctrl-Q Suite</h2>
                    <div class="info-box">
                        <p>This extension is part of the <strong>Butler and Ctrl-Q suite</strong> of tools for Qlik Sense developers and administrators.</p>
                        <p>The Butler family includes tools for automation, monitoring, DevOps, and data management for Qlik Sense environments.</p>
                        <p><strong>Explore the suite:</strong></p>
                        <ul style="margin-left: 20px; line-height: 1.8;">
                            <li><strong><a href="#" onclick="openExternal('https://github.com/ptarmiganlabs/ctrl-q'); return false;" style="color: var(--vscode-textLink-foreground); text-decoration: none;">Ctrl-Q CLI</a></strong> - Command-line tool for managing Qlik Sense environments</li>
                            <li><strong><a href="#" onclick="openExternal('https://github.com/ptarmiganlabs/butler'); return false;" style="color: var(--vscode-textLink-foreground); text-decoration: none;">Butler</a></strong> - DevOps automation and advanced features for Qlik Sense</li>
                            <li><strong><a href="#" onclick="openExternal('https://github.com/ptarmiganlabs/butler-sos'); return false;" style="color: var(--vscode-textLink-foreground); text-decoration: none;">Butler SOS</a></strong> - Real-time monitoring and operational metrics</li>
                            <li><strong><a href="#" onclick="openExternal('https://github.com/ptarmiganlabs/butler-sheet-icons'); return false;" style="color: var(--vscode-textLink-foreground); text-decoration: none;">Butler Sheet Icons</a></strong> - Thumbnail management for Qlik Sense sheets</li>
                        </ul>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Resources & Links</h2>
                    <div class="link-section">
                        <button class="link-button" onclick="openExternal('${this.escapeHtml(
                          repository
                        )}')">
                            <svg class="button-icon" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                            </svg>
                            GitHub Repository
                        </button>
                        <button class="link-button" onclick="openExternal('https://github.com/ptarmiganlabs/qvd4vscode/issues')">
                            🐛 Report Issue
                        </button>
                        <button class="link-button" onclick="openExternal('https://butler.ptarmiganlabs.com/docs/about/butler-family')">
                            🛠️ Butler Suite
                        </button>
                        <button class="link-button" onclick="openExternal('https://ptarmiganlabs.com')">
                            🌐 Ptarmigan Labs
                        </button>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Technical Information</h2>
                    <div class="tech-info">
                        <p><strong>License:</strong> ${this.escapeHtml(
                          license
                        )}</p>
                        <p><strong>Publisher:</strong> Ptarmigan Labs</p>
                        <p><strong>Dependencies:</strong> qvd4js (QVD parsing), xml2js (XML processing)</p>
                    </div>
                </div>
                
                <div class="footer">
                    <p>Made with ❤️ by <a href="#" onclick="openExternal('https://ptarmiganlabs.com'); return false;" style="color: var(--vscode-textLink-foreground); text-decoration: none;">Ptarmigan Labs</a></p>
                    <p style="margin-top: 10px; font-size: 0.9em;">© 2025 Ptarmigan Labs. All rights reserved.</p>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                function openExternal(url) {
                    vscode.postMessage({
                        command: 'openExternal',
                        url: url
                    });
                }
            </script>
        </body>
        </html>`;
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return String(text).replace(/[&<>"']/g, (m) => map[m]);
  }
}

module.exports = AboutPanel;
