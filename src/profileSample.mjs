/**
 * The rows profiling looks at to tell what kind of values a field holds
 *
 * Whether a field is numeric, holds dates or holds text is told from about a
 * thousand of its rows, spread evenly over the field: every step-th row from the
 * first. A profile of rows held in memory and one of a QVD read a chunk at a time
 * look at the same rows, so they tell the same.
 */

/**
 * About how many rows are looked at
 */
export const SAMPLE_ROWS = 1000;

/**
 * Rows from one row looked at to the next
 * @param {number} rowCount - Rows in the field
 * @returns {number} The step, at least 1
 */
export function sampleStep(rowCount) {
  if (!(rowCount > 0)) {
    return 1;
  }
  return Math.max(1, Math.floor(rowCount / Math.min(rowCount, SAMPLE_ROWS)));
}

/**
 * The values of a field at the rows looked at, in row order
 * @param {Array<Object>} data - Array of row objects
 * @param {string} fieldName - The field
 * @returns {Array<*>} The values
 */
export function sampleOf(data, fieldName) {
  const step = sampleStep(data.length);
  const values = [];
  for (let i = 0; i < data.length; i += step) {
    values.push(data[i][fieldName]);
  }
  return values;
}
