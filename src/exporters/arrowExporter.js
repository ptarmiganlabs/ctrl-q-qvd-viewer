const fs = require("fs").promises;
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

    // Normalize data to ensure all values are JSON-compatible
    const normalizedData = data.map((row) => {
      const normalizedRow = {};
      Object.keys(row).forEach((key) => {
        const value = row[key];

        if (value === null || value === undefined) {
          normalizedRow[key] = null;
        } else if (value instanceof Date) {
          // Convert dates to ISO strings for better compatibility
          normalizedRow[key] = value.toISOString();
        } else if (typeof value === "object") {
          // Convert any other objects to strings
          normalizedRow[key] = JSON.stringify(value);
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
    throw new Error(`Arrow export failed: ${error.message}`);
  }
}

module.exports = { exportToArrow };
