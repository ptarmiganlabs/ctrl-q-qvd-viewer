import { promises as fs } from 'fs';

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
        github: "https://github.com/ptarmiganlabs/qvd4vscode",
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
