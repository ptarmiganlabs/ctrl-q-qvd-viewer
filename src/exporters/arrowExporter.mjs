import { promises as fs, existsSync, unlinkSync } from 'fs';
import * as arrow from 'apache-arrow';
import { isMissing, scanColumnTypes } from './columnTypes.mjs';
import { naiveDateText } from './naiveDates.mjs';
import { zonedTimestamps } from './zonedTimestamps.mjs';

/**
 * Heap an Arrow export builds from the rows, for the memory guard. It needed 12
 * bytes per cell and 0.6 per character of text. Its file buffers, outside the
 * V8 heap, aren't counted. Measured by the smallest heap that let 200,000 or
 * 1,000,000 rows of chicago_taxi_rides_2016_03.qvd export, against reading them
 * alone, and 50,000 rows of four unique 400-character values for the cost per
 * character. See DataExporter.memoryCost() for the margins.
 */
export const memoryCost = { bytesPerCell: 24, bytesPerTextChar: 2 };

/**
 * Export data to Apache Arrow format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @param {object} [options]
 * @param {string|null} [options.timeZone] - The time zone the timestamps were read in,
 *   to write each as the instant it was; without one they are wall clocks with no time zone
 * @returns {Promise<import('./zonedTimestamps.mjs').TimeShifts|undefined>} With a time
 *   zone, what reading the timestamps in it did
 */
export async function exportToArrow(data, filePath, { timeZone = null } = {}) {
  // Before anything is written, so that a time zone Intl doesn't know leaves the file alone
  const zoned = timeZone ? zonedTimestamps(timeZone) : null;
  try {
    if (data.length === 0) {
      // Create empty Arrow file
      const emptyTable = arrow.tableFromJSON([{ empty: "" }]);
      const writer = arrow.RecordBatchFileWriter.writeAll(emptyTable);
      const buffer = Buffer.from(await writer.toUint8Array());
      await fs.writeFile(filePath, buffer);
      return zoned?.summary();
    }

    // First, analyze all columns to detect mixed types
    const firstRow = data[0];
    const columnNames = Object.keys(firstRow);

    // Determine the most compatible type for each column, from all rows
    const columnTypes = scanColumnTypes(data, columnNames);
    const isTextColumn = (typeInfo) =>
      typeInfo.hasString || typeInfo.hasObject || (typeInfo.hasNumber && typeInfo.hasBoolean);

    // A column of timestamps read in a time zone holds their instants, which go
    // straight into Arrow's buffers rather than into a number per cell first. Its type
    // names the zone
    const instants = new Map(
      columnNames
        .filter((key) => {
          const typeInfo = columnTypes[key];
          return zoned !== null && typeInfo.hasDate && !typeInfo.calendarDates && !isTextColumn(typeInfo);
        })
        .map((key) => [
          key,
          arrow.makeBuilder({ type: new arrow.TimestampMillisecond(zoned.timeZone), nullValues: [null] }),
        ])
    );

    // Each other column's values, normalized so that a column holds one type
    const columns = new Map(columnNames.filter((key) => !instants.has(key)).map((key) => [key, []]));
    for (const row of data) {
      for (const key of columnNames) {
        const value = row[key];
        const typeInfo = columnTypes[key];
        let cell;

        if (isMissing(value, typeInfo)) {
          cell = null;
        } else if (isTextColumn(typeInfo)) {
          // If column has mixed types or strings, convert everything to string
          if (value instanceof Date) {
            cell = naiveDateText(value, false);
          } else if (typeof value === "object") {
            cell = JSON.stringify(value);
          } else {
            cell = String(value);
          }
        } else {
          // Keep primitives (string, number, boolean) and dates as they are
          cell = value;
        }
        const builder = instants.get(key);
        if (builder) {
          builder.append(cell === null ? null : zoned.instant(cell, key));
        } else {
          columns.get(key).push(cell);
        }
      }
    }

    // A column of dates holds dates, or timestamps with no time zone, as a QVD's are.
    // Arrow infers each other column's type from its values
    const table = new arrow.Table(
      Object.fromEntries(
        columnNames.map((key) => {
          const builder = instants.get(key);
          if (builder) {
            return [key, builder.finish().toVector()];
          }
          const typeInfo = columnTypes[key];
          let type;
          if (typeInfo.hasDate && !isTextColumn(typeInfo)) {
            type = typeInfo.calendarDates ? new arrow.DateDay() : new arrow.TimestampMillisecond();
          }
          return [key, arrow.vectorFromArray(columns.get(key), type)];
        })
      )
    );

    // Write to file
    const writer = arrow.RecordBatchFileWriter.writeAll(table);
    const uint8Array = await writer.toUint8Array();
    const buffer = Buffer.from(uint8Array);
    await fs.writeFile(filePath, buffer);
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

    throw new Error(`Arrow export failed: ${error.message}`);
  }
}
