import ExcelJS from "exceljs";
import { isBlank } from "../cellValue.mjs";
import { scanColumnTypes } from "./columnTypes.mjs";

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
    const columns = columnNames.map((key) => ({
      header: key,
      key: key,
      width: 15,
    }));

    worksheet.columns = columns;

    // Blank text in a column of numbers, booleans or dates is an empty cell, which a
    // formula reads as nothing: as text, =A2+1 would give #VALUE!
    const columnTypes = scanColumnTypes(data, columnNames);
    const blankColumns = columnNames.filter((key) => columnTypes[key].blanksAreNull);

    // Add rows
    data.forEach((row) => {
      let cells = row;
      for (const key of blankColumns) {
        if (isBlank(row[key])) {
          // A copy, so that the caller's row stays as it was
          if (cells === row) {
            cells = { ...row };
          }
          cells[key] = null;
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
