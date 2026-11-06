import avro from 'avsc';
import { createWriteStream, existsSync, unlinkSync } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { isBlank, settleBlanks } from './blankCells.mjs';

/**
 * Write records to an Avro object container file
 * @param {Iterable<Object>} records - Records matching the type
 * @param {import('avsc').Type} type - Avro record type
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>} Resolves once the file has been written and closed
 */
function writeAvroFile(records, type, filePath) {
  // Wait for the file stream to close: the encoder's own "finish" event fires
  // before it has flushed its last block. writeHeader: true writes the header
  // even when there are no records.
  return pipeline(
    Readable.from(records),
    new avro.streams.BlockEncoder(type, { writeHeader: true }),
    createWriteStream(filePath)
  );
}

/**
 * Export data to Avro format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
export async function exportToAvro(data, filePath) {
  try {
    if (data.length === 0) {
      // Create empty Avro file with minimal schema
      const type = avro.Type.forSchema({
        type: "record",
        name: "EmptyRecord",
        fields: [{ name: "empty", type: "string" }],
      });

      await writeAvroFile([], type, filePath);
      return;
    }

    // Infer schema by scanning all rows to determine compatible types
    const firstRow = data[0];
    const columnNames = Object.keys(firstRow);

    // Track type information for each column across all rows
    const columnTypes = {};
    columnNames.forEach((key) => {
      columnTypes[key] = {
        hasNull: false,
        hasBlank: false,
        hasNumber: false,
        hasString: false,
        hasBoolean: false,
        hasDate: false,
        allIntegers: true,
      };
    });

    // Scan all rows to determine the most compatible type for each column
    for (const row of data) {
      for (const key of columnNames) {
        const value = row[key];
        const typeInfo = columnTypes[key];

        if (value === null || value === undefined) {
          typeInfo.hasNull = true;
        } else if (isBlank(value)) {
          typeInfo.hasBlank = true;
        } else if (typeof value === "number") {
          typeInfo.hasNumber = true;
          // Beyond 2^53 an integer may already be rounded, and beyond 2^63 it overflows 64 bits
          if (!Number.isSafeInteger(value)) {
            typeInfo.allIntegers = false;
          }
        } else if (typeof value === "string") {
          typeInfo.hasString = true;
        } else if (typeof value === "boolean") {
          typeInfo.hasBoolean = true;
        } else if (value instanceof Date) {
          typeInfo.hasDate = true;
        }
      }
    }

    // Blank text next to numbers, booleans or dates is a missing value
    columnNames.forEach((key) => settleBlanks(columnTypes[key]));

    // Determine Avro type for each field based on collected type information
    const fields = columnNames.map((key) => {
      const typeInfo = columnTypes[key];
      let avroType;

      // If column has mixed types or strings, use string as most compatible
      if (typeInfo.hasString || (typeInfo.hasNumber && typeInfo.hasBoolean)) {
        avroType = "string";
      } else if (typeInfo.hasDate) {
        avroType = "long"; // Store dates as timestamps
      } else if (typeInfo.hasNumber) {
        avroType = typeInfo.allIntegers ? "long" : "double";
      } else if (typeInfo.hasBoolean) {
        avroType = "boolean";
      } else {
        avroType = "string"; // Default fallback
      }

      // Make nullable if the column has null values
      if (typeInfo.hasNull) {
        avroType = ["null", avroType];
      }

      return { name: key, type: avroType };
    });

    const type = avro.Type.forSchema({
      type: "record",
      name: "QVDRecord",
      fields: fields,
    });

    // Rows as the schema expects them, produced as the encoder asks for them
    function* processedRows() {
      for (const row of data) {
        // Convert dates to timestamps and ensure type compatibility. Use the
        // schema's columns, so a missing value becomes null and an extra one is left out
        const processedRow = {};
        columnNames.forEach((key) => {
          const value = row[key];
          const typeInfo = columnTypes[key];

          if (
            value === null ||
            value === undefined ||
            (typeInfo.blanksAreNull && isBlank(value))
          ) {
            processedRow[key] = null;
          } else if (value instanceof Date) {
            processedRow[key] = value.getTime();
          } else if (typeInfo.hasString) {
            // If schema expects string, convert everything to string
            processedRow[key] = String(value);
          } else {
            processedRow[key] = value;
          }
        });
        yield processedRow;
      }
    }

    await writeAvroFile(processedRows(), type, filePath);
  } catch (error) {
    // Clean up the partially created file on error
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors, throw original error
    }
    throw new Error(`Avro export failed: ${error.message}`);
  }
}
