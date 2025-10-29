const parquet = require("parquetjs");
const fs = require("fs");

/**
 * Export data to Parquet format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
async function exportToParquet(data, filePath) {
  try {
    if (data.length === 0) {
      // Create empty parquet file with minimal schema
      const schema = new parquet.ParquetSchema({
        empty: { type: "UTF8" },
      });

      const writer = await parquet.ParquetWriter.openFile(schema, filePath);
      await writer.close();
      return;
    }

    // Infer schema by scanning all rows to determine compatible types
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
        allIntegers: true,
      };
    });

    // Scan all rows to determine the most compatible type for each column
    for (const row of data) {
      for (const key of columnNames) {
        const value = row[key];
        const typeInfo = columnTypes[key];

        if (value === null || value === undefined) {
          typeInfo.hasNull = true;
        } else if (typeof value === "number") {
          typeInfo.hasNumber = true;
          if (!Number.isInteger(value)) {
            typeInfo.allIntegers = false;
          }
        } else if (typeof value === "string") {
          typeInfo.hasString = true;
        } else if (typeof value === "boolean") {
          typeInfo.hasBoolean = true;
        } else if (value instanceof Date) {
          typeInfo.hasDate = true;
        }
      }
    }

    // Build schema based on collected type information
    const schemaFields = {};

    columnNames.forEach((key) => {
      const typeInfo = columnTypes[key];
      let type = "UTF8"; // Default to string
      let optional = typeInfo.hasNull;

      // If column has mixed types or strings, use UTF8 as most compatible
      if (typeInfo.hasString || (typeInfo.hasNumber && typeInfo.hasBoolean)) {
        type = "UTF8";
      } else if (typeInfo.hasDate) {
        type = "TIMESTAMP_MILLIS";
      } else if (typeInfo.hasNumber) {
        type = typeInfo.allIntegers ? "INT64" : "DOUBLE";
      } else if (typeInfo.hasBoolean) {
        type = "BOOLEAN";
      }

      schemaFields[key] = { type, optional };
    });

    const schema = new parquet.ParquetSchema(schemaFields);
    const writer = await parquet.ParquetWriter.openFile(schema, filePath);

    // Write rows with type conversion
    for (const row of data) {
      const processedRow = {};
      
      columnNames.forEach((key) => {
        const value = row[key];
        const typeInfo = columnTypes[key];

        if (value === null || value === undefined) {
          processedRow[key] = null;
        } else if (typeInfo.hasString) {
          // If schema expects string, convert everything to string
          processedRow[key] = String(value);
        } else if (value instanceof Date) {
          processedRow[key] = value;
        } else {
          processedRow[key] = value;
        }
      });

      await writer.appendRow(processedRow);
    }

    await writer.close();
  } catch (error) {
    // Clean up the partially created file on error
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors, throw original error
    }
    
    throw new Error(`Parquet export failed: ${error.message}`);
  }
}

module.exports = { exportToParquet };
