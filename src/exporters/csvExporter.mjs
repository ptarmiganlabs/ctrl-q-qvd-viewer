import Papa from "papaparse";
import { writeFileAtomically } from "./atomicWrite.mjs";

// Rows turned into CSV text at a time, so a large export never holds the whole
// file as one string
const CHUNK_ROWS = 10000;

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
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @param {object} [options] - CSV options
 * @param {Array<string>} [options.fields] - Column names in order, such as the QVD's fields. Defaults to every row's keys, in the order they first appear
 * @param {boolean} [options.escapeFormulas=true] - Put an apostrophe before text that a spreadsheet would run as a formula
 * @param {boolean} [options.byteOrderMark=false] - Start with a UTF-8 byte order mark, which Excel needs to read non-ASCII text
 * @param {number} [options.chunkRows] - Rows turned into text at a time
 * @returns {Promise<void>}
 */
export async function exportToCSV(data, filePath, options = {}) {
  const {
    fields = fieldsOf(data),
    escapeFormulas = true,
    byteOrderMark = false,
    chunkRows = CHUNK_ROWS,
  } = options;
  // A null in a file with one column would make a blank line, which readers skip,
  // so write it as an empty quoted value instead
  const empty = fields.length === 1 ? "" : null;
  const toLine = (values) => values.map((value) => toCell(value, escapeFormulas) ?? empty);
  const unparse = (lines) => Papa.unparse(lines, { quotes: true, newline: "\n" });

  try {
    await writeFileAtomically(filePath, async (file) => {
      if (byteOrderMark) {
        await file.writeFile("\uFEFF");
      }
      if (fields.length === 0) {
        return;
      }
      await file.writeFile(unparse([toLine(fields)]));
      for (let start = 0; start < data.length; start += chunkRows) {
        const lines = data
          .slice(start, start + chunkRows)
          .map((row) => toLine(fields.map((field) => row[field])));
        await file.writeFile(`\n${unparse(lines)}`);
      }
    });
  } catch (error) {
    throw new Error(`CSV export failed: ${error.message}`, { cause: error });
  }
}
