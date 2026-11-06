import initSqlJs from 'sql.js';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { isMissing, scanColumnTypes } from './columnTypes.mjs';

// sql.js, once it has started
let sqlJs = null;

/**
 * Heap a SQLite export builds from the rows, for the memory guard. Its database
 * lives in sql.js's WebAssembly memory, outside the V8 heap, and it added
 * nothing measurable to the heap. Measured by the smallest heap that let
 * 200,000 or 1,000,000 rows of chicago_taxi_rides_2016_03.qvd export, against
 * reading them alone, and 50,000 rows of four unique 400-character values for
 * the cost per character. See DataExporter.memoryCost() for the margins.
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
 * @returns {Promise<void>}
 */
export async function exportToSQLite(data, filePath) {
  try {
    // Initialize SQL.js once, handing it its WebAssembly file
    sqlJs ??= await initSqlJs({ wasmBinary: readSqlWasm() });

    // Create a new database
    const db = new sqlJs.Database();

    if (data.length === 0) {
      // Export empty database
      const binaryArray = db.export();
      const buffer = Buffer.from(binaryArray);
      writeFileSync(filePath, buffer);
      db.close();
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
          sqlType = "TEXT"; // Store dates as ISO strings
        } else if (typeInfo.hasNumber) {
          sqlType = typeInfo.allIntegers ? "INTEGER" : "REAL";
        } else if (typeInfo.hasBoolean) {
          sqlType = "INTEGER"; // SQLite uses 0/1 for booleans
        }

        return `"${key}" ${sqlType}`;
      })
      .join(", ");

    // Create table
    db.run(`CREATE TABLE data (${columns})`);

    // Prepare insert statement
    const placeholders = columnNames.map(() => "?").join(", ");
    const insertSQL = `INSERT INTO data (${columnNames
      .map((c) => `"${c}"`)
      .join(", ")}) VALUES (${placeholders})`;

    // Insert all rows
    for (const row of data) {
      const values = columnNames.map((col) => {
        const value = row[col];
        const typeInfo = columnTypes[col];

        // Convert values based on schema expectations
        if (isMissing(value, typeInfo)) {
          return null;
        } else if (typeInfo.hasString) {
          // If schema expects TEXT, convert everything to string
          return String(value);
        } else if (typeof value === "boolean") {
          return value ? 1 : 0;
        } else if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      });

      db.run(insertSQL, values);
    }

    // Export the database to a binary array and write to file
    const binaryArray = db.export();
    const buffer = Buffer.from(binaryArray);
    writeFileSync(filePath, buffer);

    // Close the database
    db.close();
  } catch (error) {
    // Clean up the partially created file on error
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors, throw original error
    }

    throw new Error(`SQLite export failed: ${error.message}`);
  }
}
