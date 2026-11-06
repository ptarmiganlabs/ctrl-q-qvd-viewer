import ExcelJS from "exceljs";
import { isBlank } from "../cellValue.mjs";
import { scanColumnTypes } from "./columnTypes.mjs";
import { naiveDateText } from "./naiveDates.mjs";

// The first date Excel shows as itself: it can't show earlier ones, and its 1900 leap
// year bug puts January and February 1900 a day out
const EXCEL_FIRST_DATE = Date.UTC(1900, 2, 1);

/**
 * Heap an Excel export builds from the rows, for the memory guard. It needed
 * 730 bytes per cell and 2.3 per character of text. Measured by the smallest
 * heap that let 200,000 or 1,000,000 rows of chicago_taxi_rides_2016_03.qvd
 * export, against reading them alone, and 50,000 rows of four unique
 * 400-character values for the cost per character. See
 * DataExporter.memoryCost() for the margins.
 */
export const memoryCost = { bytesPerCell: 1100, bytesPerTextChar: 5 };

/**
 * Export data to Excel (.xlsx) format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
export async function exportToExcel(data, filePath) {
  try {
    const workbook = new ExcelJS.Workbook();

    // Add metadata to workbook properties
    workbook.creator = "Ctrl-Q QVD Viewer for VS Code";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.properties.description = [
      "Excel Data Export",
      "Created by: Ctrl-Q QVD Viewer for VS Code",
      "VS Code Extension: https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer",
      "GitHub: https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer",
    ].join("\n");

    const worksheet = workbook.addWorksheet("Data");

    if (data.length === 0) {
      await workbook.xlsx.writeFile(filePath);
      return;
    }

    // Get column headers from first row
    const columnNames = Object.keys(data[0]);
    const columnTypes = scanColumnTypes(data, columnNames);

    // A column of dates shows them as dates, and one of timestamps with their time. A
    // column with a date Excel can't show is written as ISO text instead
    const textDateColumns = columnNames.filter(
      (key) =>
        columnTypes[key].hasDate &&
        data.some((row) => row[key] instanceof Date && row[key].getTime() < EXCEL_FIRST_DATE)
    );
    const columns = columnNames.map((key) => {
      const typeInfo = columnTypes[key];
      const column = { header: key, key: key, width: 15 };
      if (typeInfo.hasDate && !textDateColumns.includes(key)) {
        column.style = { numFmt: typeInfo.allMidnight ? "yyyy-mm-dd" : "yyyy-mm-dd hh:mm:ss" };
      }
      return column;
    });

    worksheet.columns = columns;

    // Blank text in a column of numbers, booleans or dates is an empty cell, which a
    // formula reads as nothing: as text, =A2+1 would give #VALUE!
    const blankColumns = columnNames.filter((key) => columnTypes[key].blanksAreNull);

    // Add rows
    data.forEach((row) => {
      // A copy where a cell changes, so that the caller's row stays as it was
      let cells = row;
      for (const key of blankColumns) {
        if (isBlank(row[key])) {
          cells = cells === row ? { ...row } : cells;
          cells[key] = null;
        }
      }
      for (const key of textDateColumns) {
        if (row[key] instanceof Date) {
          cells = cells === row ? { ...row } : cells;
          cells[key] = naiveDateText(row[key], columnTypes[key].allMidnight);
        }
      }
      worksheet.addRow(cells);
    });

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };

    await workbook.xlsx.writeFile(filePath);
  } catch (error) {
    throw new Error(`Excel export failed: ${error.message}`);
  }
}
