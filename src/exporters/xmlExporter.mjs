import { promises as fs } from "fs";
import xmljs from "xml-js";

/**
 * Heap an XML export builds from the rows, for the memory guard. It needed 107
 * bytes per cell and 1.0 per character of text. Measured by the smallest heap
 * that let 200,000 or 1,000,000 rows of chicago_taxi_rides_2016_03.qvd export,
 * against reading them alone, and 50,000 rows of four unique 400-character
 * values for the cost per character. See DataExporter.memoryCost() for the
 * margins.
 */
export const memoryCost = { bytesPerCell: 160, bytesPerTextChar: 3 };

/**
 * Export data to XML format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
export async function exportToXML(data, filePath) {
  try {
    const xmlObj = {
      _declaration: {
        _attributes: {
          version: "1.0",
          encoding: "UTF-8",
        },
      },
      _comment: [
        "XML Data Export",
        "Created by: Ctrl-Q QVD Viewer for VS Code",
        "VS Code Extension: https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer",
        "GitHub: https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer",
        `Generated: ${new Date().toISOString()}`,
        `Rows: ${data.length}`,
      ].join("\n"),
      data: {
        record: data.map((row) => {
          const record = {};
          Object.keys(row).forEach((key) => {
            const value = row[key];
            // Handle different value types
            if (value === null || value === undefined) {
              record[key] = { _attributes: { nil: "true" } };
            } else if (typeof value === "object" && value instanceof Date) {
              record[key] = { _text: value.toISOString() };
            } else {
              record[key] = { _text: String(value) };
            }
          });
          return record;
        }),
      },
    };

    const xml = xmljs.js2xml(xmlObj, {
      compact: true,
      spaces: 2,
      ignoreComment: false,
    });

    await fs.writeFile(filePath, xml, "utf8");
  } catch (error) {
    throw new Error(`XML export failed: ${error.message}`);
  }
}
