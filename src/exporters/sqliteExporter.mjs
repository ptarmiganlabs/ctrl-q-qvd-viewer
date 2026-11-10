import initSqlJs from 'sql.js';
import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { writeFileAtomically } from './atomicWrite.mjs';
import { isMissing, scanColumnTypes } from './columnTypes.mjs';
import { naiveDateText } from './naiveDates.mjs';
import { utcText, zonedTimestampsFor } from './zonedTimestamps.mjs';

// sql.js, once it has started
let sqlJs = null;

// Rows inserted between turns of the event loop
const CHUNK_ROWS = 10000;

/**
 * Heap a SQLite export builds from the rows, for the memory guard. It needed 0.42
 * bytes per cell, and nothing measurable per character of text: its database lives
 * in sql.js's in-memory file system, outside the V8 heap. Measured by the smallest
 * heap that let 1,000,000 rows of chicago_taxi_rides_2016_03.qvd export, against
 * reading them alone, and 50,000 rows of four unique 400-character values for the
 * cost per character. Outside the heap, the database file grows an eighth at a
 * time, copied each time, and the process peaked at 10 to 12 times its size: that
 * isn't priced here. See DataExporter.memoryCost() for the margins.
 */
export const memoryCost = { bytesPerCell: 16, bytesPerTextChar: 0 };

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
      // Export empty database
      const db = new sqlJs.Database();
      const binaryArray = db.export();
      db.close();
      await writeFileAtomically(filePath, (file) => file.writeFile(binaryArray));
      return;
    }

    // Get column names from first row
    const firstRow = data[0];
    const columnNames = Object.keys(firstRow);

    // Determine the most compatible type for each column, from all rows
    const columnTypes = scanColumnTypes(data, columnNames);

    // Determine SQLite type for each column based on collected type information
    const columns = columnNames
      .map((key) => {
        const typeInfo = columnTypes[key];
        let sqlType = "TEXT"; // Default to TEXT

        // If column has mixed types, use TEXT as most compatible
        if (typeInfo.hasString || (typeInfo.hasNumber && typeInfo.hasBoolean)) {
          sqlType = "TEXT";
        } else if (typeInfo.hasDate) {
          // Dates as ISO text, which SQLite's date functions read: with no time zone, or
          // for timestamps read in one, their instants in UTC, with a Z. As text, only
          // UTC keeps them in time order across a change of offset
          sqlType = "TEXT";
        } else if (typeInfo.hasNumber) {
          sqlType = typeInfo.allIntegers ? "INTEGER" : "REAL";
        } else if (typeInfo.hasBoolean) {
          sqlType = "INTEGER"; // SQLite uses 0/1 for booleans
        }

        return `"${key}" ${sqlType}`;
      })
      .join(", ");

    // Create a new database, closed once its bytes are out, or the export fails: sql.js
    // holds it in memory until then
    const db = new sqlJs.Database();
    let binaryArray;
    try {
      // Create table
      db.run(`CREATE TABLE data (${columns})`);

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
        for (let i = 0; i < data.length; i++) {
          // sql.js works synchronously: let the event loop run between chunks of rows
          if (i > 0 && i % CHUNK_ROWS === 0) {
            await new Promise((resolve) => setImmediate(resolve));
          }
          const row = data[i];
          const values = columnNames.map((col) => {
            const value = row[col];
            const typeInfo = columnTypes[col];

            // Convert values based on schema expectations
            if (isMissing(value, typeInfo)) {
              return null;
            } else if (value instanceof Date) {
              if (zoned && !typeInfo.calendarDates) {
                return utcText(zoned.instant(value, col));
              }
              return naiveDateText(value, typeInfo.calendarDates);
            } else if (typeInfo.hasString) {
              // If schema expects TEXT, convert everything to string
              return String(value);
            } else if (typeof value === "boolean") {
              return value ? 1 : 0;
            }
            return value;
          });

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
