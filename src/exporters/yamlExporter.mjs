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

// Text that YAML 1.2's core schema reads as a float
const CORE_SCHEMA_FLOAT = /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/;

/**
 * A js-yaml style rule: quote text that YAML 1.2's core schema reads as a number.
 * js-yaml quotes text its own loader would read as another type, but its loader keeps
 * a float too large for a double, such as 8E5597, as text, so it leaves that plain.
 * @param {Object} layout - js-yaml's layout of one scalar, updated in place
 * @returns {void}
 */
function quoteCoreSchemaFloats(layout) {
  if (
    layout.style === yaml.SCALAR_STYLE.PLAIN &&
    layout.node.tag === layout.presenterOptions.schema.defaultScalarTag.tagName &&
    CORE_SCHEMA_FLOAT.test(layout.node.value)
  ) {
    const singleQuoted = (layout.allowedStylesMask & (1 << yaml.SCALAR_STYLE.SINGLE_QUOTED)) !== 0;
    layout.style = singleQuoted ? yaml.SCALAR_STYLE.SINGLE_QUOTED : yaml.SCALAR_STYLE.DOUBLE_QUOTED;
  }
}

// The rule above, then js-yaml's own, in their order
const SCALAR_STYLE_RULES = [quoteCoreSchemaFloats, ...Object.values(yaml.DEFAULT_SCALAR_STYLE_RULES)];

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
      scalarStyleRules: SCALAR_STYLE_RULES,
    });

    await fs.writeFile(filePath, header + yamlString, "utf8");
  } catch (error) {
    throw new Error(`YAML export failed: ${error.message}`);
  }
}
