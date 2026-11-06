import { promises as fs } from "fs";

/**
 * Heap a JSON export builds from the rows, for the memory guard. It needed 35
 * bytes per cell and 0.9 per character of text. It also stops at V8's longest
 * string, with a catchable error, at about 1.6 million rows of 20 fields.
 * Measured by the smallest heap that let 200,000 or 1,000,000 rows of
 * chicago_taxi_rides_2016_03.qvd export, against reading them alone, and 50,000
 * rows of four unique 400-character values for the cost per character. See
 * DataExporter.memoryCost() for the margins.
 */
export const memoryCost = { bytesPerCell: 64, bytesPerTextChar: 2 };

/**
 * Export data to JSON format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
export async function exportToJSON(data, filePath) {
  try {
    // Create JSON with metadata
    const output = {
      _metadata: {
        description: "JSON Data Export",
        createdBy: "Ctrl-Q QVD Viewer for VS Code",
        extension:
          "https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer",
        github: "https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer",
        generated: new Date().toISOString(),
        rows: data.length,
      },
      data: data,
    };

    const json = JSON.stringify(output, null, 2);
    await fs.writeFile(filePath, json, "utf8");
  } catch (error) {
    throw new Error(`JSON export failed: ${error.message}`);
  }
}
