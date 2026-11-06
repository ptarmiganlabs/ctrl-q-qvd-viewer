import parquet from 'parquetjs';
import { existsSync, unlinkSync } from 'fs';
import { isMissing, scanColumnTypes } from './columnTypes.mjs';
import { markNaiveTimestamps } from './parquetTimestamps.mjs';

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
 * @returns {Promise<void>}
 */
export async function exportToParquet(data, filePath) {
  try {
    if (data.length === 0) {
      // Create empty parquet file with minimal schema
      const schema = new parquet.ParquetSchema({
        empty: { type: "UTF8" },
      });

      const writer = await parquet.ParquetWriter.openFile(schema, filePath);
      await writer.close();
      return;
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
      } else if (typeInfo.hasDate && typeInfo.allMidnight) {
        type = "DATE";
      } else if (typeInfo.hasDate) {
        // Milliseconds, marked as a timestamp with no time zone once the file is written
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
          processedRow[key] = typeInfo.allMidnight ? value : value.getTime();
        } else {
          processedRow[key] = value;
        }
      });

      await writer.appendRow(processedRow);
    }

    await writer.close();
    await markNaiveTimestamps(filePath, timestampColumns);
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
