const fs = require("fs").promises;

/**
 * Export data to JSON format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
async function exportToJSON(data, filePath) {
  try {
    const json = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, json, "utf8");
  } catch (error) {
    throw new Error(`JSON export failed: ${error.message}`);
  }
}

module.exports = { exportToJSON };
