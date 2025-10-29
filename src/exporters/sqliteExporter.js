const Database = require("better-sqlite3");

/**
 * Export data to SQLite database format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
async function exportToSQLite(data, filePath) {
  try {
    // Create database
    const db = new Database(filePath);

    if (data.length === 0) {
      db.close();
      return;
    }

    // Infer schema from first row
    const firstRow = data[0];
    const columns = Object.keys(firstRow)
      .map((key) => {
        const value = firstRow[key];
        let sqlType = "TEXT"; // Default to TEXT

        if (value !== null && value !== undefined) {
          if (typeof value === "number") {
            sqlType = Number.isInteger(value) ? "INTEGER" : "REAL";
          } else if (typeof value === "boolean") {
            sqlType = "INTEGER"; // SQLite uses 0/1 for booleans
          } else if (value instanceof Date) {
            sqlType = "TEXT"; // Store dates as ISO strings
          }
        }

        return `"${key}" ${sqlType}`;
      })
      .join(", ");

    // Create table
    db.exec(`CREATE TABLE data (${columns})`);

    // Insert data
    const columnNames = Object.keys(firstRow);
    const placeholders = columnNames.map(() => "?").join(", ");
    const insertStmt = db.prepare(
      `INSERT INTO data (${columnNames
        .map((c) => `"${c}"`)
        .join(", ")}) VALUES (${placeholders})`
    );

    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        const values = columnNames.map((col) => {
          const value = row[col];
          if (typeof value === "boolean") {
            return value ? 1 : 0;
          }
          if (value instanceof Date) {
            return value.toISOString();
          }
          return value;
        });
        insertStmt.run(values);
      }
    });

    insertMany(data);

    db.close();
  } catch (error) {
    throw new Error(`SQLite export failed: ${error.message}`);
  }
}

module.exports = { exportToSQLite };
