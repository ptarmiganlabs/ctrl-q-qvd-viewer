const path = require("path");
const { exportToCSV } = require("./csvExporter");
const { exportToJSON } = require("./jsonExporter");
const { exportToExcel } = require("./excelExporter");
const { exportToParquet } = require("./parquetExporter");
const { exportToYAML } = require("./yamlExporter");
const { exportToAvro } = require("./avroExporter");
const { exportToArrow } = require("./arrowExporter");
const { exportToSQLite } = require("./sqliteExporter");
const { exportToXML } = require("./xmlExporter");
const { exportToQlikInline } = require("./qlikInlineExporter");

/**
 * Main DataExporter class that coordinates all export operations
 */
class DataExporter {
  /**
   * Show save dialog and export data to the selected format
   * @param {Array<Object>} data - Array of row objects
   * @param {string} format - Export format ('csv', 'json', 'excel', 'parquet', 'yaml', 'avro', 'arrow', 'sqlite', 'xml', 'qlik')
   * @param {string} suggestedFileName - Suggested file name without extension
   * @param {object} vscode - VS Code API object
   * @param {string} workspaceFolder - Workspace folder path
   * @param {number} maxRows - Maximum number of rows (for Qlik format)
   * @returns {Promise<string|null>} Path to saved file or null if cancelled
   */
  static async exportData(
    data,
    format,
    suggestedFileName,
    vscode,
    workspaceFolder,
    maxRows
  ) {
    const formatConfig = {
      arrow: {
        extension: "arrow",
        filter: "Arrow Files",
        exporter: exportToArrow,
      },
      avro: {
        extension: "avro",
        filter: "Avro Files",
        exporter: exportToAvro,
      },
      csv: {
        extension: "csv",
        filter: "CSV Files",
        exporter: exportToCSV,
      },
      excel: {
        extension: "xlsx",
        filter: "Excel Files",
        exporter: exportToExcel,
      },
      json: {
        extension: "json",
        filter: "JSON Files",
        exporter: exportToJSON,
      },
      parquet: {
        extension: "parquet",
        filter: "Parquet Files",
        exporter: exportToParquet,
      },
      qlik: {
        extension: "qvs",
        filter: "Qlik Script Files",
        exporter: exportToQlikInline,
      },
      sqlite: {
        extension: "db",
        filter: "SQLite Database",
        exporter: exportToSQLite,
      },
      xml: {
        extension: "xml",
        filter: "XML Files",
        exporter: exportToXML,
      },
      yaml: {
        extension: "yaml",
        filter: "YAML Files",
        exporter: exportToYAML,
      },
    };

    const config = formatConfig[format];
    if (!config) {
      throw new Error(`Unsupported export format: ${format}`);
    }

    // Handle Qlik inline format with delimiter selection BEFORE file dialog
    let selectedDelimiter = null;
    if (format === "qlik") {
      // Get default delimiter from settings
      const vscodeConfig =
        vscode.workspace.getConfiguration("ctrl-q-qvd-viewer");
      const defaultDelimiter = vscodeConfig.get("qlikInlineDelimiter", "tab");

      // Prompt user for delimiter choice
      const delimiterOptions = [
        {
          label: "Tab (\\t)",
          description: "Good general purpose delimiter",
          value: "tab",
        },
        {
          label: "Pipe (|)",
          description: "Recommended when data contains commas",
          value: "pipe",
        },
        {
          label: "Comma (,)",
          description: "Standard CSV-style, but may conflict with data",
          value: "comma",
        },
        {
          label: "Semicolon (;)",
          description: "Alternative to comma",
          value: "semicolon",
        },
        {
          label: "Auto-detect",
          description:
            "Automatically choose the best delimiter based on data content",
          value: "auto-detect",
        },
      ];

      // Mark the default option
      const defaultOption = delimiterOptions.find(
        (opt) => opt.value === defaultDelimiter
      );
      if (defaultOption) {
        defaultOption.label = `${defaultOption.label} (default)`;
      }

      selectedDelimiter = await vscode.window.showQuickPick(delimiterOptions, {
        placeHolder: `Select delimiter for Qlik inline load script (default: ${defaultDelimiter})`,
        title: "Qlik Inline Load Delimiter",
      });

      if (!selectedDelimiter) {
        return null; // User cancelled delimiter selection
      }
    }

    // Show save dialog
    const defaultFileName = `${suggestedFileName}.${config.extension}`;
    const defaultUri = vscode.Uri.file(
      path.join(workspaceFolder || require("os").homedir(), defaultFileName)
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
    if (format === "qlik") {
      // Pass delimiter to Qlik exporter
      await config.exporter(
        data,
        fileUri.fsPath,
        maxRows,
        selectedDelimiter.value
      );
    } else {
      // Other formats don't need delimiter or maxRows
      await config.exporter(data, fileUri.fsPath);
    }

    return fileUri.fsPath;
  }
}

module.exports = DataExporter;
