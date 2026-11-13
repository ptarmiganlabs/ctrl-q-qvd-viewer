import initSqlJs from 'sql.js';
import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { writeFileAtomically } from './atomicWrite.mjs';
import { isMissing, isTextColumn, scanColumnTypes } from './columnTypes.mjs';
import { nextTurn, rowsPerChunk } from '../memoryGuard.mjs';
import { naiveDateText } from './naiveDates.mjs';
import { utcText, zonedTimestampsFor } from './zonedTimestamps.mjs';

// sql.js, once it has started
let sqlJs = null;

// Rows inserted between turns of the event loop
export const CHUNK_ROWS = 10000;

// Cells inserted between turns at most: a QVD with many fields gets fewer rows
export const CHUNK_CELLS = CHUNK_ROWS * 20;

/**
 * Memory a SQLite export builds from the rows, for the memory guard. On the heap it
 * needed 0.42 bytes per cell, and nothing measurable per character of text, measured
 * by the smallest heap that let 1,000,000 rows of chicago_taxi_rides_2016_03.qvd
 * export, against reading them alone, and 50,000 rows of four unique 400-character
 * values for the cost per character. Its database lives in sql.js's in-memory file
 * system, outside the heap, which grows the file an eighth at a time, copying it
 * each time, and export() backs it up into another such file: the process's peak
 * memory footprint grew by 53 bytes per cell and 14 per character, over reading the
 * rows alone. Measured on every row of the taxi file, a 203 MiB database, and
 * 300,000 rows of four unique 400-character values, 587 MiB, on macOS, where even a
 * full collection after each copy didn't lower it. That memory is checked against
 * the computer's, not the heap's budget. See DataExporter.memoryCost() for the margins.
 */
export const memoryCost = {
  bytesPerCell: 16,
  bytesPerTextChar: 0,
  outsideHeapBytesPerCell: 80,
  outsideHeapBytesPerTextChar: 28,
};

/**
 * Read sql.js's WebAssembly file. Reading it here rather than in sql.js keeps a
 * missing or unreadable file from failing initSqlJs(), which keeps its first
 * result, failed or not, for the rest of the session.
 * @returns {Buffer} Contents of sql-wasm.wasm
 */
function readSqlWasm() {
  // The bundled extension ships it next to dist/extension.js, copied by esbuild.js
  const bundled = join(dirname(fileURLToPath(import.meta.url)), "sql-wasm.wasm");
  if (existsSync(bundled)) {
    return readFileSync(bundled);
  }
  // Loaded from src/, as in the tests: sql.js's own copy, next to its main script.
  // The bundle has no node_modules to find sql.js in, so name the missing file
  let sqlJsMain;
  try {
    sqlJsMain = createRequire(import.meta.url).resolve("sql.js");
  } catch {
    throw new Error(`${bundled} is missing`);
  }
  return readFileSync(join(dirname(sqlJsMain), "sql-wasm.wasm"));
}

/**
 * Export data to SQLite database format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @param {object} [options]
 * @param {string|null} [options.timeZone] - The time zone the timestamps were read in,
 *   to write each as the instant it was, in UTC; without one they are wall clocks with
 *   no time zone
 * @returns {Promise<import('./zonedTimestamps.mjs').TimeShifts|undefined>} With a time
 *   zone and rows, what reading their timestamps in it did
 */
export async function exportToSQLite(data, filePath, options = {}) {
  // Before anything is written, so that a time zone Intl doesn't know leaves the file alone
  const zoned = zonedTimestampsFor(options);
  try {
    // Initialize SQL.js once, handing it its WebAssembly file
    sqlJs ??= await initSqlJs({ wasmBinary: readSqlWasm() });

    if (data.length === 0) {
      // Export empty database, closed whether its bytes come out or not
      const db = new sqlJs.Database();
      let binaryArray;
      try {
        binaryArray = db.export();
      } finally {
        db.close();
      }
      await writeFileAtomically(filePath, (file) => file.writeFile(binaryArray));
      return;
    }

    // Get column names from first row
    const firstRow = data[0];
    const columnNames = Object.keys(firstRow);

    // Determine the most compatible type for each column, from all rows
    const columnTypes = await scanColumnTypes(data, columnNames);

    // Each column, its SQLite type and how its values are written, worked out once.
    // Text, and a column of mixed types, is TEXT; so are dates, as ISO text, which
    // SQLite's date functions read: with no time zone, or for timestamps read in one,
    // their instants in UTC, with a Z. As text, only UTC keeps them in time order across
    // a change of offset. Numbers are INTEGER or REAL, booleans INTEGER, 0 or 1, and a
    // column with nothing but missing values TEXT
    const columns = columnNames.map((key) => {
      const typeInfo = columnTypes[key];
      const text = isTextColumn(typeInfo);
      let sqlType = "TEXT";
      if (!text && !typeInfo.hasDate) {
        if (typeInfo.hasNumber) {
          sqlType = typeInfo.allIntegers ? "INTEGER" : "REAL";
        } else if (typeInfo.hasBoolean) {
          sqlType = "INTEGER";
        }
      }
      return { key, typeInfo, text, sqlType };
    });

    // A cell's value, as its column takes it
    const valueOf = (value, column) => {
      const { typeInfo } = column;
      if (isMissing(value, typeInfo)) {
        return null;
      } else if (value instanceof Date) {
        if (zoned && !typeInfo.calendarDates) {
          return utcText(zoned.instant(value, column.key));
        }
        return naiveDateText(value, typeInfo.calendarDates);
      } else if (typeof value === "object") {
        // As JSON, as Arrow writes an object: sql.js can't bind one
        return JSON.stringify(value);
      } else if (column.text) {
        // A boolean next to numbers too, as the other formats write it, not as 1 or 0
        return String(value);
      } else if (typeof value === "boolean") {
        return value ? 1 : 0;
      }
      return value;
    };

    // Create a new database, closed once its bytes are out, or the export fails: sql.js
    // holds it in memory until then
    const db = new sqlJs.Database();
    let binaryArray;
    try {
      // Create table
      db.run(`CREATE TABLE data (${columns.map(({ key, sqlType }) => `"${key}" ${sqlType}`).join(", ")})`);

      // Prepare insert statement
      const placeholders = columnNames.map(() => "?").join(", ");
      const insertSQL = `INSERT INTO data (${columnNames
        .map((c) => `"${c}"`)
        .join(", ")}) VALUES (${placeholders})`;

      // Insert all rows in one transaction, through one prepared statement: each insert
      // on its own would be a transaction of its own, and compile the statement again
      const insert = db.prepare(insertSQL);
      db.run("BEGIN");
      try {
        // sql.js works synchronously: let the event loop run between chunks of rows,
        // of fewer rows for a QVD with many fields
        const rowsPerYield = rowsPerChunk({ chunkRows: CHUNK_ROWS, chunkCells: CHUNK_CELLS }, columns.length);
        // One array for every row's values, which run() binds before it returns
        const values = new Array(columns.length);
        for (let i = 0; i < data.length; i++) {
          if (i > 0 && i % rowsPerYield === 0) {
            await nextTurn();
          }
          const row = data[i];
          for (let c = 0; c < columns.length; c++) {
            values[c] = valueOf(row[columns[c].key], columns[c]);
          }
          insert.run(values);
        }
        db.run("COMMIT");
      } finally {
        insert.free();
      }

      // Export the database to a binary array
      binaryArray = db.export();
    } finally {
      db.close();
    }
    await writeFileAtomically(filePath, (file) => file.writeFile(binaryArray));
    return zoned?.summary();
  } catch (error) {
    throw new Error(`SQLite export failed: ${error.message}`, { cause: error });
  }
}
