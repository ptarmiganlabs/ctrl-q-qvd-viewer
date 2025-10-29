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
    const yamlString = yaml.dump(data, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });
    await fs.writeFile(filePath, yamlString, "utf8");
  } catch (error) {
    throw new Error(`YAML export failed: ${error.message}`);
  }
}

module.exports = { exportToYAML };
