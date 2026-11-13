import { rowsPerChunk } from "../memoryGuard.mjs";
import { writeChunks, writeFileAtomically } from "./atomicWrite.mjs";
import { isMissing, isTextColumn } from "./columnTypes.mjs";
import { sourceOf } from "../exportSource.mjs";
import { naiveDateText } from "./naiveDates.mjs";
import { offsetText, zonedTimestampsFor } from "./zonedTimestamps.mjs";

// Rows turned into SQL at a time, so a large export never holds the whole script as
// one string
export const CHUNK_ROWS = 10000;

// At most as many cells as CHUNK_ROWS rows of chicago_taxi_rides_2016_03.qvd's 20
// fields, on which a chunk's stall was measured, so a wider QVD has fewer rows a chunk
export const CHUNK_CELLS = CHUNK_ROWS * 20;

// Rows in each INSERT statement
const INSERT_ROWS = 1000;

/**
 * Heap a PostgreSQL export builds, a chunk of rows at a time, for the memory guard.
 * With every row in one chunk it needed 20 bytes per cell, and in its own chunks up
 * to 3.1 per character of a chunk's text: three runs needed 2.6 to 3.1. Only its
 * largest chunk is priced. Measured by the smallest heap that let 1,000,000 rows of
 * chicago_taxi_rides_2016_03.qvd export in one chunk, against reading them alone,
 * and 50,000 rows of four unique 400-character values for the cost per character.
 * All of the million rows, in its own chunks, needed 8 MiB beyond reading them,
 * with timestamps read in America/Chicago too. See DataExporter.memoryCost() for
 * the margins.
 */
export const memoryCost = {
  bytesPerCell: 31,
  bytesPerTextChar: 7,
  chunkRows: CHUNK_ROWS,
  chunkCells: CHUNK_CELLS,
  writesAsItGoes: true,
};

/**
 * A name as a PostgreSQL identifier: in double quotes, with a double quote in it doubled
 * @param {string} name - A table or column name
 * @returns {string} The quoted identifier
 */
function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * Export data to PostgreSQL SQL format
 * @param {Array<Object>|import("../exportSource.mjs").ExportSource} data - Row objects, or a source of them
 * @param {string} filePath - Destination file path
 * @param {number} maxRows - Maximum number of rows to export (0 = unlimited)
 * @param {Object} options - Export options
 * @param {boolean} options.createTable - Whether to include CREATE TABLE statement
 * @param {string} options.tableName - Name of the table
 * @param {boolean} options.dropTable - Whether to include DROP TABLE IF EXISTS
 * @param {string|null} [options.timeZone] - The time zone the timestamps were read in,
 *   to write each as the instant it was; without one they are wall clocks with no time zone
 * @param {number} [options.chunkRows] - Rows turned into SQL at a time: a whole number
 *   of 1 or more. By default CHUNK_ROWS, or fewer for a QVD of more than 20 fields
 * @returns {Promise<import('./zonedTimestamps.mjs').TimeShifts|undefined>} With a time
 *   zone and rows, what reading their timestamps in it did
 */
export async function exportToPostgres(data, filePath, maxRows, options) {
  // Before anything is written, so that a time zone Intl doesn't know leaves the file alone
  const zoned = zonedTimestampsFor(options);
  const source = sourceOf(data);
  try {
    const {
      createTable = true,
      tableName = "qvd_data",
      dropTable = false,
      chunkRows: rowsOption,
    } = options;

    // Limit rows if specified
    const exportData = maxRows > 0 ? source.first(maxRows) : source;
    const columnCount = exportData.length > 0 ? exportData.columns.length : 0;
    const chunkRows = rowsPerChunk(memoryCost, columnCount, rowsOption);

    if (exportData.length === 0) {
      // Create empty SQL file with comment
      const content = `-- Empty dataset\n-- No data to export\n`;
      await writeFileAtomically(filePath, (file) => file.writeFile(content));
      return;
    }

    // Get column names from first row
    const columnNames = exportData.columns;

    // Determine the most compatible type for each column, from all rows
    const columnTypes = await exportData.columnTypes();

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
        maxRows > 0 ? ` (limited from ${source.length})` : ""
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
      sqlContent.push(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)};`);
      sqlContent.push(``);
    }

    // Create table if requested
    if (createTable) {
      sqlContent.push(`-- Create table`);
      const columns = columnNames.map((key) => {
        const typeInfo = columnTypes[key];
        let pgType = "TEXT"; // Default to TEXT

        // Determine PostgreSQL type based on collected type information
        if (isTextColumn(typeInfo)) {
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

        return `  ${quoteIdentifier(key)} ${pgType}${nullConstraint}`;
      });

      sqlContent.push(`CREATE TABLE ${quoteIdentifier(tableName)} (`);
      sqlContent.push(columns.join(",\n"));
      sqlContent.push(`);`);
      sqlContent.push(``);
    }

    // Insert data in batches
    sqlContent.push(`-- Insert data`);

    // Each row's values, formatted based on type
    const valuesOf = (row) =>
      columnNames.map((col) => {
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
        } else if (typeof value === "number" && !Number.isFinite(value)) {
          // NUMERIC takes these only as quoted text: 'NaN', 'Infinity' and '-Infinity'
          return `'${value}'`;
        } else {
          // Number or other type
          return value;
        }
      });
    const columnList = columnNames.map(quoteIdentifier).join(", ");

    // The script so far, then its rows a chunk at a time, a line apart as they are: a
    // multi-row INSERT for every INSERT_ROWS rows, wherever a chunk starts or ends
    await writeFileAtomically(filePath, async (file) => {
      await file.writeFile(sqlContent.join("\n"));
      await writeChunks(file, exportData, chunkRows, (rows, start) => {
        const lines = [];
        for (let i = start; i < start + rows.length; i++) {
          if (i % INSERT_ROWS === 0) {
            lines.push(`-- Rows ${i + 1} to ${Math.min(i + INSERT_ROWS, exportData.length)}`);
            lines.push(`INSERT INTO ${quoteIdentifier(tableName)} (${columnList})`);
            lines.push(`VALUES`);
          }
          const isLast = i % INSERT_ROWS === INSERT_ROWS - 1 || i === exportData.length - 1;
          lines.push(`  (${valuesOf(rows[i - start]).join(", ")})${isLast ? ";" : ","}`);
          if (isLast) {
            lines.push(``);
          }
        }
        return `\n${lines.join("\n")}`;
      });

      // Commit transaction
      await file.writeFile(`\n${["COMMIT;", "", "-- End of script"].join("\n")}`);
    });
    return zoned?.summary();
  } catch (error) {
    throw new Error(`PostgreSQL export failed: ${error.message}`, { cause: error });
  }
}
