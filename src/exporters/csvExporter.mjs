import { promises as fs } from "fs";
import Papa from "papaparse";

/**
 * Export data to CSV format
 *
 * The file starts with the header row, as readers that take column names from the
 * first line expect. CSV has no comment syntax, so nothing is written before it.
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
export async function exportToCSV(data, filePath) {
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
