import { QvdDataFrame, QvdDual } from 'qvdjs';
import { realpath, stat } from 'fs/promises';
import { dirname } from 'path';
import { createReadQueue } from './readQueue.mjs';
import { toCellValue } from './cellValue.mjs';
import { findDateColumns } from './qvdDates.mjs';
import {
  CONVERSION_BYTES_PER_CELL,
  HELD_BYTES_PER_CELL,
  HELD_BYTES_PER_DATE,
  bookHeap,
  bookedBytes,
  dateValueBytes,
  describeCallerRefusal,
  describeReadRefusal,
  dictionaryBytes,
  heldTextBytes,
  knownBudget,
  memoryRefusalOf,
  memorySafetyFactorFor,
  nextTurn,
  pricingOfRefusal,
  rememberBudget,
  textShares,
} from './memoryGuard.mjs';

// Reads run one at a time in the whole extension host, whichever editor asks.
// Small reads have a lane of their own, so that opening a small QVD doesn't wait
// for a large one, and each large read leaves room in its budget for one of them.
const largeReads = createReadQueue();
const smallReads = createReadQueue();

/**
 * The two lanes, for tests that need to hold one busy
 */
export const readLanes = { large: largeReads, small: smallReads };

// Headers of files read lately, so that a file's later reads, such as Load
// More, Export and Profile on an open file, price themselves without opening it
// an extra time
const headers = new Map();
const HEADERS_KEPT = 32;

/**
 * The most heap a read in the small lane costs, and so what a large read leaves for it
 */
export const SMALL_READ_BYTES = 128 * 1024 * 1024;

// What a read costs at most per symbol, per byte of symbols and per cell of
// qvdjs's own rows: generous, since they decide only which lane a read takes
const BYTES_PER_SYMBOL = 64;
const BYTES_PER_SYMBOL_BYTE = 4;
const QVDJS_BYTES_PER_CELL = 16;

// Cells to convert between yields to the event loop: about 15 ms of work
const CELLS_PER_CHUNK = 250000;

// Times a read is priced afresh because its file changed while it waited for its
// turn, before it is read as it then is
const PRICINGS = 3;

// What a read's turn returns when its file changed while it waited
const FILE_CHANGED = Symbol("file changed");

/**
 * A cell's value in a row object: its Date in a column of dates, or what
 * toCellValue() makes of it, a dual's text included
 * @param {*} value - The cell as qvdjs reads it
 * @param {Map<*, Date>|null|undefined} columnDates - Its column's dates, if it holds dates
 * @returns {*} The value
 */
function rowValue(value, columnDates) {
  const date = columnDates?.get(value);
  if (date) {
    return date;
  }
  return toCellValue(value instanceof QvdDual ? value.text : value);
}

/**
 * Turn qvdjs's rows into one object per row, keyed by field name
 * Yields to the event loop between chunks, so other extensions keep running,
 * and lets each of qvdjs's rows go once it is converted, so the whole of both
 * copies is never held at once. Empties rows as it goes.
 * @param {Array<Array>} rows - qvdjs's rows, one value per field
 * @param {Array<string>} columns - Field names, in file order
 * @param {AbortSignal} [signal] - Gives the conversion up between chunks
 * @param {Array<Map<*, Date>|null>} [dates] - For each column of dates, the Date of
 *   each of its values, as findDateColumns() gives them
 * @returns {Promise<Array<Object>>} The rows as objects
 */
export async function toRowObjects(rows, columns, signal, dates = null) {
  const rowsPerChunk = Math.max(1, Math.floor(CELLS_PER_CHUNK / Math.max(1, columns.length)));
  const objects = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    objects.push(
      Object.fromEntries(columns.map((col, idx) => [col, rowValue(row[idx], dates?.[idx])]))
    );
    rows[i] = undefined;
    if ((i + 1) % rowsPerChunk === 0 && i + 1 < rows.length) {
      await nextTurn();
      signal?.throwIfAborted();
    }
  }
  return objects;
}

/**
 * A file's header, as far as pricing a read needs it
 * @typedef {{key: string|null, rowCount: number, columnCount: number, fields: Array<{name: string, symbols: number, bytes: number, tags: Array<string>}>, view: {metadata: object, columns: Array<string>}}} Header
 *   key: which version of the file it is, or null when the file can't be looked at;
 *   fields: each field's name, symbol count, symbol area's size in bytes, and tags;
 *   view: the header as the viewer shows it, for a file whose rows then fail to read
 */

/**
 * Which version of a file this is: its inode, size and modification time
 * @param {string} realFilePath - The file's real path
 * @returns {Promise<string|null>} The version, or null when the file can't be looked at
 */
export async function fileVersion(realFilePath) {
  const stats = await stat(realFilePath).catch(() => null);
  return stats ? `${stats.ino}:${stats.size}:${stats.mtimeMs}` : null;
}

/**
 * A field's tags, such as $numeric and $timestamp, as a list
 * @param {object} field - The field, as qvdjs reads it from the header
 * @returns {Array<string>} Its tags, none for a field without
 */
function tagsOf(field) {
  const tags = field.tags?.String;
  if (!tags) {
    return [];
  }
  return Array.isArray(tags) ? tags : [tags];
}

/**
 * The file's header, from the files read lately when it hasn't changed since
 * @param {string} filePath - Path to the QVD file
 * @param {string} realFilePath - Its real path
 * @param {string} allowedDir - The directory qvdjs may read in
 * @param {AbortSignal} [signal] - Gives the read up
 * @returns {Promise<Header>} The header
 */
export async function headerOf(filePath, realFilePath, allowedDir, signal) {
  const key = await fileVersion(realFilePath);
  const kept = headers.get(realFilePath);
  if (key && kept?.key === key) {
    return kept;
  }

  const metadata = await QvdDataFrame.readMetadata(filePath, { allowedDir, signal });
  const header = {
    key,
    rowCount: metadata.rowCount,
    columnCount: metadata.columns.length,
    fields: metadata.fields.map((field) => ({
      name: field.fieldName,
      symbols: Number(field.noOfSymbols) || 0,
      bytes: Number(field.length) || 0,
      tags: tagsOf(field),
    })),
    view: {
      metadata: viewerMetadata(metadata.fileMetadata || {}, metadata.fields),
      columns: metadata.columns,
    },
  };
  if (key) {
    headers.delete(realFilePath);
    headers.set(realFilePath, header);
    if (headers.size > HEADERS_KEPT) {
      headers.delete(headers.keys().next().value);
    }
  }
  return header;
}

/**
 * qvdjs's budget: asked once, since neither the heap limit nor a container's
 * memory limit changes. A read of one row of the file's smallest field makes
 * qvdjs report it, walking no more than that field's symbols.
 * @param {string} filePath - Path to the QVD file
 * @param {string} allowedDir - The directory qvdjs may read in
 * @param {Header} header - The file's header
 * @param {AbortSignal} [signal] - Gives the read up
 * @returns {Promise<import('./memoryGuard.mjs').Budget|null>} The budget, or null
 *   for a file with no fields, whose read needs none
 */
export async function budgetFor(filePath, allowedDir, header, signal) {
  const known = knownBudget();
  if (known || header.fields.length === 0) {
    return known;
  }
  const smallest = header.fields.reduce((a, b) => (b.bytes < a.bytes ? b : a));
  const { budget } = await QvdDataFrame.checkRead(filePath, {
    allowedDir,
    maxRows: 1,
    fields: [smallest.name],
    signal,
  });
  const found = { bytes: budget.allowedBytes / budget.safetyFactor, factor: budget.safetyFactor };
  rememberBudget(found);
  return found;
}

/**
 * Refuse an option that isn't a count, the way qvdjs refuses its own
 * @param {*} value - The option's value
 * @param {string} name - Its name
 * @param {boolean} [whole=false] - Whether it must be a whole number
 * @param {number} [most=Infinity] - The largest value allowed
 * @throws {Error} A QvdValidationError with context.reason "option"
 */
export function requireCount(value, name, whole = false, most = Infinity) {
  const count =
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= most &&
    (!whole || Number.isInteger(value));
  if (!count) {
    const range = most === Infinity ? "of 0 or more" : `from 0 to ${most}`;
    throw Object.assign(
      new Error(`${name} must be ${whole ? "a whole number" : "a number"} ${range}, not ${String(value)}`),
      { name: "QvdValidationError", context: { reason: "option", option: name } }
    );
  }
}

/**
 * An upper bound on the heap a read costs, from the file's header alone
 * @param {Header} header - The file's header
 * @param {number} cells - Cells the read returns
 * @param {number} callerBytes - Heap the caller builds from the rows
 * @returns {number} Bytes
 */
function readCostBound(header, cells, callerBytes) {
  let symbols = 0;
  let symbolBytes = 0;
  for (const field of header.fields) {
    symbols += field.symbols;
    symbolBytes += field.bytes;
  }
  const perCell = QVDJS_BYTES_PER_CELL + CONVERSION_BYTES_PER_CELL + HELD_BYTES_PER_CELL;
  return (
    symbols * BYTES_PER_SYMBOL + symbolBytes * BYTES_PER_SYMBOL_BYTE + cells * perCell + callerBytes
  );
}

/**
 * The operating system's code for why a file couldn't be opened or read
 * qvdjs puts it in a QvdIOError's context.code, with Node's own error as its cause,
 * and an error from Node itself carries it as its code. qvdjs's own codes, such as
 * QVD_IO_ERROR, and Node's ERR_ codes are not the system's.
 * @param {Error} error - What was thrown
 * @returns {string|null} Such as ENOENT, EACCES or EBUSY; null when there is none
 */
function systemCodeOf(error) {
  for (const code of [error?.context?.code, error?.cause?.code, error?.code]) {
    if (typeof code === "string" && /^E[A-Z0-9]+$/.test(code)) {
      return code;
    }
  }
  return null;
}

/**
 * What a failed read's error says about itself, so that a caller can tell a
 * missing or locked file, a refusal and damage apart
 * @param {Error} error - What was thrown
 * @returns {{errorName: string|null, errorReason: string|null, errorCode: string|null, errorOption: string|null}}
 *   errorName: the error's class, such as QvdIOError, QvdCorruptedError or AbortError;
 *   errorReason: qvdjs's context.reason, such as "memory" or "option", or "aborted"
 *   for a read given up; errorCode: the system's code, such as ENOENT; errorOption:
 *   the option refused, when errorReason is "option"
 */
export function errorFacts(error) {
  const reason = error?.name === "AbortError" ? "aborted" : error?.context?.reason ?? null;
  return {
    errorName: error?.name ?? null,
    errorReason: reason,
    errorCode: systemCodeOf(error),
    errorOption: reason === "option" ? error.context.option ?? null : null,
  };
}

/**
 * Whether an error is the reader's account of the file, rather than the viewer's own failure
 * qvdjs's errors, the system's, and the viewer's own refusals of a read, a page, or
 * a search or sort it won't make, are about the file; anything else thrown while it is read, such as a TypeError, is the viewer's.
 * @param {Error} error - What was thrown
 * @returns {boolean} Whether it is
 */
export function isReadError(error) {
  const { errorName, errorCode, errorReason } = errorFacts(error);
  return (
    Boolean(errorCode) || errorReason === "view" || (typeof errorName === "string" && errorName.startsWith("Qvd"))
  );
}

/**
 * The result of a read that failed: what describeReadFailure() takes
 * @param {Error} error - Why
 * @returns {object} As QvdReader.read() describes
 */
export function failedRead(error) {
  const facts = errorFacts(error);
  const aborted = facts.errorReason === "aborted";
  const refusal = aborted ? null : memoryRefusalOf(error);
  let message;
  if (aborted) {
    message = "The read was given up, because its editor was closed.";
  } else if (refusal && (error.page || error.view)) {
    // A page, or a search or sort, of the viewer's grid, whose refusal says what was asked, and what is left
    message = error.message;
  } else if (refusal) {
    message = refusal.forCaller ? describeCallerRefusal(refusal) : describeReadRefusal(refusal);
  } else {
    message = error?.message ?? String(error);
  }
  return {
    metadata: null,
    data: [],
    columns: [],
    totalRows: 0,
    dataError: null,
    error: message,
    ...facts,
    refusal,
    release: () => {},
  };
}

/**
 * A file's metadata as the viewer shows it, from qvdjs's account of its header
 * @param {object} fileMetadata - The file's own metadata, as qvdjs gives it
 * @param {Array<object>} fields - Each field's, as qvdjs gives them
 * @returns {object} The metadata
 */
function viewerMetadata(fileMetadata, fields) {
  return {
    qvBuildNo: fileMetadata.qvBuildNo || "",
    creatorDoc: fileMetadata.creatorDoc || "",
    createUtcTime: fileMetadata.createUtcTime || "",
    sourceCreateUtcTime: fileMetadata.sourceCreateUtcTime || "",
    sourceFileUtcTime: fileMetadata.sourceFileUtcTime || "",
    sourceFileSize: fileMetadata.sourceFileSize || "",
    staleUtcTime: fileMetadata.staleUtcTime || "",
    tableName: fileMetadata.tableName || "",
    tableCreator: fileMetadata.tableCreator || "",
    compression: fileMetadata.compression || "",
    recordByteSize: fileMetadata.recordByteSize || "",
    noOfRecords: parseInt(fileMetadata.noOfRecords) || 0,
    offset: parseInt(fileMetadata.offset) || 0,
    length: parseInt(fileMetadata.length) || 0,
    comment: fileMetadata.comment || "",
    encryptionInfo: fileMetadata.encryptionInfo || "",
    tableTags: fileMetadata.tableTags || "",
    profilingData: fileMetadata.profilingData || "",
    lineage: fileMetadata.lineage || [],
    fields: fields.map((field) => {
      return {
        name: field.fieldName || "",
        type: field.type || "",
        extent: field.extent || "",
        noOfSymbols: parseInt(field.noOfSymbols) || 0,
        offset: parseInt(field.offset) || 0,
        length: parseInt(field.length) || 0,
        bitOffset: parseInt(field.bitOffset) || 0,
        bitWidth: parseInt(field.bitWidth) || 0,
        bias: parseInt(field.bias) || 0,
        numberFormat: field.numberFormat
          ? {
              type: field.numberFormat.Type || "",
              nDec: field.numberFormat.nDec || "",
              useThou: field.numberFormat.UseThou || "",
              fmt: field.numberFormat.Fmt || "",
              dec: field.numberFormat.Dec || "",
              thou: field.numberFormat.Thou || "",
            }
          : null,
        tags: tagsOf(field),
        comment: field.comment || "",
      };
    }),
  };
}

/**
 * Reads and parses QVD file metadata and data
 */
class QvdReader {
  /**
   * Read QVD file and return metadata and data
   * Reads run one at a time, in the order they join their lane once their
   * file's header is read: small reads in a lane of their own. A read that won't
   * fit in the memory left, together with what the caller says it will build
   * from the rows, is refused for memory.
   * @param {string} filePath - Path to the QVD file
   * @param {number} maxRows - Maximum number of rows to read (default: 25, 0 = all rows)
   * @param {object} [options]
   * @param {AbortSignal} [options.signal] - Gives the read up, queued or running: its editor was closed
   * @param {number} [options.bytesPerCell=0] - Heap the caller builds from the rows per cell, such as an export's
   * @param {number} [options.bytesPerRow=0] - Heap the caller builds from the rows per row, such as profiling's
   * @param {number} [options.chunkRows=0] - Rows the caller builds from at a time, such as
   *   a CSV export's; 0 for every row at once
   * @param {number} [options.bytesPerDistinctText=0] - Heap the caller holds to the end per
   *   distinct value of a text field, as an Arrow export's dictionaries do
   * @param {number} [options.bytesPerSymbolByte=0] - Memory it holds to the end per byte of
   *   a text field's symbols, their text. Only fields tagged $text are priced so, whose
   *   values are all text: what else the caller holds is priced once the rows are read
   * @param {boolean} [options.holdCallerBytes=true] - Whether the rows' booking includes
   *   the caller's work from the start. A caller that waits on the user first, as Export
   *   does for its dialogs, books its work itself when it begins.
   * @param {boolean} [options.dates=false] - Whether a field of dates or timestamps reads
   *   as Dates, for an export to a format with date types, rather than as the text Qlik
   *   shows. Each Date holds the QVD's wall clock in its UTC fields.
   * @returns {Promise<{metadata: object, data: Array, error: string|null, errorName: string|null, errorReason: string|null, errorCode: string|null, errorOption: string|null, refusal: import('./memoryGuard.mjs').Refusal|null, release: function(): void}>}
   *   errorName and errorReason are qvdjs's error class and context.reason, such as
   *   "memory", "option" for a maxRows or cost that isn't a count, or "aborted" for a
   *   read given up. errorCode is the system's code for a file that couldn't be opened
   *   or read, such as ENOENT, EACCES, EISDIR, EBUSY or EPERM, and errorOption the
   *   option refused, as errorFacts() gives them. refusal, for a memory refusal, says
   *   whether the rows or what the caller builds from them didn't fit. release() ends
   *   the heap the rows have booked: call it once done with them, so that later reads
   *   may use it.
   */
  async read(
    filePath,
    maxRows = 25,
    {
      signal,
      bytesPerCell = 0,
      bytesPerRow = 0,
      chunkRows = 0,
      bytesPerDistinctText = 0,
      bytesPerSymbolByte = 0,
      holdCallerBytes = true,
      dates = false,
    } = {}
  ) {
    try {
      signal?.throwIfAborted();
      // qvdjs reads a maxRows of null, say, as every row: priced as anything else,
      // such a read would get past the memory check
      requireCount(maxRows, "maxRows", true);
      requireCount(bytesPerCell, "bytesPerCell");
      requireCount(bytesPerRow, "bytesPerRow");
      requireCount(chunkRows, "chunkRows", true);
      requireCount(bytesPerDistinctText, "bytesPerDistinctText");
      requireCount(bytesPerSymbolByte, "bytesPerSymbolByte");
      // Configure allowedDir to the parent directory of the file being opened
      // This allows qvdjs to read files from anywhere while still maintaining
      // path traversal protection within that directory.
      // qvdjs resolves symlinks before that check, so take the directory of the
      // file's real path: a QVD opened through a symlink in another directory is
      // otherwise refused. A path that can't be resolved is left for qvdjs to report.
      const realFilePath = await realpath(filePath).catch(() => filePath);
      const allowedDir = dirname(realFilePath);

      // Priced again when the file changed while the read waited for its turn,
      // as a reload rewriting it would: its rows are qvdjs's to read as they are then
      for (let pricing = 1; ; pricing++) {
        // The header alone, whatever the file's size, says how much the read returns
        const header = await headerOf(filePath, realFilePath, allowedDir, signal);
        const rows = maxRows === 0 ? header.rowCount : Math.min(maxRows, header.rowCount);
        const cells = rows * header.columnCount;
        // What the caller builds, for as many rows as it builds from at once
        const callerRows = chunkRows > 0 ? Math.min(chunkRows, rows) : rows;
        // and what it holds of its text fields' distinct values for every row
        const textFields = header.fields.filter((field) => field.tags.includes("$text"));
        const callerBytes =
          callerRows * (header.columnCount * bytesPerCell + bytesPerRow) +
          dictionaryBytes({ bytesPerDistinctText, bytesPerSymbolByte }, textFields, rows);
        // A read for dates also finds a Date for each distinct value of its date fields
        const dateBytes = dates ? dateValueBytes(header.fields, rows) : 0;
        const costBound = readCostBound(header, cells, callerBytes) + dateBytes;
        const small = costBound <= SMALL_READ_BYTES;
        const budget = await budgetFor(filePath, allowedDir, header, signal);

        const outcome = await (small ? smallReads : largeReads).run(
          () =>
            this.#readNow(filePath, maxRows, {
              allowedDir,
              realFilePath,
              signal,
              budget,
              header: pricing < PRICINGS ? header : null,
              fields: header.fields,
              conversionBytes: cells * CONVERSION_BYTES_PER_CELL + dateBytes,
              callerBytes,
              // Room for a small read beside a large one
              reserveBytes: small ? 0 : SMALL_READ_BYTES,
              // The caller's work is held with the rows unless it books that itself
              callerHeldBytes: holdCallerBytes ? callerBytes : 0,
              costBound,
              dates,
            }),
          { signal }
        );
        if (outcome !== FILE_CHANGED) {
          return outcome;
        }
      }
    } catch (error) {
      return failedRead(error);
    }
  }

  /**
   * The number of rows in a QVD, from its header alone
   * @param {string} filePath - Path to the QVD file
   * @param {{signal?: AbortSignal}} [options] - signal: gives it up
   * @returns {Promise<number>} The rows
   * @throws {Error} What reading the header throws
   */
  async rowCount(filePath, { signal } = {}) {
    const realFilePath = await realpath(filePath).catch(() => filePath);
    const header = await headerOf(filePath, realFilePath, dirname(realFilePath), signal);
    return header.rowCount;
  }

  /**
   * A QVD's header as the viewer shows it, without its rows
   * The header of a file whose rows can't be read, because they are damaged or
   * too many for the memory left, usually still reads: in milliseconds, whatever
   * the file's size, and not at all when a read has just read it and the file
   * hasn't changed since. It isn't queued, as reads are.
   * @param {string} filePath - Path to the QVD file
   * @param {{signal?: AbortSignal}} [options] - signal: gives it up
   * @returns {Promise<{metadata: object, columns: Array<string>, totalRows: number, key: string|null}>} As
   *   read() gives them, and key: which version of the file it is, null when the file can't be looked at
   * @throws {Error} What reading the header throws
   */
  async readHeader(filePath, { signal } = {}) {
    const realFilePath = await realpath(filePath).catch(() => filePath);
    // A read that failed has just read it, and kept it unless the file has changed since
    const header = await headerOf(filePath, realFilePath, dirname(realFilePath), signal);
    // A copy, so that a caller can't change the one kept
    const { metadata, columns } = structuredClone(header.view);
    return { metadata, columns, totalRows: metadata.noOfRecords, key: header.key };
  }

  /**
   * Wait until the large reads running or waiting now are done
   * A read's check counts what was booked when its turn came, not what starts
   * beside it. Work that starts while one runs, such as an export once its
   * dialogs are answered, waits for it here, and is then priced against what it
   * holds.
   * @param {{signal?: AbortSignal}} [options] - signal: gives the wait up
   * @returns {Promise<void>} Resolves once they are done
   */
  async afterLargeReads({ signal } = {}) {
    await largeReads.run(async () => {}, { signal });
  }

  /**
   * Read QVD file now, at its turn in the queue
   * @param {string} filePath - Path to the QVD file
   * @param {number} maxRows - Maximum number of rows to read (0 = all rows)
   * @param {object} plan - How the read was priced
   * @param {string} plan.allowedDir - The directory qvdjs may read in
   * @param {string} plan.realFilePath - The file's real path
   * @param {AbortSignal} [plan.signal] - Gives the read up
   * @param {object|null} plan.budget - qvdjs's budget
   * @param {object|null} plan.header - The header the read was priced from, to check the file
   *   against; null to read the file as it is
   * @param {Array<object>} plan.fields - The header's fields, for the text the rows keep alive
   * @param {number} plan.conversionBytes - Heap the row objects need beyond qvdjs's estimate
   * @param {number} plan.callerBytes - Heap the caller builds from the rows
   * @param {number} plan.reserveBytes - Heap left for a small read beside this one
   * @param {number} plan.callerHeldBytes - Heap the rows' booking holds for the caller's work
   * @param {number} plan.costBound - An upper bound on what the read costs
   * @param {boolean} plan.dates - Whether a field of dates or timestamps reads as Dates
   * @returns {Promise<object|symbol>} As read() describes, or FILE_CHANGED
   */
  async #readNow(filePath, maxRows, plan) {
    const { allowedDir, realFilePath, signal, budget, header, fields } = plan;
    const { conversionBytes, callerBytes, reserveBytes, callerHeldBytes, costBound, dates } = plan;

    // A file rewritten since it was priced is priced again
    if (header?.key && (await fileVersion(realFilePath)) !== header.key) {
      return FILE_CHANGED;
    }

    // Priced at this read's turn: qvdjs's budget, less the heap rows still held
    // have booked and what the row objects and the caller add, so that a read
    // too large is refused rather than aborting the extension host
    const held = bookedBytes();
    const extraBytes = conversionBytes + callerBytes + reserveBytes;
    const factor = budget ? memorySafetyFactorFor(extraBytes, budget, held) : null;

    // Given up while it runs, the read still holds what it has read until it
    // stops, and the next read may start before that: booked meanwhile, at most
    // what this read was allowed, so that what starts next is priced against it
    let releaseAbandoned = () => {};
    const abandon = () => {
      const allowed = factor === null ? costBound : factor * budget.bytes + conversionBytes;
      releaseAbandoned = bookHeap(Math.min(costBound, allowed));
    };
    signal?.addEventListener("abort", abandon, { once: true });
    try {
      signal?.throwIfAborted();

      // Load the QVD file using qvdjs
      const loadOptions = {
        ...(maxRows === 0 ? {} : { maxRows }),
        allowedDir,
        // Read a dual value (a date, a formatted number) as the text Qlik displays,
        // as qvdjs 0.x did. Since 1.0 qvdjs reads it as its number by default. A read
        // for dates takes both halves: a date's number, and the others' text.
        duals: dates ? "both" : "text",
        ...(factor === null ? {} : { memorySafetyFactor: factor }),
        ...(signal ? { signal } : {}),
      };
      let df;
      try {
        df = await QvdDataFrame.fromQvd(filePath, loadOptions);
      } catch (error) {
        // Whether the rows didn't fit, or what the caller builds from them
        if (budget && error?.name === "QvdValidationError" && error.context?.reason === "memory") {
          error.pricing = pricingOfRefusal(error.context.check, {
            leftBytes: budget.factor * budget.bytes - held,
            readBytes: conversionBytes + reserveBytes,
            callerBytes,
          });
        }
        throw error;
      }

      // Get columns from the DataFrame
      const columns = df.columns || [];

      // The file's metadata and its fields', from its header
      const metadata = viewerMetadata(df.fileMetadata || {}, df.getAllFieldMetadata());

      // Convert data from array of arrays to array of objects, with a field of
      // dates or timestamps as Dates when asked
      let dateColumns = null;
      if (dates) {
        const tagsByName = new Map(metadata.fields.map((field) => [field.name, field.tags]));
        const tags = columns.map((column) => tagsByName.get(column) ?? []);
        dateColumns = await findDateColumns(df.data, tags, signal);
      }
      const data = await toRowObjects(df.data, columns, signal, dateColumns);

      // Given up after the conversion's last check: nobody is waiting for these
      // rows, so nothing is booked for them
      signal?.throwIfAborted();

      // The rows hold this until the caller releases them, or drops them: their
      // objects, the text they keep alive, which a field of numbers doesn't, and
      // the caller's work when it is held with them
      const heldDates = (dateColumns ?? []).reduce((sum, dates) => sum + (dates?.size ?? 0), 0);
      const heldBytes =
        data.length * columns.length * HELD_BYTES_PER_CELL +
        heldTextBytes(fields, data.length, textShares(data, columns)) +
        heldDates * HELD_BYTES_PER_DATE +
        callerHeldBytes;
      const release = bookHeap(heldBytes, data);

      return {
        metadata,
        data,
        columns,
        totalRows: metadata.noOfRecords || 0,
        dataError: null,
        error: null,
        errorName: null,
        errorReason: null,
        errorCode: null,
        errorOption: null,
        refusal: null,
        release,
      };
    } finally {
      signal?.removeEventListener("abort", abandon);
      releaseAbandoned();
    }
  }
}

export default QvdReader;
