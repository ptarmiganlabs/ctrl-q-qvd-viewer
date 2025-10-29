const fs = require("fs").promises;
const path = require("path");
const ExcelJS = require("exceljs");
const parquet = require("parquetjs");
const Papa = require("papaparse");
const yaml = require("js-yaml");
const avro = require("avsc");
const arrow = require("apache-arrow");
const Database = require("better-sqlite3");
const xmljs = require("xml-js");

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
   * Export data to YAML format
   * @param {Array<Object>} data - Array of row objects
   * @param {string} filePath - Destination file path
   * @returns {Promise<void>}
   */
  static async exportToYAML(data, filePath) {
    try {
      const yamlString = yaml.dump(data, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
      });
      await fs.writeFile(filePath, yamlString, "utf8");
    } catch (error) {
      throw new Error(`YAML export failed: ${error.message}`);
    }
  }

  /**
   * Export data to Avro format
   * @param {Array<Object>} data - Array of row objects
   * @param {string} filePath - Destination file path
   * @returns {Promise<void>}
   */
  static async exportToAvro(data, filePath) {
    try {
      if (data.length === 0) {
        // Create empty Avro file with minimal schema
        const type = avro.Type.forSchema({
          type: "record",
          name: "EmptyRecord",
          fields: [{ name: "empty", type: "string" }],
        });
        
        await new Promise((resolve, reject) => {
          const encoder = avro.createFileEncoder(filePath, type);
          encoder.on('finish', resolve);
          encoder.on('error', reject);
          encoder.end();
        });
        return;
      }

      // Infer schema from first row
      const firstRow = data[0];
      const fields = Object.keys(firstRow).map((key) => {
        const value = firstRow[key];
        let avroType = "string"; // Default to string

        if (value === null || value === undefined) {
          avroType = ["null", "string"];
        } else if (typeof value === "number") {
          avroType = Number.isInteger(value) ? "long" : "double";
        } else if (typeof value === "boolean") {
          avroType = "boolean";
        } else if (value instanceof Date) {
          avroType = "long"; // Store as timestamp
        }

        return { name: key, type: avroType };
      });

      const type = avro.Type.forSchema({
        type: "record",
        name: "QVDRecord",
        fields: fields,
      });

      await new Promise((resolve, reject) => {
        const encoder = avro.createFileEncoder(filePath, type);
        
        encoder.on('finish', resolve);
        encoder.on('error', reject);

        // Write rows
        for (const row of data) {
          // Convert dates to timestamps
          const processedRow = {};
          Object.keys(row).forEach(key => {
            const value = row[key];
            if (value instanceof Date) {
              processedRow[key] = value.getTime();
            } else {
              processedRow[key] = value;
            }
          });
          encoder.write(processedRow);
        }

        encoder.end();
      });
    } catch (error) {
      throw new Error(`Avro export failed: ${error.message}`);
    }
  }

  /**
   * Export data to Apache Arrow format
   * @param {Array<Object>} data - Array of row objects
   * @param {string} filePath - Destination file path
   * @returns {Promise<void>}
   */
  static async exportToArrow(data, filePath) {
    try {
      if (data.length === 0) {
        // Create empty Arrow file
        const table = arrow.tableFromArrays({ empty: [] });
        const writer = arrow.RecordBatchFileWriter.writeAll(table);
        const buffer = Buffer.from(await writer.toUint8Array());
        await fs.writeFile(filePath, buffer);
        return;
      }

      // Convert data to columnar format
      const columns = {};
      const firstRow = data[0];

      Object.keys(firstRow).forEach((key) => {
        columns[key] = data.map((row) => row[key]);
      });

      // Create Arrow table
      const table = arrow.tableFromArrays(columns);

      // Write to file
      const writer = arrow.RecordBatchFileWriter.writeAll(table);
      const uint8Array = await writer.toUint8Array();
      const buffer = Buffer.from(uint8Array);
      await fs.writeFile(filePath, buffer);
    } catch (error) {
      throw new Error(`Arrow export failed: ${error.message}`);
    }
  }

  /**
   * Export data to SQLite database format
   * @param {Array<Object>} data - Array of row objects
   * @param {string} filePath - Destination file path
   * @returns {Promise<void>}
   */
  static async exportToSQLite(data, filePath) {
    try {
      // Create database
      const db = new Database(filePath);

      if (data.length === 0) {
        db.close();
        return;
      }

      // Infer schema from first row
      const firstRow = data[0];
      const columns = Object.keys(firstRow)
        .map((key) => {
          const value = firstRow[key];
          let sqlType = "TEXT"; // Default to TEXT

          if (value !== null && value !== undefined) {
            if (typeof value === "number") {
              sqlType = Number.isInteger(value) ? "INTEGER" : "REAL";
            } else if (typeof value === "boolean") {
              sqlType = "INTEGER"; // SQLite uses 0/1 for booleans
            } else if (value instanceof Date) {
              sqlType = "TEXT"; // Store dates as ISO strings
            }
          }

          return `"${key}" ${sqlType}`;
        })
        .join(", ");

      // Create table
      db.exec(`CREATE TABLE data (${columns})`);

      // Insert data
      const columnNames = Object.keys(firstRow);
      const placeholders = columnNames.map(() => "?").join(", ");
      const insertStmt = db.prepare(
        `INSERT INTO data (${columnNames.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`
      );

      const insertMany = db.transaction((rows) => {
        for (const row of rows) {
          const values = columnNames.map((col) => {
            const value = row[col];
            if (typeof value === "boolean") {
              return value ? 1 : 0;
            }
            if (value instanceof Date) {
              return value.toISOString();
            }
            return value;
          });
          insertStmt.run(values);
        }
      });

      insertMany(data);

      db.close();
    } catch (error) {
      throw new Error(`SQLite export failed: ${error.message}`);
    }
  }

  /**
   * Export data to XML format
   * @param {Array<Object>} data - Array of row objects
   * @param {string} filePath - Destination file path
   * @returns {Promise<void>}
   */
  static async exportToXML(data, filePath) {
    try {
      const xmlObj = {
        _declaration: {
          _attributes: {
            version: "1.0",
            encoding: "UTF-8",
          },
        },
        data: {
          record: data.map((row) => {
            const record = {};
            Object.keys(row).forEach((key) => {
              const value = row[key];
              // Handle different value types
              if (value === null || value === undefined) {
                record[key] = { _attributes: { nil: "true" } };
              } else if (typeof value === "object" && value instanceof Date) {
                record[key] = { _text: value.toISOString() };
              } else {
                record[key] = { _text: String(value) };
              }
            });
            return record;
          }),
        },
      };

      const xml = xmljs.js2xml(xmlObj, {
        compact: true,
        spaces: 2,
        ignoreComment: true,
      });

      await fs.writeFile(filePath, xml, "utf8");
    } catch (error) {
      throw new Error(`XML export failed: ${error.message}`);
    }
  }

  /**
   * Export data to Qlik Sense inline load script format
   * @param {Array<Object>} data - Array of row objects
   * @param {string} filePath - Destination file path
   * @param {number} maxRows - Maximum number of rows to include (0 = all)
   * @returns {Promise<void>}
   */
  static async exportToQlikInline(data, filePath, maxRows = 0) {
    try {
      if (data.length === 0) {
        await fs.writeFile(filePath, "// No data to export", "utf8");
        return;
      }

      // Limit data if maxRows is specified
      const exportData = maxRows > 0 ? data.slice(0, maxRows) : data;

      // Get column names from first row
      const columns = Object.keys(exportData[0]);

      // Build the inline load script
      const lines = [];
      
      // Add header comment
      lines.push("// Qlik Sense Inline Load Script");
      lines.push(`// Generated: ${new Date().toISOString()}`);
      lines.push(`// Rows: ${exportData.length}`);
      lines.push("");
      
      // Start the LOAD statement
      lines.push("DataTable:");
      lines.push("LOAD * INLINE [");
      
      // Add column headers (tab-separated)
      lines.push(columns.join("\t"));
      
      // Add data rows (tab-separated)
      exportData.forEach((row) => {
        const values = columns.map((col) => {
          const value = row[col];
          
          // Handle different value types
          if (value === null || value === undefined) {
            return "";
          } else if (typeof value === "string") {
            // Escape special characters in strings
            return value.replace(/\t/g, " ").replace(/\n/g, " ").replace(/\r/g, "");
          } else if (value instanceof Date) {
            return value.toISOString();
          } else {
            return String(value);
          }
        });
        lines.push(values.join("\t"));
      });
      
      // Close the inline load
      lines.push("];");

      await fs.writeFile(filePath, lines.join("\n"), "utf8");
    } catch (error) {
      throw new Error(`Qlik Sense inline script export failed: ${error.message}`);
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
  static async exportData(data, format, suggestedFileName, vscode, workspaceFolder, maxRows) {
    const formatConfig = {
      arrow: { extension: "arrow", filter: "Arrow Files", exporter: this.exportToArrow },
      avro: { extension: "avro", filter: "Avro Files", exporter: this.exportToAvro },
      csv: { extension: "csv", filter: "CSV Files", exporter: this.exportToCSV },
      excel: { extension: "xlsx", filter: "Excel Files", exporter: this.exportToExcel },
      json: { extension: "json", filter: "JSON Files", exporter: this.exportToJSON },
      parquet: { extension: "parquet", filter: "Parquet Files", exporter: this.exportToParquet },
      qlik: { extension: "qvs", filter: "Qlik Script Files", exporter: this.exportToQlikInline },
      sqlite: { extension: "db", filter: "SQLite Database", exporter: this.exportToSQLite },
      xml: { extension: "xml", filter: "XML Files", exporter: this.exportToXML },
      yaml: { extension: "yaml", filter: "YAML Files", exporter: this.exportToYAML },
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
    if (format === "qlik") {
      // Pass maxRows for Qlik inline format
      await config.exporter.call(this, data, fileUri.fsPath, maxRows);
    } else {
      await config.exporter.call(this, data, fileUri.fsPath);
    }

    return fileUri.fsPath;
  }
}

module.exports = DataExporter;
