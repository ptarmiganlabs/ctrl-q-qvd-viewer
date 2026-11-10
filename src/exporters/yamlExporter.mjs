import * as yaml from "js-yaml";
import { writeFileAtomically } from "./atomicWrite.mjs";

// Rows turned into YAML text at a time, so a large export never holds the whole
// file as one string
export const CHUNK_ROWS = 2500;

/**
 * Heap a YAML export builds, a chunk of rows at a time, for the memory guard.
 * With every row in one chunk it needed 222 bytes per cell, and in its own
 * chunks up to 4.2 per character of a chunk's text: three runs needed 2.1 to 4.2.
 * Only its largest chunk is priced. Measured by the smallest heap that let
 * 1,000,000 rows of chicago_taxi_rides_2016_03.qvd export in one chunk, against
 * reading them alone, and 50,000 rows of four unique 400-character values for the
 * cost per character. All of the million rows, in its own chunks, needed 8 MiB
 * beyond reading them. See DataExporter.memoryCost() for the margins.
 */
export const memoryCost = {
  bytesPerCell: 336,
  bytesPerTextChar: 9,
  chunkRows: CHUNK_ROWS,
  writesAsItGoes: true,
};

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

// How every chunk is dumped
const DUMP_OPTIONS = {
  indent: 2,
  lineWidth: -1,
  noRefs: true,
  scalarStyleRules: SCALAR_STYLE_RULES,
};

// What js-yaml ends a document with when its last value is a literal block ending in
// an empty line, so that a reader keeps that line
const DOCUMENT_END = "...\n";

/**
 * Export data to YAML format
 *
 * The file is the header comment, then what js-yaml dumps for every row, written a
 * chunk of rows at a time.
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @param {object} [options]
 * @param {number} [options.chunkRows] - Rows turned into text at a time
 * @returns {Promise<void>}
 */
export async function exportToYAML(data, filePath, { chunkRows = CHUNK_ROWS } = {}) {
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

    await writeFileAtomically(filePath, async (file) => {
      await file.writeFile(header);
      if (data.length === 0) {
        await file.writeFile(yaml.dump(data, DUMP_OPTIONS));
        return;
      }
      for (let start = 0; start < data.length; start += chunkRows) {
        let text = yaml.dump(data.slice(start, start + chunkRows), DUMP_OPTIONS);
        // Within the file the next chunk's rows follow, so the document doesn't end here.
        // In a list of rows every line starts with "- " or spaces, so only the end marker
        // is "..." alone at a line's start
        if (start + chunkRows < data.length && text.endsWith(`\n${DOCUMENT_END}`)) {
          text = text.slice(0, -DOCUMENT_END.length);
        }
        await file.writeFile(text);
      }
    });
  } catch (error) {
    throw new Error(`YAML export failed: ${error.message}`, { cause: error });
  }
}
