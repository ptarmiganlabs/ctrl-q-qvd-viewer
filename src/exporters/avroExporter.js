const avro = require("avsc");

/**
 * Export data to Avro format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
async function exportToAvro(data, filePath) {
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

    // Infer schema from first row
    const firstRow = data[0];
    const fields = Object.keys(firstRow).map((key) => {
      const value = firstRow[key];
      let avroType = "string"; // Default to string

      if (value === null || value === undefined) {
        avroType = ["null", "string"];
      } else if (typeof value === "number") {
        avroType = Number.isInteger(value) ? "long" : "double";
      } else if (typeof value === "boolean") {
        avroType = "boolean";
      } else if (value instanceof Date) {
        avroType = "long"; // Store as timestamp
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
        // Convert dates to timestamps
        const processedRow = {};
        Object.keys(row).forEach((key) => {
          const value = row[key];
          if (value instanceof Date) {
            processedRow[key] = value.getTime();
          } else {
            processedRow[key] = value;
          }
        });
        encoder.write(processedRow);
      }

      encoder.end();
    });
  } catch (error) {
    throw new Error(`Avro export failed: ${error.message}`);
  }
}

module.exports = { exportToAvro };
