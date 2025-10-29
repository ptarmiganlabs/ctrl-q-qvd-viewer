const fs = require("fs").promises;
const Papa = require("papaparse");

/**
 * Export data to CSV format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
async function exportToCSV(data, filePath) {
  try {
    const csv = Papa.unparse(data, {
      quotes: true,
      quoteChar: '"',
      escapeChar: '"',
      delimiter: ",",
      header: true,
      newline: "\n",
    });

    await fs.writeFile(filePath, csv, "utf8");
  } catch (error) {
    throw new Error(`CSV export failed: ${error.message}`);
  }
}

module.exports = { exportToCSV };
