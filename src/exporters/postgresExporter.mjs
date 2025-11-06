import { existsSync, unlinkSync, writeFileSync } from "fs";

/**
 * Export data to PostgreSQL SQL format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @param {number} maxRows - Maximum number of rows to export (0 = unlimited)
 * @param {Object} options - Export options
 * @param {boolean} options.createTable - Whether to include CREATE TABLE statement
 * @param {string} options.tableName - Name of the table
 * @param {boolean} options.dropTable - Whether to include DROP TABLE IF EXISTS
 * @returns {Promise<void>}
 */
export async function exportToPostgres(data, filePath, maxRows, options) {
  try {
    const {
      createTable = true,
      tableName = "qvd_data",
      dropTable = false,
    } = options;

    // Limit rows if specified
    const exportData = maxRows > 0 ? data.slice(0, maxRows) : data;

    if (exportData.length === 0) {
      // Create empty SQL file with comment
      const content = `-- Empty dataset\n-- No data to export\n`;
      writeFileSync(filePath, content, "utf8");
      return;
    }

    // Get column names from first row
    const firstRow = exportData[0];
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
        maxLength: 0,
      };
    });

    // Scan all rows to determine the most compatible type for each column
    for (const row of exportData) {
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
          typeInfo.maxLength = Math.max(typeInfo.maxLength, value.length);
        } else if (typeof value === "boolean") {
          typeInfo.hasBoolean = true;
        } else if (value instanceof Date) {
          typeInfo.hasDate = true;
        }
      }
    }

    // Build SQL content
    let sqlContent = [];

    // Add header comment
    sqlContent.push(`-- PostgreSQL Data Import Script`);
    sqlContent.push(`-- Created by: Ctrl-Q QVD Viewer for VS Code`);
    sqlContent.push(
      `-- VS Code Extension: https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer`
    );
    sqlContent.push(
      `-- GitHub: https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer`
    );
    sqlContent.push(`-- Generated: ${new Date().toISOString()}`);
    sqlContent.push(`-- Table: ${tableName}`);
    sqlContent.push(
      `-- Rows: ${exportData.length}${
        maxRows > 0 ? ` (limited from ${data.length})` : ""
      }`
    );
    sqlContent.push(``);

    // Begin transaction
    sqlContent.push(`BEGIN;`);
    sqlContent.push(``);

    // Drop table if requested
    if (dropTable) {
      sqlContent.push(`-- Drop existing table if it exists`);
      sqlContent.push(`DROP TABLE IF EXISTS "${tableName}";`);
      sqlContent.push(``);
    }

    // Create table if requested
    if (createTable) {
      sqlContent.push(`-- Create table`);
      const columns = columnNames.map((key) => {
        const typeInfo = columnTypes[key];
        let pgType = "TEXT"; // Default to TEXT

        // Determine PostgreSQL type based on collected type information
        if (typeInfo.hasString || (typeInfo.hasNumber && typeInfo.hasBoolean)) {
          // Mixed types or strings - use TEXT
          pgType = "TEXT";
        } else if (typeInfo.hasDate) {
          pgType = "TIMESTAMP";
        } else if (typeInfo.hasNumber) {
          if (typeInfo.allIntegers) {
            pgType = "BIGINT";
          } else {
            pgType = "NUMERIC";
          }
        } else if (typeInfo.hasBoolean) {
          pgType = "BOOLEAN";
        }

        // Add NOT NULL constraint if column has no nulls
        const nullConstraint = typeInfo.hasNull ? "" : " NOT NULL";

        return `  "${key}" ${pgType}${nullConstraint}`;
      });

      sqlContent.push(`CREATE TABLE "${tableName}" (`);
      sqlContent.push(columns.join(",\n"));
      sqlContent.push(`);`);
      sqlContent.push(``);
    }

    // Insert data in batches
    sqlContent.push(`-- Insert data`);
    const batchSize = 1000;
    let currentBatch = 0;

    while (currentBatch < exportData.length) {
      const batch = exportData.slice(currentBatch, currentBatch + batchSize);
      const batchEnd = Math.min(currentBatch + batchSize, exportData.length);

      if (batch.length > 0) {
        sqlContent.push(`-- Rows ${currentBatch + 1} to ${batchEnd}`);

        // Build multi-row INSERT statement
        const columnList = columnNames.map((c) => `"${c}"`).join(", ");
        sqlContent.push(`INSERT INTO "${tableName}" (${columnList})`);
        sqlContent.push(`VALUES`);

        const valueRows = batch.map((row, index) => {
          const values = columnNames.map((col) => {
            const value = row[col];
            const typeInfo = columnTypes[col];

            // Format value based on type
            if (value === null || value === undefined) {
              return "NULL";
            } else if (typeInfo.hasString) {
              // Escape single quotes for SQL
              return `'${String(value).replace(/'/g, "''")}'`;
            } else if (typeof value === "boolean") {
              return value ? "TRUE" : "FALSE";
            } else if (value instanceof Date) {
              return `'${value.toISOString()}'`;
            } else if (typeof value === "string") {
              // String value - escape quotes
              return `'${value.replace(/'/g, "''")}'`;
            } else {
              // Number or other type
              return value;
            }
          });

          const isLast = index === batch.length - 1;
          return `  (${values.join(", ")})${isLast ? ";" : ","}`;
        });

        sqlContent.push(...valueRows);
        sqlContent.push(``);
      }

      currentBatch += batchSize;
    }

    // Commit transaction
    sqlContent.push(`COMMIT;`);
    sqlContent.push(``);
    sqlContent.push(`-- End of script`);

    // Write to file
    writeFileSync(filePath, sqlContent.join("\n"), "utf8");
  } catch (error) {
    // Clean up the partially created file on error
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors, throw original error
    }

    throw new Error(`PostgreSQL export failed: ${error.message}`);
  }
}
