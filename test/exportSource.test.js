const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const avro = require("avsc");
const JSZip = require("jszip");
const { DatabaseSync } = require("node:sqlite");

let QvdReader;
let QvdDataFrame;
let QvdDual;
let exportSource;
let exportRun;
let columnTypes;
let memoryGuard;
let readQueue;
let arrow;
let exporters;
let dir;
let crafted;

const testData = path.join(__dirname, "..", "test-data");

// Files whose every row the tests read, besides the crafted one
const SMALL_FILES = [
  "lego/colors.qvd",
  "lego/part_categories.qvd",
  "lego/themes.qvd",
  "lego/inventory_sets.qvd",
  "lego/sets.qvd",
  "misc/empty_qvd.qvd",
  "stockholm_temp/stockholm_temp.qvd",
];

/**
 * The serial of a wall clock, as Qlik stores it: days since 1899-12-30
 * @param {number} time - Milliseconds since 1970, of the wall clock in UTC fields
 * @returns {number} The serial
 */
function serialOf(time) {
  return (time - Date.UTC(1899, 11, 30)) / 864e5;
}

/**
 * Rows of awkward values for exports: dates and timestamps, tagged and not, a field of
 * dates that a late value ends, one of dates whose first rows fall at midnight, blanks,
 * nulls, numbers in text and as text, and names that are integers or have dots
 * @param {number} count - Rows
 * @returns {{rows: Array<Array<*>>, columns: Array<string>}} The rows, as qvdjs writes them
 */
function awkwardRows(count) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const day = 43831 + (i % 400);
    const dayText = new Date(Date.UTC(1899, 11, 30) + day * 864e5).toISOString().slice(0, 10);
    const when = day + (i % 96) / 96;
    const whenText = new Date(Date.UTC(1899, 11, 30) + when * 864e5).toISOString().slice(0, 16).replace("T", " ");
    rows.push([
      i % 17 === 0 ? null : i % 13 === 0 ? " " : [1.5, "1.50", 2 ** 53 - 1, 12345678901234568, "0901", -3, 1e21][i % 7],
      i % 19 === 0 ? null : new QvdDual(day, dayText),
      new QvdDual(when, whenText),
      ["Åsa, \"quoted\"", "tab\there", "line\nbreak", "]bracket[", "", "Ölgod|pipe", "semi;colon"][i % 7],
      i % 5,
      i % 3 === 0 ? "" : `x${i % 11}`,
      // Dates, until a value late in the file that isn't one
      i === count - 3 ? "n/a" : new QvdDual(day, dayText),
      // Days for the first rows, then a time of day: the first rows alone hold dates
      new QvdDual(i < 100 ? day : when, i < 100 ? dayText : whenText),
      // A serial in a field Qlik would tag as dates, with a blank
      i % 23 === 0 ? "" : new QvdDual(serialOf(Date.UTC(2021, 4, 1 + (i % 28))), `${1 + (i % 28)}/5/2021`),
    ]);
  }
  return {
    rows,
    columns: ["Amount", "Day", "When", "Text", "2023", "Orders.Region", "Late", "Midnight", "Slashed"],
  };
}

/**
 * Every row a source gives, a chunk at a time, and the chunks' sizes
 * @param {object} source - The source
 * @param {number} chunkRows - Rows a chunk
 * @returns {Promise<{rows: Array<Object>, sizes: Array<number>}>} Them
 */
async function allRows(source, chunkRows) {
  const rows = [];
  const sizes = [];
  for await (const chunk of source.chunks(chunkRows)) {
    rows.push(...chunk);
    sizes.push(chunk.length);
  }
  return { rows, sizes };
}

/**
 * Read a QVD as an export of the given rows reads it
 * @param {string} file - The QVD
 * @param {number} maxRows - Rows, 0 for all
 * @param {boolean} dates - Whether its dates read as Dates
 * @returns {Promise<Array<Object>>} The rows
 */
async function readRows(file, maxRows, dates) {
  const result = await new QvdReader().read(file, maxRows, { dates });
  assert.strictEqual(result.error, null, result.error);
  result.release();
  return result.data;
}

/**
 * A file's text with its "Generated" line, which differs from run to run, set aside
 * @param {string} file - The file
 * @returns {string} Its text
 */
function textOf(file) {
  return fs
    .readFileSync(file, "utf8")
    .replace(/("generated": )"[^"]*"/g, '$1"…"')
    .replace(/^((?:#|--|\/\/)? ?Generated: ).*$/gm, "$1…");
}

/**
 * What an export holds, read back, for formats whose bytes differ from run to run
 * @param {string} format - The format
 * @param {string} file - The file
 * @returns {Promise<*>} Its content
 */
async function contentOf(format, file) {
  if (format === "excel") {
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const entries = {};
    for (const name of Object.keys(zip.files).sort()) {
      entries[name] = (await zip.files[name].async("string")).replace(
        /(<dcterms:(?:created|modified)[^>]*>)[^<]*/g,
        "$1…"
      );
    }
    return entries;
  }
  if (format === "avro") {
    const records = [];
    let schema = null;
    await new Promise((resolve, reject) => {
      avro
        .createFileDecoder(file)
        .on("metadata", (type) => {
          schema = type.schema();
        })
        .on("data", (record) => records.push({ ...record }))
        .on("end", resolve)
        .on("error", reject);
    });
    return { schema, records };
  }
  if (format === "arrow") {
    const table = arrow.tableFromIPC(fs.readFileSync(file));
    return { schema: table.schema.fields.map((field) => `${field.name}: ${field.type}`), rows: table.toArray().map((row) => row.toJSON()) };
  }
  if (format === "sqlite") {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      return {
        schema: db.prepare("SELECT sql FROM sqlite_master").all(),
        rows: db.prepare("SELECT * FROM data").all(),
      };
    } finally {
      db.close();
    }
  }
  if (format === "parquet") {
    return fs.readFileSync(file).toString("base64");
  }
  return textOf(file);
}

suite("Export Source Test Suite", function () {
  this.timeout(120000);

  suiteSetup(async () => {
    ({ default: QvdReader } = await import("../src/qvdReader.mjs"));
    ({ QvdDataFrame, QvdDual } = await import("qvdjs"));
    exportSource = await import("../src/exportSource.mjs");
    exportRun = await import("../src/exportRun.mjs");
    columnTypes = await import("../src/exporters/columnTypes.mjs");
    memoryGuard = await import("../src/memoryGuard.mjs");
    readQueue = await import("../src/readQueue.mjs");
    arrow = await import("apache-arrow");
    exporters = {
      csv: (await import("../src/exporters/csvExporter.mjs")).exportToCSV,
      json: (await import("../src/exporters/jsonExporter.mjs")).exportToJSON,
      xml: (await import("../src/exporters/xmlExporter.mjs")).exportToXML,
      yaml: (await import("../src/exporters/yamlExporter.mjs")).exportToYAML,
      excel: (await import("../src/exporters/excelExporter.mjs")).exportToExcel,
      parquet: (await import("../src/exporters/parquetExporter.mjs")).exportToParquet,
      arrow: (await import("../src/exporters/arrowExporter.mjs")).exportToArrow,
      avro: (await import("../src/exporters/avroExporter.mjs")).exportToAvro,
      sqlite: (await import("../src/exporters/sqliteExporter.mjs")).exportToSQLite,
      postgres: (await import("../src/exporters/postgresExporter.mjs")).exportToPostgres,
      qlik: (await import("../src/exporters/qlikInlineExporter.mjs")).exportToQlikInline,
    };
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "qvd-viewer-export-source-"));
    crafted = path.join(dir, "awkward.qvd");
    const { rows, columns } = awkwardRows(3000);
    await new QvdDataFrame(rows, columns).toQvd(crafted, { allowedDir: dir });
  });

  suiteTeardown(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const files = () => [crafted, ...SMALL_FILES.map((file) => path.join(testData, file))];

  test("A QVD source gives the rows a read gives, a chunk at a time, with and without dates", async () => {
    for (const file of files()) {
      for (const dates of [false, true]) {
        const expected = await readRows(file, 0, dates);
        // Small pages, and an open file opened afresh often, for the crafted file
        const small = file === crafted ? { pageRows: 333, heldBytes: 4096 } : {};
        const source = await exportSource.openQvdSource(file, { dates, ...small });
        try {
          assert.strictEqual(source.length, expected.length, file);
          assert.deepStrictEqual(source.columns, expected.length > 0 ? Object.keys(expected[0]) : source.columns, file);
          const { rows, sizes } = await allRows(source, 1000);
          assert.deepStrictEqual(rows, expected, `${file}, dates: ${dates}`);
          assert.ok(sizes.slice(0, -1).every((size) => size === 1000), `${file}: chunks of 1000 rows but the last`);
        } finally {
          await source.close();
        }
      }
    }
  });

  test("A QVD source's census is what a scan of every row finds", async () => {
    for (const file of files()) {
      for (const dates of [false, true]) {
        const rows = await readRows(file, 0, dates);
        const source = await exportSource.openQvdSource(file, { dates, pageRows: 500 });
        try {
          const keys = rows.length > 0 ? Object.keys(rows[0]) : source.columns;
          assert.deepStrictEqual(
            await source.columnTypes(),
            await columnTypes.scanColumnTypes(rows, keys),
            `${file}, dates: ${dates}`
          );
          assert.strictEqual(
            await source.holdsTimestamps(),
            await exportSource.arraySource(rows).holdsTimestamps(),
            `${file}, dates: ${dates}`
          );
        } finally {
          await source.close();
        }
      }
    }
  });

  test("The crafted file holds what the census is meant to tell apart", async () => {
    const source = await exportSource.openQvdSource(crafted, { dates: true });
    try {
      const types = await source.columnTypes();
      assert.ok(types.Day.hasDate && types.Day.calendarDates, "Day holds dates");
      assert.ok(types.When.hasDate && !types.When.calendarDates, "When holds timestamps");
      assert.ok(!types.Late.hasDate && types.Late.hasString, "a late value ends Late's dates");
      assert.ok(types.Midnight.hasDate && !types.Midnight.calendarDates, "Midnight holds timestamps");
      assert.ok(types.Slashed.hasDate && types.Slashed.blanksAreNull, "Slashed holds dates, its blanks null");
      assert.deepStrictEqual(source.columns.slice(0, 1), ["2023"], "an integer-like name comes first");
      // The first hundred rows of Midnight fall at midnight: dates alone
      const first = source.first(100);
      assert.strictEqual(first.length, 100);
      assert.ok((await first.columnTypes()).Midnight.calendarDates);
    } finally {
      await source.close();
    }
  });

  test("A QVD source of the first rows gives the rows and census of a read of them", async () => {
    for (const count of [1, 99, 100, 101, 2999]) {
      const rows = await readRows(crafted, count, true);
      const source = await exportSource.openQvdSource(crafted, { rows: count, dates: true, pageRows: 64 });
      try {
        assert.deepStrictEqual((await allRows(source, 50)).rows, rows, `${count} rows`);
        assert.deepStrictEqual(await source.columnTypes(), await columnTypes.scanColumnTypes(rows, Object.keys(rows[0])));
        assert.strictEqual(await source.holdsTimestamps(), await exportSource.arraySource(rows).holdsTimestamps());
      } finally {
        await source.close();
      }
    }
  });

  test("Every format writes from a QVD source what it writes from the rows read, chunked or not", async () => {
    const options = {
      csv: (rows) => ({ fields: Object.keys(rows[0]) }),
      postgres: () => ({ createTable: true, tableName: "t" }),
    };
    for (const file of [crafted, path.join(testData, "lego/sets.qvd")]) {
      for (const [format, exporter] of Object.entries(exporters)) {
        // Avro takes only names of letters, digits and underscores, not starting with a
        // digit, and refuses the crafted file's 2023 (#159)
        if (format === "avro" && file === crafted) {
          continue;
        }
        const dates = ["excel", "parquet", "arrow", "avro", "sqlite", "postgres"].includes(format);
        const rows = await readRows(file, 0, dates);
        const extension = format === "excel" ? "xlsx" : format;
        const fromRows = path.join(dir, `rows.${extension}`);
        const fromSource = path.join(dir, `source.${extension}`);
        const extra = options[format]?.(rows) ?? {};
        // Arrow's record batches are its chunks, so both are written in batches of 7 rows
        const oneChunk = format === "arrow" ? 7 : rows.length;
        const call = (data, target, chunkRows) =>
          format === "postgres"
            ? exporter(data, target, 0, { ...extra, chunkRows })
            : format === "qlik"
              ? exporter(data, target, 0, "auto-detect", { chunkRows })
              : exporter(data, target, { ...extra, chunkRows });
        await call(rows, fromRows, oneChunk);
        const source = await exportSource.openQvdSource(file, { dates, pageRows: 1234 });
        try {
          await call(source, fromSource, 7);
        } finally {
          await source.close();
        }
        assert.deepStrictEqual(
          await contentOf(format, fromSource),
          await contentOf(format, fromRows),
          `${path.basename(file)} to ${format}`
        );
      }
    }
  });

  test("Arrow writes the same rows whatever its batches", async () => {
    const rows = await readRows(crafted, 0, true);
    const one = path.join(dir, "one.arrow");
    const many = path.join(dir, "many.arrow");
    await exporters.arrow(rows, one, { chunkRows: rows.length });
    await exporters.arrow(rows, many, { chunkRows: 7 });
    assert.deepStrictEqual(await contentOf("arrow", many), await contentOf("arrow", one));
  });

  test("Parquet and Avro that fail leave the file that was there as it was, and nothing else", async () => {
    const rows = await readRows(path.join(testData, "lego/sets.qvd"), 0, true);
    for (const format of ["parquet", "avro"]) {
      const target = path.join(dir, `kept.${format}`);
      fs.writeFileSync(target, "what was there");
      const failing = {
        ...exportSource.arraySource(rows),
        async *chunks(chunkRows) {
          yield rows.slice(0, chunkRows);
          throw new Error("the source failed");
        },
      };
      const before = fs.readdirSync(dir).sort();
      await assert.rejects(exporters[format](failing, target, { chunkRows: 10 }), /the source failed/);
      assert.strictEqual(fs.readFileSync(target, "utf8"), "what was there", format);
      assert.deepStrictEqual(fs.readdirSync(dir).sort(), before, `${format} leaves no temporary file`);
    }
  });

  test("A file rewritten during an export stops it, and leaves nothing behind", async () => {
    const copy = path.join(dir, "changing.qvd");
    fs.copyFileSync(crafted, copy);
    const target = path.join(dir, "changing.csv");
    let chunks = 0;
    const source = await exportSource.openQvdSource(copy, {
      pageRows: 100,
      heldBytes: 1,
      onChunk: () => {
        if (++chunks === 2) {
          const later = new Date(Date.now() + 60000);
          fs.utimesSync(copy, later, later);
        }
      },
    });
    try {
      await assert.rejects(exporters.csv(source, target, { chunkRows: 100 }), /changed while it was exported/);
    } finally {
      await source.close();
    }
    assert.ok(!fs.existsSync(target));
  });

  /**
   * Dialogs that take the defaults and save to a file
   * @param {string} target - The file
   * @returns {object} The dialogs, as runExport() takes them
   */
  const dialogsTo = (target) => ({
    window: {
      showQuickPick: async (items) => items[0],
      showInputBox: async (input) => input.value,
      showSaveDialog: async () => ({ fsPath: target }),
    },
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
    Uri: { file: (fsPath) => ({ fsPath }) },
  });

  test("An export runs its passes in the lane of large reads, and holds it while it writes", async () => {
    const lane = readQueue.createReadQueue();
    const target = path.join(dir, "lane.parquet");
    const events = [];
    let queued = null;
    const exported = exportRun.runExport({
      filePath: crafted,
      format: "parquet",
      vscode: dialogsTo(target),
      lane,
      pageRows: 500,
      onProgress: ({ pass, rows }) => {
        if (pass === "rows" && rows === 0 && !queued) {
          queued = lane.run(async () => events.push(fs.existsSync(target) ? "after the export" : "during the export"));
        }
      },
    });
    assert.strictEqual(await exported, target);
    await queued;
    // A read queued while the export writes runs once its file is written, not before
    assert.deepStrictEqual(events, ["after the export"]);
  });

  test("An export that won't fit is refused before anything is written, and books nothing", async () => {
    const target = path.join(dir, "refused.csv");
    const budget = memoryGuard.knownBudget();
    const booked = memoryGuard.bookedBytes();
    memoryGuard.rememberBudget({ bytes: 1024 * 1024, factor: 1 });
    try {
      await assert.rejects(
        exportRun.runExport({ filePath: crafted, format: "csv", vscode: dialogsTo(target) }),
        /Exporting 3,000 rows to CSV needs about .* of memory, and about 1 MiB is left/
      );
    } finally {
      memoryGuard.rememberBudget(budget);
    }
    assert.ok(!fs.existsSync(target));
    assert.strictEqual(memoryGuard.bookedBytes(), booked);
  });

  test("A chunk that takes more than was booked books more, and lets it all go at the end", async () => {
    const heap = exportRun.exportHeapOf({
      cost: { bytesPerCell: 10, bytesPerTextChar: 2, chunkRows: 100 },
      fields: [{ name: "a", symbols: 10, bytes: 100 }],
      rows: 1000,
    });
    assert.strictEqual(heap.chunkRows, 100);
    assert.strictEqual(heap.estimatedChars, 1000);
    assert.ok(heap.chunkBytes(100, 5000) > heap.chunkBytes(100, 1000));

    const booked = memoryGuard.bookedBytes();
    const target = path.join(dir, "booked.json");
    let most = 0;
    const saved = await exportRun.runExport({
      filePath: crafted,
      format: "json",
      vscode: dialogsTo(target),
      onProgress: () => {
        most = Math.max(most, memoryGuard.bookedBytes() - booked);
      },
    });
    assert.strictEqual(saved, target);
    assert.ok(most > 0, "the export booked heap while it ran");
    assert.strictEqual(memoryGuard.bookedBytes(), booked);
  });
});
