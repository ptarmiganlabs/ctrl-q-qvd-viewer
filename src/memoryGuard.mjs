/**
 * Keeps a read of every row inside the extension host's memory.
 *
 * qvdjs refuses a read that won't fit with a catchable error, but it prices only
 * its own read. QvdReader then builds one object per row from qvdjs's rows, and
 * for a read of every row that costs more than qvdjs's estimate again: a read
 * qvdjs approved could abort the extension host, taking every extension with it.
 */

/**
 * The memorySafetyFactor qvdjs uses when it is given none.
 */
export const QVDJS_SAFETY_FACTOR = 0.8;

/**
 * How many times qvdjs's heap estimate to keep free for a read of every row,
 * row objects included. Building them a row at a time and letting qvdjs's row
 * go needed at most 1.48 times the estimate: chicago_taxi_rides_2016_03.qvd,
 * 1,975,108 rows of 20 fields, which qvdjs estimates at 457 MiB, ran out of
 * heap at 660 MiB and fitted in 675 MiB. The other test files needed less. Two
 * leaves room for the rest of the extension host, which every extension shares.
 */
export const ROW_OBJECT_OVERHEAD = 2;

/**
 * The memorySafetyFactor to read with, or undefined for qvdjs's default
 * A read of every row leaves room in qvdjs's budget for the row objects. A
 * window of rows doesn't need to: its symbols outweigh its few row objects.
 * @param {number} maxRows - Rows to read, 0 for every row
 * @returns {number|undefined} Fraction of the heap the read may use
 */
export function memorySafetyFactorFor(maxRows) {
  return maxRows === 0 ? QVDJS_SAFETY_FACTOR / ROW_OBJECT_OVERHEAD : undefined;
}

/**
 * Say why qvdjs refused a read for memory, in terms a VS Code user can act on
 * qvdjs's own message suggests a limit option and --max-old-space-size, which
 * the viewer's user can't set.
 * @param {Error} error - What qvdjs threw
 * @returns {string|null} The message, or null when this isn't a memory refusal
 */
export function describeMemoryRefusal(error) {
  const context = error?.context;
  if (error?.name !== "QvdValidationError" || context?.reason !== "memory") {
    return null;
  }

  const totalRows = Number(context.totalRows) || 0;
  const askedRows = Number(context.maxRows) || totalRows;
  const fitRows = Number(context.recommendedMaxRows) || 0;
  const count = (rows) => rows.toLocaleString();

  const what =
    askedRows >= totalRows
      ? `Reading all ${count(totalRows)} rows of this QVD`
      : `Reading ${count(askedRows)} of this QVD's ${count(totalRows)} rows`;
  const instead =
    fitRows > 0
      ? `About ${count(fitRows)} rows would fit.`
      : "Its distinct values alone are more than fits, so fewer rows won't help.";

  return `${what} needs more memory than VS Code gives its extensions. ${instead}`;
}
