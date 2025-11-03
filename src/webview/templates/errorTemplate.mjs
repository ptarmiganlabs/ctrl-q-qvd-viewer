/**
 * Template for displaying error messages in the webview
 */

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML string
 */
export function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Generate HTML for error display
 * @param {string} errorMessage - The error message to display
 * @returns {string} HTML content for error display
 */
export function getErrorHtml(errorMessage) {
  return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>QVD Error</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                }
                h1 {
                    color: var(--vscode-errorForeground);
                    margin-bottom: 20px;
                }
                .error {
                    color: var(--vscode-errorForeground);
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    padding: 15px;
                    border-radius: 4px;
                    margin-bottom: 15px;
                }
                .error-details {
                    background-color: var(--vscode-textBlockQuote-background);
                    border-left: 4px solid var(--vscode-inputValidation-errorBorder);
                    padding: 12px;
                    margin-top: 15px;
                    font-family: var(--vscode-editor-font-family);
                    font-size: 0.9em;
                }
                .error-details strong {
                    display: block;
                    margin-bottom: 8px;
                    color: var(--vscode-foreground);
                }
                p {
                    line-height: 1.5;
                    margin: 10px 0;
                }
                ul {
                    margin: 10px 0;
                    padding-left: 20px;
                }
                li {
                    margin: 5px 0;
                }
            </style>
        </head>
        <body>
            <h1>Unable to Load QVD File</h1>
            <div class="error">
                <strong>⚠️ This QVD file appears to be corrupted or damaged</strong>
                <p>The file structure could not be read properly. This can happen if:</p>
                <ul>
                    <li>The file was not saved correctly by Qlik Sense/QlikView</li>
                    <li>The file was modified by an external program</li>
                    <li>The file transfer was interrupted or corrupted</li>
                    <li>The file format is not a valid QVD file</li>
                </ul>
            </div>
            <div class="error-details">
                <strong>Technical Error Details:</strong>
                ${escapeHtml(errorMessage)}
            </div>
        </body>
        </html>`;
}
