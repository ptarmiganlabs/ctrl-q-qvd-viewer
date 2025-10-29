const parquet = require("parquetjs");

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

    // Infer schema from first row
    const firstRow = data[0];
    const schemaFields = {};

    Object.keys(firstRow).forEach((key) => {
      const value = firstRow[key];
      let type = "UTF8"; // Default to string

      if (value === null || value === undefined) {
        type = "UTF8";
      } else if (typeof value === "number") {
        type = Number.isInteger(value) ? "INT64" : "DOUBLE";
      } else if (typeof value === "boolean") {
        type = "BOOLEAN";
      } else if (value instanceof Date) {
        type = "TIMESTAMP_MILLIS";
      }

      schemaFields[key] = { type };
    });

    const schema = new parquet.ParquetSchema(schemaFields);
    const writer = await parquet.ParquetWriter.openFile(schema, filePath);

    // Write rows
    for (const row of data) {
      await writer.appendRow(row);
    }

    await writer.close();
  } catch (error) {
    throw new Error(`Parquet export failed: ${error.message}`);
  }
}

module.exports = { exportToParquet };
