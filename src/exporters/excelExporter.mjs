import ExcelJS from "exceljs";

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
    const columns = Object.keys(data[0]).map((key) => ({
      header: key,
      key: key,
      width: 15,
    }));

    worksheet.columns = columns;

    // Add rows
    data.forEach((row) => {
      worksheet.addRow(row);
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
