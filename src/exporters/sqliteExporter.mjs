import { writeFileAtomicallyByPath } from './atomicWrite.mjs';
import { isMissing, isTextColumn } from './columnTypes.mjs';
import { sourceOf } from '../exportSource.mjs';
import { nextTurn, rowsPerChunk } from '../memoryGuard.mjs';
import { naiveDateText } from './naiveDates.mjs';
import { utcText, zonedTimestampsFor } from './zonedTimestamps.mjs';

// Rows inserted between turns of the event loop
export const CHUNK_ROWS = 10000;

// Cells inserted between turns at most: a QVD with many fields gets fewer rows
export const CHUNK_CELLS = CHUNK_ROWS * 20;

/**
 * Heap a SQLite export builds from the rows, for the memory guard. It writes the
 * database to its file as it goes, through node:sqlite, a chunk of rows between turns
 * of the event loop, so only its largest chunk is priced. It needed nothing measurable
 * beyond holding the rows: under 0.4 bytes a cell, from 1,000,000 rows of 20 fields of
 * short text, reals, integers and timestamps, and under 0.1 a character, from 50,000
 * rows of four unique 400-character values. Measured by the smallest heap that let
 * them export, against holding them alone, to 8 MiB. Outside the heap it holds
 * SQLite's page cache, 2 MiB: every row of chicago_taxi_rides_2016_03.qvd took the
 * process's peak memory footprint 12 MB past reading them alone, where sql.js, which
 * built the database in memory, took it 2.3 GB past. See DataExporter.memoryCost() for
 * the margins.
 */
export const memoryCost = {
  bytesPerCell: 1,
  bytesPerTextChar: 1,
  chunkRows: CHUNK_ROWS,
  chunkCells: CHUNK_CELLS,
  writesAsItGoes: true,
};

// What SQLite keeps next to a database while it writes: its rollback journal
const SIDECAR_SUFFIXES = ["-journal"];

/**
 * A number bound as sql.js bound it, which SQLite exports wrote with before node:sqlite:
 * a whole number that fits in 32 bits as an INTEGER, any other number as a REAL.
 * node:sqlite binds every number as a REAL. An INTEGER or REAL column stores the same
 * either way, but a TEXT column keeps the text SQLite makes of it: 1 as "1" bound as
 * an INTEGER, and "1.0" as a REAL. A column of dates mixed with numbers is such a column.
 * Only a TEXT column's numbers are bound so: bound as BigInts, the whole numbers of
 * chicago_taxi_rides_2016_03.qvd made its export take 5.1 s rather than 4.7 s.
 *
 * A REAL's text is SQLite's own. Node 24's SQLite 3.53 writes it as sql.js's SQLite 3.54
 * did, such as "9007199254740991.0". Node 22's SQLite 3.50, in VS Code 1.105, writes 15
 * significant digits, "9.00719925474099e+15", so a number that needs more is rounded there.
 * @param {number} number - A cell's number
 * @returns {number|bigint} The value to bind
 */
function boundAsSqlJs(number) {
  return number === (number | 0) ? BigInt(number) : number;
}

/**
 * Export data to SQLite database format
 * @param {Array<Object>|import("../exportSource.mjs").ExportSource} data - Row objects, or a source of them
 * @param {string} filePath - Destination file path
 * @param {object} [options]
 * @param {string|null} [options.timeZone] - The time zone the timestamps were read in,
 *   to write each as the instant it was, in UTC; without one they are wall clocks with
 *   no time zone
 * @param {number} [options.chunkRows] - Rows inserted between turns of the event loop
 * @returns {Promise<import('./zonedTimestamps.mjs').TimeShifts|undefined>} With a time
 *   zone and rows, what reading their timestamps in it did
 */
export async function exportToSQLite(data, filePath, options = {}) {
  // Before anything is written, so that a time zone Intl doesn't know leaves the file alone
  const zoned = zonedTimestampsFor(options);
  const source = sourceOf(data);
  try {
    // Node's SQLite, loaded with the first SQLite export rather than with the extension:
    // the Node of VS Code 1.105 prints a warning that it is experimental as it loads it,
    // and a Node without it fails this export, not the extension
    const { DatabaseSync } = await import("node:sqlite");

    if (source.length === 0) {
      // An empty database, with the header page sql.js wrote too: a file of no bytes
      // is one as well, but isn't recognisable as one
      await writeFileAtomicallyByPath(
        filePath,
        async (tempPath) => {
          const db = new DatabaseSync(tempPath);
          try {
            db.exec("PRAGMA user_version = 0");
          } finally {
            db.close();
          }
        },
        { sidecarSuffixes: SIDECAR_SUFFIXES }
      );
      return;
    }

    // Get column names from first row
    const columnNames = source.columns;

    // Determine the most compatible type for each column, from all rows
    const columnTypes = await source.columnTypes();

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
        // As JSON, as Arrow writes an object: SQLite can't bind one
        return JSON.stringify(value);
      } else if (column.text) {
        // A boolean next to numbers too, as the other formats write it, not as 1 or 0
        return String(value);
      }
      // A boolean as 1 or 0
      const number = typeof value === "boolean" ? Number(value) : value;
      // In a TEXT column, as sql.js bound it: a column of dates mixed with numbers or booleans
      return column.sqlType === "TEXT" && typeof number === "number" ? boundAsSqlJs(number) : number;
    };

    await writeFileAtomicallyByPath(
      filePath,
      async (tempPath) => {
        // Written to its file as it goes, and closed whether the export succeeds or
        // fails: a transaction left open is rolled back, and its journal removed
        const db = new DatabaseSync(tempPath);
        try {
          // Create table
          db.exec(`CREATE TABLE data (${columns.map(({ key, sqlType }) => `"${key}" ${sqlType}`).join(", ")})`);

          // Prepare insert statement
          const placeholders = columnNames.map(() => "?").join(", ");
          const insertSQL = `INSERT INTO data (${columnNames
            .map((c) => `"${c}"`)
            .join(", ")}) VALUES (${placeholders})`;

          // Insert all rows in one transaction, through one prepared statement: each insert
          // on its own would be a transaction of its own, and compile the statement again
          const insert = db.prepare(insertSQL);
          db.exec("BEGIN");
          // node:sqlite works synchronously: let the event loop run between chunks of
          // rows, of fewer rows for a QVD with many fields
          const rowsPerYield = rowsPerChunk(memoryCost, columns.length, options.chunkRows);
          // One array for every row's values, which run() binds before it returns
          const values = new Array(columns.length);
          for await (const rows of source.chunks(rowsPerYield)) {
            for (const row of rows) {
              for (let c = 0; c < columns.length; c++) {
                values[c] = valueOf(row[columns[c].key], columns[c]);
              }
              // node:sqlite takes positional values only as arguments of their own. There
              // is one a field, and SQLite takes at most 2,000 fields in a table
              // eslint-disable-next-line no-restricted-syntax
              insert.run(...values);
            }
            await nextTurn();
          }
          db.exec("COMMIT");
        } finally {
          db.close();
        }
      },
      { sidecarSuffixes: SIDECAR_SUFFIXES }
    );
    return zoned?.summary();
  } catch (error) {
    throw new Error(`SQLite export failed: ${error.message}`, { cause: error });
  }
}
