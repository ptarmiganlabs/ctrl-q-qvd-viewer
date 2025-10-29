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
      const table = arrow.tableFromArrays({ empty: [] });
      const writer = arrow.RecordBatchFileWriter.writeAll(table);
      const buffer = Buffer.from(await writer.toUint8Array());
      await fs.writeFile(filePath, buffer);
      return;
    }

    // Convert data to columnar format
    const columns = {};
    const firstRow = data[0];

    Object.keys(firstRow).forEach((key) => {
      columns[key] = data.map((row) => row[key]);
    });

    // Create Arrow table
    const table = arrow.tableFromArrays(columns);

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
