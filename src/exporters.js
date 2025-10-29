const fs = require("fs").promises;
const path = require("path");
const ExcelJS = require("exceljs");
const parquet = require("parquetjs");
const Papa = require("papaparse");

/**
 * Export data from QVD to various formats
 */
class DataExporter {
  /**
   * Export data to CSV format
   * @param {Array<Object>} data - Array of row objects
   * @param {string} filePath - Destination file path
   * @returns {Promise<void>}
   */
  static async exportToCSV(data, filePath) {
    try {
      const csv = Papa.unparse(data, {
        quotes: true,
        quoteChar: '"',
        escapeChar: '"',
        delimiter: ",",
        header: true,
        newline: "\n",
      });

      await fs.writeFile(filePath, csv, "utf8");
    } catch (error) {
      throw new Error(`CSV export failed: ${error.message}`);
    }
  }

  /**
   * Export data to JSON format
   * @param {Array<Object>} data - Array of row objects
   * @param {string} filePath - Destination file path
   * @returns {Promise<void>}
   */
  static async exportToJSON(data, filePath) {
    try {
      const json = JSON.stringify(data, null, 2);
      await fs.writeFile(filePath, json, "utf8");
    } catch (error) {
      throw new Error(`JSON export failed: ${error.message}`);
    }
  }

  /**
   * Export data to Excel (.xlsx) format
   * @param {Array<Object>} data - Array of row objects
   * @param {string} filePath - Destination file path
   * @returns {Promise<void>}
   */
  static async exportToExcel(data, filePath) {
    try {
      const workbook = new ExcelJS.Workbook();
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

  /**
   * Export data to Parquet format
   * @param {Array<Object>} data - Array of row objects
   * @param {string} filePath - Destination file path
   * @returns {Promise<void>}
   */
  static async exportToParquet(data, filePath) {
    try {
      if (data.length === 0) {
        // Create empty parquet file with minimal schema
        const schema = new parquet.ParquetSchema({
          empty: { type: "UTF8" },
        });

        const writer = await parquet.ParquetWriter.openFile(schema, filePath);
        await writer.close();
        return;
      }

      // Infer schema from first row
      const firstRow = data[0];
      const schemaFields = {};

      Object.keys(firstRow).forEach((key) => {
        const value = firstRow[key];
        let type = "UTF8"; // Default to string

        if (value === null || value === undefined) {
          type = "UTF8";
        } else if (typeof value === "number") {
          type = Number.isInteger(value) ? "INT64" : "DOUBLE";
        } else if (typeof value === "boolean") {
          type = "BOOLEAN";
        } else if (value instanceof Date) {
          type = "TIMESTAMP_MILLIS";
        }

        schemaFields[key] = { type };
      });

      const schema = new parquet.ParquetSchema(schemaFields);
      const writer = await parquet.ParquetWriter.openFile(schema, filePath);

      // Write rows
      for (const row of data) {
        await writer.appendRow(row);
      }

      await writer.close();
    } catch (error) {
      throw new Error(`Parquet export failed: ${error.message}`);
    }
  }

  /**
   * Show save dialog and export data to the selected format
   * @param {Array<Object>} data - Array of row objects
   * @param {string} format - Export format ('csv', 'json', 'excel', 'parquet')
   * @param {string} suggestedFileName - Suggested file name without extension
   * @param {object} vscode - VS Code API object
   * @param {string} workspaceFolder - Workspace folder path
   * @returns {Promise<string|null>} Path to saved file or null if cancelled
   */
  static async exportData(data, format, suggestedFileName, vscode, workspaceFolder) {
    const formatConfig = {
      csv: { extension: "csv", filter: "CSV Files", exporter: this.exportToCSV },
      json: { extension: "json", filter: "JSON Files", exporter: this.exportToJSON },
      excel: { extension: "xlsx", filter: "Excel Files", exporter: this.exportToExcel },
      parquet: { extension: "parquet", filter: "Parquet Files", exporter: this.exportToParquet },
    };

    const config = formatConfig[format];
    if (!config) {
      throw new Error(`Unsupported export format: ${format}`);
    }

    // Show save dialog
    const defaultFileName = `${suggestedFileName}.${config.extension}`;
    const defaultUri = vscode.Uri.file(
      path.join(
        workspaceFolder || require("os").homedir(),
        defaultFileName
      )
    );

    const fileUri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: {
        [config.filter]: [config.extension],
      },
      title: `Export to ${format.toUpperCase()}`,
    });

    if (!fileUri) {
      return null; // User cancelled
    }

    // Perform export
    await config.exporter.call(this, data, fileUri.fsPath);

    return fileUri.fsPath;
  }
}

module.exports = DataExporter;
