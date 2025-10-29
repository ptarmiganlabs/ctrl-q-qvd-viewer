import { QvdDataFrame } from 'qvdjs';
import { dirname } from 'path';

/**
 * Reads and parses QVD file metadata and data
 */
class QvdReader {
  /**
   * Read QVD file and return metadata and data
   * @param {string} filePath - Path to the QVD file
   * @param {number} maxRows - Maximum number of rows to read (default: 25, 0 = all rows)
   * @returns {Promise<{metadata: object, data: Array, error: string|null}>}
   */
  async read(filePath, maxRows = 25) {
    try {
      // Load the QVD file using qvdjs
      // Configure allowedDir to the parent directory of the file being opened
      // This allows qvdjs to read files from anywhere while still maintaining
      // path traversal protection within that directory
      const loadOptions = {
        ...(maxRows === 0 ? {} : { maxRows }),
        allowedDir: dirname(filePath),
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
      const data = df.data.map((row) =>
        Object.fromEntries(columns.map((col, idx) => [col, row[idx]]))
      );

      return {
        metadata,
        data,
        columns,
        totalRows: metadata.noOfRecords || 0,
        dataError: null,
        error: null,
      };
    } catch (error) {
      return {
        metadata: null,
        data: [],
        columns: [],
        totalRows: 0,
        dataError: null,
        error: error.message,
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
