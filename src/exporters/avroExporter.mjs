import avro from 'avsc';
import { createWriteStream, existsSync, unlinkSync } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { isMissing, scanColumnTypes } from './columnTypes.mjs';
import { DAY_MS, naiveDateText } from './naiveDates.mjs';

// avsc leaves a logical type it doesn't know out of the file's schema. This one keeps
// the annotation, which tells a reader that an int is a date, or a long a timestamp
// with no time zone, and passes the values through as they are
class Annotation extends avro.types.LogicalType {
  _fromValue(value) {
    return value;
  }

  _toValue(value) {
    return value;
  }
}
const LOGICAL_TYPES = { date: Annotation, "local-timestamp-millis": Annotation };

/**
 * Heap an Avro export builds from the rows, for the memory guard. It writes as
 * it goes, and added nothing measurable to the V8 heap. Measured by the
 * smallest heap that let 200,000 or 1,000,000 rows of
 * chicago_taxi_rides_2016_03.qvd export, against reading them alone, and 50,000
 * rows of four unique 400-character values for the cost per character. See
 * DataExporter.memoryCost() for the margins.
 */
export const memoryCost = { bytesPerCell: 16, bytesPerTextChar: 0, writesAsItGoes: true };

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

    // Determine the most compatible type for each column, from all rows
    const columnTypes = scanColumnTypes(data, columnNames);

    // Determine Avro type for each field based on collected type information
    const fields = columnNames.map((key) => {
      const typeInfo = columnTypes[key];
      let avroType;

      // If column has mixed types or strings, use string as most compatible
      if (typeInfo.hasString || (typeInfo.hasNumber && typeInfo.hasBoolean)) {
        avroType = "string";
      } else if (typeInfo.hasDate) {
        // Days since 1970 for a date, or milliseconds for a timestamp
        avroType = typeInfo.allMidnight
          ? { type: "int", logicalType: "date" }
          : { type: "long", logicalType: "local-timestamp-millis" };
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

    const type = avro.Type.forSchema(
      {
        type: "record",
        name: "QVDRecord",
        fields: fields,
      },
      { logicalTypes: LOGICAL_TYPES }
    );

    // Rows as the schema expects them, produced as the encoder asks for them
    function* processedRows() {
      for (const row of data) {
        // Convert dates to timestamps and ensure type compatibility. Use the
        // schema's columns, so a missing value becomes null and an extra one is left out
        const processedRow = {};
        columnNames.forEach((key) => {
          const value = row[key];
          const typeInfo = columnTypes[key];

          if (isMissing(value, typeInfo)) {
            processedRow[key] = null;
          } else if (typeInfo.hasString) {
            // If schema expects string, convert everything to string
            processedRow[key] = value instanceof Date ? naiveDateText(value, false) : String(value);
          } else if (value instanceof Date) {
            processedRow[key] = typeInfo.allMidnight
              ? Math.round(value.getTime() / DAY_MS)
              : value.getTime();
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
