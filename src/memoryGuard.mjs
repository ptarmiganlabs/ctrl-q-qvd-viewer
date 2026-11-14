import os from "os";

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
 * that a container's memory limit binds here as it binds there. What a caller
 * builds is declared by the caller: each exporter declares its own cost, and
 * the profiler its own.
 */

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
 * Heap a read for dates needs per distinct value of a field that may hold dates, as
 * it finds them: a Date, 32 bytes, and its entry in the map that finds them, up to 43
 * bytes while the map grows. Measured on a million distinct timestamps.
 */
export const DATE_BYTES_PER_VALUE = 96;

/**
 * Heap the rows of a read for dates hold per distinct date: its Date, 32 bytes.
 */
export const HELD_BYTES_PER_DATE = 48;

/**
 * Heap a read for dates needs for the Dates of its date fields, at most
 * Which fields hold dates is known only once the rows are read, so every field that
 * may is priced: all but those tagged $text, whose values are all text, never a date.
 * @param {Array<{symbols: number, tags: Array<string>}>} fields - The header's fields
 * @param {number} rows - Rows the read returns
 * @returns {number} Bytes
 */
export function dateValueBytes(fields, rows) {
  let values = 0;
  for (const field of fields) {
    if (!field.tags.includes("$text")) {
      values += Math.min(field.symbols, rows);
    }
  }
  return values * DATE_BYTES_PER_VALUE;
}

/**
 * Heap a string costs besides its characters, and per character at most: text
 * outside Latin-1 takes two bytes a character.
 */
const STRING_HEADER_BYTES = 16;
const BYTES_PER_TEXT_CHAR = 2;

// Rows looked at for the share of each field's values that are text
const SAMPLED_ROWS = 1000;

// Cells an export's pricing looks at between yields to the event loop: a few milliseconds
export const CELLS_PER_YIELD = 1000000;

/**
 * Give the event loop a turn, as work over every row does between its slices
 * @returns {Promise<void>} Resolves on the next turn
 */
export function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

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
 * The share of each field's values that are text, from rows spread through those read
 * A field whose values are numbers keeps no text alive, however many bytes its
 * symbols take on disk: the row objects hold its numbers.
 * @param {Array<Object>} rows - The rows, as objects
 * @param {Array<string>} columns - Their fields
 * @returns {Map<string, number>} Each field's share of text among its values that
 *   aren't null, from 0 to 1; 0 for a field with none
 */
export function textShares(rows, columns) {
  const step = Math.max(1, Math.floor(rows.length / SAMPLED_ROWS));
  const shares = new Map();
  for (const column of columns) {
    let values = 0;
    let texts = 0;
    for (let i = 0; i < rows.length; i += step) {
      const value = rows[i][column];
      if (value !== null && value !== undefined) {
        values++;
        if (typeof value === "string") {
          texts++;
        }
      }
    }
    shares.set(column, values > 0 ? texts / values : 0);
  }
  return shares;
}

/**
 * Heap the text that rows keep alive costs, from the file's header
 * Each field's distinct values are its symbols: rows can keep at most one per
 * row alive, or all of them, and each costs about its size on disk in
 * characters, plus a string's header. Only the share of them that is text
 * counts.
 * @param {Array<{name?: string, symbols: number, bytes: number}>} fields - Each
 *   field's name, symbol count and the bytes of its symbol area, from the header
 * @param {number} rows - Rows read
 * @param {Map<string, number>} [shares] - Each field's share of text, from
 *   textShares(); without it, every field counts as text
 * @returns {number} Bytes, whole: bookings stay exact when they are added and taken away
 */
export function heldTextBytes(fields, rows, shares) {
  let bytes = 0;
  for (const field of fields) {
    const share = shares ? shares.get(field.name) ?? 1 : 1;
    if (field.symbols > 0 && share > 0) {
      const alive = Math.min(field.symbols, rows) * share;
      bytes += alive * ((field.bytes / field.symbols) * BYTES_PER_TEXT_CHAR + STRING_HEADER_BYTES);
    }
  }
  return Math.ceil(bytes);
}

/**
 * What an export builds on the heap from the rows, as its exporter declares it
 * @typedef {object} ExportCost
 * @property {number} bytesPerCell - Heap per cell
 * @property {number} bytesPerTextChar - Heap per character of the rows' text, on top
 * @property {number} [chunkRows] - Rows it builds from at a time, so that only its largest chunk is priced
 * @property {number} [chunkCells] - Cells it builds from at a time, at most, so that a chunk of a QVD
 *   with many fields has fewer rows
 * @property {function(Object<string, object>, Array<string>): Array<string>} [dictionaryColumns] -
 *   The columns, of these types, whose distinct values it holds from before its first
 *   chunk to the end, as a dictionary of them
 * @property {number} [bytesPerDistinctText] - Heap per distinct value of such a column
 * @property {number} [bytesPerSymbolByte] - Memory per byte of such a field's symbols in the
 *   QVD: the text of its distinct values, which is held to the end too, if outside the heap
 * @property {number} [rowGroupRows] - Rows it holds beside a chunk's before it writes them,
 *   as Parquet's row groups, each of which adds to the footer it holds to the end
 */

/**
 * Refuse a chunk size that isn't a whole number of 1 or more, which would never end a
 * chunk loop or would cut rows in two
 * @param {number} chunkRows - Rows a chunk
 * @returns {number} The same rows
 * @throws {RangeError} For any other value
 */
export function requireChunkRows(chunkRows) {
  if (!Number.isInteger(chunkRows) || chunkRows < 1) {
    throw new RangeError(`chunkRows must be a whole number of 1 or more, not ${String(chunkRows)}`);
  }
  return chunkRows;
}

/**
 * Rows an export that writes as it goes builds from at a time
 * At most its chunkRows and, where it declares chunkCells, at most that many cells, so
 * that a chunk of a QVD with many fields holds the event loop up no longer than one with
 * few. At least one row.
 * @param {ExportCost} cost - What the export builds, as its exporter declares it
 * @param {number} columnCount - Fields per row
 * @param {number} [chunkRows] - Rows a chunk instead, such as a test's
 * @returns {number} Rows
 * @throws {RangeError} For a chunkRows that isn't a whole number of 1 or more
 */
export function rowsPerChunk(cost, columnCount, chunkRows) {
  if (chunkRows !== undefined) {
    return requireChunkRows(chunkRows);
  }
  if (!(cost.chunkCells > 0)) {
    return cost.chunkRows;
  }
  return Math.max(1, Math.min(cost.chunkRows, Math.floor(cost.chunkCells / Math.max(1, columnCount))));
}

/**
 * Memory an export's dictionaries hold to the end
 * For each field whose distinct values it holds, as many as the QVD has symbols in
 * it, at most one a row, and their text, at most the bytes of its symbols: a text
 * symbol holds its text and two bytes besides.
 * @param {ExportCost} cost - What the export builds, as its exporter declares it
 * @param {Array<{symbols: number, bytes: number}>} fields - Each such field's symbols
 *   and the bytes they take, from the QVD's header
 * @param {number} rows - Rows exported
 * @returns {number} Bytes
 */
export function dictionaryBytes(cost, fields, rows) {
  let bytes = 0;
  for (const field of fields) {
    bytes += Math.min(rows, field.symbols) * (cost.bytesPerDistinctText ?? 0) + field.bytes * (cost.bytesPerSymbolByte ?? 0);
  }
  return bytes;
}

/**
 * Memory left on this computer for work outside the heap, such as a database built in
 * memory: the computer's memory, or a container's limit where it is less, less what
 * the extension host already uses
 * @returns {number} Bytes, 0 at least
 */
export function memoryLeftOutsideHeap() {
  const total = os.totalmem();
  const constrained = typeof process.constrainedMemory === "function" ? process.constrainedMemory() : 0;
  const limit = constrained > 0 && constrained < total ? constrained : total;
  return Math.max(0, limit - process.memoryUsage().rss);
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
 * Say why an export is refused for memory
 * @param {string} formatLabel - The format, as the user sees it
 * @param {number} rows - Rows to export
 * @param {number} neededBytes - Memory the export needs
 * @param {number} leftBytes - Memory left for it
 * @param {{onComputer?: boolean}} [options] - onComputer: whether what is left is the
 *   computer's memory, outside the heap, not VS Code's heap
 * @returns {string} The message
 */
export function describeExportRefusal(formatLabel, rows, neededBytes, leftBytes, { onComputer = false } = {}) {
  return (
    `Exporting ${rows.toLocaleString()} rows to ${formatLabel} needs about ${size(neededBytes)} ` +
    `of memory, and about ${size(leftBytes)} is left ` +
    `${onComputer ? "on this computer" : "in what VS Code gives its extensions"}.`
  );
}

/**
 * A read refused for memory, as QvdReader reports it
 * @typedef {object} Refusal
 * @property {number} rows - Rows asked for
 * @property {number} totalRows - Rows in the file
 * @property {number} fitRows - Rows qvdjs says would fit, or 0 when none does
 * @property {boolean} forCaller - Whether the rows alone would have fit: what the
 *   caller builds from them is what doesn't
 * @property {number} neededBytes - Heap the caller said it builds from the rows
 * @property {number} leftBytes - Heap left for that once the rows are read, when forCaller
 */

/**
 * Whether a read qvdjs refused would have fit without what the caller builds from its rows
 * @param {object} check - qvdjs's check of the read, from its refusal
 * @param {{leftBytes: number, readBytes: number, callerBytes: number}} priced -
 *   leftBytes: heap left for the read at its turn; readBytes: what the read adds
 *   beyond qvdjs's estimate, the caller's work aside; callerBytes: the caller's work
 * @returns {{forCaller: boolean, neededBytes: number, leftBytes: number}} What QvdReader adds to the refusal
 */
export function pricingOfRefusal(check, { leftBytes, readBytes, callerBytes }) {
  const estimate = check?.estimate;
  if (!estimate || !(callerBytes > 0)) {
    return { forCaller: false, neededBytes: callerBytes, leftBytes: 0 };
  }
  // qvdjs counts its external memory against a container's limit, not against the heap
  const rowsNeed =
    (Number(estimate.heapBytes) || 0) +
    (check.budget?.bound === "process" ? Number(estimate.externalBytes) || 0 : 0) +
    readBytes;
  return {
    forCaller: rowsNeed <= leftBytes,
    neededBytes: callerBytes,
    leftBytes: Math.max(0, leftBytes - rowsNeed),
  };
}

/**
 * The refusal in what qvdjs threw, if it refused a read for memory
 * @param {Error} error - What qvdjs threw, with the pricing QvdReader adds to a refusal
 * @returns {Refusal|null} The refusal, or null when this isn't a memory refusal
 */
export function memoryRefusalOf(error) {
  const context = error?.context;
  if (error?.name !== "QvdValidationError" || context?.reason !== "memory") {
    return null;
  }
  const totalRows = Number(context.totalRows) || 0;
  const pricing = error.pricing ?? {};
  return {
    rows: Number(context.maxRows) || totalRows,
    totalRows,
    fitRows: Number(context.recommendedMaxRows) || 0,
    forCaller: pricing.forCaller === true,
    neededBytes: Number(pricing.neededBytes) || 0,
    leftBytes: Number(pricing.leftBytes) || 0,
  };
}

/**
 * Say why a read was refused for memory, in terms a VS Code user can act on
 * qvdjs's own message suggests a limit option and --max-old-space-size, which
 * the viewer's user can't set.
 * @param {Refusal} refusal - The refusal
 * @param {{offerRows?: boolean}} [options] - offerRows: say how many rows would
 *   fit; false for an action that reads every row whatever it is given, as
 *   Export and Profile do
 * @returns {string} The message
 */
export function describeReadRefusal(refusal, { offerRows = true } = {}) {
  const count = (rows) => rows.toLocaleString();
  const what =
    refusal.rows >= refusal.totalRows
      ? `Reading all ${count(refusal.totalRows)} rows of this QVD`
      : `Reading ${count(refusal.rows)} of this QVD's ${count(refusal.totalRows)} rows`;
  // qvdjs's row count is for the budget this read was given, so it fits. When
  // there is none, the budget may be gone to rows other reads hold, or to the
  // file's distinct values: neither is known here, so neither is named
  const instead =
    refusal.fitRows > 0
      ? offerRows
        ? ` About ${count(refusal.fitRows)} rows would fit.`
        : ""
      : " It doesn't fit in the memory that is left.";
  return `${what} needs more memory than VS Code gives its extensions.${instead}`;
}

/**
 * Say why a page of the viewer's grid was refused for memory
 * @param {{offset: number, rows: number, neededBytes: number, leftBytes: number}} page -
 *   offset: the page's first row, counted from 0; rows: its rows; neededBytes: what
 *   showing it needs, the columns the file's open copy holds included; leftBytes: what
 *   is left for that
 * @returns {string} The message
 */
export function describePageRefusal({ offset, rows, neededBytes, leftBytes }) {
  const first = (offset + 1).toLocaleString();
  const last = (offset + rows).toLocaleString();
  return (
    `Showing rows ${first} to ${last} needs about ${size(neededBytes)} of memory, and about ` +
    `${size(leftBytes)} is left in what VS Code gives its extensions.`
  );
}

/**
 * Say why a whole-file search or sort for the viewer's grid was refused for memory
 * @param {{what: string, neededBytes: number, leftBytes: number}} view - what: what
 *   was asked, such as "Sorting all 30,000,000 rows by OrderID"; neededBytes: what it
 *   needs; leftBytes: what is left for it
 * @returns {string} The message
 */
export function describeViewRefusal({ what, neededBytes, leftBytes }, { onComputer = false } = {}) {
  return (
    `${what} needs about ${size(neededBytes)} of memory, and about ${size(leftBytes)} is left ` +
    `${onComputer ? "on this computer" : "in what VS Code gives its extensions"}.`
  );
}

/**
 * Say why a read was refused when its rows fit, and what is built from them doesn't
 * @param {Refusal} refusal - The refusal
 * @returns {string} The message
 */
export function describeCallerRefusal(refusal) {
  return (
    `Reading the rows fits, but what is made from them needs about ${size(refusal.neededBytes)} ` +
    `of memory, and about ${size(refusal.leftBytes)} is left in what VS Code gives its extensions.`
  );
}

/**
 * Say why qvdjs refused a read for memory
 * @param {Error} error - What qvdjs threw
 * @returns {string|null} The message, or null when this isn't a memory refusal
 */
export function describeMemoryRefusal(error) {
  const refusal = memoryRefusalOf(error);
  if (!refusal) {
    return null;
  }
  return refusal.forCaller ? describeCallerRefusal(refusal) : describeReadRefusal(refusal);
}
