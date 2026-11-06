/**
 * Most rows that Load More reads. Load All has no limit.
 */
export const LOAD_MORE_MAX_ROWS = 100000;

// The settings' section, and the setting in it that says how many rows a file opens with
const SETTINGS = "ctrl-q-qvd-viewer";
const PREVIEW_ROWS = "maxPreviewRows";

/**
 * The setting that says how many rows a file opens with, as VS Code names it
 */
export const PREVIEW_ROWS_SETTING = `${SETTINGS}.${PREVIEW_ROWS}`;

/**
 * How many rows to read when the user clicks Load More: twice the rows already
 * loaded, up to LOAD_MORE_MAX_ROWS
 * @param {number} currentRows - Rows loaded now
 * @returns {number} Rows to read, counted from the start of the file
 */
export function getLoadMoreRowCount(currentRows) {
  return Math.min(currentRows * 2, LOAD_MORE_MAX_ROWS);
}

/**
 * The rows to open a file with, from the maxPreviewRows setting
 * package.json allows 100 to 100,000, but VS Code doesn't hold settings.json to
 * that: a 0 there would read every row on open, and a null or a string would
 * reach the reader as a row limit it can't price.
 * @param {*} value - The setting's value
 * @returns {number} A whole number of rows, from 100 to LOAD_MORE_MAX_ROWS;
 *   5,000, the default, when the value isn't a number
 */
export function previewRowsFromSetting(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 5000;
  }
  return Math.min(LOAD_MORE_MAX_ROWS, Math.max(100, Math.round(value)));
}

/**
 * The rows to open a file with, from the maxPreviewRows setting as it is now:
 * on open, and on a retry, which reads the file again as opening it would
 * @param {object} vscode - The VS Code API
 * @returns {number} As previewRowsFromSetting() gives it
 */
export function previewRows(vscode) {
  return previewRowsFromSetting(vscode.workspace.getConfiguration(SETTINGS).get(PREVIEW_ROWS));
}
