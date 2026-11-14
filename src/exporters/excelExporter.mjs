import ExcelJS from "exceljs";
import { once } from "events";
import { isBlank } from "../cellValue.mjs";
import { fileWriter, writeFileAtomically } from "./atomicWrite.mjs";
import { nextTurn, rowsPerChunk } from "../memoryGuard.mjs";
import { sourceOf } from "../exportSource.mjs";
import { naiveDateText } from "./naiveDates.mjs";

// The first date Excel shows as itself: it can't show earlier ones, and its 1900 leap
// year bug puts January and February 1900 a day out
const EXCEL_FIRST_DATE = Date.UTC(1900, 2, 1);

// Rows added to a sheet at a time, before the file is given time to take them
export const CHUNK_ROWS = 2000;

// Cells added at a time: a QVD with many fields gets fewer rows in a chunk
export const CHUNK_CELLS = CHUNK_ROWS * 20;

// The rows of a worksheet, its header row included: Excel holds no more
export const SHEET_ROWS = 1048576;

/**
 * Heap an Excel export builds, a chunk of rows at a time, for the memory guard.
 * With every row in one chunk it needed 0.84 bytes per cell, and in its own chunks
 * 10.5 per character of a chunk's text. Only its largest chunk is priced, of
 * CHUNK_ROWS rows or CHUNK_CELLS cells, whichever is fewer rows. A sheet's
 * XML waits for the zip in buffers outside the V8 heap, which the waits between
 * chunks keep to about a chunk's. Measured by the smallest heap that let 1,000,000
 * rows of chicago_taxi_rides_2016_03.qvd export in one chunk, against reading them
 * alone, and 50,000 rows of four unique 400-character values for the cost per
 * character. All of the million rows, in its own chunks, needed 8 MiB beyond reading
 * them. See DataExporter.memoryCost() for the margins.
 */
export const memoryCost = {
  bytesPerCell: 2,
  bytesPerTextChar: 21,
  chunkRows: CHUNK_ROWS,
  chunkCells: CHUNK_CELLS,
};

/**
 * Text as a cell value that the streaming writer writes as an inline string
 * A plain string it writes as t="str", a formula's result, which leaves out the
 * xml:space that keeps spaces around text, and which an empty string reads back from
 * as no value at all. One run of rich text, with no font of its own, it writes as
 * an inline string: the cell shows the text as it is, as a shared string did.
 * @param {string} text - The text
 * @returns {{richText: Array<{text: string}>}} The cell value
 */
function inlineText(text) {
  return { richText: [{ text }] };
}

/**
 * Wait until the zip has taken the sheet's XML written so far
 * ExcelJS hands each 64 KB of a sheet's XML to archiver's PassThrough without waiting
 * for it to be taken, so without this the whole sheet would pile up in memory, outside
 * the heap, before anything reached the file.
 * @param {object} worksheet - The sheet, as WorkbookWriter adds it
 * @param {AbortSignal} signal - Aborted, with the error as its reason, when writing
 *   the file fails
 * @returns {Promise<boolean>} Resolves once the PassThrough is drained: false if it
 *   couldn't be found, and the zip was only given a turn of the event loop
 */
async function sheetTaken(worksheet, signal) {
  const entry = worksheet.stream?.pipes?.[0];
  const state = entry?._writableState;
  if (!state) {
    // ExcelJS's or archiver's insides have changed: give the zip a turn, at least
    await nextTurn();
    signal.throwIfAborted();
    return false;
  }
  while (state.needDrain) {
    try {
      await once(entry, "drain", { signal });
    } catch (error) {
      throw signal.aborted ? signal.reason : error;
    }
  }
  return true;
}

/**
 * Export data to Excel (.xlsx) format
 *
 * The workbook is written as it goes, a chunk of rows at a time: a sheet named Data,
 * and past the rows a sheet holds, Data 2, Data 3 and so on, each with the header row.
 * @param {Array<Object>|import("../exportSource.mjs").ExportSource} data - Row objects, or a source of them
 * @param {string} filePath - Destination file path
 * @param {object} [options]
 * @param {number} [options.chunkRows] - Rows added at a time
 * @param {number} [options.sheetRows] - Rows in a sheet, its header row included: 2 to
 *   SHEET_ROWS
 * @param {function(string): void} [options.warn] - Called with a warning for the log
 * @returns {Promise<void>}
 */
export async function exportToExcel(data, filePath, { chunkRows: rowsOption, sheetRows = SHEET_ROWS, warn = console.warn } = {}) {
  const source = sourceOf(data);
  try {
    const columnNames = source.length > 0 ? source.columns : [];
    const chunkRows = rowsPerChunk(memoryCost, columnNames.length, rowsOption);
    if (!Number.isInteger(sheetRows) || sheetRows < 2 || sheetRows > SHEET_ROWS) {
      throw new RangeError(`sheetRows must be a whole number from 2 to ${SHEET_ROWS}, not ${String(sheetRows)}`);
    }

    await writeFileAtomically(filePath, async (file) => {
      const stream = fileWriter(file);
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream,
        // The header row's font and fill, and the date columns' formats
        useStyles: true,
        // Each cell's text in the cell: a table of every distinct text would be held to the end
        useSharedStrings: false,
        // Files about the size the in-memory writer made: its default makes them a sixth larger
        zip: { zlib: { level: 6 } },
      });
      // ExcelJS listens for the file failing only once it finalizes: until then a failed
      // write would leave the export waiting for ever. Every error is listened to, so
      // that none is left unhandled once the export has given up. The first aborts
      // every wait, which then throws it
      const failure = new AbortController();
      const { signal } = failure;
      const failed = new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      failed.catch(() => {});
      stream.on("error", (error) => failure.abort(error));
      workbook.zip.on("error", (error) => failure.abort(error));

      // Add metadata to workbook properties, as the in-memory writer wrote them, the
      // ones it left empty included
      workbook.creator = "Ctrl-Q QVD Viewer for VS Code";
      workbook.lastModifiedBy = "Unknown";
      workbook.created = new Date();
      workbook.modified = new Date();
      for (const property of ["title", "subject", "description", "keywords", "category"]) {
        workbook[property] = "";
      }

      if (source.length === 0) {
        workbook.addWorksheet("Data").commit();
        await Promise.race([workbook.commit(), failed]);
        return;
      }

      const columnTypes = await source.columnTypes();

      // Each column as ExcelJS takes it, and what its values need. A column of dates
      // shows them as dates, and one of timestamps with their time, to the millisecond
      // where one has them. A column with a date Excel can't show is written as ISO text
      // instead. Blank text in a column of numbers, booleans or dates is an empty cell,
      // which a formula reads as nothing: as text, =A2+1 would give #VALUE!
      const columns = [];
      const cellColumns = [];
      for (const key of columnNames) {
        const { hasDate, earliestTime, calendarDates, hasMilliseconds, blanksAreNull } = columnTypes[key];
        const textDates = hasDate && earliestTime < EXCEL_FIRST_DATE;
        const column = { header: inlineText(key), key: key, width: 15 };
        if (hasDate && !textDates) {
          const numFmt = calendarDates ? "yyyy-mm-dd" : hasMilliseconds ? "yyyy-mm-dd hh:mm:ss.000" : "yyyy-mm-dd hh:mm:ss";
          column.style = { numFmt };
        }
        columns.push(column);
        cellColumns.push({ key, blanksAreNull, textDates, calendarDates });
      }

      // A row's cells, so that the caller's row stays as it was
      const cellsOf = (row) => {
        const cells = {};
        for (const { key, blanksAreNull, textDates, calendarDates } of cellColumns) {
          let value = row[key];
          if (blanksAreNull && isBlank(value)) {
            value = null;
          } else if (textDates && value instanceof Date) {
            value = naiveDateText(value, calendarDates);
          }
          cells[key] = typeof value === "string" ? inlineText(value) : value;
        }
        return cells;
      };

      // Each sheet's rows, below its header row. If the zip's stream can't be waited on,
      // the sheet's XML may pile up outside the heap: the log says so, once
      let warned = false;
      const sheetDataRows = sheetRows - 1;
      let worksheet = null;
      let sheet = 0;
      let rowsInSheet = 0;
      // A sheet's rows, below its header row, a chunk at a time: a chunk that runs past
      // the sheet's last row goes on in the next sheet
      const addSheet = () => {
        worksheet?.commit();
        sheet++;
        rowsInSheet = 0;
        worksheet = workbook.addWorksheet(sheet === 1 ? "Data" : `Data ${sheet}`);
        // Columns of its own, since a sheet takes its columns' headers as its first row
        worksheet.columns = columns.map((column) => ({ ...column }));

        // Style the header row, before the rows are added: a sheet writes each row away
        // once the next is committed
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFD3D3D3" },
        };
      };
      const taken = async () => {
        if (!(await sheetTaken(worksheet, signal)) && !warned) {
          warned = true;
          warn("Excel export: ExcelJS's sheet stream isn't where expected, so a sheet's XML may be held in memory until the zip takes it");
        }
      };
      for await (const rows of source.chunks(chunkRows)) {
        for (const row of rows) {
          if (worksheet === null || rowsInSheet === sheetDataRows) {
            if (worksheet !== null) {
              await taken();
            }
            addSheet();
          }
          worksheet.addRow(cellsOf(row)).commit();
          rowsInSheet++;
        }
        await taken();
      }
      worksheet?.commit();

      await Promise.race([workbook.commit(), failed]);
    });
  } catch (error) {
    throw new Error(`Excel export failed: ${error.message}`, { cause: error });
  }
}
