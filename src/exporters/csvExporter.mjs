import { promises as fs } from "fs";
import Papa from "papaparse";

/**
 * Export data to CSV format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
export async function exportToCSV(data, filePath) {
  try {
    // Add header comment (with # prefix, commonly recognized in CSV parsers)
    const header = [
      "# CSV Data Export",
      "# Created by: Ctrl-Q QVD Viewer for VS Code",
      "# VS Code Extension: https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer",
      "# GitHub: https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer",
      `# Generated: ${new Date().toISOString()}`,
      `# Rows: ${data.length}`,
      "",
    ].join("\n");

    const csv = Papa.unparse(data, {
      quotes: true,
      quoteChar: '"',
      escapeChar: '"',
      delimiter: ",",
      header: true,
      newline: "\n",
    });

    await fs.writeFile(filePath, header + csv, "utf8");
  } catch (error) {
    throw new Error(`CSV export failed: ${error.message}`);
  }
}
