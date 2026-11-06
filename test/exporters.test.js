const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const avro = require("avsc");
const esbuild = require("esbuild");
const ExcelJS = require("exceljs");
const Papa = require("papaparse");
const parquet = require("parquetjs");
const initSqlJs = require("sql.js");
// parquetjs's own Thrift, to read the logical types parquetjs reads past
const thrift = require("thrift");
const yaml = require("js-yaml");
const { buildOptions } = require("../esbuild.js");

// Import exporter modules
let arrow;
let arrowExporter;
let avroExporter;
let csvExporter;
let excelExporter;
let parquetExporter;
let postgresExporter;
let sqliteExporter;
let yamlExporter;
let DataExporter;
let QvdDataFrame;
let CalendarDate;
// QvdReader is async because it's a CJS wrapper around ESM
let QvdReader;
let outputDir;

/**
 * Enough of the VS Code API for an export that asks only for where to save, with
 * every setting at its default
 * @param {string} filePath - What the save dialog answers
 * @returns {object} The API
 */
function saveDialogTo(filePath) {
  return {
    Uri: { file: (fsPath) => ({ fsPath }) },
    window: { showSaveDialog: async () => ({ fsPath: filePath }) },
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
  };
}

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
 * Build rows with blank text next to integers, next to booleans, among text, and on its own
 * @returns {Array<Object>} Array of row objects
 */
function makeBlankRows() {
  return [
    { parent_id: 3, flag: true, code: "a", note: "" },
    { parent_id: "", flag: " ", code: "", note: " " },
    { parent_id: " \t", flag: false, code: "c", note: null },
  ];
}

/**
 * Build rows with an integer column, and a column of integers a double holds but a
 * 64-bit integer column might not: 2^53, the first a double can't tell from the next,
 * and 10^19, which is past 2^63
 * @returns {Array<Object>} Array of row objects
 */
function makeBigIntegerRows() {
  return [
    { id: 1, big: 2 ** 53 },
    { id: 2, big: 1e19 },
  ];
}

// makeBlankRows() as a typed format should store it: the blanks next to integers and
// booleans as nulls, and the others as the text they are
const BLANK_ROWS_STORED = [
  { parent_id: 3, flag: true, code: "a", note: "" },
  { parent_id: null, flag: null, code: "", note: " " },
  { parent_id: null, flag: false, code: "c", note: null },
];

/**
 * Decode an Avro object container file held in memory
 * @param {Buffer} bytes - File contents
 * @returns {Promise<{header: boolean, schema: Object, fileSchema: Object, records: Array<Object>}>}
 *   Whether the file had a header, its schema as avsc reads it, its schema as the file
 *   stores it, logical types included, and its records
 */
function decodeAvro(bytes) {
  return new Promise((resolve, reject) => {
    let header = false;
    let schema;
    let fileSchema;
    const records = [];
    const decoder = new avro.streams.BlockDecoder();
    decoder.on("metadata", (type, codec, fileHeader) => {
      header = true;
      schema = type.schema();
      fileSchema = JSON.parse(fileHeader.meta["avro.schema"].toString());
    });
    decoder.on("data", (record) => records.push(record));
    decoder.on("error", reject);
    decoder.on("end", () => resolve({ header, schema, fileSchema, records }));
    decoder.end(bytes);
  });
}

/**
 * Build rows with a column of dates without a time, from before 1900 on, and one of timestamps
 * @returns {Array<Object>} Array of row objects
 */
function makeDateRows() {
  return [
    { day: new CalendarDate(Date.UTC(1756, 0, 1)), at: new Date(Date.UTC(2016, 0, 13, 6, 15)) },
    // Midnight, in a column whose other values have a time
    { day: new CalendarDate(Date.UTC(2016, 0, 14)), at: new Date(Date.UTC(2016, 0, 14)) },
  ];
}

/**
 * Read a Parquet file's schema and rows
 * @param {string} filePath - File path
 * @returns {Promise<{schema: Object<string, string>, rows: Array<Object>}>} Each column's type, ending in ? if the column is optional, and the rows
 */
async function readParquet(filePath) {
  const reader = await parquet.ParquetReader.openFile(filePath);
  try {
    const schema = {};
    for (const [name, field] of Object.entries(reader.getSchema().fields)) {
      const optional = field.repetitionType === "OPTIONAL" ? "?" : "";
      schema[name] = `${field.originalType ?? field.primitiveType}${optional}`;
    }
    const rows = [];
    const cursor = reader.getCursor();
    let row;
    while ((row = await cursor.next())) {
      // parquetjs leaves a null out of the row
      rows.push(Object.fromEntries(Object.keys(schema).map((name) => [name, row[name] ?? null])));
    }
    return { schema, rows };
  } finally {
    await reader.close();
  }
}

/**
 * Read the logical type of each Parquet column that has one: its footer's
 * SchemaElement field 10, which parquetjs's reader skips
 * @param {string} filePath - File path
 * @returns {Object<string, string>} Such as {at: "TIMESTAMP(isAdjustedToUTC=false, MILLIS)"}
 */
function parquetLogicalTypes(filePath) {
  const bytes = fs.readFileSync(filePath);
  const footerLength = bytes.readUInt32LE(bytes.length - 8);
  const footer = bytes.subarray(bytes.length - 8 - footerLength, bytes.length - 8);
  const input = new thrift.TCompactProtocol(new thrift.TFramedTransport(footer));
  // Call read for each field of the struct at hand, and skip the fields it doesn't read
  const fields = (read) => {
    input.readStructBegin();
    for (;;) {
      const { ftype, fid } = input.readFieldBegin();
      if (ftype === thrift.Thrift.Type.STOP) {
        break;
      }
      if (!read(fid, ftype)) {
        input.skip(ftype);
      }
      input.readFieldEnd();
    }
    input.readStructEnd();
  };

  const types = {};
  fields((metadataField) => {
    // FileMetaData.schema
    if (metadataField !== 2) {
      return false;
    }
    const { size } = input.readListBegin();
    for (let i = 0; i < size; i++) {
      let name;
      let logicalType;
      fields((elementField) => {
        if (elementField === 4) {
          name = input.readString();
          return true;
        }
        if (elementField !== 10) {
          return false;
        }
        fields((kind) => {
          // LogicalType.TIMESTAMP
          if (kind !== 8) {
            logicalType = `type ${kind}`;
            return false;
          }
          let adjusted;
          let unit;
          fields((timestampField) => {
            if (timestampField === 1) {
              adjusted = input.readBool();
              return true;
            }
            fields((unitField) => {
              unit = ["", "MILLIS", "MICROS", "NANOS"][unitField];
              return false;
            });
            return true;
          });
          logicalType = `TIMESTAMP(isAdjustedToUTC=${adjusted}, ${unit})`;
          return true;
        });
        return true;
      });
      if (logicalType) {
        types[name] = logicalType;
      }
    }
    input.readListEnd();
    return true;
  });
  return types;
}

/**
 * Read an Arrow file's schema and rows
 * @param {string} filePath - File path
 * @returns {{schema: Object<string, string>, rows: Array<Object>}} Each column's type, and the rows
 */
function readArrow(filePath) {
  const table = arrow.tableFromIPC(fs.readFileSync(filePath));
  return {
    schema: Object.fromEntries(table.schema.fields.map((field) => [field.name, String(field.type)])),
    rows: table.toArray().map((row) => ({ ...row.toJSON() })),
  };
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
    arrow = await import("apache-arrow");
    arrowExporter = await import("../src/exporters/arrowExporter.mjs");
    avroExporter = await import("../src/exporters/avroExporter.mjs");
    csvExporter = await import("../src/exporters/csvExporter.mjs");
    excelExporter = await import("../src/exporters/excelExporter.mjs");
    parquetExporter = await import("../src/exporters/parquetExporter.mjs");
    postgresExporter = await import("../src/exporters/postgresExporter.mjs");
    sqliteExporter = await import("../src/exporters/sqliteExporter.mjs");
    yamlExporter = await import("../src/exporters/yamlExporter.mjs");
    ({ default: DataExporter } = await import("../src/exporters/index.mjs"));
    ({ QvdDataFrame } = await import("qvdjs"));
    ({ CalendarDate } = await import("../src/cellValue.mjs"));
    QvdReader = await require("../src/qvdReader.cjs");
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "qvd-viewer-export-"));
  });

  suiteTeardown(() => {
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  test("An export its reserve refuses writes nothing", async () => {
    const filePath = path.join(outputDir, "refused.csv");
    let reserved;
    await assert.rejects(
      DataExporter.exportData(makeRows(10), "csv", "refused", saveDialogTo(filePath), outputDir, 0, ["id"], {
        reserve: (rows, limit) => {
          reserved = { rows: rows.length, limit };
          throw new Error("Exporting 10 rows to CSV needs about 1 MiB of memory");
        },
      }),
      /needs about 1 MiB/
    );
    // Asked once the dialog was answered, for every row
    assert.deepStrictEqual(reserved, { rows: 10, limit: 0 });
    assert.ok(!fs.existsSync(filePath));
  });

  test("An export's reservation is released once it is written", async () => {
    const filePath = path.join(outputDir, "reserved.csv");
    let released = 0;
    const saved = await DataExporter.exportData(makeRows(10), "csv", "reserved", saveDialogTo(filePath), outputDir, 0, ["name", "id"], {
      reserve: () => () => released++,
    });
    assert.strictEqual(saved, filePath);
    // The fields reach the CSV exporter, in their order, as the header row
    assert.strictEqual(fs.readFileSync(filePath, "utf8").split("\n")[0], '"name","id"');
    assert.strictEqual(released, 1);
  });

  test("An export waits for a reserve that answers later", async () => {
    const filePath = path.join(outputDir, "reserved-later.csv");
    const events = [];
    await DataExporter.exportData(makeRows(10), "csv", "later", saveDialogTo(filePath), outputDir, 0, ["id"], {
      reserve: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        events.push(fs.existsSync(filePath) ? "written" : "reserved");
        return () => events.push("released");
      },
    });
    assert.deepStrictEqual(events, ["reserved", "released"]);
    assert.ok(fs.existsSync(filePath));
  });

  test("Arrow export - blank text next to numbers or booleans is null, and text elsewhere", async () => {
    const filePath = path.join(outputDir, "blanks.arrow");

    await arrowExporter.exportToArrow(makeBlankRows(), filePath);
    const { schema, rows } = readArrow(filePath);

    assert.deepStrictEqual(schema, {
      parent_id: "Float64",
      flag: "Bool",
      code: "Dictionary<Int32, Utf8>",
      note: "Dictionary<Int32, Utf8>",
    });
    assert.deepStrictEqual(rows, BLANK_ROWS_STORED);
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

  test("Avro export - blank text next to numbers or booleans is null, and text elsewhere", async () => {
    const filePath = path.join(outputDir, "blanks.avro");

    await avroExporter.exportToAvro(makeBlankRows(), filePath);
    const { schema, records } = await decodeAvro(fs.readFileSync(filePath));

    assert.deepStrictEqual(
      schema.fields.map((field) => [field.name, field.type]),
      [
        ["parent_id", ["null", "long"]],
        ["flag", ["null", "boolean"]],
        ["code", "string"],
        ["note", ["null", "string"]],
      ]
    );
    assert.deepStrictEqual(
      records.map((record) => ({ ...record })),
      BLANK_ROWS_STORED
    );
  });

  test("Avro export - integers beyond 2^53 go in a double column", async () => {
    const filePath = path.join(outputDir, "big.avro");

    await avroExporter.exportToAvro(makeBigIntegerRows(), filePath);
    const { schema, records } = await decodeAvro(fs.readFileSync(filePath));

    assert.deepStrictEqual(
      schema.fields.map((field) => [field.name, field.type]),
      [
        ["id", "long"],
        ["big", "double"],
      ]
    );
    assert.deepStrictEqual(
      records.map((record) => ({ ...record })),
      makeBigIntegerRows()
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
    assert.deepStrictEqual(exported.data, source.data);
  });

  test("CSV export - text a spreadsheet would run as a formula gets an apostrophe", async () => {
    const values = ["=1+1", "@SUM(A1)", "+A1", "-2+3", "\tx", "-5", "-1,234.50", "+46 70 123 45 67", "x=1"];
    const rows = [Object.fromEntries(values.map((value, i) => [`f${i}`, value]))];
    rows[0].number = -5;
    const fields = [...Object.keys(rows[0]), "=Total"];

    const [header, line] = (await exportCsvText(rows, "formulas.csv", { fields })).split("\n");

    assert.ok(header.endsWith(`"'=Total"`), "A field name is a cell too");
    assert.deepStrictEqual(
      Papa.parse(line).data[0],
      ["'=1+1", "'@SUM(A1)", "'+A1", "'-2+3", "'\tx", "-5", "-1,234.50", "+46 70 123 45 67", "x=1", "-5", ""],
      "Numbers, and text that only looks like one, should be left alone"
    );
  });

  test("CSV export - formula escaping can be turned off", async () => {
    const text = await exportCsvText([{ a: "=1+1", b: "+A1" }], "raw.csv", {
      escapeFormulas: false,
    });

    assert.strictEqual(text, ['"a","b"', '"=1+1","+A1"'].join("\n"));
  });

  test("CSV export - a byte order mark comes first when asked for", async () => {
    const text = await exportCsvText([{ name: "Ölstuga" }], "bom.csv", {
      byteOrderMark: true,
    });

    assert.strictEqual(text, '\uFEFF"name"\n"Ölstuga"');
    // Papa Parse, like Excel and Qlik, reads the mark as the encoding, not as text
    assert.deepStrictEqual(Papa.parse(text, { header: true }).meta.fields, ["name"]);
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

  test("CSV export - writing in chunks gives the same file as in one go", async () => {
    const rows = makeRows(25);

    assert.strictEqual(
      await exportCsvText(rows, "chunks.csv", { chunkRows: 4 }),
      await exportCsvText(rows, "one-chunk.csv", { chunkRows: rows.length })
    );
  });

  test("CSV export - a failed export leaves the file it would replace as it was", async () => {
    const filePath = path.join(outputDir, "keep.csv");
    fs.writeFileSync(filePath, "previous export");
    const failing = {
      toString() {
        throw new Error("value can't be written");
      },
    };

    // The first chunk is written before the second fails
    await assert.rejects(
      csvExporter.exportToCSV([{ a: 1 }, { a: failing }], filePath, { chunkRows: 1 }),
      (error) => {
        assert.strictEqual(error.message, "CSV export failed: value can't be written");
        assert.strictEqual(error.cause.message, "value can't be written");
        return true;
      }
    );

    assert.strictEqual(fs.readFileSync(filePath, "utf8"), "previous export");
    assert.deepStrictEqual(
      fs.readdirSync(outputDir).filter((name) => name.endsWith(".tmp")),
      [],
      "The temporary file should be removed"
    );
  });

  test("CSV export - replacing a file keeps its permissions and symlinks", async function () {
    if (process.platform === "win32") {
      this.skip();
    }
    const real = path.join(outputDir, "real.csv");
    const link = path.join(outputDir, "link.csv");
    fs.writeFileSync(real, "previous export");
    fs.chmodSync(real, 0o600);
    fs.symlinkSync(real, link);

    await csvExporter.exportToCSV([{ a: 1 }], link);

    assert.ok(fs.lstatSync(link).isSymbolicLink(), "The link should still be a link");
    assert.strictEqual(fs.readFileSync(real, "utf8"), '"a"\n"1"');
    assert.strictEqual(fs.statSync(real).mode & 0o777, 0o600);
  });

  test("Excel export - blank text next to numbers or booleans is an empty cell, and text elsewhere", async () => {
    const filePath = path.join(outputDir, "blanks.xlsx");
    const rows = makeBlankRows();

    await excelExporter.exportToExcel(rows, filePath);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet("Data");

    // exceljs reads an empty cell as null
    assert.deepStrictEqual(
      [2, 3, 4].map((row) => [1, 2, 3, 4].map((column) => sheet.getRow(row).getCell(column).value)),
      BLANK_ROWS_STORED.map((row) => Object.values(row))
    );
    assert.deepStrictEqual(rows, makeBlankRows(), "The rows should stay as they were");
  });

  test("Parquet export - blank text next to numbers or booleans is null, and text elsewhere", async () => {
    const filePath = path.join(outputDir, "blanks.parquet");

    await parquetExporter.exportToParquet(makeBlankRows(), filePath);
    const { schema, rows } = await readParquet(filePath);

    assert.deepStrictEqual(schema, {
      parent_id: "INT64?",
      flag: "BOOLEAN?",
      code: "UTF8",
      note: "UTF8?",
    });
    assert.deepStrictEqual(rows, BLANK_ROWS_STORED);
  });

  test("Parquet export - integers beyond 2^53 go in a DOUBLE column", async () => {
    const filePath = path.join(outputDir, "big.parquet");

    await parquetExporter.exportToParquet(makeBigIntegerRows(), filePath);

    assert.deepStrictEqual(await readParquet(filePath), {
      schema: { id: "INT64", big: "DOUBLE" },
      rows: makeBigIntegerRows(),
    });
  });

  test("Parquet export - an integer a QVD stores beyond 2^53 goes in a DOUBLE column", async () => {
    // A number stored without text, as in a field Qlik calculated
    const qvdPath = path.join(outputDir, "big.qvd");
    await new QvdDataFrame([[1, 2 ** 53], [2, 1e19]], ["id", "big"]).toQvd(qvdPath, {
      allowedDir: outputDir,
    });
    const result = await new QvdReader().read(qvdPath, 0);
    assert.strictEqual(result.error, null);
    const filePath = path.join(outputDir, "big-qvd.parquet");

    await parquetExporter.exportToParquet(result.data, filePath);

    assert.deepStrictEqual(await readParquet(filePath), {
      schema: { id: "INT64", big: "DOUBLE" },
      rows: makeBigIntegerRows(),
    });
  });

  test("PostgreSQL export - blank text next to numbers or booleans is NULL, and text elsewhere", async () => {
    const filePath = path.join(outputDir, "blanks.sql");

    await postgresExporter.exportToPostgres(makeBlankRows(), filePath, 0, {});
    const lines = fs.readFileSync(filePath, "utf8").split("\n");

    const create = lines.indexOf('CREATE TABLE "qvd_data" (');
    assert.deepStrictEqual(lines.slice(create + 1, create + 5), [
      '  "parent_id" BIGINT,',
      '  "flag" BOOLEAN,',
      '  "code" TEXT NOT NULL,',
      '  "note" TEXT',
    ]);
    const values = lines.indexOf("VALUES");
    assert.deepStrictEqual(lines.slice(values + 1, values + 4), [
      "  (3, TRUE, 'a', ''),",
      "  (NULL, NULL, '', ' '),",
      "  (NULL, FALSE, 'c', NULL);",
    ]);
  });

  test("PostgreSQL export - integers beyond 2^53 go in a NUMERIC column", async () => {
    const filePath = path.join(outputDir, "big.sql");

    await postgresExporter.exportToPostgres(makeBigIntegerRows(), filePath, 0, {});
    const lines = fs.readFileSync(filePath, "utf8").split("\n");

    const create = lines.indexOf('CREATE TABLE "qvd_data" (');
    assert.deepStrictEqual(lines.slice(create + 1, create + 3), [
      '  "id" BIGINT NOT NULL,',
      '  "big" NUMERIC NOT NULL',
    ]);
    const values = lines.indexOf("VALUES");
    assert.deepStrictEqual(lines.slice(values + 1, values + 3), [
      "  (1, 9007199254740992),",
      "  (2, 10000000000000000000);",
    ]);
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
        [3, 3.25, "Item 3", 0, null, "2024-01-01 00:03:00"],
        "Row should round-trip, with booleans as 0/1 and dates as ISO text with no time zone"
      );
    } finally {
      db.close();
    }
  });

  test("SQLite export - blank text next to numbers or booleans is NULL, and text elsewhere", async () => {
    const filePath = path.join(outputDir, "blanks.db");

    await sqliteExporter.exportToSQLite(makeBlankRows(), filePath);

    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(filePath));
    try {
      assert.strictEqual(
        db.exec("SELECT sql FROM sqlite_master WHERE name = 'data'")[0].values[0][0],
        'CREATE TABLE data ("parent_id" INTEGER, "flag" INTEGER, "code" TEXT, "note" TEXT)'
      );
      assert.deepStrictEqual(
        db.exec("SELECT parent_id, flag, code, note FROM data")[0].values,
        [
          [3, 1, "a", ""],
          [null, null, "", " "],
          [null, 0, "c", null],
        ],
        "Booleans should be stored as 0/1"
      );
    } finally {
      db.close();
    }
  });

  test("SQLite export - integers beyond 2^53 go in a REAL column", async () => {
    const filePath = path.join(outputDir, "big.db");

    await sqliteExporter.exportToSQLite(makeBigIntegerRows(), filePath);

    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(filePath));
    try {
      assert.strictEqual(
        db.exec("SELECT sql FROM sqlite_master WHERE name = 'data'")[0].values[0][0],
        'CREATE TABLE data ("id" INTEGER, "big" REAL)'
      );
      assert.deepStrictEqual(db.exec("SELECT id, big FROM data")[0].values, [
        [1, 2 ** 53],
        [2, 1e19],
      ]);
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

  test("YAML export - text that YAML 1.2 reads as a number is quoted", async () => {
    const filePath = path.join(outputDir, "numeric-text.yaml");
    // Floats too large for a double, as keys too, next to text and numbers
    const row = {
      rgb: "8E5597",
      negative: "-8.0E5597",
      huge: "1E400",
      "1E400": "key",
      code: "845E84",
      text: "8E5597x",
      number: 8.45e86,
    };

    await yamlExporter.exportToYAML([row], filePath);
    const text = fs.readFileSync(filePath, "utf8");

    assert.deepStrictEqual(
      text.split("\n").filter((line) => line && !line.startsWith("#")),
      [
        "- rgb: '8E5597'",
        "  negative: '-8.0E5597'",
        "  huge: '1E400'",
        "  '1E400': key",
        "  code: '845E84'",
        "  text: 8E5597x",
        "  number: 8.45e+86",
      ]
    );
    assert.deepStrictEqual(yaml.load(text), [row]);
  });

  test("Typed exports - blank text next to dates is null, and an empty cell in Excel", async () => {
    const when = new Date(Date.UTC(2024, 0, 2, 3, 4, 5));
    const rows = [{ when }, { when: "" }, { when: " " }];
    const file = (extension) => path.join(outputDir, `dates.${extension}`);

    // A timestamp is milliseconds, marked as a timestamp with no time zone
    await parquetExporter.exportToParquet(rows, file("parquet"));
    assert.deepStrictEqual(await readParquet(file("parquet")), {
      schema: { when: "INT64?" },
      rows: [{ when: when.getTime() }, { when: null }, { when: null }],
    });
    assert.deepStrictEqual(parquetLogicalTypes(file("parquet")), {
      when: "TIMESTAMP(isAdjustedToUTC=false, MILLIS)",
    });

    await avroExporter.exportToAvro(rows, file("avro"));
    const { schema, records } = await decodeAvro(fs.readFileSync(file("avro")));
    assert.deepStrictEqual(schema.fields, [{ name: "when", type: ["null", "long"] }]);
    assert.deepStrictEqual(
      records.map((record) => ({ ...record })),
      [{ when: when.getTime() }, { when: null }, { when: null }]
    );

    // Arrow reads a timestamp back as its milliseconds
    await arrowExporter.exportToArrow(rows, file("arrow"));
    assert.deepStrictEqual(readArrow(file("arrow")).rows, [
      { when: when.getTime() },
      { when: null },
      { when: null },
    ]);

    await sqliteExporter.exportToSQLite(rows, file("db"));
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(file("db")));
    try {
      assert.deepStrictEqual(db.exec('SELECT "when" FROM data')[0].values, [
        ["2024-01-02 03:04:05"],
        [null],
        [null],
      ]);
    } finally {
      db.close();
    }

    await postgresExporter.exportToPostgres(rows, file("sql"), 0, {});
    const lines = fs.readFileSync(file("sql"), "utf8").split("\n");
    assert.ok(lines.includes('  "when" TIMESTAMP'), "The column should be a nullable TIMESTAMP");
    const values = lines.indexOf("VALUES");
    assert.deepStrictEqual(lines.slice(values + 1, values + 4), [
      "  ('2024-01-02 03:04:05'),",
      "  (NULL),",
      "  (NULL);",
    ]);

    await excelExporter.exportToExcel(rows, file("xlsx"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file("xlsx"));
    const sheet = workbook.getWorksheet("Data");
    assert.deepStrictEqual(
      [2, 3, 4].map((row) => sheet.getRow(row).getCell(1).value),
      [when, null, null]
    );
  });

  test("Typed exports - a column of dates holds dates, and one of timestamps naive timestamps", async () => {
    const rows = makeDateRows();
    const file = (extension) => path.join(outputDir, `naive.${extension}`);

    await parquetExporter.exportToParquet(rows, file("parquet"));
    assert.deepStrictEqual(await readParquet(file("parquet")), {
      schema: { day: "DATE", at: "INT64" },
      // parquetjs reads a date back as a plain Date
      rows: rows.map((row) => ({ day: new Date(row.day.getTime()), at: row.at.getTime() })),
    });
    // Not TIMESTAMP_MILLIS, which says UTC: pyarrow reads it as timestamp[ms, tz=UTC]
    assert.deepStrictEqual(parquetLogicalTypes(file("parquet")), {
      at: "TIMESTAMP(isAdjustedToUTC=false, MILLIS)",
    });

    await avroExporter.exportToAvro(rows, file("avro"));
    const { fileSchema, records } = await decodeAvro(fs.readFileSync(file("avro")));
    assert.deepStrictEqual(fileSchema.fields, [
      { name: "day", type: { type: "int", logicalType: "date" } },
      { name: "at", type: { type: "long", logicalType: "local-timestamp-millis" } },
    ]);
    // Days since 1970, and milliseconds
    assert.deepStrictEqual(
      records.map((record) => ({ ...record })),
      [
        { day: -78162, at: rows[0].at.getTime() },
        { day: 16814, at: rows[1].at.getTime() },
      ]
    );

    await arrowExporter.exportToArrow(rows, file("arrow"));
    const table = arrow.tableFromIPC(fs.readFileSync(file("arrow")));
    assert.deepStrictEqual(
      table.schema.fields.map((field) => [field.name, String(field.type), field.type.timezone ?? null]),
      [
        ["day", "Date32<DAY>", null],
        ["at", "Timestamp<MILLISECOND>", null],
      ],
      "A timestamp should have no time zone"
    );
    assert.deepStrictEqual(
      readArrow(file("arrow")).rows,
      rows.map((row) => ({ day: row.day.getTime(), at: row.at.getTime() }))
    );

    await sqliteExporter.exportToSQLite(rows, file("db"));
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(file("db")));
    try {
      assert.deepStrictEqual(db.exec("SELECT day, at FROM data")[0].values, [
        ["1756-01-01", "2016-01-13 06:15:00"],
        ["2016-01-14", "2016-01-14 00:00:00"],
      ]);
    } finally {
      db.close();
    }

    await postgresExporter.exportToPostgres(rows, file("sql"), 0, {});
    const lines = fs.readFileSync(file("sql"), "utf8").split("\n");
    const create = lines.indexOf('CREATE TABLE "qvd_data" (');
    assert.deepStrictEqual(lines.slice(create + 1, create + 3), [
      '  "day" DATE NOT NULL,',
      '  "at" TIMESTAMP NOT NULL',
    ]);
    const values = lines.indexOf("VALUES");
    assert.deepStrictEqual(lines.slice(values + 1, values + 3), [
      "  ('1756-01-01', '2016-01-13 06:15:00'),",
      "  ('2016-01-14', '2016-01-14 00:00:00');",
    ]);

    // A column of timestamps stays one when the rows exported all fall at midnight
    await postgresExporter.exportToPostgres(rows.slice(1), file("sql"), 0, {});
    assert.ok(fs.readFileSync(file("sql"), "utf8").includes('  "at" TIMESTAMP NOT NULL'));
  });

  test("Excel export - dates are formatted date cells, and a column with one before 1900-03-01 is ISO text", async () => {
    const since = [new CalendarDate(Date.UTC(1900, 2, 1)), new CalendarDate(Date.UTC(2016, 0, 14))];
    const rows = makeDateRows().map((row, index) => ({ ...row, since: since[index] }));
    const filePath = path.join(outputDir, "dates.xlsx");

    await excelExporter.exportToExcel(rows, filePath);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet("Data");
    const cells = (column) =>
      [2, 3].map((row) => {
        const cell = sheet.getRow(row).getCell(column);
        return [cell.value, cell.numFmt ?? null];
      });

    // Excel can't show 1756-01-01, so the whole column is text
    assert.deepStrictEqual(cells(1), [
      ["1756-01-01", null],
      ["2016-01-14", null],
    ]);
    assert.deepStrictEqual(cells(2), [
      [rows[0].at, "yyyy-mm-dd hh:mm:ss"],
      [rows[1].at, "yyyy-mm-dd hh:mm:ss"],
    ]);
    // exceljs reads a date back as a plain Date
    assert.deepStrictEqual(cells(3), [
      [new Date(since[0].getTime()), "yyyy-mm-dd"],
      [new Date(since[1].getTime()), "yyyy-mm-dd"],
    ]);
    assert.deepStrictEqual(rows[0].day, makeDateRows()[0].day, "The rows should stay as they were");
  });

  test("Typed exports - a QVD's dates and timestamps come out as dates, as an export reads them", async () => {
    const read = async (name, maxRows) => {
      const qvdPath = path.join(__dirname, "..", "test-data", name);
      const result = await new QvdReader().read(qvdPath, maxRows, { dates: true });
      assert.strictEqual(result.error, null);
      return result.data;
    };

    // Timestamps, one field tagged $timestamp and one with no tags
    const taxi = await read("chicago_taxi_rides/chicago_taxi_rides_2016_01.qvd", 100);
    const parquetPath = path.join(outputDir, "taxi.parquet");
    await parquetExporter.exportToParquet(taxi, parquetPath);
    const { rows } = await readParquet(parquetPath);
    const logicalTypes = parquetLogicalTypes(parquetPath);
    assert.strictEqual(logicalTypes.trip_start_timestamp, "TIMESTAMP(isAdjustedToUTC=false, MILLIS)");
    assert.strictEqual(logicalTypes.trip_end_timestamp, "TIMESTAMP(isAdjustedToUTC=false, MILLIS)");
    assert.strictEqual(rows[0].trip_start_timestamp, Date.UTC(2016, 0, 13, 6, 15));

    // Dates from 1756 on, in a field tagged $numeric and $integer
    const stockholm = await read("stockholm_temp/stockholm_temp.qvd", 1000);
    const sqlPath = path.join(outputDir, "stockholm.sql");
    await postgresExporter.exportToPostgres(stockholm, sqlPath, 2, {});
    const lines = fs.readFileSync(sqlPath, "utf8").split("\n");
    assert.ok(lines.includes('  "date" DATE NOT NULL,'), "The column should be a DATE");
    assert.ok(lines[lines.indexOf("VALUES") + 1].startsWith("  ('1756-01-01', "));

    // Excel can't show them, so they are text
    const excelPath = path.join(outputDir, "stockholm.xlsx");
    await excelExporter.exportToExcel(stockholm, excelPath);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelPath);
    assert.strictEqual(workbook.getWorksheet("Data").getRow(2).getCell(1).value, "1756-01-01");

    // Every format with date types reads them so, and none other
    assert.deepStrictEqual(
      DataExporter.getExportFormats()
        .map(({ name }) => name)
        .filter((name) => DataExporter.writesDates(name)),
      ["arrow", "avro", "excel", "parquet", "postgres", "sqlite"]
    );
  });
});
