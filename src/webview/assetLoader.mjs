import { readFileSync } from "fs";
import { join } from "path";

/**
 * Utility functions for loading webview assets
 *
 * The libraries the webview inlines are copied from their npm packages into
 * dist/webview when the extension is built: see copyWebviewLibsPlugin in
 * esbuild.js.
 */

/**
 * Generate a random nonce for CSP (Content Security Policy)
 * @returns {string} A random 32-character string
 */
export function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Get Tabulator library inlined as string
 * @param {string} extensionPath - The extension path
 * @returns {string} Tabulator JS library content
 */
export function getTabulatorJs(extensionPath) {
  const tabulatorPath = join(
    extensionPath,
    "dist",
    "webview",
    "tabulator.min.js"
  );
  return readFileSync(tabulatorPath, "utf8");
}

/**
 * Get Tabulator CSS inlined as string
 * @param {string} extensionPath - The extension path
 * @returns {string} Tabulator CSS content
 */
export function getTabulatorCss(extensionPath) {
  const tabulatorCssPath = join(
    extensionPath,
    "dist",
    "webview",
    "tabulator.min.css"
  );
  return readFileSync(tabulatorCssPath, "utf8");
}

/**
 * Get Chart.js library inlined as string
 * @param {string} extensionPath - The extension path
 * @returns {string} Chart.js library content
 */
export function getChartJs(extensionPath) {
  const chartPath = join(extensionPath, "dist", "webview", "chart.umd.js");
  return readFileSync(chartPath, "utf8");
}
