import ExcelJS from "exceljs";
import { once } from "events";
import { isBlank } from "../cellValue.mjs";
import { fileWriter, writeFileAtomically } from "./atomicWrite.mjs";
import { scanColumnTypes } from "./columnTypes.mjs";
import { naiveDateText } from "./naiveDates.mjs";

// The first date Excel shows as itself: it can't show earlier ones, and its 1900 leap
// year bug puts January and February 1900 a day out
const EXCEL_FIRST_DATE = Date.UTC(1900, 2, 1);

// Rows added to a sheet at a time, before the file is given time to take them
export const CHUNK_ROWS = 2000;

// The rows of a worksheet, its header row included: Excel holds no more
export const SHEET_ROWS = 1048576;

/**
 * Heap an Excel export builds, a chunk of rows at a time, for the memory guard.
 * With every row in one chunk it needed 0.84 bytes per cell, and in its own chunks
 * 10.5 per character of a chunk's text. Only its largest chunk is priced. A sheet's
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
  writesAsItGoes: true,
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
 * @param {Promise<never>} failed - Rejects when writing the file fails
 * @returns {Promise<void>} Resolves once the PassThrough is drained
 */
async function sheetTaken(worksheet, failed) {
  const entry = worksheet.stream?.pipes?.[0];
  const state = entry?._writableState;
  if (!state) {
    // ExcelJS's or archiver's insides have changed: give the zip a turn, at least
    await Promise.race([new Promise((resolve) => setImmediate(resolve)), failed]);
    return;
  }
  while (state.needDrain) {
    await Promise.race([once(entry, "drain"), failed]);
  }
}

/**
 * Export data to Excel (.xlsx) format
 *
 * The workbook is written as it goes, a chunk of rows at a time: a sheet named Data,
 * and past the rows a sheet holds, Data 2, Data 3 and so on, each with the header row.
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @param {object} [options]
 * @param {number} [options.chunkRows] - Rows added at a time
 * @param {number} [options.sheetRows] - Rows in a sheet, its header row included
 * @returns {Promise<void>}
 */
export async function exportToExcel(data, filePath, { chunkRows = CHUNK_ROWS, sheetRows = SHEET_ROWS } = {}) {
  try {
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
      // that none is left unhandled once the export has given up
      let fail;
      const failed = new Promise((_, reject) => (fail = reject));
      failed.catch(() => {});
      stream.on("error", (error) => fail(error));
      workbook.zip.on("error", (error) => fail(error));

      // Add metadata to workbook properties, as the in-memory writer wrote them, the
      // ones it left empty included
      workbook.creator = "Ctrl-Q QVD Viewer for VS Code";
      workbook.lastModifiedBy = "Unknown";
      workbook.created = new Date();
      workbook.modified = new Date();
      for (const property of ["title", "subject", "description", "keywords", "category"]) {
        workbook[property] = "";
      }

      if (data.length === 0) {
        workbook.addWorksheet("Data").commit();
        await Promise.race([workbook.commit(), failed]);
        return;
      }

      // Get column headers from first row
      const columnNames = Object.keys(data[0]);
      const columnTypes = scanColumnTypes(data, columnNames);

      // A column of dates shows them as dates, and one of timestamps with their time, to
      // the millisecond where one has them. A column with a date Excel can't show is
      // written as ISO text instead
      const textDateColumns = new Set();
      const columns = columnNames.map((key) => {
        const typeInfo = columnTypes[key];
        const column = { header: inlineText(key), key: key, width: 15 };
        if (typeInfo.hasDate) {
          let early = false;
          let milliseconds = false;
          for (const row of data) {
            const value = row[key];
            if (value instanceof Date) {
              early ||= value.getTime() < EXCEL_FIRST_DATE;
              milliseconds ||= value.getTime() % 1000 !== 0;
            }
          }
          if (early) {
            textDateColumns.add(key);
          } else if (typeInfo.calendarDates) {
            column.style = { numFmt: "yyyy-mm-dd" };
          } else {
            column.style = { numFmt: milliseconds ? "yyyy-mm-dd hh:mm:ss.000" : "yyyy-mm-dd hh:mm:ss" };
          }
        }
        return column;
      });

      // Blank text in a column of numbers, booleans or dates is an empty cell, which a
      // formula reads as nothing: as text, =A2+1 would give #VALUE!
      const blankColumns = new Set(columnNames.filter((key) => columnTypes[key].blanksAreNull));

      // A row's cells, so that the caller's row stays as it was
      const cellsOf = (row) => {
        const cells = {};
        for (const key of columnNames) {
          let value = row[key];
          if (blankColumns.has(key) && isBlank(value)) {
            value = null;
          } else if (textDateColumns.has(key) && value instanceof Date) {
            value = naiveDateText(value, columnTypes[key].calendarDates);
          }
          cells[key] = typeof value === "string" ? inlineText(value) : value;
        }
        return cells;
      };

      // Each sheet's rows, below its header row
      const sheetDataRows = sheetRows - 1;
      for (let first = 0, sheet = 1; first < data.length; first += sheetDataRows, sheet++) {
        const worksheet = workbook.addWorksheet(sheet === 1 ? "Data" : `Data ${sheet}`);
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

        const last = Math.min(first + sheetDataRows, data.length);
        for (let start = first; start < last; start += chunkRows) {
          const end = Math.min(start + chunkRows, last);
          for (let i = start; i < end; i++) {
            worksheet.addRow(cellsOf(data[i])).commit();
          }
          await sheetTaken(worksheet, failed);
        }
        worksheet.commit();
      }

      await Promise.race([workbook.commit(), failed]);
    });
  } catch (error) {
    throw new Error(`Excel export failed: ${error.message}`, { cause: error });
  }
}
