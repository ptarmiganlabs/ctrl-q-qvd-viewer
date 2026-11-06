import { promises as fs } from "fs";
import * as yaml from "js-yaml";

/**
 * Heap a YAML export builds from the rows, for the memory guard. It needed 226
 * bytes per cell and 1.9 per character of text. Measured by the smallest heap
 * that let 200,000 or 1,000,000 rows of chicago_taxi_rides_2016_03.qvd export,
 * against reading them alone, and 50,000 rows of four unique 400-character
 * values for the cost per character. See DataExporter.memoryCost() for the
 * margins.
 */
export const memoryCost = { bytesPerCell: 352, bytesPerTextChar: 4 };

/**
 * Export data to YAML format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
export async function exportToYAML(data, filePath) {
  try {
    // Add header comment
    const header = [
      "# YAML Data Export",
      "# Created by: Ctrl-Q QVD Viewer for VS Code",
      "# VS Code Extension: https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer",
      "# GitHub: https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer",
      `# Generated: ${new Date().toISOString()}`,
      `# Rows: ${data.length}`,
      "",
    ].join("\n");

    const yamlString = yaml.dump(data, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });

    await fs.writeFile(filePath, header + yamlString, "utf8");
  } catch (error) {
    throw new Error(`YAML export failed: ${error.message}`);
  }
}
