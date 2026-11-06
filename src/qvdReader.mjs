import { QvdDataFrame } from 'qvdjs';
import { realpath } from 'fs/promises';
import { dirname } from 'path';
import { createReadQueue } from './readQueue.mjs';
import { describeMemoryRefusal, memorySafetyFactorFor } from './memoryGuard.mjs';

// One read at a time in the whole extension host, whichever editor asks
const reads = createReadQueue();

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
 * @returns {Promise<Array<Object>>} The rows as objects
 */
export async function toRowObjects(rows, columns) {
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
    }
  }
  return objects;
}

/**
 * Reads and parses QVD file metadata and data
 */
class QvdReader {
  /**
   * Read QVD file and return metadata and data
   * Reads run one at a time, in the order they are asked for.
   * @param {string} filePath - Path to the QVD file
   * @param {number} maxRows - Maximum number of rows to read (default: 25, 0 = all rows)
   * @returns {Promise<{metadata: object, data: Array, error: string|null, errorName: string|null, errorReason: string|null}>}
   *   errorName and errorReason are qvdjs's error class and context.reason, such as "memory"
   */
  async read(filePath, maxRows = 25) {
    return reads.run(() => this.readNow(filePath, maxRows));
  }

  /**
   * Read QVD file now, without waiting for other reads
   * @param {string} filePath - Path to the QVD file
   * @param {number} maxRows - Maximum number of rows to read (0 = all rows)
   * @returns {Promise<object>} As read() describes
   */
  async readNow(filePath, maxRows) {
    try {
      // Load the QVD file using qvdjs
      // Configure allowedDir to the parent directory of the file being opened
      // This allows qvdjs to read files from anywhere while still maintaining
      // path traversal protection within that directory.
      // qvdjs resolves symlinks before that check, so take the directory of the
      // file's real path: a QVD opened through a symlink in another directory is
      // otherwise refused. A path that can't be resolved is left for qvdjs to report.
      const realFilePath = await realpath(filePath).catch(() => filePath);
      const memorySafetyFactor = memorySafetyFactorFor(maxRows);
      const loadOptions = {
        ...(maxRows === 0 ? {} : { maxRows }),
        allowedDir: dirname(realFilePath),
        // Read a dual value (a date, a formatted number) as the text Qlik displays,
        // as qvdjs 0.x did. Since 1.0 qvdjs reads it as its number by default.
        duals: "text",
        // A read of every row leaves room in qvdjs's budget for the row objects
        // built below, so that one too large is refused rather than aborting
        ...(memorySafetyFactor === undefined ? {} : { memorySafetyFactor }),
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
      const data = await toRowObjects(df.data, columns);

      return {
        metadata,
        data,
        columns,
        totalRows: metadata.noOfRecords || 0,
        dataError: null,
        error: null,
        errorName: null,
        errorReason: null,
      };
    } catch (error) {
      return {
        metadata: null,
        data: [],
        columns: [],
        totalRows: 0,
        dataError: null,
        error: describeMemoryRefusal(error) ?? error.message,
        // qvdjs's error class and reason, so a caller can tell a refusal from damage
        errorName: error.name ?? null,
        errorReason: error.context?.reason ?? null,
      };
    }
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
