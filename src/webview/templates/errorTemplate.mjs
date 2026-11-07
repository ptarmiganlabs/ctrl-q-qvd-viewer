/**
 * Template for the page that says why a QVD couldn't be read, and for the same
 * notice in the viewer's Data tab when only the file's rows failed
 */

import { getNonce } from "../assetLoader.mjs";
import { escapeHtml, html } from "./escaping.mjs";

/**
 * Styles for the notice that says why a read failed, on the error page and in the viewer
 */
export const FAILURE_NOTICE_CSS = `
        .read-failure {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 4px;
            padding: 15px 18px;
            margin-bottom: 15px;
            color: var(--vscode-foreground);
            line-height: 1.5;
        }
        .read-failure-title {
            color: var(--vscode-errorForeground);
            font-size: 1.3em;
            margin: 0 0 10px 0;
        }
        .read-failure p {
            margin: 8px 0;
        }
        .read-failure-advice {
            margin: 10px 0;
            padding-left: 20px;
        }
        .read-failure-advice li {
            margin: 5px 0;
        }
        .read-failure-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin: 14px 0 4px 0;
        }
        .read-failure-button {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-button-secondaryForeground);
            background-color: var(--vscode-button-secondaryBackground);
            border: 1px solid var(--vscode-button-border, transparent);
            border-radius: 2px;
            padding: 4px 12px;
            cursor: pointer;
        }
        .read-failure-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .read-failure-button.primary {
            color: var(--vscode-button-foreground);
            background-color: var(--vscode-button-background);
        }
        .read-failure-button.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .read-failure-button:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }
        .read-failure-button:disabled {
            opacity: 0.6;
            cursor: default;
        }
        .read-failure-detail {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-inputValidation-errorBorder);
            padding: 10px 12px;
            margin-top: 14px;
            font-size: 0.9em;
        }
        .read-failure-detail pre {
            font-family: var(--vscode-editor-font-family);
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            margin: 6px 0 0 0;
        }
`;

/**
 * The script that makes the notice's buttons post their messages: a function,
 * wireFailureButtons(vscode), for a page that has its VS Code API already. A retry
 * replaces the page, so until it does, its buttons say the read is under way.
 */
export const FAILURE_BUTTONS_JS = `
        function wireFailureButtons(vscode) {
            const buttons = document.querySelectorAll('.read-failure button[data-command]');
            buttons.forEach(function (button) {
                button.addEventListener('click', function () {
                    const message = { command: button.dataset.command };
                    if (button.dataset.rows) {
                        message.rows = Number(button.dataset.rows);
                    }
                    if (button.dataset.setting) {
                        message.setting = button.dataset.setting;
                    }
                    if (message.command === 'retry') {
                        buttons.forEach(function (other) {
                            if (other.dataset.command === 'retry') {
                                other.disabled = true;
                            }
                        });
                        button.textContent = 'Retrying…';
                    }
                    vscode.postMessage(message);
                });
            });
        }
`;

/**
 * HTML for the notice that says why a read failed
 * @param {import('../readFailure.mjs').ReadFailure} failure - Why, as describeReadFailure() says it
 * @param {{headerShown?: boolean, heading?: string}} [options] - headerShown: the file's
 *   header is shown in the viewer's other tabs; heading: the title's element
 * @returns {import('../client/html.js').HtmlMarkup} HTML, written with html, so that
 *   each part of the failure is escaped
 */
export function failureNoticeHtml(failure, { headerShown = false, heading = "h2" } = {}) {
  const advice = failure.advice.map(
    (line) => html`
                <li>${line}</li>`
  );
  const buttons = failure.actions.map(
    (action, index) => html`
                <button type="button" class="read-failure-button${index === 0 ? " primary" : ""}" data-command="${
                  action.command
                }"${action.rows ? html` data-rows="${action.rows}"` : ""}${
                  action.setting ? html` data-setting="${action.setting}"` : ""
                }>${action.label}</button>`
  );
  return html`
            <div class="read-failure" role="alert" data-kind="${failure.kind}">
                <${heading} class="read-failure-title">${failure.title}</${heading}>
                <p class="read-failure-summary">${failure.summary}</p>
                ${
                  headerShown
                    ? html`<p>The file's header could still be read: its fields, file metadata and lineage are in the other tabs.</p>`
                    : ""
                }
                ${advice.length > 0 ? html`<ul class="read-failure-advice">${advice}
                </ul>` : ""}
                <div class="read-failure-actions">${buttons}
                </div>
                ${
                  failure.detail
                    ? html`<div class="read-failure-detail"><strong>Technical details</strong><pre>${failure.detail}</pre></div>`
                    : ""
                }
            </div>`;
}

/**
 * The page that says why a QVD couldn't be read, with buttons to retry, see the
 * logs and open the settings it names
 * @param {import('../readFailure.mjs').ReadFailure} failure - Why, as describeReadFailure() says it
 * @returns {string} HTML content for error display
 */
export function getErrorHtml(failure) {
  const nonce = getNonce();
  return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; form-action 'none'; base-uri 'none';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(failure.title)}</title>
            <style nonce="${nonce}">
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                    max-width: 60em;
                }
                ${FAILURE_NOTICE_CSS}
            </style>
        </head>
        <body>
            ${failureNoticeHtml(failure, { heading: "h1" })}
            <script nonce="${nonce}">
                ${FAILURE_BUTTONS_JS}
                wireFailureButtons(acquireVsCodeApi());
            </script>
        </body>
        </html>`;
}
