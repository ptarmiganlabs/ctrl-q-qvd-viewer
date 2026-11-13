import { basename, dirname, extname } from "path";
import { realpath } from "fs/promises";
import DataExporter from "./exporters/index.mjs";
import { openQvdSource } from "./exportSource.mjs";
import { scanBytesFor } from "./columnScan.mjs";
import {
  HELD_BYTES_PER_CELL,
  describeExportRefusal,
  dictionaryBytes,
  memoryLeftOutsideHeap,
  rowsPerChunk,
  tryBookHeap,
} from "./memoryGuard.mjs";
import { budgetFor } from "./qvdReader.mjs";

/**
 * An export of a QVD, from its dialogs to its file, a chunk of rows at a time
 *
 * The rows come from a source that reads the QVD a page at a time, so that a file of
 * any size is exported in bounded memory (see exportSource.mjs). What the export holds
 * is booked once every question is answered, before anything is written: the reader's
 * open file, one chunk of rows and what the exporter makes of it, and what the format
 * keeps to the end, such as Arrow's dictionaries and Parquet's footer. A chunk whose
 * text takes more than was booked books more, or stops the export with the same
 * refusal. The passes over the file run in the large reads' lane, one after another
 * with other large reads, as profiling's do.
 *
 * This module doesn't import vscode, so that tests and scripts can run an export with
 * dialogs of their own.
 */

// Heap Parquet's footer takes per column of each row group, for its metadata
export const PARQUET_BYTES_PER_COLUMN_CHUNK = 1024;

// Heap a row object's string takes besides its characters, at two bytes a character at most
const STRING_HEADER_BYTES = 16;
const BYTES_PER_TEXT_CHAR = 2;

/**
 * Hold a lane of reads until let go: tasks queued behind wait until then
 * @param {{run: function(function(): Promise<*>, {signal?: AbortSignal}=): Promise<*>}} lane - The lane
 * @param {AbortSignal} [signal] - Gives the wait for the lane up
 * @returns {Promise<function(): void>} Resolves at the hold's turn with what lets it go
 */
function holdLane(lane, signal) {
  return new Promise((resolve, reject) => {
    let letGo;
    const held = new Promise((done) => {
      letGo = done;
    });
    lane.run(
      () => {
        resolve(letGo);
        return held;
      },
      { signal }
    ).catch(reject);
  });
}

/**
 * Heap an export holds at once, from the file's header and the source's census
 * @param {object} options
 * @param {import('./memoryGuard.mjs').ExportCost} options.cost - What the exporter builds
 * @param {Array<{name: string, symbols: number, bytes: number}>} options.fields - The header's fields
 * @param {number} options.rows - Rows exported
 * @param {Array<string>} [options.dictionaryKeys] - The columns whose distinct values the
 *   format holds to the end, as dictionaries
 * @returns {{fixedBytes: number, chunkRows: number, chunkBytes: function(number, number): number, estimatedChars: number}}
 *   fixedBytes: what is held whatever the chunk; chunkRows: rows a chunk at most;
 *   chunkBytes(rows, chars): what a chunk of so many rows and characters of text adds;
 *   estimatedChars: the characters a chunk of chunkRows rows holds, on average
 */
export function exportHeapOf({ cost, fields, rows, dictionaryKeys = [] }) {
  const columns = fields.length;
  const chunkRows = Math.min(rows, rowsPerChunk(cost, columns));
  // parquetjs holds a row group's rows beside a chunk's
  const heldRows = (chunkRowsOf) => chunkRowsOf + Math.min(rows, cost.rowGroupRows ?? 0);
  const chunkBytes = (chunkRowsOf, chars) => {
    const held = heldRows(chunkRowsOf);
    return (
      held * columns * (HELD_BYTES_PER_CELL + STRING_HEADER_BYTES + cost.bytesPerCell) +
      (chars * held) / Math.max(1, chunkRowsOf) * (BYTES_PER_TEXT_CHAR + cost.bytesPerTextChar)
    );
  };
  // Each field's average value, in the characters of its symbols
  let charsPerRow = 0;
  for (const { symbols, bytes } of fields) {
    if (symbols > 0) {
      charsPerRow += bytes / symbols;
    }
  }
  const byName = new Map(fields.map((field) => [field.name, field]));
  let fixedBytes = scanBytesFor(fields, rows);
  fixedBytes += dictionaryBytes(
    cost,
    dictionaryKeys.map((key) => byName.get(key) ?? { symbols: rows, bytes: 0 }),
    rows
  );
  if (cost.rowGroupRows > 0) {
    fixedBytes += Math.ceil(rows / cost.rowGroupRows) * columns * PARQUET_BYTES_PER_COLUMN_CHUNK;
  }
  return {
    fixedBytes: Math.ceil(fixedBytes),
    chunkRows,
    chunkBytes: (chunkRowsOf, chars) => Math.ceil(chunkBytes(chunkRowsOf, chars)),
    estimatedChars: Math.ceil(chunkRows * charsPerRow),
  };
}

/**
 * Memory outside the heap a source's passes hold: a byte a distinct value of each
 * field, for the census and for the reader
 * @param {Array<{symbols: number}>} fields - The header's fields
 * @returns {number} Bytes
 */
export function exportOutsideBytesOf(fields) {
  return 2 * fields.reduce((sum, { symbols }) => sum + Math.max(0, symbols), 0);
}

/**
 * Export a QVD, asking the user what the format needs
 * @param {object} options
 * @param {string} options.filePath - The QVD file
 * @param {string} options.format - The export format, such as "csv"
 * @param {number} [options.maxRows=0] - Rows to export, from the first, for Qlik inline
 *   and PostgreSQL; 0 for every row
 * @param {object} options.vscode - VS Code's API, or dialogs that stand in for it
 * @param {string} [options.workspaceFolder] - Where the save dialog starts
 * @param {AbortSignal} [options.signal] - Gives the export up: its editor was closed
 * @param {{run: function(function(): Promise<*>, {signal?: AbortSignal}=): Promise<*>}} [options.lane] -
 *   The lane of large reads the passes over the file run in; none for a script's own export
 * @param {function(import('./exporters/zonedTimestamps.mjs').TimeShifts): void} [options.report] -
 *   As DataExporter.exportData() takes it
 * @param {function(string): void} [options.warn] - As DataExporter.exportData() takes it
 * @param {function({pass: string, rows: number, totalRows: number}): void} [options.onProgress] -
 *   Told the rows read so far, as openQvdSource() tells it
 * @param {number} [options.heldBytes] - What the reader's open file may hold, for a test
 * @param {number} [options.pageRows] - Rows a page of the reader holds, for a test
 * @returns {Promise<string|null>} The file written, or null when the user cancelled
 * @throws {Error} A refusal, for an export that won't fit in memory, and what reading
 *   the file or writing the export throws
 */
export async function runExport({
  filePath,
  format,
  maxRows = 0,
  vscode,
  workspaceFolder,
  signal,
  lane = { run: (task) => task() },
  report,
  warn,
  onProgress,
  heldBytes,
  pageRows,
}) {
  const cost = DataExporter.memoryCost(format);
  if (!cost) {
    throw new Error(`Unsupported export format: ${format}`);
  }
  const label = DataExporter.formatLabel(format);

  // The lane is held from the booking to the end of the export: the census before it,
  // which may wait on the time zone question, takes a turn of its own
  let letLaneGo = null;
  const exclusive = (work) => (letLaneGo ? work() : lane.run(work, { signal }));

  // What is booked so far, and what more a chunk needs
  let booking = null;
  const releases = [];
  const book = (bytes, rows) => {
    const booked = tryBookHeap(bytes);
    if (!booked.release) {
      throw new Error(describeExportRefusal(label, rows, booking ? booking.bytes + bytes : bytes, booked.leftBytes));
    }
    releases.push(booked.release);
  };
  const onChunk = ({ rows, chars }) => {
    if (!booking) {
      return;
    }
    const needed = booking.heap.fixedBytes + booking.heap.chunkBytes(rows, chars);
    if (needed > booking.bytes) {
      book(needed - booking.bytes, booking.rows);
      booking.bytes = needed;
    }
  };
  const release = () => {
    while (releases.length > 0) {
      releases.pop()();
    }
    booking = null;
    letLaneGo?.();
    letLaneGo = null;
  };

  const source = await openQvdSource(filePath, {
    rows: maxRows,
    dates: DataExporter.writesDates(format),
    signal,
    exclusive,
    onChunk,
    onProgress,
    heldBytes,
    pageRows,
  });
  try {
    return await DataExporter.exportData(
      source,
      format,
      basename(filePath, extname(filePath)),
      vscode,
      workspaceFolder,
      maxRows,
      source.fields,
      {
        reserve: async (rowsSource, limit) => {
          letLaneGo = await holdLane(lane, signal);
          try {
            const exported = limit > 0 ? rowsSource.first(limit) : rowsSource;
            const { header } = source;
            const realFilePath = await realpath(filePath).catch(() => filePath);
            // qvdjs's budget, which a read of this file asks once
            await budgetFor(filePath, dirname(realFilePath), header, signal);
            const outsideBytes = exportOutsideBytesOf(header.fields);
            const outsideLeft = memoryLeftOutsideHeap();
            if (outsideBytes > outsideLeft) {
              throw new Error(
                describeExportRefusal(label, exported.length, outsideBytes, outsideLeft, { onComputer: true })
              );
            }
            const dictionaryKeys =
              cost.dictionaryColumns && exported.length > 0
                ? cost.dictionaryColumns(await exported.columnTypes(), exported.columns)
                : [];
            const heap = exportHeapOf({ cost, fields: header.fields, rows: exported.length, dictionaryKeys });
            const bytes = heap.fixedBytes + heap.chunkBytes(heap.chunkRows, heap.estimatedChars);
            booking = null;
            book(bytes, exported.length);
            booking = { heap, bytes, rows: exported.length };
          } catch (error) {
            release();
            throw error;
          }
          return release;
        },
        report,
        warn,
      }
    );
  } finally {
    release();
    // A failure to close mustn't hide what went wrong, or spoil an export that is done
    await source.close().catch(() => {});
  }
}
