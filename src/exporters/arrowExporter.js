const fs = require("fs").promises;
const fsSync = require("fs");
const arrow = require("apache-arrow");

/**
 * Export data to Apache Arrow format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
async function exportToArrow(data, filePath) {
  try {
    if (data.length === 0) {
      // Create empty Arrow file
      const emptyTable = arrow.tableFromJSON([{ empty: "" }]);
      const writer = arrow.RecordBatchFileWriter.writeAll(emptyTable);
      const buffer = Buffer.from(await writer.toUint8Array());
      await fs.writeFile(filePath, buffer);
      return;
    }

    // First, analyze all columns to detect mixed types
    const firstRow = data[0];
    const columnNames = Object.keys(firstRow);

    // Track type information for each column across all rows
    const columnTypes = {};
    columnNames.forEach((key) => {
      columnTypes[key] = {
        hasNull: false,
        hasNumber: false,
        hasString: false,
        hasBoolean: false,
        hasDate: false,
        hasObject: false,
      };
    });

    // Scan all rows to determine the most compatible type for each column
    for (const row of data) {
      for (const key of columnNames) {
        const value = row[key];
        const typeInfo = columnTypes[key];

        if (value === null || value === undefined) {
          typeInfo.hasNull = true;
        } else if (value instanceof Date) {
          typeInfo.hasDate = true;
        } else if (typeof value === "object") {
          typeInfo.hasObject = true;
        } else if (typeof value === "number") {
          typeInfo.hasNumber = true;
        } else if (typeof value === "string") {
          typeInfo.hasString = true;
        } else if (typeof value === "boolean") {
          typeInfo.hasBoolean = true;
        }
      }
    }

    // Normalize data to ensure type consistency within each column
    const normalizedData = data.map((row) => {
      const normalizedRow = {};
      
      columnNames.forEach((key) => {
        const value = row[key];
        const typeInfo = columnTypes[key];

        if (value === null || value === undefined) {
          normalizedRow[key] = null;
        } else if (typeInfo.hasString || typeInfo.hasObject || (typeInfo.hasNumber && typeInfo.hasBoolean)) {
          // If column has mixed types or strings, convert everything to string
          if (value instanceof Date) {
            normalizedRow[key] = value.toISOString();
          } else if (typeof value === "object") {
            normalizedRow[key] = JSON.stringify(value);
          } else {
            normalizedRow[key] = String(value);
          }
        } else if (value instanceof Date) {
          // Convert dates to ISO strings for better compatibility
          normalizedRow[key] = value.toISOString();
        } else {
          // Keep primitives (string, number, boolean) as-is
          normalizedRow[key] = value;
        }
      });
      
      return normalizedRow;
    });

    // Create Arrow table from JSON (this method is most reliable)
    const table = arrow.tableFromJSON(normalizedData);

    // Write to file
    const writer = arrow.RecordBatchFileWriter.writeAll(table);
    const uint8Array = await writer.toUint8Array();
    const buffer = Buffer.from(uint8Array);
    await fs.writeFile(filePath, buffer);
  } catch (error) {
    // Clean up the partially created file on error
    try {
      if (fsSync.existsSync(filePath)) {
        fsSync.unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors, throw original error
    }
    
    throw new Error(`Arrow export failed: ${error.message}`);
  }
}

module.exports = { exportToArrow };
