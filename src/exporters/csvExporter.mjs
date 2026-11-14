import Papa from "papaparse";
import { rowsPerChunk } from "../memoryGuard.mjs";
import { writeChunks, writeFileAtomically } from "./atomicWrite.mjs";
import { sourceOf } from "../exportSource.mjs";

// Rows turned into CSV text at a time, so a large export never holds the whole
// file as one string
export const CHUNK_ROWS = 10000;

/**
 * Heap a CSV export builds, a chunk of rows at a time, for the memory guard.
 * With every row in one chunk it needed 108 bytes per cell, and in its own
 * chunks 1.8 per character of a chunk's text. Only its largest chunk is priced.
 * Measured by the smallest heap that let 200,000 or 1,000,000 rows of
 * chicago_taxi_rides_2016_03.qvd export, against reading them alone, and 50,000
 * rows of four unique 400-character values for the cost per character. See
 * DataExporter.memoryCost() for the margins.
 */
export const memoryCost = {
  bytesPerCell: 168,
  bytesPerTextChar: 4,
  chunkRows: CHUNK_ROWS,
};

// Text that Excel, LibreOffice and Google Sheets would run as a formula: = or @
// first, a tab or carriage return first, or + or - followed by anything but a
// number. "-5", "-1,234.50" and "+46 70 123 45 67" are left alone.
const FORMULA = /^(?:[=@\t\r]|[+-](?![\d\s.,]*(?:[eE][+-]?\d+)?$))/;

/**
 * Collect the field names of all rows, in the order they first appear
 * @param {Array<Object>} rows - Array of row objects
 * @returns {Array<string>} Field names
 */
function fieldsOf(rows) {
  const fields = new Set();
  for (const row of rows) {
    for (const field of Object.keys(row)) {
      fields.add(field);
    }
  }
  return [...fields];
}

/**
 * Turn a value into what Papa Parse should write for it
 * @param {*} value - Field name or value
 * @param {boolean} escapeFormulas - Whether to defuse text a spreadsheet would run as a formula
 * @returns {*} null for an empty cell, otherwise the value or its text
 */
function toCell(value, escapeFormulas) {
  if (value === null || value === undefined) {
    return null;
  }
  // Papa Parse writes a Date without the quotes every other value gets. Write its
  // ISO text instead, and an invalid date as an empty cell.
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  // An apostrophe first makes a spreadsheet show the text instead of running it
  if (escapeFormulas && typeof value === "string" && FORMULA.test(value)) {
    return `'${value}`;
  }
  return value;
}

/**
 * Export data to CSV format
 *
 * The file starts with the header row, as readers that take column names from the
 * first line expect. CSV has no comment syntax, so nothing but an optional byte
 * order mark comes before it. With no field names and no rows, the file is empty.
 * @param {Array<Object>|import("../exportSource.mjs").ExportSource} data - Row objects, or a source of them
 * @param {string} filePath - Destination file path
 * @param {object} [options] - CSV options
 * @param {Array<string>} [options.fields] - Column names in order, such as the QVD's fields. Defaults to every row's keys, in the order they first appear, or a source's columns
 * @param {boolean} [options.escapeFormulas=true] - Put an apostrophe before text that a spreadsheet would run as a formula
 * @param {boolean} [options.byteOrderMark=false] - Start with a UTF-8 byte order mark, which Excel needs to read non-ASCII text
 * @param {number} [options.chunkRows] - Rows turned into text at a time: a whole number of 1 or more
 * @returns {Promise<void>}
 */
export async function exportToCSV(data, filePath, options = {}) {
  const source = sourceOf(data);
  const {
    fields = Array.isArray(data) ? fieldsOf(data) : source.columns,
    escapeFormulas = true,
    byteOrderMark = false,
    chunkRows: rowsOption,
  } = options;
  // A null in a file with one column would make a blank line, which readers skip,
  // so write it as an empty quoted value instead
  const empty = fields.length === 1 ? "" : null;
  const toLine = (values) => values.map((value) => toCell(value, escapeFormulas) ?? empty);
  const unparse = (lines) => Papa.unparse(lines, { quotes: true, newline: "\n" });

  try {
    const chunkRows = rowsPerChunk(memoryCost, fields.length, rowsOption);
    await writeFileAtomically(filePath, async (file) => {
      if (byteOrderMark) {
        await file.writeFile("\uFEFF");
      }
      if (fields.length === 0) {
        return;
      }
      await file.writeFile(unparse([toLine(fields)]));
      await writeChunks(file, source, chunkRows, (rows) => {
        const lines = rows.map((row) => toLine(fields.map((field) => row[field])));
        return `\n${unparse(lines)}`;
      });
    });
  } catch (error) {
    throw new Error(`CSV export failed: ${error.message}`, { cause: error });
  }
}
