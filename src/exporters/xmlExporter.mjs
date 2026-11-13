import xmljs from "xml-js";
import { rowsPerChunk } from "../memoryGuard.mjs";
import { writeChunks, writeFileAtomically } from "./atomicWrite.mjs";
import { sourceOf } from "../exportSource.mjs";

// Rows turned into XML text at a time, so a large export never holds the whole
// file as one string
export const CHUNK_ROWS = 2500;

// At most as many cells as CHUNK_ROWS rows of chicago_taxi_rides_2016_03.qvd's 20
// fields, on which a chunk's stall was measured, so a wider QVD has fewer rows a chunk
export const CHUNK_CELLS = CHUNK_ROWS * 20;

/**
 * Heap an XML export builds, a chunk of rows at a time, for the memory guard.
 * With every row in one chunk it needed 92 bytes per cell, and in its own chunks
 * up to 10.5 per character of a chunk's text: xml-js makes about eight bytes of
 * short-lived strings per character as it builds a chunk, and three runs needed
 * 6.3 to 10.5. Only its largest chunk is priced. Measured by the smallest heap
 * that let 200,000 rows of chicago_taxi_rides_2016_03.qvd export in one chunk,
 * against reading them alone (a million in one chunk make a string longer than
 * V8's longest), and 50,000 rows of four unique 400-character values for the
 * cost per character. All of a million rows, in its own chunks, needed nothing
 * measurable beyond reading them. See DataExporter.memoryCost() for the margins.
 */
export const memoryCost = {
  bytesPerCell: 140,
  bytesPerTextChar: 21,
  chunkRows: CHUNK_ROWS,
  chunkCells: CHUNK_CELLS,
  writesAsItGoes: true,
};

// How the head and every chunk are written
const XML_OPTIONS = { compact: true, spaces: 2, ignoreComment: false };

// The data element, around the records
const DATA_OPEN = "<data>";
const DATA_CLOSE = "\n</data>";

/**
 * A row as xml-js's compact form of its record element
 * @param {Object} row - Row object
 * @returns {Object} One element per field: its text, or nil="true" for a null
 */
function toRecord(row) {
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
}

/**
 * Export data to XML format
 *
 * The file is what xml-js writes for the declaration, a comment and a data element
 * of one record per row, written a chunk of rows at a time.
 * @param {Array<Object>|import("../exportSource.mjs").ExportSource} data - Row objects, or a source of them
 * @param {string} filePath - Destination file path
 * @param {object} [options]
 * @param {number} [options.chunkRows] - Rows turned into text at a time: a whole number
 *   of 1 or more. By default CHUNK_ROWS, or fewer for a QVD of more than 20 fields
 * @returns {Promise<void>}
 */
export async function exportToXML(data, filePath, { chunkRows: rowsOption } = {}) {
  const source = sourceOf(data);
  try {
    const chunkRows = rowsPerChunk(memoryCost, source.length > 0 ? source.columns.length : 0, rowsOption);
    // The file with no records, up to the data element's closing tag
    const head = xmljs.js2xml(
      {
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
          `Rows: ${source.length}`,
        ].join("\n"),
        data: { record: [] },
      },
      XML_OPTIONS
    );

    await writeFileAtomically(filePath, async (file) => {
      await file.writeFile(head.slice(0, -DATA_CLOSE.length));
      await writeChunks(file, source, chunkRows, (rows) => {
        // The chunk's records inside a data element of their own, at the depth the
        // file has them, without that element's tags
        const xml = xmljs.js2xml({ data: { record: rows.map(toRecord) } }, XML_OPTIONS);
        return xml.slice(DATA_OPEN.length, -DATA_CLOSE.length);
      });
      await file.writeFile(DATA_CLOSE);
    });
  } catch (error) {
    throw new Error(`XML export failed: ${error.message}`, { cause: error });
  }
}
