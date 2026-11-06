/**
 * Most rows that Load More reads. Load All has no limit.
 */
export const LOAD_MORE_MAX_ROWS = 100000;

/**
 * How many rows to read when the user clicks Load More: twice the rows already
 * loaded, up to LOAD_MORE_MAX_ROWS
 * @param {number} currentRows - Rows loaded now
 * @returns {number} Rows to read, counted from the start of the file
 */
export function getLoadMoreRowCount(currentRows) {
  return Math.min(currentRows * 2, LOAD_MORE_MAX_ROWS);
}
