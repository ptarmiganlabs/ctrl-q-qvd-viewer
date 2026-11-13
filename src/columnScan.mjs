import { QvdDataFrame, QvdDual } from "qvdjs";
import { toCellValue } from "./cellValue.mjs";

/**
 * Every row of one field of a QVD, a chunk at a time, for whole-file search and sort
 *
 * A chunk comes from qvdjs's columnar page of an open file: one code per row,
 * and the values those codes stand for. A code is the field's own symbol index,
 * the same in every chunk, so that a caller can work out what it needs once per
 * distinct value rather than once per row.
 *
 * qvdjs keeps the values it decodes, for later chunks, until the file is closed.
 * The scan keeps count of what that holds, and once it is more than heldBytes it
 * closes the file and opens it again, which lets them go: a field of 30 million
 * distinct values is scanned in bounded memory, at the cost of walking its
 * symbols again.
 */

/**
 * Most rows a chunk holds
 */
export const CHUNK_ROWS = 1_000_000;

/**
 * Most values a chunk decodes that the scan's open file doesn't hold yet. What
 * qvdjs builds while it decodes them is the larger part of what a scan of a field
 * of distinct values holds: chunks of a million such values took a scan of 47
 * million to about 900 MiB of heap, and chunks of a quarter of that to about 550.
 */
export const FRESH_VALUES_PER_CHUNK = 250_000;

/**
 * Heap the scan's open file may hold before it is opened afresh. Opening it again
 * walks the field's symbols again, which took 0.3 s for 47 million of them.
 */
export const SCAN_HELD_BYTES = 512 * 1024 * 1024;

// Heap a decoded value takes, held and while it is decoded: qvdjs's cache entry,
// its index and its value object, beside its text
const BYTES_PER_VALUE = 400;

/**
 * The most heap a scan holds: what its open file may hold, what a chunk's new
 * values take while they are decoded, and a chunk's codes
 */
export const SCAN_PEAK_BYTES = SCAN_HELD_BYTES + FRESH_VALUES_PER_CHUNK * BYTES_PER_VALUE + 16 * CHUNK_ROWS;

/**
 * Rows a chunk of a field holds: fewer where most rows hold a value of their own
 * @param {number} symbols - The field's distinct values
 * @param {number} totalRows - Rows in the file
 * @param {number} [freshValues] - New values a chunk decodes at most, FRESH_VALUES_PER_CHUNK unless said
 * @returns {number} Rows
 */
export function chunkRowsFor(symbols, totalRows, freshValues = FRESH_VALUES_PER_CHUNK) {
  // Rows per new value, at worst: a field of distinct values has one in each row
  const freshPerRow = Math.min(1, Math.max(0, symbols) / Math.max(1, totalRows));
  if (freshPerRow === 0) {
    return CHUNK_ROWS;
  }
  return Math.max(freshValues, Math.min(CHUNK_ROWS, Math.floor(freshValues / freshPerRow)));
}

/**
 * The value a cell shows in the viewer's grid: a dual's text, and text that is a
 * plain number as that number, as toCellValue() makes it
 * @param {*} value - The value, as qvdjs reads it with duals: "both"
 * @returns {*} The value shown, null for none
 */
export function shownValue(value) {
  return toCellValue(value instanceof QvdDual ? value.text : value);
}

/**
 * The text a cell shows in the viewer's grid, which a search matches
 * @param {*} value - The value, as qvdjs reads it with duals: "both"
 * @returns {string|null} Its text, null for none
 */
export function shownText(value) {
  const shown = shownValue(value);
  return shown === null || shown === undefined ? null : String(shown);
}

/**
 * Heap a decoded value holds in qvdjs's cache
 * @param {*} value - The value
 * @returns {number} Bytes, roughly
 */
function heldBytesOf(value) {
  const text = value instanceof QvdDual ? value.text : typeof value === "string" ? value : null;
  return BYTES_PER_VALUE + (text === null ? 0 : 2 * text.length);
}

/**
 * Scan one field, every row of it, a chunk at a time
 * @param {object} options
 * @param {string} options.filePath - The QVD file
 * @param {string} options.allowedDir - The directory qvdjs may read in
 * @param {string} options.field - The field's name
 * @param {number} options.symbols - Its distinct values, as its header says
 * @param {number} options.totalRows - Rows in the file
 * @param {function({codes: Int32Array, symbols: ReadonlyArray<*>, offset: number}): (void|Promise<void>)} options.onChunk -
 *   Takes each chunk, in file order: codes, one per row of the chunk, a negative
 *   one for null; symbols, the values the codes stand for, indexed by code; offset,
 *   the chunk's first row. The arrays are qvdjs's, and are reused for the next chunk,
 *   once a promise onChunk returns has settled.
 * @param {function(number): void} [options.onRows] - Told the rows scanned so far, after each chunk
 * @param {AbortSignal} [options.signal] - Gives the scan up between chunks, and within one
 * @param {number} [options.chunkRows] - Rows a chunk holds, as chunkRowsFor() says unless a test says otherwise
 * @param {number} [options.heldBytes] - What the open file may hold, SCAN_HELD_BYTES unless a test says otherwise
 * @returns {Promise<{reopened: number}>} How often the file was opened afresh
 * @throws {Error} What qvdjs throws, and an AbortError when the scan is given up
 */
export async function scanColumn({ filePath, allowedDir, heldBytes, ...scan }) {
  const scanner = openColumnScanner({ filePath, allowedDir, heldBytes });
  try {
    return await scanner.scan(scan);
  } finally {
    // A failure to close mustn't hide what went wrong, or spoil a scan that is done
    await scanner.close().catch(() => {});
  }
}

/**
 * Open a QVD for scanning its fields, once or more, one after another
 * The file stays open between scans, so that a field scanned again, as profiling
 * does, doesn't decode the values its open file still holds. What the open file
 * holds is counted across scans: past heldBytes it is opened afresh.
 * @param {object} options
 * @param {string} options.filePath - The QVD file
 * @param {string} options.allowedDir - The directory qvdjs may read in
 * @param {number} [options.heldBytes] - What the open file may hold, SCAN_HELD_BYTES unless a test says otherwise
 * @returns {{scan: function(object): Promise<{reopened: number}>, close: function(): Promise<void>}}
 *   scan(): scans a field, taking scanColumn()'s options but filePath, allowedDir and
 *   heldBytes; close(): closes the file, once every scan is done
 */
export function openColumnScanner({ filePath, allowedDir, heldBytes = SCAN_HELD_BYTES }) {
  let file = null;
  let held = 0;
  // Each field's codes whose values the open file holds already, as far as the scans have seen
  let seenByField = new Map();
  let busy = false;
  // Files whose close failed, tried again when the scanner is closed: an open handle
  // keeps Windows from replacing the file
  const unclosed = [];

  const reopen = async () => {
    const closing = file;
    file = null;
    held = 0;
    seenByField = new Map();
    try {
      await closing?.close();
    } catch (error) {
      unclosed.push(closing);
      throw error;
    }
  };

  return {
    async scan({ field, symbols, totalRows, onChunk, onRows, signal, chunkRows = chunkRowsFor(symbols, totalRows) }) {
      if (busy) {
        throw new Error("A scan of this file is already running");
      }
      busy = true;
      let reopened = 0;
      try {
        for (let offset = 0; offset < totalRows; offset += chunkRows) {
          signal?.throwIfAborted();
          if (file && held > heldBytes) {
            await reopen();
            reopened++;
          }
          // Both halves of a dual: its text, which the grid shows, and its number, which sorts it
          file ??= await QvdDataFrame.open(filePath, { allowedDir, duals: "both" });
          let seen = seenByField.get(field);
          if (!seen) {
            seen = new Uint8Array(Math.max(0, symbols));
            seenByField.set(field, seen);
          }
          const table = await file.columns({
            fields: [field],
            offset,
            limit: Math.min(chunkRows, totalRows - offset),
            signal,
          });
          const column = table.column(field);
          const codes = column.codes;
          const values = column.symbols;
          for (let i = 0; i < codes.length; i++) {
            const code = codes[i];
            if (code >= 0 && code < seen.length && seen[code] === 0) {
              seen[code] = 1;
              held += heldBytesOf(values[code]);
            }
          }
          // A chunk may be taken a slice at a time: the arrays are reused for the next
          await onChunk({ codes, symbols: values, offset });
          onRows?.(offset + codes.length);
          // Other extensions run between chunks
          await new Promise((resolve) => setImmediate(resolve));
        }
        signal?.throwIfAborted();
        return { reopened };
      } catch (error) {
        // A scan given up may have left the file in the middle of a page. Closing it
        // may fail too, which mustn't hide why the scan stopped
        await reopen().catch(() => {});
        throw error;
      } finally {
        busy = false;
      }
    },
    async close() {
      await reopen();
      while (unclosed.length > 0) {
        await unclosed.shift().close();
      }
    },
  };
}
