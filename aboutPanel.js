const vscode = require('vscode');

/**
 * Manages the About panel webview
 */
class AboutPanel {
    static currentPanel = undefined;
    static viewType = 'qvd4vscode.about';

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
            message => {
                switch (message.command) {
                    case 'openExternal':
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
            'About QVD Viewer',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
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
        this._panel.title = 'About QVD Viewer';
        this._panel.webview.html = this._getHtmlContent();
    }

    /**
     * Get the HTML content for the About page
     */
    _getHtmlContent() {
        // Get the extension version from package.json
        const packageJson = require('./package.json');
        const version = packageJson.version;
        const displayName = packageJson.displayName;
        const description = packageJson.description;
        const repository = packageJson.repository.url;
        const license = packageJson.license;

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
            <title>About QVD Viewer</title>
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
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 40px 20px;
                }
                
                .header {
                    text-align: center;
                    margin-bottom: 40px;
                    padding-bottom: 30px;
                    border-bottom: 2px solid var(--vscode-panel-border);
                }
                
                .logo {
                    font-size: 64px;
                    margin-bottom: 20px;
                }
                
                h1 {
                    font-size: 2em;
                    margin: 15px 0 10px 0;
                    color: var(--vscode-foreground);
                }
                
                .version {
                    color: var(--vscode-descriptionForeground);
                    font-size: 1.2em;
                    margin-top: 10px;
                }
                
                .description {
                    font-size: 1.1em;
                    color: var(--vscode-descriptionForeground);
                    line-height: 1.6;
                    margin-top: 10px;
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
                    display: inline-block;
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
                    <div class="logo">📊</div>
                    <h1>${this.escapeHtml(displayName)}</h1>
                    <div class="version">Version ${this.escapeHtml(version)}</div>
                    <div class="description">${this.escapeHtml(description)}</div>
                </div>
                
                <div class="section">
                    <h2>Features</h2>
                    <ul class="feature-list">
                        <li>View QVD files created by Qlik Sense or QlikView directly in VS Code</li>
                        <li>Display comprehensive metadata including file creation info and field definitions</li>
                        <li>Preview data with configurable row limits</li>
                        <li>View field types, symbols, and technical details</li>
                        <li>Load all data for complete file viewing</li>
                        <li>Safe read-only access to QVD files</li>
                    </ul>
                </div>
                
                <div class="section">
                    <h2>About QVD Files</h2>
                    <div class="info-box">
                        <p>QVD (QlikView Data) files are a proprietary tabular format used by Qlik Sense and QlikView for storing data tables.</p>
                        <p>They consist of an XML header containing metadata and a binary data section for efficient storage and fast loading.</p>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Quick Start</h2>
                    <ol style="line-height: 2;">
                        <li>Open any <code>.qvd</code> file in your workspace</li>
                        <li>Or use Command Palette (Ctrl+Shift+P) → "Open QVD File"</li>
                        <li>View metadata, field information, and data preview</li>
                    </ol>
                </div>
                
                <div class="section">
                    <h2>Resources</h2>
                    <div class="link-section">
                        <button class="link-button" onclick="openExternal('${this.escapeHtml(repository)}')">
                            📦 GitHub Repository
                        </button>
                        <button class="link-button" onclick="openExternal('https://github.com/ptarmiganlabs/qvd4vscode/issues')">
                            🐛 Report Issue
                        </button>
                        <button class="link-button" onclick="openExternal('https://github.com/MuellerConstantin/qvd4js')">
                            📚 qvd4js Library
                        </button>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Technical Information</h2>
                    <div class="tech-info">
                        <p><strong>License:</strong> ${this.escapeHtml(license)}</p>
                        <p><strong>Publisher:</strong> Ptarmigan Labs</p>
                        <p><strong>Dependencies:</strong> qvd4js, xml2js</p>
                    </div>
                </div>
                
                <div class="footer">
                    <p>Made with ❤️ by Ptarmigan Labs</p>
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
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }
}

module.exports = AboutPanel;
