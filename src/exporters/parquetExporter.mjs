import parquet from 'parquetjs';
import { rowsPerChunk } from '../memoryGuard.mjs';
import { sourceOf } from '../exportSource.mjs';
import { writeFileAtomicallyByPath } from './atomicWrite.mjs';
import { isMissing, isTextColumn } from './columnTypes.mjs';
import { markTimestamps } from './parquetTimestamps.mjs';
import { zonedTimestampsFor } from './zonedTimestamps.mjs';

// Rows taken from the source at a time
export const CHUNK_ROWS = 10000;

// Cells taken at a time at most: a QVD with many fields gets fewer rows in a chunk
export const CHUNK_CELLS = CHUNK_ROWS * 20;

// Rows parquetjs holds before it writes them as a row group: its default, which sets
// the file's layout
export const ROW_GROUP_ROWS = 4096;

/**
 * Heap a Parquet export builds from the rows, for the memory guard. It writes
 * as it goes, and added nothing measurable to the V8 heap. Measured by the
 * smallest heap that let 200,000 or 1,000,000 rows of
 * chicago_taxi_rides_2016_03.qvd export, against reading them alone, and 50,000
 * rows of four unique 400-character values for the cost per character. See
 * DataExporter.memoryCost() for the margins.
 */
export const memoryCost = {
  bytesPerCell: 16,
  bytesPerTextChar: 0,
  chunkRows: CHUNK_ROWS,
  chunkCells: CHUNK_CELLS,
  rowGroupRows: ROW_GROUP_ROWS,
  writesAsItGoes: true,
};

/**
 * Export data to Parquet format
 * The file is written next to its destination and takes its place once it is whole,
 * so that an export that fails leaves the file that was there before as it was.
 * @param {Array<Object>|import("../exportSource.mjs").ExportSource} data - Row objects, or a source of them
 * @param {string} filePath - Destination file path
 * @param {object} [options]
 * @param {number} [options.chunkRows] - Rows taken from the source at a time: a whole number of 1 or more
 * @param {string|null} [options.timeZone] - The time zone the timestamps were read in,
 *   to write each as the instant it was; without one they are wall clocks with no time zone
 * @returns {Promise<import('./zonedTimestamps.mjs').TimeShifts|undefined>} With a time
 *   zone and rows, what reading their timestamps in it did
 */
export async function exportToParquet(data, filePath, options = {}) {
  // Before anything is written, so that a time zone Intl doesn't know leaves the file alone
  const zoned = zonedTimestampsFor(options);
  const source = sourceOf(data);
  try {
    if (source.length === 0) {
      // Create empty parquet file with minimal schema
      const schema = new parquet.ParquetSchema({
        empty: { type: "UTF8" },
      });

      await writeFileAtomicallyByPath(filePath, async (tempPath) => {
        const writer = await parquet.ParquetWriter.openFile(schema, tempPath);
        await writer.close();
      });
      return;
    }

    // Infer schema by scanning all rows to determine compatible types
    const columnNames = source.columns;
    const chunkRows = rowsPerChunk(memoryCost, columnNames.length, options.chunkRows);

    // Determine the most compatible type for each column, from all rows
    const columnTypes = await source.columnTypes();

    // Build schema based on collected type information
    const schemaFields = {};
    const timestampColumns = [];

    columnNames.forEach((key) => {
      const typeInfo = columnTypes[key];
      let type = "UTF8"; // Default to string
      let optional = typeInfo.hasNull;

      // If column has mixed types or strings, use UTF8 as most compatible
      if (isTextColumn(typeInfo)) {
        type = "UTF8";
      } else if (typeInfo.hasDate && typeInfo.calendarDates) {
        type = "DATE";
      } else if (typeInfo.hasDate) {
        // Milliseconds, marked as timestamps once the file is written: wall clocks with
        // no time zone, or instants when read in one
        type = "INT64";
        timestampColumns.push(key);
      } else if (typeInfo.hasNumber) {
        type = typeInfo.allIntegers ? "INT64" : "DOUBLE";
      } else if (typeInfo.hasBoolean) {
        type = "BOOLEAN";
      }

      schemaFields[key] = { type, optional };
    });

    const schema = new parquet.ParquetSchema(schemaFields);

    // A row with type conversion
    const processedRowOf = (row) => {
      const processedRow = {};

      columnNames.forEach((key) => {
        const value = row[key];
        const typeInfo = columnTypes[key];

        if (isMissing(value, typeInfo)) {
          processedRow[key] = null;
        } else if (typeInfo.hasString) {
          // If schema expects string, convert everything to string
          processedRow[key] = String(value);
        } else if (value instanceof Date) {
          if (typeInfo.calendarDates) {
            processedRow[key] = value;
          } else {
            processedRow[key] = zoned ? zoned.instant(value, key) : value.getTime();
          }
        } else {
          processedRow[key] = value;
        }
      });

      return processedRow;
    };

    await writeFileAtomicallyByPath(filePath, async (tempPath) => {
      const writer = await parquet.ParquetWriter.openFile(schema, tempPath);
      try {
        for await (const rows of source.chunks(chunkRows)) {
          for (const row of rows) {
            await writer.appendRow(processedRowOf(row));
          }
        }
      } catch (error) {
        // Its file let go without a footer, whose writing could fail too and hide why
        await writer.envelopeWriter?.close().catch(() => {});
        throw error;
      }
      await writer.close();
      await markTimestamps(tempPath, timestampColumns, { adjustedToUTC: zoned !== null });
    });
    return zoned?.summary();
  } catch (error) {
    throw new Error(`Parquet export failed: ${error.message}`, { cause: error });
  }
}
