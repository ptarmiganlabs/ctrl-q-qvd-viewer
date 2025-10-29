const fs = require("fs").promises;
const xmljs = require("xml-js");

/**
 * Export data to XML format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
async function exportToXML(data, filePath) {
  try {
    const xmlObj = {
      _declaration: {
        _attributes: {
          version: "1.0",
          encoding: "UTF-8",
        },
      },
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
      ignoreComment: true,
    });

    await fs.writeFile(filePath, xml, "utf8");
  } catch (error) {
    throw new Error(`XML export failed: ${error.message}`);
  }
}

module.exports = { exportToXML };
