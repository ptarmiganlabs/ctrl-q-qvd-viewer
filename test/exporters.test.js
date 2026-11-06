const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const avro = require("avsc");
const esbuild = require("esbuild");
const Papa = require("papaparse");
const initSqlJs = require("sql.js");
const { buildOptions } = require("../esbuild.js");

// Import exporter modules
let avroExporter;
let csvExporter;
let sqliteExporter;
// QvdReader is async because it's a CJS wrapper around ESM
let QvdReader;
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
 * Build two rows with the field names and values that CSV has to quote or escape:
 * spaces and % in names, a comma, quotes, a line break and non-ASCII text in a value,
 * and a number, a boolean, a null and a date
 * @returns {Array<Object>} Array of row objects
 */
function makeAwkwardRows() {
  return [
    {
      "Order Date": new Date(Date.UTC(2024, 0, 2)),
      "%CustomerKey": 'Å, "quoted"\nvalue',
      Amount: 12.5,
      Active: true,
      Note: null,
    },
    {
      "Order Date": new Date(Date.UTC(2024, 0, 3)),
      "%CustomerKey": "Ölstuga",
      Amount: -3,
      Active: false,
      Note: "x",
    },
  ];
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

/**
 * Export rows to CSV in the output directory and read the file back
 * @param {Array<Object>} rows - Array of row objects
 * @param {string} name - File name in the output directory
 * @param {object} [options] - CSV options
 * @returns {Promise<string>} The file's text
 */
async function exportCsvText(rows, name, options) {
  const filePath = path.join(outputDir, name);
  await csvExporter.exportToCSV(rows, filePath, options);
  return fs.readFileSync(filePath, "utf8");
}

/**
 * Count the rows in the data table of an exported SQLite database
 * @param {string} filePath - Database file path
 * @returns {Promise<number>} Number of rows
 */
async function countSqliteRows(filePath) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(filePath));
  try {
    return db.exec("SELECT COUNT(*) FROM data")[0].values[0][0];
  } finally {
    db.close();
  }
}

/**
 * Bundle the SQLite exporter with esbuild.js's options, into a folder of its own
 * with no node_modules above it, as in the installed extension
 * @param {string} name - Folder name in the output directory
 * @returns {Promise<{exportToSQLite: Function, wasmPath: string}>} The bundled exporter, and the wasm file next to it
 */
async function bundleSqliteExporter(name) {
  const outfile = path.join(outputDir, name, "dist", "sqliteExporter.js");
  await esbuild.build({
    ...buildOptions,
    entryPoints: [
      path.join(__dirname, "..", "src", "exporters", "sqliteExporter.mjs"),
    ],
    outfile,
    sourcemap: false,
    logLevel: "silent",
  });
  return {
    exportToSQLite: require(outfile).exportToSQLite,
    wasmPath: path.join(path.dirname(outfile), "sql-wasm.wasm"),
  };
}

suite("Exporter Test Suite", () => {
  // Load the modules and create an output directory before running tests
  suiteSetup(async () => {
    // Import the ESM modules
    avroExporter = await import("../src/exporters/avroExporter.mjs");
    csvExporter = await import("../src/exporters/csvExporter.mjs");
    sqliteExporter = await import("../src/exporters/sqliteExporter.mjs");
    QvdReader = await require("../src/qvdReader.cjs");
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

  test("Avro export - columns come from the first row", async () => {
    // A later row may lack a column, or have one the first row does not
    const rows = [{ a: 1, b: "x" }, { a: 2 }, { a: 3, b: "z", c: true }];
    const filePath = path.join(outputDir, "uneven.avro");

    await avroExporter.exportToAvro(rows, filePath);
    const { records } = await decodeAvro(fs.readFileSync(filePath));

    assert.deepStrictEqual(
      records.map((record) => ({ ...record })),
      [
        { a: 1, b: "x" },
        { a: 2, b: null },
        { a: 3, b: "z" },
      ],
      "Missing values should be null, and extra columns left out"
    );
  });

  test("CSV export - the file starts with the header row", async () => {
    const text = await exportCsvText(makeAwkwardRows(), "awkward.csv");

    // Written out by hand rather than by a CSV library, so a quoting mistake shared by
    // the writer and a reader can't hide. Every value is quoted, dates as ISO text,
    // nulls are empty, and quotes inside a value are doubled. No BOM, no trailing newline.
    assert.strictEqual(
      text,
      [
        '"Order Date","%CustomerKey","Amount","Active","Note"',
        '"2024-01-02T00:00:00.000Z","Å, ""quoted""\nvalue","12.5","true",',
        '"2024-01-03T00:00:00.000Z","Ölstuga","-3","false","x"',
      ].join("\n")
    );
  });

  test("CSV export - a reader takes the column names from the first line", async () => {
    const rows = makeAwkwardRows();
    const parsed = Papa.parse(await exportCsvText(rows, "header.csv"), { header: true });

    assert.deepStrictEqual(parsed.errors, []);
    assert.deepStrictEqual(parsed.meta.fields, Object.keys(rows[0]));
    assert.deepStrictEqual(
      parsed.data.map((row) => row["%CustomerKey"]),
      rows.map((row) => row["%CustomerKey"]),
      "Values with a comma, quotes and a line break should come back unchanged"
    );
  });

  test("CSV export - exporting the same rows twice gives the same file", async () => {
    const first = await exportCsvText(makeAwkwardRows(), "first.csv");
    // Let the clock move on, so a timestamp in the file would differ
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await exportCsvText(makeAwkwardRows(), "second.csv");

    assert.strictEqual(
      second,
      first,
      "Nothing that changes between runs, such as a timestamp, should be in the file"
    );
  });

  test("CSV export - columns follow the given fields, not the rows' keys", async () => {
    // JavaScript puts integer-like keys first, so Object.keys gives 2019, 2020, Name
    const rows = [
      { Name: "a", 2019: 1, 2020: 2 },
      { Name: "b", 2020: 4, Extra: "x" },
    ];

    assert.strictEqual(
      await exportCsvText(rows, "fields.csv", { fields: ["Name", "2019", "2020"] }),
      ['"Name","2019","2020"', '"a","1","2"', '"b",,"4"'].join("\n"),
      "A missing value should be empty, and a key that isn't a field left out"
    );
  });

  test("CSV export - without fields, columns are every row's keys", async () => {
    // A later row may have a column the first row does not
    const rows = [{ a: 1 }, { a: 2, b: "y" }];

    assert.strictEqual(
      await exportCsvText(rows, "keys.csv"),
      ['"a","b"', '"1",', '"2","y"'].join("\n")
    );
  });

  test("CSV export - with no rows, the header row is still written", async () => {
    assert.strictEqual(
      await exportCsvText([], "no-rows.csv", { fields: ["id", "name"] }),
      '"id","name"'
    );
    // With neither rows nor field names there is nothing to write
    assert.strictEqual(await exportCsvText([], "nothing.csv"), "");
  });

  test("CSV export - a QVD comes out as the CSV it was made from", async () => {
    const legoDir = path.join(__dirname, "..", "test-data", "lego");
    const result = await new QvdReader().read(path.join(legoDir, "colors.qvd"), 0);
    assert.strictEqual(result.error, null);

    const exported = Papa.parse(
      await exportCsvText(result.data, "colors.csv", { fields: result.columns }),
      { header: true }
    );
    const source = Papa.parse(
      fs.readFileSync(path.join(legoDir, "colors.csv"), "utf8").trimEnd(),
      { header: true }
    );

    assert.deepStrictEqual(exported.errors, []);
    assert.deepStrictEqual(exported.meta.fields, source.meta.fields);
    assert.strictEqual(exported.data.length, result.metadata.noOfRecords);
    // The reader turns these colour codes into numbers (#154). Once that is fixed,
    // they come out as in colors.csv and this list goes.
    const readAsNumbers = {
      75: "0",
      132: "0",
      133: "0",
      373: "8.45e+86",
      1001: "93910000",
      1007: "Infinity",
    };
    assert.deepStrictEqual(
      exported.data,
      source.data.map((row) =>
        row.id in readAsNumbers ? { ...row, rgb: readAsNumbers[row.id] } : row
      )
    );
  });

  test("CSV export - an invalid date is an empty cell, and a one-column null isn't a blank line", async () => {
    assert.strictEqual(
      await exportCsvText([{ d: new Date(NaN), n: 1 }], "bad-date.csv"),
      ['"d","n"', ',"1"'].join("\n")
    );
    // Readers skip blank lines, which would drop the row
    assert.strictEqual(
      await exportCsvText([{ only: "a" }, { only: null }, { only: "c" }], "one-column.csv"),
      ['"only"', '"a"', '""', '"c"'].join("\n")
    );
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

  test("SQLite export - bundled exporter finds its wasm file without node_modules", async () => {
    const { exportToSQLite } = await bundleSqliteExporter("bundled");
    const rows = makeRows(100);
    const filePath = path.join(outputDir, "bundled.db");

    await exportToSQLite(rows, filePath);

    assert.strictEqual(await countSqliteRows(filePath), rows.length);
  });

  test("SQLite export - a missing wasm file fails one export, not the session", async () => {
    const { exportToSQLite, wasmPath } = await bundleSqliteExporter("missing-wasm");
    const rows = makeRows(100);
    const filePath = path.join(outputDir, "missing-wasm.db");
    const wasm = fs.readFileSync(wasmPath);

    fs.rmSync(wasmPath);
    await assert.rejects(
      exportToSQLite(rows, filePath),
      /SQLite export failed: .*sql-wasm\.wasm is missing/
    );

    // Once the file is back, the next export should work
    fs.writeFileSync(wasmPath, wasm);
    await exportToSQLite(rows, filePath);
    assert.strictEqual(await countSqliteRows(filePath), rows.length);
  });
});
