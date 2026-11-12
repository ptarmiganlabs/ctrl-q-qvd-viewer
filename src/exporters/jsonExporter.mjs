import { rowsPerChunk } from "../memoryGuard.mjs";
import { writeChunks, writeFileAtomically } from "./atomicWrite.mjs";

// Rows turned into JSON text at a time, so a large export never holds the whole
// file as one string, which V8 caps at about 537 million characters
export const CHUNK_ROWS = 10000;

// At most as many cells as CHUNK_ROWS rows of chicago_taxi_rides_2016_03.qvd's 20
// fields, on which a chunk's stall was measured, so a wider QVD has fewer rows a chunk
export const CHUNK_CELLS = CHUNK_ROWS * 20;

// What JSON.stringify writes around a chunk's rows, given them as an object's data
const CHUNK_HEAD = '{\n  "data": [';
const CHUNK_TAIL = "\n  ]\n}";

/**
 * Heap a JSON export builds, a chunk of rows at a time, for the memory guard.
 * With every row in one chunk it needed 19 bytes per cell, and in its own
 * chunks 2.1 per character of a chunk's text. Only its largest chunk is priced.
 * Measured by the smallest heap that let 200,000 rows of
 * chicago_taxi_rides_2016_03.qvd export in one chunk, against reading them alone
 * (a million in one chunk make a string longer than V8's longest), and 50,000
 * rows of four unique 400-character values for the cost per character. All of a
 * million rows, in its own chunks, needed nothing measurable beyond reading
 * them. See DataExporter.memoryCost() for the margins.
 */
export const memoryCost = {
  bytesPerCell: 30,
  bytesPerTextChar: 5,
  chunkRows: CHUNK_ROWS,
  chunkCells: CHUNK_CELLS,
  writesAsItGoes: true,
};

/**
 * Export data to JSON format
 *
 * The file is what JSON.stringify gives for the metadata and every row, indented
 * by two spaces, written a chunk of rows at a time.
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @param {object} [options]
 * @param {number} [options.chunkRows] - Rows turned into text at a time: a whole number
 *   of 1 or more. By default CHUNK_ROWS, or fewer for a QVD of more than 20 fields
 * @returns {Promise<void>}
 */
export async function exportToJSON(data, filePath, { chunkRows: rowsOption } = {}) {
  try {
    const chunkRows = rowsPerChunk(memoryCost, data.length > 0 ? Object.keys(data[0]).length : 0, rowsOption);
    const metadata = {
      description: "JSON Data Export",
      createdBy: "Ctrl-Q QVD Viewer for VS Code",
      extension:
        "https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer",
      github: "https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer",
      generated: new Date().toISOString(),
      rows: data.length,
    };

    await writeFileAtomically(filePath, async (file) => {
      // The file with no rows, up to the data array's opening bracket
      const empty = JSON.stringify({ _metadata: metadata, data: [] }, null, 2);
      await file.writeFile(empty.slice(0, -"]\n}".length));
      if (data.length === 0) {
        await file.writeFile("]\n}");
        return;
      }
      await writeChunks(file, data.length, chunkRows, (start, end) => {
        // The chunk's rows in a data array of their own, at the depth the file has
        // them, without that array's brackets
        const rows = JSON.stringify({ data: data.slice(start, end) }, null, 2).slice(
          CHUNK_HEAD.length,
          -CHUNK_TAIL.length
        );
        return start === 0 ? rows : `,${rows}`;
      });
      await file.writeFile("\n  ]\n}");
    });
  } catch (error) {
    throw new Error(`JSON export failed: ${error.message}`, { cause: error });
  }
}
