import { realpath } from "fs/promises";
import { dirname } from "path";
import { QvdDual } from "qvdjs";
import { CalendarDate, toCellValue } from "./cellValue.mjs";
import { SCAN_HELD_BYTES, openColumnScanner, pageRowsFor } from "./columnScan.mjs";
import { countsAsDate, dateColumnOf, dateTimeOf, takeDateValue } from "./qvdDates.mjs";
import {
  emptyColumnType,
  finishColumnType,
  scanColumnTypes,
  takeColumnDate,
  takeColumnValue,
} from "./exporters/columnTypes.mjs";
import { CELLS_PER_YIELD, nextTurn, requireChunkRows } from "./memoryGuard.mjs";
import { fileVersion, headerOf } from "./qvdReader.mjs";

/**
 * The rows an export writes, a chunk at a time
 *
 * An exporter takes its rows from a source rather than from an array, so that a QVD of
 * any size is exported in bounded memory: a source reads its rows a page at a time,
 * and builds row objects for one chunk at a time, as the exporter asks for them. What
 * an exporter needs from every row before it writes the first, such as each column's
 * type, the source works out with a pass of its own over the file, its census.
 *
 * A row object is what QvdReader.read() makes of a row: a field of dates, in a read
 * for dates, holds Dates, and every other value is what toCellValue() makes of it, a
 * dual's text included. Its keys are in the order Object.keys() gives them for an
 * object built in field order, so integer-like names come first.
 *
 * @typedef {object} ExportSource
 * @property {number} length - Rows to export
 * @property {Array<string>} columns - Each row's keys, in Object.keys() order
 * @property {function(): Promise<Object<string, import('./exporters/columnTypes.mjs').ColumnType>>} columnTypes -
 *   What each column holds, as scanColumnTypes() gives it over every row
 * @property {function(): Promise<boolean>} holdsTimestamps - Whether a row holds a
 *   timestamp: a Date with its time of day, rather than a CalendarDate
 * @property {function(number, {keys?: Array<string>}=): AsyncIterable<Array<Object>>} chunks -
 *   The rows, chunkRows at a time, the last chunk with what is left; keys: the only
 *   columns an exporter looks at, which a source may leave the others out of
 * @property {function(number): ExportSource} first - A source of the first rows alone
 * @property {function(function(string): Array<number>, number): Promise<Array<number>>} sumOverText -
 *   What a measure of text gives, summed over every cell of text: measure(text) gives
 *   size numbers, and the sum is of each
 */

/**
 * Whether these rows hold a timestamp: a Date with its time of day, rather than a
 * CalendarDate, a date alone. Every cell is looked at until one is found, so this
 * yields to the event loop as it goes.
 * @param {Array<Object>} rows - Row objects
 * @param {Array<string>} columns - Their keys
 * @returns {Promise<boolean>} True at the first timestamp found
 */
async function arrayHoldsTimestamps(rows, columns) {
  const rowsPerYield = Math.max(1, Math.floor(CELLS_PER_YIELD / Math.max(1, columns.length)));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (const key of columns) {
      const value = row[key];
      if (value instanceof Date && !(value instanceof CalendarDate)) {
        return true;
      }
    }
    if ((i + 1) % rowsPerYield === 0) {
      await nextTurn();
    }
  }
  return false;
}

/**
 * A source of rows already in memory, as tests and small exports have them
 * @param {Array<Object>} rows - Row objects
 * @returns {ExportSource} The source
 */
export function arraySource(rows) {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return {
    length: rows.length,
    columns,
    columnTypes() {
      return scanColumnTypes(rows, columns);
    },
    holdsTimestamps() {
      return arrayHoldsTimestamps(rows, columns);
    },
    async *chunks(chunkRows) {
      requireChunkRows(chunkRows);
      for (let start = 0; start < rows.length; start += chunkRows) {
        yield rows.slice(start, start + chunkRows);
      }
    },
    first(count) {
      return count >= rows.length ? this : arraySource(rows.slice(0, count));
    },
    async sumOverText(measure, size) {
      const sums = new Array(size).fill(0);
      const rowsPerYield = Math.max(1, Math.floor(CELLS_PER_YIELD / Math.max(1, columns.length)));
      for (let i = 0; i < rows.length; i++) {
        for (const value of Object.values(rows[i])) {
          if (typeof value === "string") {
            measure(value).forEach((count, d) => {
              sums[d] += count;
            });
          }
        }
        if ((i + 1) % rowsPerYield === 0) {
          await nextTurn();
        }
      }
      return sums;
    },
  };
}

/**
 * A source of the rows an exporter is given: an array of row objects becomes one
 * @param {Array<Object>|ExportSource} data - Row objects, or a source
 * @returns {ExportSource} The source
 */
export function sourceOf(data) {
  return Array.isArray(data) ? arraySource(data) : data;
}

/**
 * What a file changing under an export throws: its rows would be of two versions
 * @returns {Error} The error
 */
export function changedWhileExported() {
  return Object.assign(new Error("The QVD file changed while it was exported. Export it again."), {
    name: "QvdChangedError",
  });
}

/**
 * What reading the QVD for an export throws when the file can't be read, as such
 * @param {Error} error - What reading it threw
 * @returns {Error} The error, said to be the read's; one that gives the export up, or
 *   tells of the file changing, as it was
 */
function readFailure(error) {
  if (error?.name === "AbortError" || error?.name === "QvdChangedError") {
    return error;
  }
  return Object.assign(new Error(`Failed to read QVD for export: ${error?.message ?? error}`, { cause: error }), {
    readFailure: true,
  });
}

/**
 * The read failure an export's error comes of, if it does
 * @param {*} error - What the export threw
 * @returns {Error|null} The read's error, as readFailure() makes it, or null
 */
export function readFailureOf(error) {
  for (let cause = error; cause; cause = cause.cause) {
    if (cause.readFailure) {
      return cause;
    }
  }
  return null;
}

/**
 * The value a cell shows, as QvdReader.read() makes it outside a column of dates
 * @param {*} value - The value, as qvdjs reads it with duals: "both"
 * @returns {*} The cell
 */
function shownCell(value) {
  return toCellValue(value instanceof QvdDual ? value.text : value);
}

/**
 * How a column's values become cells: as the census found its column to hold
 * @param {typeof Date|null} DateOfKind - Date or CalendarDate for a column of dates, null otherwise
 * @returns {function(*): *} The cell of a value, as qvdjs reads it with duals: "both"
 */
function cellMaker(DateOfKind) {
  if (DateOfKind === null) {
    return shownCell;
  }
  return (value) => (countsAsDate(value) ? new DateOfKind(dateTimeOf(value)) : shownCell(value));
}

/**
 * Open a QVD as the source of an export
 * The file is read through one open file at a time, opened afresh once it holds more
 * than heldBytes of decoded values, and checked against the version first read at
 * each opening and after each pass: a file rewritten during an export would give rows
 * of both versions.
 * @param {string} filePath - The QVD file
 * @param {object} [options]
 * @param {number} [options.rows=0] - Rows to export, from the first; 0 for every row
 * @param {boolean} [options.dates=false] - Whether a field of dates or timestamps reads as
 *   Dates, as QvdReader.read() reads it for a format with date types
 * @param {AbortSignal} [options.signal] - Gives the export up between pages, and within one
 * @param {function(function(): Promise<*>): Promise<*>} [options.exclusive] - Runs a pass,
 *   such as the census, that mustn't run beside other large reads; at once unless said
 * @param {function({rows: number, chars: number}): (void|Promise<void>)} [options.onChunk] -
 *   Told of each chunk built, its rows and the characters of its text, before an
 *   exporter takes it: it may throw to stop the export, as one that won't fit
 * @param {function({pass: string, rows: number, totalRows: number}): void} [options.onProgress] -
 *   Told the rows read so far: pass is "census" or "rows"
 * @param {number} [options.heldBytes] - What the open file may hold, SCAN_HELD_BYTES unless a test says otherwise
 * @param {number} [options.pageRows] - Rows a page holds, as pageRowsFor() says unless a test says otherwise
 * @returns {Promise<ExportSource & {fields: Array<string>, header: object, close: function(): Promise<void>}>}
 *   The source; fields: the QVD's field names, in file order; header: its header, as
 *   headerOf() gives it; close(): closes the file, once the export is done
 */
export async function openQvdSource(
  filePath,
  { rows = 0, dates = false, signal, exclusive = (work) => work(), onChunk, onProgress, heldBytes = SCAN_HELD_BYTES, pageRows } = {}
) {
  // As QvdReader.read() does: qvdjs resolves links before it checks the file is in the
  // directory it may read, so that directory is the real path's
  const realFilePath = await realpath(filePath).catch(() => filePath);
  const allowedDir = dirname(realFilePath);
  const header = await headerOf(filePath, realFilePath, allowedDir, signal).catch((error) => {
    throw readFailure(error);
  });
  const fieldsByName = new Map(header.fields.map((field) => [field.name, field]));
  // The fields in the order the rows hold them, as qvdjs names its columns
  const fields = header.view.columns.map((name) => {
    const field = fieldsByName.get(name);
    return { name, symbols: field?.symbols ?? 0, tags: field?.tags ?? [] };
  });
  const keys = Object.keys(Object.fromEntries(fields.map(({ name }) => [name, null])));
  const scanner = openColumnScanner({ filePath, allowedDir, heldBytes });

  /**
   * The scanner's pages, a failure to read them said to be the read's: what the loop
   * over them throws stays as it is
   * @param {object} options - As the scanner's pages() takes them
   * @returns {AsyncGenerator<object>} The pages
   */
  async function* readPages(options) {
    const pages = scanner.pages(options);
    try {
      for (;;) {
        let step;
        try {
          step = await pages.next();
        } catch (error) {
          throw readFailure(error);
        }
        if (step.done) {
          return;
        }
        yield step.value;
      }
    } finally {
      await pages.return();
    }
  }

  const unchanged = async () => {
    if (header.key && (await fileVersion(realFilePath)) !== header.key) {
      throw changedWhileExported();
    }
  };

  /**
   * A source of the first count rows
   * @param {number} count - Rows
   * @returns {ExportSource} The source
   */
  const sourceOfRows = (count) => {
    const length = Math.min(count, header.rowCount);
    const rowsOf = pageRows ?? pageRowsFor(fields, header.rowCount);
    let census = null;

    /**
     * Each column's type, and for a read for dates whether it holds dates and of
     * which kind, from each distinct value of the rows to export. A column holds dates
     * as findDateColumns() decides it over the rows read, and its type is then what
     * scanColumnTypes() finds in its cells: so each column's type is worked out both
     * ways, and the one its dates decide is kept once every value is seen.
     * @returns {Promise<{types: Object<string, object>, kinds: Array<typeof Date|null>, timestamps: boolean}>} The census
     */
    const takeCensus = () =>
      exclusive(async () => {
        const asShown = fields.map(() => emptyColumnType());
        const asDates = fields.map(() => emptyColumnType());
        const dateColumns = fields.map(({ tags }) => dateColumnOf(tags));
        const datesSeen = fields.map(() => emptyColumnType());
        const nulls = fields.map(() => false);
        onProgress?.({ pass: "census", rows: 0, totalRows: length });
        // Each distinct value is taken at its first sight in the open file: one the file
        // opened afresh shows again is taken again, which changes nothing
        for await (const { columns, offset } of readPages({
          fields,
          to: length,
          chunkRows: rowsOf,
          signal,
          beforeOpen: unchanged,
          freshCodes: true,
        })) {
          for (let f = 0; f < fields.length; f++) {
            const { codes, symbols, fresh } = columns[f];
            const dateColumn = dateColumns[f];
            if (!nulls[f]) {
              const count = fields[f].symbols;
              for (let i = 0; i < codes.length; i++) {
                if (codes[i] < 0 || codes[i] >= count) {
                  nulls[f] = true;
                  break;
                }
              }
            }
            for (const code of fresh) {
              const value = symbols[code];
              const shown = shownCell(value);
              takeColumnValue(asShown[f], shown);
              if (!dates) {
                continue;
              }
              if (!countsAsDate(value)) {
                takeColumnValue(asDates[f], shown);
              } else if (dateColumn.holdsDates) {
                const time = takeDateValue(dateColumn, value);
                if (time !== null) {
                  takeColumnDate(datesSeen[f], time, true);
                }
              }
            }
          }
          onProgress?.({ pass: "census", rows: offset + (columns[0]?.codes.length ?? 0), totalRows: length });
        }
        await unchanged();

        const types = {};
        const kinds = [];
        let timestamps = false;
        fields.forEach(({ name }, f) => {
          const dateColumn = dateColumns[f];
          const holdsDates = dates && dateColumn.holdsDates && datesSeen[f].hasDate;
          const type = holdsDates ? asDates[f] : asShown[f];
          if (nulls[f]) {
            takeColumnValue(type, null);
          }
          if (holdsDates) {
            Object.assign(type, {
              hasDate: true,
              calendarDates: !dateColumn.timestamps,
              earliestTime: datesSeen[f].earliestTime,
              hasMilliseconds: datesSeen[f].hasMilliseconds,
            });
            timestamps ||= dateColumn.timestamps;
          }
          types[name] = finishColumnType(type);
          kinds.push(holdsDates ? (dateColumn.timestamps ? Date : CalendarDate) : null);
        });
        return { types, kinds, timestamps };
      });

    const censusOf = () => {
      census ??= takeCensus();
      return census;
    };

    return {
      length,
      columns: keys,
      fields: fields.map(({ name }) => name),
      header,
      async columnTypes() {
        const { types } = await censusOf();
        // A copy, as scanColumnTypes() gives each caller its own
        return structuredClone(types);
      },
      async holdsTimestamps() {
        return (await censusOf()).timestamps;
      },
      async *chunks(chunkRows, { keys: wanted } = {}) {
        requireChunkRows(chunkRows);
        // Without dates every cell is what it shows, and no census is needed
        const kinds = dates ? (await censusOf()).kinds : fields.map(() => null);
        const picked = fields
          .map((field, f) => ({ ...field, cell: cellMaker(kinds[f]) }))
          .filter(({ name }) => !wanted || wanted.includes(name));
        const names = picked.map(({ name }) => name);
        const cells = picked.map(({ cell }) => cell);
        // A code past a field's distinct values is a null, as the census takes it
        const counts = picked.map(({ symbols }) => symbols);
        let chunk = [];
        let chars = 0;
        const done = async () => {
          const rowsOfChunk = chunk;
          await onChunk?.({ rows: rowsOfChunk.length, chars });
          chunk = [];
          chars = 0;
          return rowsOfChunk;
        };
        onProgress?.({ pass: "rows", rows: 0, totalRows: length });
        for await (const { columns, offset } of readPages({
          fields: picked,
          to: length,
          chunkRows: rowsOf,
          signal,
          beforeOpen: unchanged,
        })) {
          const pageLength = columns[0]?.codes.length ?? 0;
          for (let i = 0; i < pageLength; i++) {
            const row = {};
            for (let f = 0; f < names.length; f++) {
              const { codes, symbols } = columns[f];
              const code = codes[i];
              const cell = code < 0 || code >= counts[f] ? null : cells[f](symbols[code]);
              if (typeof cell === "string") {
                chars += cell.length;
              }
              row[names[f]] = cell;
            }
            chunk.push(row);
            if (chunk.length === chunkRows) {
              yield await done();
            }
          }
          onProgress?.({ pass: "rows", rows: offset + pageLength, totalRows: length });
        }
        if (chunk.length > 0) {
          yield await done();
        }
        await unchanged();
      },
      first(rowCount) {
        return rowCount >= length ? this : sourceOfRows(rowCount);
      },
      // From each distinct value once, times the rows it is in, rather than from row
      // objects: a value's measure is worked out at its first sight in the open file,
      // and only a value it gives anything for is measured again after
      async sumOverText(measure, size) {
        // Each cell as chunks() makes it: the census comes first, in a turn of its own
        const dateKinds = dates ? (await censusOf()).kinds : fields.map(() => null);
        const cellsOf = dateKinds.map(cellMaker);
        return exclusive(async () => {
          const sums = new Array(size).fill(0);
          // Each field's values: 1 once measured and found to give nothing, 2 to give something
          const kinds = fields.map(({ symbols }) => new Uint8Array(Math.max(0, symbols)));
          onProgress?.({ pass: "census", rows: 0, totalRows: length });
          for await (const { columns, offset } of readPages({
            fields,
            to: length,
            chunkRows: rowsOf,
            signal,
            beforeOpen: unchanged,
          })) {
            for (let f = 0; f < fields.length; f++) {
              const { codes, symbols } = columns[f];
              const kind = kinds[f];
              const cellOf = cellsOf[f];
              for (let i = 0; i < codes.length; i++) {
                const code = codes[i];
                if (code < 0 || code >= kind.length || kind[code] === 1) {
                  continue;
                }
                const cell = cellOf(symbols[code]);
                const counts = typeof cell === "string" ? measure(cell) : null;
                if (!counts || counts.every((count) => count === 0)) {
                  kind[code] = 1;
                  continue;
                }
                kind[code] = 2;
                counts.forEach((count, d) => {
                  sums[d] += count;
                });
              }
            }
            onProgress?.({ pass: "census", rows: offset + (columns[0]?.codes.length ?? 0), totalRows: length });
          }
          await unchanged();
          return sums;
        });
      },
      close: () => scanner.close(),
    };
  };

  return sourceOfRows(rows > 0 ? rows : header.rowCount);
}
