import parquet from 'parquetjs';
import { existsSync, unlinkSync } from 'fs';
import { isMissing, scanColumnTypes } from './columnTypes.mjs';
import { markTimestamps } from './parquetTimestamps.mjs';
import { zonedTimestamps } from './zonedTimestamps.mjs';

/**
 * Heap a Parquet export builds from the rows, for the memory guard. It writes
 * as it goes, and added nothing measurable to the V8 heap. Measured by the
 * smallest heap that let 200,000 or 1,000,000 rows of
 * chicago_taxi_rides_2016_03.qvd export, against reading them alone, and 50,000
 * rows of four unique 400-character values for the cost per character. See
 * DataExporter.memoryCost() for the margins.
 */
export const memoryCost = { bytesPerCell: 16, bytesPerTextChar: 0, writesAsItGoes: true };

/**
 * Export data to Parquet format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @param {object} [options]
 * @param {string|null} [options.timeZone] - The time zone the timestamps were read in,
 *   to write each as the instant it was; without one they are wall clocks with no time zone
 * @returns {Promise<import('./zonedTimestamps.mjs').TimeShifts|undefined>} With a time
 *   zone, what reading the timestamps in it did
 */
export async function exportToParquet(data, filePath, { timeZone = null } = {}) {
  // Before anything is written, so that a time zone Intl doesn't know leaves the file alone
  const zoned = timeZone ? zonedTimestamps(timeZone) : null;
  try {
    if (data.length === 0) {
      // Create empty parquet file with minimal schema
      const schema = new parquet.ParquetSchema({
        empty: { type: "UTF8" },
      });

      const writer = await parquet.ParquetWriter.openFile(schema, filePath);
      await writer.close();
      return zoned?.summary();
    }

    // Infer schema by scanning all rows to determine compatible types
    const firstRow = data[0];
    const columnNames = Object.keys(firstRow);

    // Determine the most compatible type for each column, from all rows
    const columnTypes = scanColumnTypes(data, columnNames);

    // Build schema based on collected type information
    const schemaFields = {};
    const timestampColumns = [];

    columnNames.forEach((key) => {
      const typeInfo = columnTypes[key];
      let type = "UTF8"; // Default to string
      let optional = typeInfo.hasNull;

      // If column has mixed types or strings, use UTF8 as most compatible
      if (typeInfo.hasString || (typeInfo.hasNumber && typeInfo.hasBoolean)) {
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
    const writer = await parquet.ParquetWriter.openFile(schema, filePath);

    // Write rows with type conversion
    for (const row of data) {
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

      await writer.appendRow(processedRow);
    }

    await writer.close();
    await markTimestamps(filePath, timestampColumns, { adjustedToUTC: zoned !== null });
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

    throw new Error(`Parquet export failed: ${error.message}`);
  }
}
