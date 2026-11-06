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
 * So each read hands qvdjs a smaller budget: qvdjs's own, less the heap that
 * held rows have booked here, and less what this read will add on top of
 * qvdjs's estimate. A read that won't fit is then refused, catchably, before it
 * reads any rows. qvdjs's budget itself comes from qvdjs (see QvdReader), so
 * that a container's memory limit binds here as it binds there.
 */

import { CHUNK_ROWS as CSV_CHUNK_ROWS } from "./exporters/csvExporter.mjs";

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
 * Measured at 16.7 to 25 bytes per cell on the taxi, lego and orders files.
 * The text the rows keep alive is booked on top, from the file's header.
 */
export const HELD_BYTES_PER_CELL = 32;

/**
 * Heap a string costs besides its characters, and per character at most: text
 * outside Latin-1 takes two bytes a character.
 */
const STRING_HEADER_BYTES = 16;
const BYTES_PER_TEXT_CHAR = 2;

/**
 * Heap an export builds from the rows, per cell, by format: about one and a
 * half times what each needed for the taxi file. Measured by the smallest heap
 * that let 200,000 or 1,000,000 rows export: Excel 730, YAML 226, CSV 108 (every
 * row in one chunk), XML 107, JSON 35, PostgreSQL 13, Arrow 12 and Qlik inline
 * 7.8 bytes per cell. CSV writes a chunk of rows at a time, so only its largest
 * chunk is priced (EXPORT_CHUNK_ROWS). Arrow's file buffers, outside the V8
 * heap, aren't counted. Parquet and Avro write as they go, and SQLite keeps its
 * database in sql.js's WebAssembly memory, outside the V8 heap too. JSON also
 * stops at V8's longest string, with a catchable error, at about 1.6 million
 * rows of 20 fields.
 */
export const EXPORT_BYTES_PER_CELL = {
  arrow: 24,
  avro: 16,
  csv: 168,
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
 * Heap an export builds per character of the rows' text, by format, on top of
 * its cost per cell: what the formats that write the text into one string, or
 * keep it in a document, cost as values get longer. About twice what each
 * needed for 50,000 rows of four 400-character values, since text outside
 * Latin-1 takes two bytes a character: Excel 2.3, YAML 1.9, CSV 1.8 (of the
 * chunk it writes at a time), XML and Qlik inline 1.0, JSON and PostgreSQL 0.9
 * and Arrow 0.6 bytes per character. Parquet, Avro and SQLite added nothing to
 * the V8 heap.
 */
export const EXPORT_BYTES_PER_TEXT_CHAR = {
  arrow: 2,
  avro: 0,
  csv: 4,
  excel: 5,
  json: 2,
  parquet: 0,
  postgres: 2,
  qlik: 3,
  sqlite: 0,
  xml: 3,
  yaml: 4,
};

/**
 * Rows an export turns into text at a time, by format, so that its heap is its
 * largest chunk's rather than its whole output's. The formats not listed build
 * their whole output at once, or are priced as if they did.
 */
export const EXPORT_CHUNK_ROWS = { csv: CSV_CHUNK_ROWS };

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
// qvdjs's budget, once a read has asked it: the heap limit and any container limit don't change
let qvdjsBudget = null;

/**
 * qvdjs's budget, as a read found it
 * @typedef {{bytes: number, factor: number}} Budget
 *   bytes: what qvdjs budgets against, the heap or a container limit, whichever binds;
 *   factor: the share of it qvdjs lets a read use when it is given no factor
 */

/**
 * Remember qvdjs's budget
 * @param {Budget} budget - As qvdjs reported it
 */
export function rememberBudget(budget) {
  qvdjsBudget = budget;
}

/**
 * qvdjs's budget, if a read has asked for it yet
 * @returns {Budget|null} The budget
 */
export function knownBudget() {
  return qvdjsBudget;
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
 * Book heap for work a caller is about to do, if it fits in qvdjs's budget less what is booked
 * @param {number} bytes - Heap the work needs
 * @param {Budget} [budget] - qvdjs's budget; without one there is nothing to check against
 * @returns {{release: function(): void}|{leftBytes: number}} release ends the
 *   booking; leftBytes, when the work doesn't fit, is what is left
 */
export function tryBookHeap(bytes, budget = knownBudget()) {
  const left = budget ? budget.factor * budget.bytes - booked : Infinity;
  if (bytes > left) {
    return { leftBytes: Math.max(0, left) };
  }
  return { release: bookHeap(bytes) };
}

/**
 * The memorySafetyFactor to read with
 * qvdjs's own budget, less the heap held rows have booked and what this read
 * adds beyond qvdjs's estimate.
 * @param {number} extraBytes - Heap the read needs beyond qvdjs's estimate
 * @param {Budget} budget - qvdjs's budget
 * @param {number} [held] - Heap already booked; read from the ledger when left out
 * @returns {number} Fraction of qvdjs's budget the read may use: above zero,
 *   and at most qvdjs's own factor
 */
export function memorySafetyFactorFor(extraBytes, budget, held = bookedBytes()) {
  const allowed = budget.factor * budget.bytes - held - extraBytes;
  return Math.min(budget.factor, Math.max(MINIMUM_FACTOR, allowed / budget.bytes));
}

/**
 * Heap the text that rows keep alive costs, from the file's header
 * Each field's distinct values are its symbols: rows can keep at most one per
 * row alive, or all of them, and each costs about its size on disk in
 * characters, plus a string's header.
 * @param {Array<{symbols: number, bytes: number}>} fields - Each field's symbol
 *   count and the bytes of its symbol area, from the header
 * @param {number} rows - Rows read
 * @returns {number} Bytes, whole: bookings stay exact when they are added and taken away
 */
export function heldTextBytes(fields, rows) {
  let bytes = 0;
  for (const field of fields) {
    if (field.symbols > 0) {
      const alive = Math.min(field.symbols, rows);
      bytes += alive * ((field.bytes / field.symbols) * BYTES_PER_TEXT_CHAR + STRING_HEADER_BYTES);
    }
  }
  return Math.ceil(bytes);
}

/**
 * A format's figure from one of the tables above, or 0 for a name that isn't a format
 * @param {Object<string, number>} table - EXPORT_BYTES_PER_CELL, EXPORT_BYTES_PER_TEXT_CHAR or EXPORT_CHUNK_ROWS
 * @param {string} format - The export format
 * @returns {number} Bytes, or rows for EXPORT_CHUNK_ROWS
 */
export function exportCost(table, format) {
  return Object.hasOwn(table, format) ? table[format] : 0;
}

/**
 * Rows an export writes at a time
 * @param {string} format - The export format
 * @returns {number} Rows, or 0 for a format that builds its whole output at once
 */
export function exportChunkRows(format) {
  return exportCost(EXPORT_CHUNK_ROWS, format);
}

/**
 * Heap an export of these rows builds: per cell, and per character of their text
 * A format that writes a chunk of rows at a time holds one chunk's work at a
 * time, so it is priced by its largest chunk.
 * @param {string} format - The export format
 * @param {Array<Object>} rows - The rows read
 * @param {number} columnCount - Fields per row
 * @param {number} [limit] - Rows to export, from the first; 0 or none for every row
 * @returns {{bytes: number, rows: number}} The heap, and the rows it is for
 */
export function exportHeapBytes(format, rows, columnCount, limit = 0) {
  const count = limit > 0 ? Math.min(limit, rows.length) : rows.length;
  const chunkRows = exportChunkRows(format) || count;
  const perCell = exportCost(EXPORT_BYTES_PER_CELL, format);
  const perChar = exportCost(EXPORT_BYTES_PER_TEXT_CHAR, format);
  let bytes = 0;
  for (let start = 0; start < count; start += chunkRows) {
    const end = Math.min(start + chunkRows, count);
    let chars = 0;
    for (let i = start; i < end; i++) {
      const row = rows[i];
      for (const key in row) {
        const value = row[key];
        if (typeof value === "string") {
          chars += value.length;
        }
      }
    }
    bytes = Math.max(bytes, (end - start) * columnCount * perCell + chars * perChar);
  }
  return { bytes, rows: count };
}

/**
 * Bytes, the way the messages below give them
 * @param {number} bytes - Bytes
 * @returns {string} Such as "1.4 GiB" or "380 MiB"
 */
function size(bytes) {
  const mib = bytes / 2 ** 20;
  return mib >= 1024 ? `${(mib / 1024).toFixed(1)} GiB` : `${Math.max(1, Math.round(mib))} MiB`;
}

/**
 * The formats that write as they go, as the user sees them
 */
const LEAN_FORMATS = ["CSV", "Parquet", "Avro"];

/**
 * Say why an export is refused for memory
 * @param {string} formatLabel - The format, as the user sees it
 * @param {number} rows - Rows to export
 * @param {number} neededBytes - Heap the export needs
 * @param {number} leftBytes - Heap left for it
 * @returns {string} The message
 */
export function describeExportRefusal(formatLabel, rows, neededBytes, leftBytes) {
  const others = LEAN_FORMATS.filter((label) => label !== formatLabel);
  return (
    `Exporting ${rows.toLocaleString()} rows to ${formatLabel} needs about ${size(neededBytes)} ` +
    `of memory, and about ${size(leftBytes)} is left in what VS Code gives its extensions. ` +
    `${others.slice(0, -1).join(", ")} and ${others.at(-1)} write as they go, and need much less.`
  );
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
