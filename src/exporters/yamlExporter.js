const fs = require("fs").promises;
const yaml = require("js-yaml");

/**
 * Export data to YAML format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
async function exportToYAML(data, filePath) {
  try {
    // Add header comment
    const header = [
      "# YAML Data Export",
      "# Created by: Ctrl-Q QVD Viewer for VS Code",
      "# VS Code Extension: https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer",
      "# GitHub: https://github.com/ptarmiganlabs/qvd4vscode",
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

module.exports = { exportToYAML };
