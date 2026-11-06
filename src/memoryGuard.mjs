/**
 * Keeps QVD reads, and what their callers do with the rows, inside the
 * extension host's memory, which every extension shares.
 *
 * qvdjs refuses a read that won't fit with a catchable error, but it prices
 * only its own read, and checks it against the whole heap. Three things cost
 * more than that: the row objects QvdReader builds from qvdjs's rows, what a
 * caller builds from them in turn (an export's file, profiling's statistics),
 * and the rows of earlier reads that callers still hold. A read qvdjs approved
 * could then abort the extension host, taking every extension with it.
 *
 * So each read hands qvdjs a smaller budget: its own, less the heap that held
 * rows have booked here, and less what this read will add on top of qvdjs's
 * estimate. A read that won't fit is then refused, catchably, before it reads
 * any rows.
 */
import v8 from "v8";

/**
 * The memorySafetyFactor qvdjs uses when it is given none.
 */
export const QVDJS_SAFETY_FACTOR = 0.8;

/**
 * How qvdjs sizes the heap it budgets against: heap_size_limit, less what that
 * overstates, and never less than a floor. HEAP_LIMIT_OVERSTATEMENT_BYTES and
 * MINIMUM_BUDGET_BYTES in qvdjs's src/util/memoryUtils.js.
 */
const QVDJS_HEAP_OVERSTATEMENT = 192 * 1024 * 1024;
const QVDJS_MINIMUM_BUDGET = 64 * 1024 * 1024;

/**
 * The smallest factor handed to qvdjs. Zero would switch its check off.
 */
const MINIMUM_FACTOR = 1e-6;

/**
 * Heap a read needs beyond qvdjs's estimate, per cell, for the row objects.
 * Building them a row at a time and letting qvdjs's row go needed 5.8 bytes per
 * cell more than the estimate: chicago_taxi_rides_2016_03.qvd, 1,975,108 rows of
 * 20 fields, which qvdjs estimates at 457 MiB, ran out of heap at 660 MiB and
 * fitted in 675 MiB. The other test files needed less.
 */
export const CONVERSION_BYTES_PER_CELL = 12;

/**
 * Heap the rows hold once read, per cell: the row objects and their values.
 * Measured at 16.7 to 25 bytes per cell on the taxi, lego and orders files,
 * the most where every row holds text of its own.
 */
export const HELD_BYTES_PER_CELL = 32;

/**
 * Heap an export builds from the rows, per cell, by format: about one and a
 * half times what each needed for the taxi file, whose values are short, since
 * the formats that build one string grow with the text. Measured by the
 * smallest heap that let 200,000 or 1,000,000 rows export:
 * Excel 730, YAML 226, XML 107, CSV 104, JSON 35, PostgreSQL 13, Arrow 12 and
 * Qlik inline 7.8 bytes per cell. Arrow's file buffers, outside the V8 heap,
 * aren't counted. Parquet and Avro write as they go, and SQLite keeps its
 * database in sql.js's WebAssembly memory, outside the V8 heap too. JSON also
 * stops at V8's longest string, with a catchable error, at about 1.6 million
 * rows of 20 fields.
 */
export const EXPORT_BYTES_PER_CELL = {
  arrow: 24,
  avro: 16,
  csv: 160,
  excel: 1100,
  json: 64,
  parquet: 16,
  postgres: 24,
  qlik: 16,
  sqlite: 16,
  xml: 160,
  yaml: 352,
};

/**
 * Heap profiling builds, per value of each profiled field: about one and a half
 * times the most measured, on 1,000,000 rows of the taxi file. A date field
 * needed 181 bytes per value, for its Date objects and their sorted copies, and
 * a number or a text field 38.
 */
export const PROFILE_BYTES_PER_VALUE = 288;

// Heap booked by rows callers still hold
let booked = 0;
// Rows a caller drops without releasing them are let go when they are collected
const unreleased = new FinalizationRegistry((release) => release());

/**
 * The heap qvdjs budgets against
 * @returns {number} Bytes
 */
export function usableHeapBytes() {
  const usable = v8.getHeapStatistics().heap_size_limit - QVDJS_HEAP_OVERSTATEMENT;
  return Math.max(usable, QVDJS_MINIMUM_BUDGET);
}

/**
 * Heap booked by rows that callers still hold
 * @returns {number} Bytes
 */
export function bookedBytes() {
  return booked;
}

/**
 * Book heap for rows a caller holds, until release() is called or the rows are collected
 * @param {number} bytes - Heap to book
 * @param {object} [rows] - The rows, so that dropping them releases the booking too
 * @returns {function(): void} release: ends the booking; calling it again does nothing
 */
export function bookHeap(bytes, rows) {
  let released = false;
  booked += bytes;
  const release = () => {
    if (!released) {
      released = true;
      booked -= bytes;
      unreleased.unregister(release);
    }
  };
  if (rows) {
    unreleased.register(rows, release, release);
  }
  return release;
}

/**
 * The memorySafetyFactor to read with
 * qvdjs's own budget, less the heap held rows have booked and what this read
 * adds beyond qvdjs's estimate.
 * @param {number} extraBytes - Heap the read needs beyond qvdjs's estimate
 * @param {{booked?: number, usable?: number}} [heap] - Heap already booked, and
 *   the heap qvdjs budgets against; both read from the process when left out
 * @returns {number} Fraction of the heap qvdjs may let the read use: above zero,
 *   and at most qvdjs's own factor
 */
export function memorySafetyFactorFor(extraBytes, heap = {}) {
  const held = heap.booked ?? bookedBytes();
  const usable = heap.usable ?? usableHeapBytes();
  const allowed = QVDJS_SAFETY_FACTOR * usable - held - extraBytes;
  return Math.min(QVDJS_SAFETY_FACTOR, Math.max(MINIMUM_FACTOR, allowed / usable));
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
  // qvdjs's row count is for the budget this read was given, so it fits. When
  // there is none, the budget may be gone to rows other reads hold, or to the
  // file's distinct values: neither is known here, so neither is named
  const instead =
    fitRows > 0
      ? `About ${count(fitRows)} rows would fit.`
      : "It doesn't fit in the memory that is left.";

  return `${what} needs more memory than VS Code gives its extensions. ${instead}`;
}
