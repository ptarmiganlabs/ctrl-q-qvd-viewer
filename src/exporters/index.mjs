import { join } from 'path';
import { sourceOf } from '../exportSource.mjs';
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
import { resolveTimeZone, timeZoneNames } from './zonedTimestamps.mjs';

// The setting that names the time zone a QVD's timestamps were read in
const TIME_ZONE_SETTING = "exportTimeZone";

// Each export format: its name as the user sees it, its file's extension and the save
// dialog's filter, whether it is in beta, its exporter, what its export builds on the
// heap as the exporter declares it, whether it writes a QVD's dates and timestamps as
// dates, as a format with date types does, and whether it can write the timestamps as
// instants, read in a time zone the export names
const FORMATS = {
  arrow: {
    label: "Export to Arrow",
    extension: "arrow",
    filter: "Arrow Files",
    beta: true,
    exporter: exportToArrow,
    cost: arrowCost,
    dates: true,
    zones: true,
  },
  avro: {
    label: "Export to Avro",
    extension: "avro",
    filter: "Avro Files",
    beta: true,
    exporter: exportToAvro,
    cost: avroCost,
    dates: true,
    zones: true,
  },
  csv: {
    label: "Export to CSV",
    extension: "csv",
    filter: "CSV Files",
    beta: false,
    exporter: exportToCSV,
    cost: csvCost,
    dates: false,
    zones: false,
  },
  excel: {
    label: "Export to Excel",
    extension: "xlsx",
    filter: "Excel Files",
    beta: false,
    exporter: exportToExcel,
    cost: excelCost,
    dates: true,
    zones: false,
  },
  json: {
    label: "Export to JSON",
    extension: "json",
    filter: "JSON Files",
    beta: false,
    exporter: exportToJSON,
    cost: jsonCost,
    dates: false,
    zones: false,
  },
  parquet: {
    label: "Export to Parquet",
    extension: "parquet",
    filter: "Parquet Files",
    beta: false,
    exporter: exportToParquet,
    cost: parquetCost,
    dates: true,
    zones: true,
  },
  postgres: {
    label: "Export to PostgreSQL",
    extension: "sql",
    filter: "SQL Files",
    beta: true,
    exporter: exportToPostgres,
    cost: postgresCost,
    dates: true,
    zones: true,
  },
  qlik: {
    label: "Export to Qlik Inline Script",
    extension: "qvs",
    filter: "Qlik Script Files",
    beta: false,
    exporter: exportToQlikInline,
    cost: qlikCost,
    dates: false,
    zones: false,
  },
  sqlite: {
    label: "Export to SQLite",
    extension: "db",
    filter: "SQLite Database",
    beta: true,
    exporter: exportToSQLite,
    cost: sqliteCost,
    dates: true,
    zones: true,
  },
  xml: {
    label: "Export to XML",
    extension: "xml",
    filter: "XML Files",
    beta: false,
    exporter: exportToXML,
    cost: xmlCost,
    dates: false,
    zones: false,
  },
  yaml: {
    label: "Export to YAML",
    extension: "yaml",
    filter: "YAML Files",
    beta: false,
    exporter: exportToYAML,
    cost: yamlCost,
    dates: false,
    zones: false,
  },
};

/**
 * The time zone the settings name for a QVD's timestamps
 * @param {object} vscode - VS Code API object
 * @returns {string|null} Intl's name for it, or null when the setting is empty
 * @throws {Error} For a zone Intl doesn't know, naming the setting in its setting property
 */
function settingsTimeZone(vscode) {
  const named = String(
    vscode.workspace.getConfiguration("ctrl-q-qvd-viewer").get(TIME_ZONE_SETTING, "") ?? ""
  ).trim();
  if (named === "") {
    return null;
  }
  const timeZone = resolveTimeZone(named);
  if (timeZone === null) {
    const setting = `ctrl-q-qvd-viewer.${TIME_ZONE_SETTING}`;
    const error = new Error(
      `The setting ${setting} names "${named}", which isn't a time zone VS Code knows. ` +
        `Name one such as America/Chicago or UTC, or leave it empty to export timestamps ` +
        `as wall clocks with no time zone.`
    );
    error.setting = setting;
    throw error;
  }
  return timeZone;
}

/**
 * Ask which time zone a QVD's timestamps were read in
 * @param {object} vscode - VS Code API object
 * @param {string|null} defaultTimeZone - The zone the settings name, offered first
 * @returns {Promise<string|null|undefined>} The zone, null for none, or undefined when
 *   the user cancelled
 */
async function askTimeZone(vscode, defaultTimeZone) {
  const title = "Time Zone of the Timestamps";
  const items = [];
  const offer = (item) => {
    if (!items.some((other) => other.value === item.value)) {
      items.push(item);
    }
  };
  if (defaultTimeZone !== null) {
    offer({ label: `${defaultTimeZone} (default)`, description: "From the settings", value: defaultTimeZone });
  }
  offer({
    label: defaultTimeZone === null ? "No time zone (default)" : "No time zone",
    description: "Wall clocks as Qlik shows them, as the QVD holds them",
    value: null,
  });
  offer({ label: "UTC", description: "The timestamps already are UTC, as Qlik's UTC() gives them", value: "UTC" });
  const here = resolveTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (here !== null) {
    offer({ label: here, description: "This computer's time zone. The QVD's may be another", value: here });
  }
  items.push({ label: "Other time zone…", description: "Every time zone VS Code knows", other: true });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "A QVD's timestamps are wall clocks. Name the time zone they were read in to export them as instants",
    title,
  });
  if (!picked) {
    return undefined;
  }
  if (!picked.other) {
    return picked.value;
  }
  const zone = await vscode.window.showQuickPick(timeZoneNames(), {
    placeHolder: "The time zone the QVD's timestamps were read in",
    title,
  });
  return zone ?? undefined;
}

/**
 * Main DataExporter class that coordinates all export operations
 */
class DataExporter {
  /**
   * Get the list of available export formats with metadata
   * @returns {Array<Object>} Array of format objects with name, label, and beta status
   */
  static getExportFormats() {
    return Object.entries(FORMATS).map(([name, { label, beta }]) => ({ name, label, beta }));
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
   * about one and a half times what the export needed per cell, or per distinct
   * value it holds, and twice what it needed per character of text, since text
   * outside Latin-1 takes two bytes a character.
   * @param {string} format - The export format
   * @returns {import('../memoryGuard.mjs').ExportCost|null} The cost, or null for a name that isn't a format
   */
  static memoryCost(format) {
    return Object.hasOwn(FORMATS, format) ? FORMATS[format].cost : null;
  }

  /**
   * Whether a format's export writes a QVD's dates and timestamps as dates. Every other
   * format writes the text Qlik shows, as the grid does.
   * @param {string} format - The export format
   * @returns {boolean} True for a format with date types
   */
  static writesDates(format) {
    return Object.hasOwn(FORMATS, format) && FORMATS[format].dates;
  }

  /**
   * Show save dialog and export data to the selected format
   * The questions come first, then the save dialog. A format that can write instants
   * then asks which time zone the timestamps were read in, once it is known that the
   * rows hold timestamps: from a source of a QVD, that takes a pass over the file.
   * @param {Array<Object>|import('../exportSource.mjs').ExportSource} data - Row objects, or a source of them
   * @param {string} format - Export format ('csv', 'json', 'excel', 'parquet', 'yaml', 'avro', 'arrow', 'sqlite', 'xml', 'qlik', 'postgres')
   * @param {string} suggestedFileName - Suggested file name without extension
   * @param {object} vscode - VS Code API object
   * @param {string} workspaceFolder - Workspace folder path
   * @param {number} maxRows - Maximum number of rows (for Qlik and PostgreSQL formats)
   * @param {Array<string>} [fields] - The QVD's field names in order (for CSV's header row)
   * @param {object} [options]
   * @param {function(import('../exportSource.mjs').ExportSource, number): (function(): void|Promise<function(): void>)} [options.reserve] -
   *   Called with the source and the row limit once every question is answered, just before
   *   the export is written. It returns a release, or a promise of one, called when the
   *   export ends, or throws to refuse the export.
   * @param {function(import('./zonedTimestamps.mjs').TimeShifts): void} [options.report] -
   *   Called once an export that read its timestamps in a time zone is written, with
   *   what reading them in it did
   * @param {function(string): void} [options.warn] - Called with a warning for the
   *   extension's log, such as an Excel export that can't wait for its zip
   * @returns {Promise<string|null>} Path to saved file or null if cancelled
   * @throws {Error} For a time zone in the settings that VS Code doesn't know, naming
   *   the setting in its setting property, when the export would use it
   */
  static async exportData(
    data,
    format,
    suggestedFileName,
    vscode,
    workspaceFolder,
    maxRows,
    fields,
    { reserve, report, warn } = {}
  ) {
    const config = Object.hasOwn(FORMATS, format) ? FORMATS[format] : null;
    if (!config) {
      throw new Error(`Unsupported export format: ${format}`);
    }

    const source = sourceOf(data);
    // Qlik inline and PostgreSQL export as many rows as the user chose, from the first
    const limited = format === "qlik" || format === "postgres";
    const exported = limited && maxRows > 0 ? source.first(maxRows) : source;

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

    // A format that can write instants asks which time zone the timestamps were read
    // in, when the rows it exports hold timestamps: dates have no time zone. The zone
    // the settings name is offered first, once it is known to be one. Without a time
    // zone the timestamps are written as wall clocks, as the QVD holds them
    let timeZone = null;
    if (config.zones && (await exported.holdsTimestamps())) {
      timeZone = await askTimeZone(vscode, settingsTimeZone(vscode));
      if (timeZone === undefined) {
        return null; // User cancelled
      }
    }

    // The heap the export needs, booked now the questions are answered
    const release = reserve ? await reserve(source, limited ? maxRows : 0) : () => {};

    try {
      // Perform export
      let timeShifts;
      if (format === "qlik") {
        // Pass delimiter to Qlik exporter
        await config.exporter(
          source,
          fileUri.fsPath,
          maxRows,
          selectedDelimiter.value
        );
      } else if (format === "postgres") {
        // Pass options to PostgreSQL exporter
        timeShifts = await config.exporter(source, fileUri.fsPath, maxRows, { ...postgresOptions, timeZone });
      } else if (config.zones) {
        timeShifts = await config.exporter(source, fileUri.fsPath, { timeZone });
      } else if (format === "excel") {
        // What it works around goes to the extension's log
        await config.exporter(source, fileUri.fsPath, { warn });
      } else if (format === "csv") {
        // The header row comes from the QVD's fields, so it has every field, in QVD order,
        // even when there are no rows
        const vscodeConfig =
          vscode.workspace.getConfiguration("ctrl-q-qvd-viewer");
        await config.exporter(source, fileUri.fsPath, {
          fields,
          escapeFormulas: vscodeConfig.get("csvEscapeFormulas", true),
          byteOrderMark: vscodeConfig.get("csvByteOrderMark", false),
        });
      } else {
        // Other formats don't need delimiter or maxRows
        await config.exporter(source, fileUri.fsPath);
      }
      if (timeZone !== null && timeShifts) {
        report?.(timeShifts);
      }
    } finally {
      release();
    }

    return fileUri.fsPath;
  }
}

export default DataExporter;
