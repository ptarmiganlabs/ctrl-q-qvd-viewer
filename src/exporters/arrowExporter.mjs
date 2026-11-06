import { promises as fs, existsSync, unlinkSync } from 'fs';
import * as arrow from 'apache-arrow';
import { isMissing, scanColumnTypes } from './columnTypes.mjs';
import { naiveDateText } from './naiveDates.mjs';

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
 * @returns {Promise<void>}
 */
export async function exportToArrow(data, filePath) {
  try {
    if (data.length === 0) {
      // Create empty Arrow file
      const emptyTable = arrow.tableFromJSON([{ empty: "" }]);
      const writer = arrow.RecordBatchFileWriter.writeAll(emptyTable);
      const buffer = Buffer.from(await writer.toUint8Array());
      await fs.writeFile(filePath, buffer);
      return;
    }

    // First, analyze all columns to detect mixed types
    const firstRow = data[0];
    const columnNames = Object.keys(firstRow);

    // Determine the most compatible type for each column, from all rows
    const columnTypes = scanColumnTypes(data, columnNames);
    const isTextColumn = (typeInfo) =>
      typeInfo.hasString || typeInfo.hasObject || (typeInfo.hasNumber && typeInfo.hasBoolean);

    // Each column's values, normalized so that a column holds one type
    const columns = new Map(columnNames.map((key) => [key, []]));
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
        columns.get(key).push(cell);
      }
    }

    // A column of dates holds dates, or timestamps with no time zone, as a QVD's are.
    // Arrow infers each other column's type from its values
    const table = new arrow.Table(
      Object.fromEntries(
        columnNames.map((key) => {
          const typeInfo = columnTypes[key];
          let type;
          if (typeInfo.hasDate && !isTextColumn(typeInfo)) {
            type = typeInfo.allMidnight ? new arrow.DateDay() : new arrow.TimestampMillisecond();
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
