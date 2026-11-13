/**
 * How many rows a page of the Data tab's grid shows when a file opens
 */

// The settings' section, and the setting in it
const SETTINGS = "ctrl-q-qvd-viewer";
const PAGE_SIZE = "pageSize";

/**
 * The setting, as VS Code names it
 */
export const PAGE_SIZE_SETTING = `${SETTINGS}.${PAGE_SIZE}`;

/**
 * The page sizes the grid offers, the setting's own aside
 */
export const PAGE_SIZES = [25, 50, 100, 250, 500, 1000];

/**
 * The page size when the setting isn't a number
 */
export const DEFAULT_PAGE_SIZE = 100;

// What package.json allows; VS Code doesn't hold settings.json to it
const FEWEST = 10;
const MOST = 1000;

/**
 * The page size from the setting's value
 * @param {*} value - The setting's value
 * @returns {number} A whole number of rows, from 10 to 1,000; 100 when the value isn't a number
 */
export function pageSizeFromSetting(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(MOST, Math.max(FEWEST, Math.round(value)));
}

/**
 * The page size from the setting as it is now
 * @param {object} vscode - The VS Code API
 * @returns {number} As pageSizeFromSetting() gives it
 */
export function pageSize(vscode) {
  return pageSizeFromSetting(vscode.workspace.getConfiguration(SETTINGS).get(PAGE_SIZE));
}

/**
 * The page sizes the grid offers: PAGE_SIZES, with the setting's own among them
 * @param {number} size - The page size, as pageSize() gives it
 * @returns {Array<number>} Ascending
 */
export function pageSizesOffered(size) {
  return [...new Set([...PAGE_SIZES, size])].sort((a, b) => a - b);
}
