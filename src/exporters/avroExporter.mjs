import avro from 'avsc';
import { existsSync, unlinkSync } from 'fs';

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

      await new Promise((resolve, reject) => {
        const encoder = avro.createFileEncoder(filePath, type);
        encoder.on("finish", resolve);
        encoder.on("error", reject);
        encoder.end();
      });
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
        } else if (typeof value === "number") {
          typeInfo.hasNumber = true;
          if (!Number.isInteger(value)) {
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

    await new Promise((resolve, reject) => {
      const encoder = avro.createFileEncoder(filePath, type);

      encoder.on("finish", resolve);
      encoder.on("error", reject);

      // Write rows
      for (const row of data) {
        // Convert dates to timestamps and ensure type compatibility
        const processedRow = {};
        Object.keys(row).forEach((key) => {
          const value = row[key];
          const typeInfo = columnTypes[key];

          if (value === null || value === undefined) {
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
        encoder.write(processedRow);
      }

      encoder.end();
    });
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
