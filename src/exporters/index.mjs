import { join } from 'path';
import { exportToCSV, memoryCost as csvCost } from './csvExporter.mjs';
import { exportToJSON, memoryCost as jsonCost } from './jsonExporter.mjs';
import { exportToExcel, memoryCost as excelCost } from './excelExporter.mjs';
import { exportToParquet, memoryCost as parquetCost } from './parquetExporter.mjs';
import { exportToYAML, memoryCost as yamlCost } from './yamlExporter.mjs';
import { exportToAvro, memoryCost as avroCost } from './avroExporter.mjs';
import { exportToArrow, memoryCost as arrowCost } from './arrowExporter.mjs';
import { exportToSQLite, memoryCost as sqliteCost } from './sqliteExporter.mjs';
import { exportToXML, memoryCost as xmlCost } from './xmlExporter.mjs';
import { exportToQlikInline, memoryCost as qlikCost } from './qlikInlineExporter.mjs';
import { exportToPostgres, memoryCost as postgresCost } from './postgresExporter.mjs';

// What each format's export builds on the heap, as its exporter declares it
const MEMORY_COSTS = {
  arrow: arrowCost,
  avro: avroCost,
  csv: csvCost,
  excel: excelCost,
  json: jsonCost,
  parquet: parquetCost,
  postgres: postgresCost,
  qlik: qlikCost,
  sqlite: sqliteCost,
  xml: xmlCost,
  yaml: yamlCost,
};

// The formats with date types, whose exports read a QVD's dates and timestamps as dates
const DATE_FORMATS = new Set(["arrow", "avro", "excel", "parquet", "postgres", "sqlite"]);

/**
 * Main DataExporter class that coordinates all export operations
 */
class DataExporter {
  /**
   * Get the list of available export formats with metadata
   * @returns {Array<Object>} Array of format objects with name, label, and beta status
   */
  static getExportFormats() {
    return [
      { name: "arrow", label: "Export to Arrow", beta: true },
      { name: "avro", label: "Export to Avro", beta: true },
      { name: "csv", label: "Export to CSV", beta: false },
      { name: "excel", label: "Export to Excel", beta: false },
      { name: "json", label: "Export to JSON", beta: false },
      { name: "parquet", label: "Export to Parquet", beta: false },
      { name: "postgres", label: "Export to PostgreSQL", beta: true },
      { name: "qlik", label: "Export to Qlik Inline Script", beta: false },
      { name: "sqlite", label: "Export to SQLite", beta: true },
      { name: "xml", label: "Export to XML", beta: false },
      { name: "yaml", label: "Export to YAML", beta: false },
    ];
  }

  /**
   * A format's name as the user sees it
   * @param {string} format - The export format, such as "excel"
   * @returns {string} Such as "Excel"; the name itself for one that isn't a format
   */
  static formatLabel(format) {
    const known = DataExporter.getExportFormats().find((entry) => entry.name === format);
    return known ? known.label.replace(/^Export to /, "") : String(format);
  }

  /**
   * What a format's export builds on the heap from the rows, for the memory guard
   * Each exporter declares its own, next to the code that builds it. Each is
   * about one and a half times what the export needed per cell, and twice what
   * it needed per character of text, since text outside Latin-1 takes two bytes
   * a character.
   * @param {string} format - The export format
   * @returns {import('../memoryGuard.mjs').ExportCost|null} The cost, or null for a name that isn't a format
   */
  static memoryCost(format) {
    return Object.hasOwn(MEMORY_COSTS, format) ? MEMORY_COSTS[format] : null;
  }

  /**
   * Whether a format's export writes a QVD's dates and timestamps as dates. Every other
   * format writes the text Qlik shows, as the grid does.
   * @param {string} format - The export format
   * @returns {boolean} True for a format with date types
   */
  static writesDates(format) {
    return DATE_FORMATS.has(format);
  }

  /**
   * The formats whose export writes as it goes, and so needs little memory, as the user sees them
   * @returns {Array<string>} Such as "CSV"
   */
  static leanFormatLabels() {
    return DataExporter.getExportFormats()
      .filter((entry) => MEMORY_COSTS[entry.name]?.writesAsItGoes)
      .map((entry) => DataExporter.formatLabel(entry.name));
  }

  /**
   * Show save dialog and export data to the selected format
   * @param {Array<Object>} data - Array of row objects
   * @param {string} format - Export format ('csv', 'json', 'excel', 'parquet', 'yaml', 'avro', 'arrow', 'sqlite', 'xml', 'qlik', 'postgres')
   * @param {string} suggestedFileName - Suggested file name without extension
   * @param {object} vscode - VS Code API object
   * @param {string} workspaceFolder - Workspace folder path
   * @param {number} maxRows - Maximum number of rows (for Qlik and PostgreSQL formats)
   * @param {Array<string>} [fields] - The QVD's field names in order (for CSV's header row)
   * @param {object} [options]
   * @param {function(Array<Object>, number): (function(): void|Promise<function(): void>)} [options.reserve] -
   *   Called with the rows and the row limit once every question is answered, just before
   *   the export is written. It returns a release, or a promise of one, called when the
   *   export ends, or throws to refuse the export.
   * @returns {Promise<string|null>} Path to saved file or null if cancelled
   */
  static async exportData(
    data,
    format,
    suggestedFileName,
    vscode,
    workspaceFolder,
    maxRows,
    fields,
    { reserve } = {}
  ) {
    const formatConfig = {
      arrow: {
        extension: "arrow",
        filter: "Arrow Files",
        exporter: exportToArrow,
        beta: true,
      },
      avro: {
        extension: "avro",
        filter: "Avro Files",
        exporter: exportToAvro,
        beta: true,
      },
      csv: {
        extension: "csv",
        filter: "CSV Files",
        exporter: exportToCSV,
        beta: false,
      },
      excel: {
        extension: "xlsx",
        filter: "Excel Files",
        exporter: exportToExcel,
        beta: false,
      },
      json: {
        extension: "json",
        filter: "JSON Files",
        exporter: exportToJSON,
        beta: false,
      },
      parquet: {
        extension: "parquet",
        filter: "Parquet Files",
        exporter: exportToParquet,
        beta: false,
      },
      postgres: {
        extension: "sql",
        filter: "SQL Files",
        exporter: exportToPostgres,
        beta: true,
      },
      qlik: {
        extension: "qvs",
        filter: "Qlik Script Files",
        exporter: exportToQlikInline,
        beta: false,
      },
      sqlite: {
        extension: "db",
        filter: "SQLite Database",
        exporter: exportToSQLite,
        beta: true,
      },
      xml: {
        extension: "xml",
        filter: "XML Files",
        exporter: exportToXML,
        beta: false,
      },
      yaml: {
        extension: "yaml",
        filter: "YAML Files",
        exporter: exportToYAML,
        beta: false,
      },
    };

    const config = formatConfig[format];
    if (!config) {
      throw new Error(`Unsupported export format: ${format}`);
    }

    // Handle Qlik inline format with delimiter selection BEFORE file dialog
    let selectedDelimiter = null;
    let postgresOptions = null;

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

    // Handle PostgreSQL format with options BEFORE file dialog
    if (format === "postgres") {
      // Ask if CREATE TABLE should be included
      const createTableChoice = await vscode.window.showQuickPick(
        [
          {
            label: "Yes",
            description: "Include CREATE TABLE statement",
            value: true,
          },
          {
            label: "No",
            description: "Only generate INSERT statements",
            value: false,
          },
        ],
        {
          placeHolder: "Include CREATE TABLE statement?",
          title: "PostgreSQL Export - CREATE TABLE",
        }
      );

      if (createTableChoice === undefined) {
        return null; // User cancelled
      }

      const createTable = createTableChoice.value;
      let tableName = "qvd_data";
      let dropTable = false;

      // If creating table, ask for table name and drop option
      if (createTable) {
        // Ask for table name
        const tableNameInput = await vscode.window.showInputBox({
          prompt: "Enter the PostgreSQL table name",
          value: "qvd_data",
          placeHolder: "qvd_data",
          title: "PostgreSQL Export - Table Name",
        });

        if (tableNameInput === undefined) {
          return null; // User cancelled
        }

        tableName = tableNameInput || "qvd_data";

        // Ask if existing table should be dropped
        const dropTableChoice = await vscode.window.showQuickPick(
          [
            {
              label: "No",
              description: "Keep existing table if it exists (default)",
              value: false,
            },
            {
              label: "Yes",
              description: "Drop existing table before creating new one",
              value: true,
            },
          ],
          {
            placeHolder: "Drop existing table if it exists?",
            title: "PostgreSQL Export - DROP TABLE",
          }
        );

        if (dropTableChoice === undefined) {
          return null; // User cancelled
        }

        dropTable = dropTableChoice.value;
      }

      postgresOptions = {
        createTable,
        tableName,
        dropTable,
      };
    }

    // Show save dialog
    const defaultFileName = `${suggestedFileName}.${config.extension}`;
    // Need to use require for os.homedir() since it's not exported as ESM
    const os = await import('os');
    const defaultUri = vscode.Uri.file(
      join(workspaceFolder || os.homedir(), defaultFileName)
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

    // The heap the export needs, booked now the questions are answered
    const limited = format === "qlik" || format === "postgres";
    const release = reserve ? await reserve(data, limited ? maxRows : 0) : () => {};

    try {
      // Perform export
      if (format === "qlik") {
        // Pass delimiter to Qlik exporter
        await config.exporter(
          data,
          fileUri.fsPath,
          maxRows,
          selectedDelimiter.value
        );
      } else if (format === "postgres") {
        // Pass options to PostgreSQL exporter
        await config.exporter(data, fileUri.fsPath, maxRows, postgresOptions);
      } else if (format === "csv") {
        // The header row comes from the QVD's fields, so it has every field, in QVD order,
        // even when there are no rows
        const vscodeConfig =
          vscode.workspace.getConfiguration("ctrl-q-qvd-viewer");
        await config.exporter(data, fileUri.fsPath, {
          fields,
          escapeFormulas: vscodeConfig.get("csvEscapeFormulas", true),
          byteOrderMark: vscodeConfig.get("csvByteOrderMark", false),
        });
      } else {
        // Other formats don't need delimiter or maxRows
        await config.exporter(data, fileUri.fsPath);
      }
    } finally {
      release();
    }

    return fileUri.fsPath;
  }
}

export default DataExporter;
