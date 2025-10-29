const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

/**
 * Export data to SQLite database format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @returns {Promise<void>}
 */
async function exportToSQLite(data, filePath) {
  try {
    // Initialize SQL.js with WASM file
    // In Node.js, we need to point to the wasm file in node_modules
    const SQL = await initSqlJs({
      locateFile: (file) => {
        return path.join(__dirname, "../../node_modules/sql.js/dist", file);
      },
    });

    // Create a new database
    const db = new SQL.Database();

    if (data.length === 0) {
      // Export empty database
      const binaryArray = db.export();
      const buffer = Buffer.from(binaryArray);
      fs.writeFileSync(filePath, buffer);
      db.close();
      return;
    }

    // Get column names from first row
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

    // Determine SQLite type for each column based on collected type information
    const columns = columnNames
      .map((key) => {
        const typeInfo = columnTypes[key];
        let sqlType = "TEXT"; // Default to TEXT

        // If column has mixed types, use TEXT as most compatible
        if (typeInfo.hasString || (typeInfo.hasNumber && typeInfo.hasBoolean)) {
          sqlType = "TEXT";
        } else if (typeInfo.hasDate) {
          sqlType = "TEXT"; // Store dates as ISO strings
        } else if (typeInfo.hasNumber) {
          sqlType = typeInfo.allIntegers ? "INTEGER" : "REAL";
        } else if (typeInfo.hasBoolean) {
          sqlType = "INTEGER"; // SQLite uses 0/1 for booleans
        }

        return `"${key}" ${sqlType}`;
      })
      .join(", ");

    // Create table
    db.run(`CREATE TABLE data (${columns})`);

    // Prepare insert statement
    const placeholders = columnNames.map(() => "?").join(", ");
    const insertSQL = `INSERT INTO data (${columnNames
      .map((c) => `"${c}"`)
      .join(", ")}) VALUES (${placeholders})`;

    // Insert all rows
    for (const row of data) {
      const values = columnNames.map((col) => {
        const value = row[col];
        const typeInfo = columnTypes[col];

        // Convert values based on schema expectations
        if (value === null || value === undefined) {
          return null;
        } else if (typeInfo.hasString) {
          // If schema expects TEXT, convert everything to string
          return String(value);
        } else if (typeof value === "boolean") {
          return value ? 1 : 0;
        } else if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      });

      db.run(insertSQL, values);
    }

    // Export the database to a binary array and write to file
    const binaryArray = db.export();
    const buffer = Buffer.from(binaryArray);
    fs.writeFileSync(filePath, buffer);

    // Close the database
    db.close();
  } catch (error) {
    // Clean up the partially created file on error
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors, throw original error
    }

    throw new Error(`SQLite export failed: ${error.message}`);
  }
}

module.exports = { exportToSQLite };
