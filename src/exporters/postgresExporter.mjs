import { existsSync, unlinkSync, writeFileSync } from "fs";
import { isMissing, scanColumnTypes } from "./columnTypes.mjs";
import { naiveDateText } from "./naiveDates.mjs";
import { offsetText, zonedTimestampsFor } from "./zonedTimestamps.mjs";

/**
 * Heap a PostgreSQL export builds from the rows, for the memory guard. It
 * needed 13 bytes per cell and 0.9 per character of text. Measured by the
 * smallest heap that let 200,000 or 1,000,000 rows of
 * chicago_taxi_rides_2016_03.qvd export, against reading them alone, and 50,000
 * rows of four unique 400-character values for the cost per character. See
 * DataExporter.memoryCost() for the margins.
 */
export const memoryCost = { bytesPerCell: 24, bytesPerTextChar: 2 };

/**
 * Export data to PostgreSQL SQL format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @param {number} maxRows - Maximum number of rows to export (0 = unlimited)
 * @param {Object} options - Export options
 * @param {boolean} options.createTable - Whether to include CREATE TABLE statement
 * @param {string} options.tableName - Name of the table
 * @param {boolean} options.dropTable - Whether to include DROP TABLE IF EXISTS
 * @param {string|null} [options.timeZone] - The time zone the timestamps were read in,
 *   to write each as the instant it was; without one they are wall clocks with no time zone
 * @returns {Promise<import('./zonedTimestamps.mjs').TimeShifts|undefined>} With a time
 *   zone and rows, what reading their timestamps in it did
 */
export async function exportToPostgres(data, filePath, maxRows, options) {
  // Before anything is written, so that a time zone Intl doesn't know leaves the file alone
  const zoned = zonedTimestampsFor(options);
  try {
    const {
      createTable = true,
      tableName = "qvd_data",
      dropTable = false,
    } = options;

    // Limit rows if specified
    const exportData = maxRows > 0 ? data.slice(0, maxRows) : data;

    if (exportData.length === 0) {
      // Create empty SQL file with comment
      const content = `-- Empty dataset\n-- No data to export\n`;
      writeFileSync(filePath, content, "utf8");
      return;
    }

    // Get column names from first row
    const firstRow = exportData[0];
    const columnNames = Object.keys(firstRow);

    // Determine the most compatible type for each column, from all rows
    const columnTypes = scanColumnTypes(exportData, columnNames);

    // Build SQL content
    let sqlContent = [];

    // Add header comment
    sqlContent.push(`-- PostgreSQL Data Import Script`);
    sqlContent.push(`-- Created by: Ctrl-Q QVD Viewer for VS Code`);
    sqlContent.push(
      `-- VS Code Extension: https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer`
    );
    sqlContent.push(
      `-- GitHub: https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer`
    );
    sqlContent.push(`-- Generated: ${new Date().toISOString()}`);
    sqlContent.push(`-- Table: ${tableName}`);
    sqlContent.push(
      `-- Rows: ${exportData.length}${
        maxRows > 0 ? ` (limited from ${data.length})` : ""
      }`
    );
    // Timestamps read in a time zone are its wall clocks, with their offsets from UTC
    const zonedColumns = zoned
      ? columnNames.filter((key) => columnTypes[key].hasDate && !columnTypes[key].calendarDates)
      : [];
    if (zonedColumns.length > 0) {
      sqlContent.push(`-- Timestamps: wall clocks read in ${zoned.timeZone}, with their offsets from UTC`);
    }
    sqlContent.push(``);

    // Begin transaction
    sqlContent.push(`BEGIN;`);
    sqlContent.push(``);

    // Drop table if requested
    if (dropTable) {
      sqlContent.push(`-- Drop existing table if it exists`);
      sqlContent.push(`DROP TABLE IF EXISTS "${tableName}";`);
      sqlContent.push(``);
    }

    // Create table if requested
    if (createTable) {
      sqlContent.push(`-- Create table`);
      const columns = columnNames.map((key) => {
        const typeInfo = columnTypes[key];
        let pgType = "TEXT"; // Default to TEXT

        // Determine PostgreSQL type based on collected type information
        if (typeInfo.hasString || (typeInfo.hasNumber && typeInfo.hasBoolean)) {
          // Mixed types or strings - use TEXT
          pgType = "TEXT";
        } else if (typeInfo.hasDate) {
          // TIMESTAMP is without a time zone, as a QVD's timestamps are. TIMESTAMPTZ holds
          // instants, as timestamps read in a time zone are
          if (typeInfo.calendarDates) {
            pgType = "DATE";
          } else {
            pgType = zoned ? "TIMESTAMPTZ" : "TIMESTAMP";
          }
        } else if (typeInfo.hasNumber) {
          if (typeInfo.allIntegers) {
            pgType = "BIGINT";
          } else {
            pgType = "NUMERIC";
          }
        } else if (typeInfo.hasBoolean) {
          pgType = "BOOLEAN";
        }

        // Add NOT NULL constraint if column has no nulls
        const nullConstraint = typeInfo.hasNull ? "" : " NOT NULL";

        return `  "${key}" ${pgType}${nullConstraint}`;
      });

      sqlContent.push(`CREATE TABLE "${tableName}" (`);
      sqlContent.push(columns.join(",\n"));
      sqlContent.push(`);`);
      sqlContent.push(``);
    }

    // Insert data in batches
    sqlContent.push(`-- Insert data`);
    const batchSize = 1000;
    let currentBatch = 0;

    while (currentBatch < exportData.length) {
      const batch = exportData.slice(currentBatch, currentBatch + batchSize);
      const batchEnd = Math.min(currentBatch + batchSize, exportData.length);

      if (batch.length > 0) {
        sqlContent.push(`-- Rows ${currentBatch + 1} to ${batchEnd}`);

        // Build multi-row INSERT statement
        const columnList = columnNames.map((c) => `"${c}"`).join(", ");
        sqlContent.push(`INSERT INTO "${tableName}" (${columnList})`);
        sqlContent.push(`VALUES`);

        const valueRows = batch.map((row, index) => {
          const values = columnNames.map((col) => {
            const value = row[col];
            const typeInfo = columnTypes[col];

            // Format value based on type
            if (isMissing(value, typeInfo)) {
              return "NULL";
            } else if (value instanceof Date) {
              if (zoned && !typeInfo.calendarDates) {
                return `'${offsetText(value, zoned, col)}'`;
              }
              return `'${naiveDateText(value, typeInfo.calendarDates)}'`;
            } else if (typeInfo.hasString) {
              // Escape single quotes for SQL
              return `'${String(value).replace(/'/g, "''")}'`;
            } else if (typeof value === "boolean") {
              return value ? "TRUE" : "FALSE";
            } else if (typeof value === "string") {
              // String value - escape quotes
              return `'${value.replace(/'/g, "''")}'`;
            } else {
              // Number or other type
              return value;
            }
          });

          const isLast = index === batch.length - 1;
          return `  (${values.join(", ")})${isLast ? ";" : ","}`;
        });

        for (const valueRow of valueRows) {
          sqlContent.push(valueRow);
        }
        sqlContent.push(``);
      }

      currentBatch += batchSize;
    }

    // Commit transaction
    sqlContent.push(`COMMIT;`);
    sqlContent.push(``);
    sqlContent.push(`-- End of script`);

    // Write to file
    writeFileSync(filePath, sqlContent.join("\n"), "utf8");
    return zoned?.summary();
  } catch (error) {
    // Clean up the partially created file on error
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors, throw original error
    }

    throw new Error(`PostgreSQL export failed: ${error.message}`);
  }
}
