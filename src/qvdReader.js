const fs = require("fs").promises;
const xml2js = require("xml2js");
const { QvdFileReader } = require("qvd4js");

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
      // Extract metadata from the XML header first
      const metadata = await this.extractMetadata(filePath);

      let data = [];
      let columns = [];
      let dataError = null;

      try {
        // Try to read the data using qvd4js
        const reader = new QvdFileReader(filePath);
        const dataFrame = await reader.load();

        // Get columns
        columns = dataFrame.columns || metadata.fields.map((f) => f.name);

        // Determine how many rows to return (0 means all)
        const numRows =
          maxRows === 0
            ? metadata.noOfRecords
            : Math.min(maxRows, metadata.noOfRecords || 0);
        data = [];

        // Read rows from dataFrame.data which is indexed by row number
        for (let i = 0; i < numRows; i++) {
          const rowData = dataFrame.data[i.toString()];
          if (rowData) {
            const row = {};
            columns.forEach((col, idx) => {
              row[col] = rowData[idx];
            });
            data.push(row);
          }
        }
      } catch (error) {
        console.error("Error reading QVD data:", error);
        dataError = error.message;
        // Continue with just metadata - no placeholder data
        columns = metadata.fields.map((f) => f.name);
      }

      return {
        metadata,
        data,
        columns,
        totalRows: metadata.noOfRecords || 0,
        dataError,
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
   * Read specific page of data (FUTURE: when qvd4js supports streaming/lazy loading)
   * @param {string} filePath - Path to the QVD file
   * @param {number} page - Page number (0-indexed)
   * @param {number} pageSize - Rows per page
   * @returns {Promise<{metadata: object, data: Array, columns: Array, totalRows: number, page: number, pageSize: number, error: string|null}>}
   */
  async readPage(filePath, page, pageSize) {
    // TODO: Implement when qvd4js supports streaming
    // For now, this would still load the full file and slice the data
    // const metadata = await this.extractMetadata(filePath);
    // const startRow = page * pageSize;
    // const endRow = Math.min(startRow + pageSize, metadata.noOfRecords);
    //
    // const reader = new QvdFileReader(filePath);
    // // Hypothetical future API:
    // const dataFrame = await reader.loadRange(startRow, endRow);
    //
    // return {
    //     metadata,
    //     data: dataFrame.data,
    //     columns: dataFrame.columns,
    //     totalRows: metadata.noOfRecords,
    //     page,
    //     pageSize,
    //     error: null
    // };

    throw new Error(
      "Page-based loading not yet supported. Waiting for qvd4js streaming support."
    );
  }

  /**
   * Extract metadata from QVD file XML header
   * @param {string} filePath - Path to the QVD file
   * @returns {Promise<object>}
   */
  async extractMetadata(filePath) {
    try {
      const fileContent = await fs.readFile(filePath, "utf8");

      // QVD files have XML header followed by binary data
      // Extract XML part (ends with </QvdTableHeader>)
      const xmlEndMarker = "</QvdTableHeader>";
      const xmlEndIndex = fileContent.indexOf(xmlEndMarker);

      if (xmlEndIndex === -1) {
        throw new Error("Invalid QVD file: XML header not found");
      }

      const xmlContent = fileContent.substring(
        0,
        xmlEndIndex + xmlEndMarker.length
      );

      // Parse XML
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlContent);

      const header = result.QvdTableHeader;

      // Extract ALL metadata fields, including potentially empty ones
      const metadata = {
        qvBuildNo: header.QvBuildNo || "",
        creatorDoc: header.CreatorDoc || "",
        createUtcTime: header.CreateUtcTime || "",
        sourceCreateUtcTime: header.SourceCreateUtcTime || "",
        sourceFileUtcTime: header.SourceFileUtcTime || "",
        sourceFileSize: header.SourceFileSize || "",
        staleUtcTime: header.StaleUtcTime || "",
        tableName: header.TableName || "",
        tableCreator: header.TableCreator || "",
        compression: header.Compression || "",
        recordByteSize: header.RecordByteSize || "",
        noOfRecords: parseInt(header.NoOfRecords) || 0,
        offset: parseInt(header.Offset) || 0,
        length: parseInt(header.Length) || 0,
        comment: header.Comment || "",
        encryptionInfo: header.EncryptionInfo || "",
        tableTags: header.TableTags || "",
        profilingData: header.ProfilingData || "",
        lineage: header.Lineage || [],
        fields: [],
      };

      // Extract field information
      if (header.Fields && header.Fields.QvdFieldHeader) {
        const fields = Array.isArray(header.Fields.QvdFieldHeader)
          ? header.Fields.QvdFieldHeader
          : [header.Fields.QvdFieldHeader];

        metadata.fields = fields.map((field) => {
          // Handle Tags - can be an array of strings or empty
          let tagsArray = [];
          if (field.Tags) {
            if (field.Tags.String) {
              tagsArray = Array.isArray(field.Tags.String)
                ? field.Tags.String
                : [field.Tags.String];
            }
          }

          return {
            name: field.FieldName || "",
            type: field.Type || "",
            extent: field.Extent || "",
            noOfSymbols: parseInt(field.NoOfSymbols) || 0,
            offset: parseInt(field.Offset) || 0,
            length: parseInt(field.Length) || 0,
            bitOffset: parseInt(field.BitOffset) || 0,
            bitWidth: parseInt(field.BitWidth) || 0,
            bias: parseInt(field.Bias) || 0,
            numberFormat: field.NumberFormat
              ? {
                  type: field.NumberFormat.Type || "",
                  nDec: field.NumberFormat.nDec || "",
                  useThou: field.NumberFormat.UseThou || "",
                  fmt: field.NumberFormat.Fmt || "",
                  dec: field.NumberFormat.Dec || "",
                  thou: field.NumberFormat.Thou || "",
                }
              : null,
            tags: tagsArray,
            comment: field.Comment || "",
          };
        });
      }

      return metadata;
    } catch (error) {
      console.error("Error extracting metadata:", error);
      throw error;
    }
  }
}

module.exports = QvdReader;
