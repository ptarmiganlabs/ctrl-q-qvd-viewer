import { QvdDataFrame } from 'qvdjs';
import { realpath } from 'fs/promises';
import { dirname } from 'path';
import { createReadQueue } from './readQueue.mjs';
import {
  CONVERSION_BYTES_PER_CELL,
  HELD_BYTES_PER_CELL,
  bookHeap,
  describeMemoryRefusal,
  memorySafetyFactorFor,
} from './memoryGuard.mjs';

// Reads run one at a time in the whole extension host, whichever editor asks.
// Small reads have a lane of their own, so that opening a small QVD doesn't wait
// for a large one, and each large read leaves room in its budget for one of them.
const largeReads = createReadQueue();
const smallReads = createReadQueue();

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

// qvdjs 1.0+ leaves text that looks like a number as text. Convert it the way
// qvdjs 0.6 did, so the grid, profiling and exports see the values they always
// have - including its quirks: "" becomes 0 and "8E5597" becomes Infinity.
const toCellValue = (value) =>
  typeof value === "string" && !isNaN(Number(value)) ? Number(value) : value;

/**
 * Turn qvdjs's rows into one object per row, keyed by field name
 * Yields to the event loop between chunks, so other extensions keep running,
 * and lets each of qvdjs's rows go once it is converted, so the whole of both
 * copies is never held at once. Empties rows as it goes.
 * @param {Array<Array>} rows - qvdjs's rows, one value per field
 * @param {Array<string>} columns - Field names, in file order
 * @param {AbortSignal} [signal] - Gives the conversion up between chunks
 * @returns {Promise<Array<Object>>} The rows as objects
 */
export async function toRowObjects(rows, columns, signal) {
  const rowsPerChunk = Math.max(1, Math.floor(CELLS_PER_CHUNK / Math.max(1, columns.length)));
  const objects = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    objects.push(
      Object.fromEntries(columns.map((col, idx) => [col, toCellValue(row[idx])]))
    );
    rows[i] = undefined;
    if ((i + 1) % rowsPerChunk === 0 && i + 1 < rows.length) {
      await new Promise((resolve) => setImmediate(resolve));
      signal?.throwIfAborted();
    }
  }
  return objects;
}

/**
 * An upper bound on the heap a read costs, from the file's header alone
 * @param {object} header - qvdjs's readMetadata() of the file
 * @param {number} cells - Cells the read returns
 * @param {number} callerBytes - Heap the caller builds from the rows
 * @returns {number} Bytes
 */
function readCostBound(header, cells, callerBytes) {
  let symbols = 0;
  let symbolBytes = 0;
  for (const field of header.fields) {
    symbols += Number(field.noOfSymbols) || 0;
    symbolBytes += Number(field.length) || 0;
  }
  const perCell = QVDJS_BYTES_PER_CELL + CONVERSION_BYTES_PER_CELL + HELD_BYTES_PER_CELL;
  return (
    symbols * BYTES_PER_SYMBOL + symbolBytes * BYTES_PER_SYMBOL_BYTE + cells * perCell + callerBytes
  );
}

/**
 * The result of a read that failed
 * @param {Error} error - Why
 * @returns {object} As QvdReader.read() describes
 */
function failedRead(error) {
  const aborted = error?.name === "AbortError";
  return {
    metadata: null,
    data: [],
    columns: [],
    totalRows: 0,
    dataError: null,
    error: aborted
      ? "The read was given up, because its editor was closed."
      : describeMemoryRefusal(error) ?? error?.message ?? String(error),
    // qvdjs's error class and reason, so a caller can tell a refusal from damage
    errorName: error?.name ?? null,
    errorReason: aborted ? "aborted" : error?.context?.reason ?? null,
    release: () => {},
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
   * @returns {Promise<{metadata: object, data: Array, error: string|null, errorName: string|null, errorReason: string|null, release: function(): void}>}
   *   errorName and errorReason are qvdjs's error class and context.reason, such as
   *   "memory", or "aborted" for a read given up. release() ends the heap the rows
   *   have booked: call it once done with them, so that later reads may use it.
   */
  async read(filePath, maxRows = 25, { signal, bytesPerCell = 0, bytesPerRow = 0 } = {}) {
    try {
      signal?.throwIfAborted();
      // Configure allowedDir to the parent directory of the file being opened
      // This allows qvdjs to read files from anywhere while still maintaining
      // path traversal protection within that directory.
      // qvdjs resolves symlinks before that check, so take the directory of the
      // file's real path: a QVD opened through a symlink in another directory is
      // otherwise refused. A path that can't be resolved is left for qvdjs to report.
      const realFilePath = await realpath(filePath).catch(() => filePath);
      const allowedDir = dirname(realFilePath);

      // The header alone, whatever the file's size, says how much the read returns
      const header = await QvdDataFrame.readMetadata(filePath, { allowedDir, signal });
      const rows = maxRows === 0 ? header.rowCount : Math.min(maxRows, header.rowCount);
      const cells = rows * header.columns.length;
      const callerBytes = cells * bytesPerCell + rows * bytesPerRow;
      const small = readCostBound(header, cells, callerBytes) <= SMALL_READ_BYTES;

      return await (small ? smallReads : largeReads).run(
        () =>
          this.#readNow(filePath, maxRows, {
            allowedDir,
            signal,
            extraBytes:
              cells * CONVERSION_BYTES_PER_CELL + callerBytes + (small ? 0 : SMALL_READ_BYTES),
            callerBytes,
          }),
        { signal }
      );
    } catch (error) {
      return failedRead(error);
    }
  }

  /**
   * Read QVD file now, at its turn in the queue
   * @param {string} filePath - Path to the QVD file
   * @param {number} maxRows - Maximum number of rows to read (0 = all rows)
   * @param {{allowedDir: string, signal?: AbortSignal, extraBytes: number, callerBytes: number}} plan -
   *   extraBytes: heap the read needs beyond qvdjs's estimate; callerBytes: the caller's share of it
   * @returns {Promise<object>} As read() describes
   */
  async #readNow(filePath, maxRows, { allowedDir, signal, extraBytes, callerBytes }) {
    // Load the QVD file using qvdjs
    const loadOptions = {
      ...(maxRows === 0 ? {} : { maxRows }),
      allowedDir,
      // Read a dual value (a date, a formatted number) as the text Qlik displays,
      // as qvdjs 0.x did. Since 1.0 qvdjs reads it as its number by default.
      duals: "text",
      // Priced at this read's turn: qvdjs's budget, less the heap rows still held
      // have booked and what the row objects and the caller add, so that a read
      // too large is refused rather than aborting the extension host
      memorySafetyFactor: memorySafetyFactorFor(extraBytes),
      ...(signal ? { signal } : {}),
    };
    const df = await QvdDataFrame.fromQvd(filePath, loadOptions);

    // Get columns from the DataFrame
    const columns = df.columns || [];

    // Get file-level metadata
    const fileMetadata = df.fileMetadata || {};

    // Get field metadata
    const allFieldMetadata = df.getAllFieldMetadata();

    // Build metadata object matching the expected structure
    const metadata = {
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
      fields: allFieldMetadata.map((field) => {
        // Handle Tags - normalize the structure
        let tagsArray = [];
        if (field.tags) {
          if (field.tags.String) {
            tagsArray = Array.isArray(field.tags.String)
              ? field.tags.String
              : [field.tags.String];
          }
        }

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
          tags: tagsArray,
          comment: field.comment || "",
        };
      }),
    };

    // Convert data from array of arrays to array of objects
    const data = await toRowObjects(df.data, columns, signal);

    // The rows, and what the caller builds from them, hold this until the
    // caller releases them, or drops them
    const release = bookHeap(data.length * columns.length * HELD_BYTES_PER_CELL + callerBytes, data);

    return {
      metadata,
      data,
      columns,
      totalRows: metadata.noOfRecords || 0,
      dataError: null,
      error: null,
      errorName: null,
      errorReason: null,
      release,
    };
  }

  /**
   * Read a specific page of data from the QVD file
   * @param {string} _filePath - Path to the QVD file
   * @param {number} _page - Page number (0-indexed)
   * @param {number} _pageSize - Rows per page
   * @returns {Promise<{metadata: object, data: Array, columns: Array, totalRows: number, page: number, pageSize: number, error: string|null}>}
   * @throws {Error} Not yet implemented - waiting for qvdjs streaming support
   */
  async readPage(_filePath, _page, _pageSize) {
    // TODO: Implement when qvdjs supports streaming
    // For now, this would still load the full file and slice the data
    // const metadata = await this.extractMetadata(filePath);
    // const startRow = page * pageSize;
    // const endRow = Math.min(startRow + pageSize, metadata.noOfRecords);
    //
    // const df = await QvdDataFrame.fromQvd(filePath, { maxRows: endRow });
    // const pageData = df.rows(...Array.from({length: pageSize}, (_, i) => startRow + i));
    //
    // return {
    //     metadata,
    //     data: pageData.data,
    //     columns: pageData.columns,
    //     totalRows: metadata.noOfRecords,
    //     page,
    //     pageSize,
    //     error: null
    // };

    throw new Error(
      "Page-based loading not yet supported. Waiting for qvdjs streaming support."
    );
  }
}

export default QvdReader;
