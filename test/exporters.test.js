const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const avro = require("avsc");
const initSqlJs = require("sql.js");

// Import exporter modules
let avroExporter;
let sqliteExporter;
let outputDir;

/**
 * Build rows with integer, decimal, string, boolean, null and date values
 * @param {number} count - Number of rows
 * @returns {Array<Object>} Array of row objects
 */
function makeRows(count) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      id: i,
      price: i + 0.25,
      name: `Item ${i}`,
      active: i % 2 === 0,
      note: i % 3 === 0 ? null : `Note ${i}`,
      created: new Date(Date.UTC(2024, 0, 1) + i * 60000),
    });
  }
  return rows;
}

/**
 * Decode an Avro object container file held in memory
 * @param {Buffer} bytes - File contents
 * @returns {Promise<{header: boolean, records: Array<Object>}>} Whether the file had a header, and its records
 */
function decodeAvro(bytes) {
  return new Promise((resolve, reject) => {
    let header = false;
    const records = [];
    const decoder = new avro.streams.BlockDecoder();
    decoder.on("metadata", () => {
      header = true;
    });
    decoder.on("data", (record) => records.push(record));
    decoder.on("error", reject);
    decoder.on("end", () => resolve({ header, records }));
    decoder.end(bytes);
  });
}

suite("Exporter Test Suite", () => {
  // Load the modules and create an output directory before running tests
  suiteSetup(async () => {
    // Import the ESM modules
    avroExporter = await import("../src/exporters/avroExporter.mjs");
    sqliteExporter = await import("../src/exporters/sqliteExporter.mjs");
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "qvd-viewer-export-"));
  });

  suiteTeardown(() => {
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  test("Avro export - file is complete when the export resolves", async () => {
    // Enough rows for the file to span several 64 KB blocks
    const rows = makeRows(20000);
    const filePath = path.join(outputDir, "rows.avro");

    await avroExporter.exportToAvro(rows, filePath);
    // Read synchronously, so this is the file as it was when the export resolved
    const { header, records } = await decodeAvro(fs.readFileSync(filePath));

    assert.ok(header, "File should start with an Avro header");
    // The decoder silently drops a truncated last block, so count the records
    assert.strictEqual(records.length, rows.length, "Every row should be in the file");
    const last = rows[rows.length - 1];
    assert.deepStrictEqual(
      { ...records[records.length - 1] },
      { ...last, created: last.created.getTime() },
      "Last row should round-trip, with dates as timestamps"
    );
  });

  test("Avro export - empty data gives a valid file", async () => {
    const filePath = path.join(outputDir, "empty.avro");

    await avroExporter.exportToAvro([], filePath);
    const { header, records } = await decodeAvro(fs.readFileSync(filePath));

    assert.ok(header, "File should have an Avro header");
    assert.strictEqual(records.length, 0, "File should have no records");
  });

  test("SQLite export - rows can be read back", async () => {
    const rows = makeRows(1000);
    const filePath = path.join(outputDir, "rows.db");

    await sqliteExporter.exportToSQLite(rows, filePath);

    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(filePath));
    try {
      const [count] = db.exec("SELECT COUNT(*) FROM data")[0].values[0];
      assert.strictEqual(count, rows.length, "Every row should be in the table");

      const [row] = db.exec(
        "SELECT id, price, name, active, note, created FROM data WHERE id = 3"
      )[0].values;
      assert.deepStrictEqual(
        row,
        [3, 3.25, "Item 3", 0, null, rows[3].created.toISOString()],
        "Row should round-trip, with booleans as 0/1 and dates as ISO strings"
      );
    } finally {
      db.close();
    }
  });

  test("SQLite export - sql-wasm.wasm is built next to the bundled extension", () => {
    // sql.js in dist/extension.js loads its WebAssembly file from dist/
    const wasmPath = path.join(__dirname, "..", "dist", "sql-wasm.wasm");
    assert.ok(
      fs.existsSync(wasmPath),
      `${wasmPath} should exist; esbuild.js copies it there`
    );
  });
});
