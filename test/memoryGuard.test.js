const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Import the guard, the reader, the exporters, the profiler and the message handler
let guard;
let toRowObjects;
let readLanes;
let QvdReader;
let DataExporter;
let QvdDataFrame;
let PROFILE_BYTES_PER_VALUE;
let exportReadFailure;
let profileReadFailure;

const root = path.join(__dirname, "..");
const colors = path.join(root, "test-data", "lego", "colors.qvd");
const sets = path.join(root, "test-data", "lego", "sets.qvd");
const inventoryParts = path.join(root, "test-data", "lego", "inventory_parts.qvd");
const stockholm = path.join(root, "test-data", "stockholm_temp", "stockholm_temp.qvd");

/**
 * An error shaped like qvdjs's memory refusal
 * @param {object} context - Context fields besides the reason
 * @returns {Error} The refusal
 */
function memoryRefusal(context) {
  return Object.assign(new Error("Insufficient memory to load file safely."), {
    name: "QvdValidationError",
    context: { reason: "memory", ...context },
  });
}

/**
 * Hold a lane busy until free() is called
 * @param {object} lane - One of the reader's lanes
 * @returns {{free: function(): void, done: Promise<void>}} free ends the hold
 */
function holdLane(lane) {
  let free;
  const done = lane.run(() => new Promise((resolve) => (free = resolve)));
  return { free: () => free(), done };
}

/**
 * Wait for a promise, or report that it is still waiting after a while
 * @param {Promise<any>} promise - The promise
 * @param {number} ms - How long to give it
 * @returns {Promise<string>} "settled" or "waiting"
 */
function settledWithin(promise, ms) {
  return Promise.race([
    promise.then(() => "settled"),
    new Promise((resolve) => setTimeout(() => resolve("waiting"), ms)),
  ]);
}

/**
 * Wait until a condition holds
 * @param {function(): boolean} condition - The condition
 * @param {number} [ms=5000] - How long to wait at most
 * @returns {Promise<void>} Resolves once it holds; rejects if it doesn't in time
 */
async function until(condition, ms = 5000) {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for a condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

suite("Memory Guard Test Suite", () => {
  // Load the modules before running tests
  suiteSetup(async () => {
    // Import the ESM modules
    guard = await import("../src/memoryGuard.mjs");
    ({ toRowObjects, readLanes, default: QvdReader } = await import("../src/qvdReader.mjs"));
    ({ default: DataExporter } = await import("../src/exporters/index.mjs"));
    ({ QvdDataFrame } = await import("qvdjs"));
    ({ PROFILE_BYTES_PER_VALUE } = await import("../src/qvdProfiler.mjs"));
    ({ exportReadFailure, profileReadFailure } = await import("../src/webview/messageHandler.mjs"));
  });

  test("With nothing held and nothing added, qvdjs keeps its own factor", () => {
    assert.strictEqual(guard.memorySafetyFactorFor(0, { bytes: 4e9, factor: 0.8 }, 0), 0.8);
  });

  test("Held rows and what the read adds come off qvdjs's budget", () => {
    // 0.8 of 4 GB, less 1 GB held and 1 GB added, is 1.2 GB: 0.3 of the budget
    const factor = guard.memorySafetyFactorFor(1e9, { bytes: 4e9, factor: 0.8 }, 1e9);
    assert.ok(Math.abs(factor - 0.3) < 1e-12);
  });

  test("A budget used up still gives a factor above zero, which would switch qvdjs's check off", () => {
    const factor = guard.memorySafetyFactorFor(5e9, { bytes: 4e9, factor: 0.8 }, 0);
    assert.ok(factor > 0);
    assert.ok(factor < 1e-5);
  });

  test("qvdjs's own budget is what reads are priced against", async () => {
    const read = await new QvdReader().read(colors, 1);
    read.release();
    const budget = guard.knownBudget();
    // Its default factor, and the heap or container limit it budgets against
    assert.strictEqual(budget.factor, 0.8);
    assert.ok(budget.bytes > 64 * 1024 * 1024);
  });

  test("The costs cover what was measured, with room to spare", () => {
    // Reading every row of the taxi file needed 5.8 bytes per cell beyond qvdjs's estimate
    assert.ok(guard.CONVERSION_BYTES_PER_CELL >= 5.8 * 2);
    // Read rows held up to 25 bytes per cell
    assert.ok(guard.HELD_BYTES_PER_CELL >= 25 * 1.25);
    // A read for dates built a Date of 32 bytes and a map entry of up to 43 per distinct value
    assert.ok(guard.DATE_BYTES_PER_VALUE >= (32 + 43) * 1.25);
    assert.ok(guard.HELD_BYTES_PER_DATE >= 32 * 1.5);
    // Profiling a date field needed 181 bytes per value
    assert.ok(PROFILE_BYTES_PER_VALUE >= 181 * 1.5);
    // An Excel export needed 0.84 per cell in one chunk, and 10.5 per character of the
    // chunks it writes
    const excel = DataExporter.memoryCost("excel");
    assert.ok(excel.bytesPerCell >= 0.84 * 1.5);
    assert.ok(excel.bytesPerTextChar >= 10.5 * 2);
    // A CSV export needed 108 per cell with every row in one chunk, and 1.8 per
    // character of the chunk it writes at a time
    const csv = DataExporter.memoryCost("csv");
    assert.ok(csv.bytesPerCell >= 108 * 1.5);
    assert.ok(csv.bytesPerTextChar >= 1.8 * 2);
    // JSON, YAML and XML needed 19, 222 and 92 per cell in one chunk, and 2.1, at
    // most 4.2 and at most 10.5 per character of the chunks they write
    const json = DataExporter.memoryCost("json");
    assert.ok(json.bytesPerCell >= 19 * 1.5);
    assert.ok(json.bytesPerTextChar >= 2.1 * 2);
    const yamlCost = DataExporter.memoryCost("yaml");
    assert.ok(yamlCost.bytesPerCell >= 222 * 1.5);
    assert.ok(yamlCost.bytesPerTextChar >= 4.2 * 2);
    const xml = DataExporter.memoryCost("xml");
    assert.ok(xml.bytesPerCell >= 92 * 1.5);
    assert.ok(xml.bytesPerTextChar >= 10.5 * 2);
    // PostgreSQL and Qlik inline needed 20 and 9.2 per cell in one chunk, and at most
    // 3.1 and 5.2 per character of the chunks they write
    const postgres = DataExporter.memoryCost("postgres");
    assert.ok(postgres.bytesPerCell >= 20 * 1.5);
    assert.ok(postgres.bytesPerTextChar >= 3.1 * 2);
    const qlik = DataExporter.memoryCost("qlik");
    assert.ok(qlik.bytesPerCell >= 9.2 * 1.5);
    assert.ok(qlik.bytesPerTextChar >= 5.2 * 2);
    // An Arrow export needed nothing measurable per cell or character of a batch, and
    // up to 55 per distinct value of a text column, which its dictionaries hold to the end
    const arrowCost = DataExporter.memoryCost("arrow");
    assert.ok(arrowCost.bytesPerCell >= 0.4 * 1.5);
    assert.ok(arrowCost.bytesPerDistinctText >= 55 * 1.5);
    // Its dictionaries' text took at most 97% of its fields' symbols' bytes
    assert.ok(arrowCost.bytesPerSymbolByte >= 0.97);
    assert.ok(arrowCost.chunkRows > 0 && arrowCost.chunkCells > 0);
    // A SQLite export needed 0.42 per cell on the heap: its database is outside it, where
    // the process's footprint grew by 53 per cell and 14 per character
    const sqliteCost = DataExporter.memoryCost("sqlite");
    assert.ok(sqliteCost.bytesPerCell >= 0.42 * 1.5);
    assert.ok(sqliteCost.outsideHeapBytesPerCell >= 53 * 1.5);
    assert.ok(sqliteCost.outsideHeapBytesPerTextChar >= 14 * 2);
  });

  test("Every export format's exporter declares what it costs", () => {
    for (const { name } of DataExporter.getExportFormats()) {
      const cost = DataExporter.memoryCost(name);
      assert.ok(cost, name);
      assert.ok(Number.isFinite(cost.bytesPerCell) && cost.bytesPerCell >= 0, name);
      assert.ok(Number.isFinite(cost.bytesPerTextChar) && cost.bytesPerTextChar >= 0, name);
      if (cost.chunkRows !== undefined) {
        assert.ok(Number.isInteger(cost.chunkRows) && cost.chunkRows > 0, name);
      }
      if (cost.chunkCells !== undefined) {
        assert.ok(Number.isInteger(cost.chunkCells) && cost.chunkCells > 0 && cost.chunkRows > 0, name);
      }
    }
    assert.deepStrictEqual(DataExporter.leanFormatLabels(), ["Arrow", "Avro", "CSV", "Excel", "JSON", "Parquet", "PostgreSQL", "Qlik Inline Script", "XML", "YAML"]);
  });

  test("A name that isn't a format has no cost, not a function", () => {
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty", "nope", undefined]) {
      assert.strictEqual(DataExporter.memoryCost(name), null);
    }
    assert.strictEqual(DataExporter.memoryCost("excel").bytesPerTextChar, 21);
  });

  test("Booked heap is held until released, once", () => {
    const before = guard.bookedBytes();
    const release = guard.bookHeap(1000);
    assert.strictEqual(guard.bookedBytes(), before + 1000);
    release();
    release();
    assert.strictEqual(guard.bookedBytes(), before);
  });

  test("Work that doesn't fit in the budget left isn't booked", () => {
    const budget = { bytes: 1e9, factor: 0.8 };
    const before = guard.bookedBytes();
    const refused = guard.tryBookHeap(0.9e9, budget);
    assert.strictEqual(refused.release, undefined);
    assert.strictEqual(refused.leftBytes, 0.8e9 - before);
    assert.strictEqual(guard.bookedBytes(), before);

    const booked = guard.tryBookHeap(1000, budget);
    assert.strictEqual(guard.bookedBytes(), before + 1000);
    booked.release();
    assert.strictEqual(guard.bookedBytes(), before);
  });

  test("Held text is priced by what the rows can keep alive", () => {
    // A field of unique 2,000-byte values, and one of three short values
    const fields = [
      { symbols: 1000000, bytes: 2000 * 1000000 },
      { symbols: 3, bytes: 30 },
    ];
    // 100 rows keep at most 100 of the unique values alive, and all three short ones
    const window = guard.heldTextBytes(fields, 100);
    assert.strictEqual(window, 100 * (2000 * 2 + 16) + 3 * (10 * 2 + 16));
    // Every row keeps every value alive
    const all = guard.heldTextBytes(fields, 1000000);
    assert.strictEqual(all, 1000000 * (2000 * 2 + 16) + 3 * (10 * 2 + 16));
    assert.strictEqual(guard.heldTextBytes([{ symbols: 0, bytes: 0 }], 10), 0);
  });

  test("Held text counts only the share of a field's values that is text", () => {
    const fields = [
      { name: "id", symbols: 1000, bytes: 5000 },
      { name: "note", symbols: 1000, bytes: 100000 },
      { name: "mixed", symbols: 1000, bytes: 10000 },
    ];
    const shares = new Map([
      ["id", 0],
      ["note", 1],
      ["mixed", 0.5],
    ]);
    assert.strictEqual(
      guard.heldTextBytes(fields, 1000, shares),
      1000 * (100 * 2 + 16) + 500 * (10 * 2 + 16)
    );
  });

  test("A field's share of text comes from its values, nulls aside", () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      code: i % 2 === 0 ? "A1" : 7,
      empty: null,
    }));
    const shares = guard.textShares(rows, ["id", "name", "code", "empty"]);
    assert.strictEqual(shares.get("id"), 0);
    assert.strictEqual(shares.get("name"), 1);
    assert.ok(Math.abs(shares.get("code") - 0.5) < 0.01);
    assert.strictEqual(shares.get("empty"), 0);
  });

  test("An export is priced by its rows' cells and text", async () => {
    const rows = [
      { id: 1, note: "x".repeat(1000) },
      { id: 2, note: "y".repeat(3000) },
      { id: 3, note: null },
    ];
    const excel = DataExporter.memoryCost("excel");
    assert.deepStrictEqual(await guard.exportHeapBytes(excel, rows, 2), {
      rows: 3,
      bytes: 3 * 2 * excel.bytesPerCell + 4000 * excel.bytesPerTextChar,
    });
    // A row limit prices only the rows exported
    const qlik = DataExporter.memoryCost("qlik");
    assert.deepStrictEqual(await guard.exportHeapBytes(qlik, rows, 2, 1), {
      rows: 1,
      bytes: 2 * qlik.bytesPerCell + 1000 * qlik.bytesPerTextChar,
    });
  });

  test("A CSV export is priced by its largest chunk, as it writes one at a time", async () => {
    const csv = DataExporter.memoryCost("csv");
    const chunk = csv.chunkRows;
    assert.ok(chunk > 0);
    // Two chunks and a row, the second chunk with the most text
    const rows = Array.from({ length: 2 * chunk + 1 }, (_, i) => ({
      id: i,
      note: i >= chunk && i < 2 * chunk ? "x".repeat(10) : "y",
    }));
    assert.deepStrictEqual(await guard.exportHeapBytes(csv, rows, 2), {
      rows: rows.length,
      bytes: chunk * 2 * csv.bytesPerCell + chunk * 10 * csv.bytesPerTextChar,
    });
    // A format that builds its whole output at once has no chunks
    assert.strictEqual(DataExporter.memoryCost("sqlite").chunkRows, undefined);
  });

  test("A chunk of a QVD with many fields has fewer rows, and is priced so", async () => {
    const yamlCost = DataExporter.memoryCost("yaml");
    assert.strictEqual(guard.rowsPerChunk(yamlCost, 2), yamlCost.chunkRows);
    assert.strictEqual(guard.rowsPerChunk(yamlCost, 20), yamlCost.chunkRows);
    assert.strictEqual(guard.rowsPerChunk(yamlCost, 300), Math.floor(yamlCost.chunkCells / 300));
    assert.strictEqual(guard.rowsPerChunk(yamlCost, 10 * yamlCost.chunkCells), 1);
    // Without chunkCells a chunk is chunkRows, whatever the fields
    const csv = DataExporter.memoryCost("csv");
    assert.strictEqual(guard.rowsPerChunk(csv, 300), csv.chunkRows);

    // Two chunks of 300 fields: the second, with text, is priced
    const chunk = guard.rowsPerChunk(yamlCost, 300);
    const fields = Array.from({ length: 300 }, (_, i) => `f${i}`);
    const rows = Array.from({ length: 2 * chunk }, (_, i) =>
      Object.fromEntries(fields.map((field) => [field, i >= chunk && field === "f0" ? "x" : 0]))
    );
    assert.deepStrictEqual(await guard.exportHeapBytes(yamlCost, rows, 300), {
      rows: rows.length,
      bytes: chunk * 300 * yamlCost.bytesPerCell + chunk * yamlCost.bytesPerTextChar,
    });
  });

  test("An export that holds some columns' distinct values is priced for them and their text, as the QVD has them", async () => {
    const arrowCost = DataExporter.memoryCost("arrow");
    const { bytesPerCell, bytesPerTextChar, bytesPerDistinctText, bytesPerSymbolByte } = arrowCost;
    // Five rows, one chunk: code has two distinct texts and note five. blank's numbers
    // with blank text, and at's timestamps, Arrow writes as they are, not as text
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      code: `c${i % 2}`,
      note: `n${i}`,
      blank: i % 2 ? "" : i,
      at: new Date(i),
    }));
    assert.deepStrictEqual(await arrowCost.dictionaryColumns(rows, Object.keys(rows[0])), ["code", "note"]);
    // Objects, as JSON, and numbers next to booleans are text to Arrow too
    assert.deepStrictEqual(
      await arrowCost.dictionaryColumns([{ object: { a: 1 }, mixed: 1 }, { object: null, mixed: true }], ["object", "mixed"]),
      ["object", "mixed"]
    );

    const chunk = 5 * 5 * bytesPerCell + 20 * bytesPerTextChar;
    const fields = new Map([
      ["id", { symbols: 5, bytes: 25 }],
      ["code", { symbols: 2, bytes: 8 }],
      ["note", { symbols: 5, bytes: 20 }],
      ["blank", { symbols: 4, bytes: 20 }],
      ["at", { symbols: 5, bytes: 45 }],
    ]);
    assert.deepStrictEqual(await guard.exportHeapBytes(arrowCost, rows, 5, 0, { fields }), {
      rows: 5,
      bytes: chunk + (2 + 5) * bytesPerDistinctText + (8 + 20) * bytesPerSymbolByte,
    });
    // A field the header doesn't describe counts one value a row, and the rows' text at
    // three bytes a character
    assert.deepStrictEqual(await guard.exportHeapBytes(arrowCost, rows, 5), {
      rows: 5,
      bytes: chunk + (5 + 5) * bytesPerDistinctText + 2 * 3 * 20 * bytesPerSymbolByte,
    });
    // A row limit counts at most one a row exported
    assert.deepStrictEqual(await guard.exportHeapBytes(arrowCost, rows, 5, 3, { fields }), {
      rows: 3,
      bytes: 3 * 5 * bytesPerCell + 12 * bytesPerTextChar + (2 + 3) * bytesPerDistinctText + (8 + 20) * bytesPerSymbolByte,
    });
    // A format that holds no dictionary isn't priced for one
    const csv = DataExporter.memoryCost("csv");
    assert.deepStrictEqual(await guard.exportHeapBytes(csv, rows, 5, 0, { fields }), {
      rows: 5,
      bytes: 5 * 5 * csv.bytesPerCell + 20 * csv.bytesPerTextChar,
    });
  });

  test("A read for an export that holds its text fields' distinct values prices them from the header", async () => {
    // sets.qvd's name is tagged $text: 10,368 distinct values, taking 269,715 bytes
    const header = await new QvdReader().readHeader(sets);
    const name = header.metadata.fields.find((field) => field.name === "name");
    assert.deepStrictEqual([name.noOfSymbols, name.length, name.tags.includes("$text")], [10368, 269715, true]);
    const perValue = await new QvdReader().read(sets, 0, { bytesPerDistinctText: 1e6 });
    assert.strictEqual(perValue.errorReason, "memory");
    assert.strictEqual(perValue.refusal.forCaller, true);
    assert.ok(perValue.refusal.neededBytes >= 10368 * 1e6);
    const perByte = await new QvdReader().read(sets, 0, { bytesPerSymbolByte: 1e5 });
    assert.strictEqual(perByte.errorReason, "memory");
    assert.ok(perByte.refusal.neededBytes >= 269715 * 1e5);
    // set_num, not tagged $text, is text too, but is priced once the rows are read
    const read = await new QvdReader().read(sets, 0, { bytesPerDistinctText: 84, bytesPerSymbolByte: 1 });
    assert.strictEqual(read.error, null);
    read.release();
  });

  test("An export that builds outside the heap is priced for that too, for every row", async () => {
    const sqliteCost = DataExporter.memoryCost("sqlite");
    const rows = [
      { id: 1, note: "x".repeat(1000) },
      { id: 2, note: "y".repeat(3000) },
      { id: 3, note: null },
    ];
    assert.deepStrictEqual(await guard.exportHeapBytes(sqliteCost, rows, 2), {
      rows: 3,
      bytes: 3 * 2 * sqliteCost.bytesPerCell,
      outsideBytes: 3 * 2 * sqliteCost.outsideHeapBytesPerCell + 4000 * sqliteCost.outsideHeapBytesPerTextChar,
    });
    // What is left for it is the computer's memory, less what the extension host uses
    const left = guard.memoryLeftOutsideHeap();
    assert.ok(left > 0 && left < os.totalmem());
    const message = guard.describeExportRefusal("SQLite", 10, 2 ** 30, 2 ** 20, [], { onComputer: true });
    assert.ok(message.endsWith("needs about 1.0 GiB of memory, and about 1 MiB is left on this computer."));
  });

  test("A chunk size that isn't a whole number of 1 or more is refused", () => {
    const json = DataExporter.memoryCost("json");
    assert.strictEqual(guard.rowsPerChunk(json, 20, 3), 3);
    for (const chunkRows of [0, -1, 2.5, NaN, Infinity, "3", null]) {
      assert.throws(() => guard.rowsPerChunk(json, 20, chunkRows), RangeError, String(chunkRows));
    }
  });

  test("Scanning column types lets the event loop run as it looks at the rows", async () => {
    const { scanColumnTypes } = await import("../src/exporters/columnTypes.mjs");
    const rows = Array.from({ length: 300000 }, (_, i) => ({ a: i, b: "x", c: "", d: i % 2 === 0 }));
    let ran = false;
    setImmediate(() => {
      ran = true;
    });
    const scanned = scanColumnTypes(rows, ["a", "b", "c", "d"]);
    assert.strictEqual(ran, false);
    const types = await scanned;
    assert.strictEqual(ran, true);
    assert.strictEqual(types.a.allIntegers, true);
    assert.strictEqual(types.c.hasString, true);
    assert.strictEqual(types.d.hasBoolean, true);
  });

  test("Scanning column types records each date column's earliest time and whether one has milliseconds", async () => {
    const { scanColumnTypes } = await import("../src/exporters/columnTypes.mjs");
    const rows = [
      { a: new Date(Date.UTC(2016, 2, 1)), b: new Date(Date.UTC(1899, 11, 31)), c: 1 },
      { a: new Date(Date.UTC(2016, 2, 1, 0, 0, 0, 250)), b: new Date(Date.UTC(2020, 0, 1)), c: 2 },
    ];
    const types = await scanColumnTypes(rows, ["a", "b", "c"]);
    assert.deepStrictEqual(
      ["a", "b", "c"].map((key) => [types[key].earliestTime, types[key].hasMilliseconds]),
      [
        [Date.UTC(2016, 2, 1), true],
        [Date.UTC(1899, 11, 31), false],
        [Infinity, false],
      ]
    );
  });

  test("Writing chunks refuses a chunk size that would never end or would cut rows", async () => {
    const { writeChunks } = await import("../src/exporters/atomicWrite.mjs");
    const written = [];
    const file = { writeFile: async (text) => written.push(text) };
    await writeChunks(file, 5, 2, (start, end) => `${start}-${end}`);
    assert.deepStrictEqual(written, ["0-2", "2-4", "4-5"]);
    for (const chunkRows of [0, -1, 2.5, NaN]) {
      await assert.rejects(writeChunks(file, 5, chunkRows, () => ""), RangeError, String(chunkRows));
    }
    assert.strictEqual(written.length, 3);
  });

  test("Pricing an export lets the event loop run as it looks at the rows", async () => {
    const rows = Array.from({ length: 300000 }, (_, i) => ({ a: i, b: "x", c: "y", d: i }));
    let ran = false;
    setImmediate(() => {
      ran = true;
    });
    const priced = guard.exportHeapBytes(DataExporter.memoryCost("excel"), rows, 4);
    assert.strictEqual(ran, false);
    await priced;
    assert.strictEqual(ran, true);
  });

  test("A refused export says what it needs and what is left", () => {
    const message = guard.describeExportRefusal("SQLite", 300000, 6.5 * 2 ** 30, 380 * 2 ** 20, ["Avro", "CSV", "Parquet"]);
    assert.ok(message.startsWith(`Exporting ${(300000).toLocaleString()} rows to SQLite needs about 6.5 GiB`));
    assert.ok(message.includes("about 380 MiB is left"));
    assert.ok(message.endsWith(" Avro, CSV and Parquet write as they go, and need much less."));
    assert.ok(guard.describeExportRefusal("SQLite", 10, 2 ** 20, 0, ["CSV"]).endsWith(" CSV writes as it goes, and needs much less."));
    // Every other format, said rather than listed
    const everyOther = guard.describeExportRefusal("SQLite", 10, 2 ** 20, 0, ["Arrow", "CSV"], { everyOther: true });
    assert.ok(everyOther.endsWith(" Every other format writes as it goes, and needs much less."));
    // With nothing to suggest, the message ends with what is left
    assert.ok(guard.describeExportRefusal("CSV", 10, 2 ** 20, 0, []).endsWith("left in what VS Code gives its extensions."));
    // A format isn't suggested for itself
    assert.ok(guard.describeExportRefusal("CSV", 10, 2 ** 20, 0, ["CSV", "Avro"]).endsWith(" Avro writes as it goes, and needs much less."));
  });

  test("Only a refused export that builds its whole file has formats to suggest", () => {
    // One that writes as it goes is offered none: the others need about as much
    assert.deepStrictEqual(DataExporter.leanerFormats("csv"), { labels: [], everyOther: false });
    assert.deepStrictEqual(DataExporter.leanerFormats("json"), { labels: [], everyOther: false });
    // SQLite builds its whole database
    const sqlite = DataExporter.leanerFormats("sqlite");
    assert.deepStrictEqual(sqlite.labels, DataExporter.leanFormatLabels());
    const others = DataExporter.getExportFormats().length - 1;
    assert.strictEqual(sqlite.everyOther, sqlite.labels.length === others);
  });

  test("A refused profile says what it needs, and to profile fewer fields", () => {
    const message = guard.describeProfileRefusal(3, 1975108, 1.6 * 2 ** 30, 900 * 2 ** 20);
    assert.ok(message.startsWith(`Profiling 3 fields over ${(1975108).toLocaleString()} rows needs about 1.6 GiB`));
    assert.ok(message.endsWith("Profile fewer fields at a time."));
    assert.ok(!guard.describeProfileRefusal(1, 10, 2 ** 20, 0).includes("fewer fields"));
  });

  test("A refusal of what the caller builds is told apart from one of the rows", () => {
    // qvdjs's estimate of 1 GB, 3 GB left, the row objects 0.5 GB: the rows fit, and 1.5 GB is left
    const check = { estimate: { heapBytes: 1e9, externalBytes: 4e8 }, budget: { bound: "heap" } };
    assert.deepStrictEqual(
      guard.pricingOfRefusal(check, { leftBytes: 3e9, readBytes: 5e8, callerBytes: 6e9 }),
      { forCaller: true, neededBytes: 6e9, leftBytes: 1.5e9 }
    );
    // With 1 GB left, the rows don't fit either
    assert.strictEqual(
      guard.pricingOfRefusal(check, { leftBytes: 1e9, readBytes: 5e8, callerBytes: 6e9 }).forCaller,
      false
    );
    // A container's limit counts qvdjs's external memory too
    const container = { ...check, budget: { bound: "process" } };
    assert.strictEqual(
      guard.pricingOfRefusal(container, { leftBytes: 1.7e9, readBytes: 5e8, callerBytes: 6e9 }).forCaller,
      false
    );
    // Without a caller's cost, it is the rows
    assert.strictEqual(guard.pricingOfRefusal(check, { leftBytes: 3e9, readBytes: 0, callerBytes: 0 }).forCaller, false);
  });

  test("Export and Profile say what didn't fit, and offer rows only where they can be chosen", () => {
    const refusal = { rows: 1975108, totalRows: 1975108, fitRows: 800000, forCaller: false, neededBytes: 0, leftBytes: 0 };
    const read = exportReadFailure({ error: "x", refusal }, "excel", false);
    assert.ok(read.startsWith("Failed to read QVD for export: Reading all"));
    assert.ok(!read.includes("would fit"));
    assert.ok(exportReadFailure({ error: "x", refusal }, "qlik", true).includes("About 800,000 rows would fit."));
    assert.ok(!profileReadFailure({ error: "x", refusal }, 2).includes("would fit"));

    const forCaller = { ...refusal, forCaller: true, neededBytes: 40 * 2 ** 30, leftBytes: 2 * 2 ** 30 };
    const sqlite = exportReadFailure({ error: "x", refusal: forCaller }, "sqlite", false);
    assert.ok(sqlite.startsWith(`Exporting ${(1975108).toLocaleString()} rows to SQLite needs about 40.0 GiB`));
    // The formats that write as they go are suggested for one that builds its whole file
    const suggested = sqlite.slice(sqlite.indexOf("extensions.") + "extensions.".length);
    assert.ok(suggested.endsWith(" need much less.") || suggested.endsWith(" needs much less."));
    for (const label of DataExporter.leanFormatLabels()) {
      assert.ok(suggested.includes(label) || suggested.includes("Every other format"), label);
    }
    // and none for one that writes as it goes
    assert.ok(
      exportReadFailure({ error: "x", refusal: forCaller }, "csv", false).endsWith("left in what VS Code gives its extensions.")
    );
    assert.ok(profileReadFailure({ error: "x", refusal: forCaller }, 3).startsWith("Profiling 3 fields"));

    // Any other failure keeps the reader's message
    assert.strictEqual(
      exportReadFailure({ error: "ENOENT: no such file", refusal: null }, "csv", false),
      "Failed to read QVD for export: ENOENT: no such file"
    );
  });

  test("A refused read of every row says how many rows would fit", () => {
    const message = guard.describeMemoryRefusal(
      memoryRefusal({ totalRows: 1975108, maxRows: 1975108, recommendedMaxRows: 836950 })
    );
    assert.ok(message.startsWith(`Reading all ${(1975108).toLocaleString()} rows`));
    assert.ok(message.includes(`About ${(836950).toLocaleString()} rows would fit.`));
    assert.ok(!message.includes("max-old-space-size"));
  });

  test("A refused window names the rows asked for", () => {
    const message = guard.describeMemoryRefusal(
      memoryRefusal({ totalRows: 30000000, maxRows: 100000, recommendedMaxRows: 20000 })
    );
    assert.ok(message.startsWith(`Reading ${(100000).toLocaleString()} of this QVD's`));
  });

  test("When no row count fits, none is offered", () => {
    const message = guard.describeMemoryRefusal(
      memoryRefusal({ totalRows: 30000000, maxRows: 5000, recommendedMaxRows: 0 })
    );
    assert.ok(message.includes("It doesn't fit in the memory that is left."));
    assert.ok(!message.includes("would fit"));
  });

  test("Other errors aren't memory refusals", () => {
    assert.strictEqual(guard.describeMemoryRefusal(new Error("ENOENT")), null);
    const option = Object.assign(new Error("maxRows must be a non-negative integer"), {
      name: "QvdValidationError",
      context: { reason: "option" },
    });
    assert.strictEqual(guard.describeMemoryRefusal(option), null);
    assert.strictEqual(guard.describeMemoryRefusal(undefined), null);
  });

  test("Row objects keep every row and field, and let qvdjs's rows go", async () => {
    // Enough rows to span several chunks between yields
    const columns = ["id", "name"];
    const rows = Array.from({ length: 300000 }, (_, i) => [i, `Item ${i}`]);
    const objects = await toRowObjects(rows, columns);

    assert.strictEqual(objects.length, 300000);
    assert.deepStrictEqual(objects[0], { id: 0, name: "Item 0" });
    assert.deepStrictEqual(objects[299999], { id: 299999, name: "Item 299999" });
    assert.ok(rows.every((row) => row === undefined));
  });

  test("Row objects convert numeric text and keep unusual field names", async () => {
    const objects = await toRowObjects([["42", "abc", null]], ["__proto__", "text", "empty"]);

    assert.strictEqual(objects[0].text, "abc");
    assert.strictEqual(objects[0].empty, null);
    // An own property, not the prototype
    assert.ok(Object.prototype.hasOwnProperty.call(objects[0], "__proto__"));
    assert.strictEqual(Object.getOwnPropertyDescriptor(objects[0], "__proto__").value, 42);
  });

  test("A conversion given up stops at the next chunk", async () => {
    const rows = Array.from({ length: 300000 }, (_, i) => [i, `Item ${i}`]);
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(toRowObjects(rows, ["id", "name"], controller.signal), {
      name: "AbortError",
    });
  });

  test("A row limit or cost that isn't a count is refused, not read", async () => {
    const reader = new QvdReader();
    // qvdjs would read a null maxRows as every row
    for (const maxRows of [null, -1, 1.5, "10", NaN]) {
      const result = await reader.read(colors, maxRows);
      assert.strictEqual(result.errorReason, "option", `maxRows ${String(maxRows)}`);
      assert.deepStrictEqual(result.data, []);
    }
    const cost = await reader.read(colors, 10, { bytesPerCell: NaN });
    assert.strictEqual(cost.errorReason, "option");
    const chunk = await reader.read(colors, 10, { chunkRows: 1.5 });
    assert.strictEqual(chunk.errorReason, "option");
  });

  test("A read's rows book their objects and text until released", async () => {
    const header = await QvdDataFrame.readMetadata(colors, { allowedDir: path.dirname(colors) });
    const fields = header.fields.map((field) => ({
      name: field.fieldName,
      symbols: Number(field.noOfSymbols),
      bytes: Number(field.length),
    }));
    const result = await new QvdReader().read(colors, 0);
    assert.strictEqual(result.error, null);

    // Read in one step, so nothing else can change the total in between
    const held = guard.bookedBytes();
    result.release();
    const shares = guard.textShares(result.data, result.columns);
    assert.strictEqual(
      held - guard.bookedBytes(),
      135 * 4 * guard.HELD_BYTES_PER_CELL + guard.heldTextBytes(fields, 135, shares)
    );
    // colors.qvd's id field is numbers, and keeps no text alive
    assert.strictEqual(shares.get("id"), 0);
    assert.ok(guard.heldTextBytes(fields, 135, shares) < guard.heldTextBytes(fields, 135));
  });

  test("A read for dates books the Dates its rows hold", async () => {
    const header = await QvdDataFrame.readMetadata(stockholm, { allowedDir: path.dirname(stockholm) });
    const fields = header.fields.map((field) => ({
      name: field.fieldName,
      symbols: Number(field.noOfSymbols),
      bytes: Number(field.length),
    }));
    const result = await new QvdReader().read(stockholm, 0, { dates: true });
    assert.strictEqual(result.error, null);

    const held = guard.bookedBytes();
    result.release();
    const rows = result.data.length;
    const shares = guard.textShares(result.data, result.columns);
    // One Date for each of the 98,543 days, and no text kept alive for them
    assert.strictEqual(shares.get("date"), 0);
    assert.strictEqual(
      held - guard.bookedBytes(),
      rows * 5 * guard.HELD_BYTES_PER_CELL +
        guard.heldTextBytes(fields, rows, shares) +
        98543 * guard.HELD_BYTES_PER_DATE
    );
  });

  test("A read for dates prices a Date for each value of a field that may hold dates", () => {
    const fields = [
      { symbols: 5000, tags: ["$numeric", "$timestamp"] },
      // Text alone holds no date
      { symbols: 200, tags: ["$ascii", "$text"] },
      { symbols: 30, tags: [] },
    ];
    // At most one Date for each row read
    assert.strictEqual(guard.dateValueBytes(fields, 1000), (1000 + 30) * guard.DATE_BYTES_PER_VALUE);
  });

  test("A read for dates is refused when its Dates don't fit, as the same read without them isn't", async () => {
    const reader = new QvdReader();
    (await reader.read(colors, 1)).release();
    const budget = guard.knownBudget();
    const allowedDir = path.dirname(stockholm);
    const { estimate, budget: checked } = await QvdDataFrame.checkRead(stockholm, { allowedDir, duals: "both" });
    const header = await QvdDataFrame.readMetadata(stockholm, { allowedDir });
    const fields = header.fields.map((field) => ({
      symbols: Number(field.noOfSymbols),
      tags: [].concat(field.tags?.String ?? []),
    }));
    const rows = header.rowCount;
    const datesBytes = guard.dateValueBytes(fields, rows);
    // What the read needs without its Dates, and half of what they add
    const readBytes =
      estimate.heapBytes +
      (checked.bound === "process" ? estimate.externalBytes : 0) +
      rows * 5 * guard.CONVERSION_BYTES_PER_CELL;
    // Rows other tests dropped are released once they are collected, which can happen
    // during the reads and leave them more room: then the reads are done again
    for (let attempt = 1; ; attempt++) {
      const booked = guard.bookedBytes();
      const release = guard.bookHeap(budget.factor * budget.bytes - booked - readBytes - datesBytes / 2);
      let withDates;
      let withoutDates;
      try {
        withDates = await reader.read(stockholm, 0, { dates: true });
        withDates.release();
        withoutDates = await reader.read(stockholm, 0);
        withoutDates.release();
      } finally {
        release();
      }
      if (guard.bookedBytes() === booked || attempt === 3) {
        assert.strictEqual(withDates.errorReason, "memory");
        assert.strictEqual(withoutDates.error, null);
        break;
      }
    }
  });

  test("A read is refused while held rows have booked the heap", async () => {
    const reader = new QvdReader();
    (await reader.read(colors, 1)).release();
    const release = guard.bookHeap(guard.knownBudget().bytes);
    let refused;
    try {
      refused = await reader.read(colors, 10);
    } finally {
      release();
    }
    assert.strictEqual(refused.errorReason, "memory");
    assert.ok(refused.error.includes("needs more memory than VS Code gives its extensions"));
    // The rows themselves didn't fit
    assert.strictEqual(refused.refusal.forCaller, false);

    const read = await reader.read(colors, 10);
    assert.strictEqual(read.data.length, 10);
    assert.strictEqual(read.refusal, null);
    read.release();
  });

  test("A read is refused when what the caller builds won't fit, and says so", async () => {
    const result = await new QvdReader().read(inventoryParts, 0, { bytesPerCell: 1e6 });
    assert.strictEqual(result.errorReason, "memory");
    // The rows fit: what the caller builds from them is what doesn't
    const { refusal } = result;
    assert.strictEqual(refusal.forCaller, true);
    assert.strictEqual(refusal.rows, refusal.totalRows);
    assert.ok(refusal.neededBytes >= refusal.totalRows * 1e6);
    assert.ok(refusal.leftBytes > 0 && refusal.leftBytes < guard.knownBudget().bytes);
    assert.ok(result.error.startsWith("Reading the rows fits, but what is made from them needs about"));
  });

  test("A caller that builds from a few rows at a time is priced for those rows", async () => {
    const reader = new QvdReader();
    // At 1 MB a cell, every row of sets.qvd won't fit, and ten rows at a time do
    const whole = await reader.read(sets, 0, { bytesPerCell: 1e6 });
    assert.strictEqual(whole.errorReason, "memory");
    const chunked = await reader.read(sets, 0, { bytesPerCell: 1e6, chunkRows: 10 });
    assert.strictEqual(chunked.error, null);
    assert.strictEqual(chunked.data.length, chunked.totalRows);
    chunked.release();
  });

  test("A large read waits while the large lane is busy", async () => {
    const reader = new QvdReader();
    const lane = holdLane(readLanes.large);
    let read;
    try {
      // What the caller builds puts this small file's read in the large lane
      read = reader.read(sets, 0, { bytesPerCell: 4096 });
      assert.strictEqual(await settledWithin(read, 300), "waiting");
    } finally {
      lane.free();
    }
    const result = await read;
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.data.length, 11673);
    result.release();
    await lane.done;
  });

  test("A file rewritten while its read waits is priced again", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qvd-viewer-rewritten-"));
    const file = path.join(dir, "rewritten.qvd");
    fs.copyFileSync(colors, file);
    const reader = new QvdReader();
    const lane = holdLane(readLanes.large);
    let read;
    try {
      // Priced for colors.qvd's 540 cells, about a third of the budget goes to the
      // caller's work, which puts the read in the large lane
      const bytesPerCell = Math.floor(guard.knownBudget().bytes / 2000);
      read = reader.read(file, 0, { bytesPerCell });
      await until(() => readLanes.large.size === 2);
      // sets.qvd has far more cells: priced again, the caller's work doesn't fit
      fs.copyFileSync(sets, file);
    } finally {
      lane.free();
    }
    try {
      const result = await read;
      assert.strictEqual(result.errorReason, "memory");
      assert.strictEqual(result.refusal.forCaller, true);
      assert.strictEqual(result.refusal.totalRows, 11673);
    } finally {
      await lane.done;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("A file's row count comes from its header", async () => {
    assert.strictEqual(await new QvdReader().rowCount(sets), 11673);
    await assert.rejects(new QvdReader().rowCount(path.join(root, "test-data", "missing.qvd")));
  });

  test("Work that waits for the large reads starts once they are done", async () => {
    const reader = new QvdReader();
    const lane = holdLane(readLanes.large);
    let waited;
    try {
      waited = reader.afterLargeReads();
      assert.strictEqual(await settledWithin(waited, 100), "waiting");
    } finally {
      lane.free();
    }
    await waited;
    await lane.done;
  });

  test("A small read doesn't wait for the large lane", async () => {
    const reader = new QvdReader();
    const lane = holdLane(readLanes.large);
    try {
      const result = await reader.read(colors, 10);
      assert.strictEqual(result.data.length, 10);
      result.release();
    } finally {
      lane.free();
    }
    await lane.done;
  });

  test("A read whose editor is closed is given up", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await new QvdReader().read(colors, 10, { signal: controller.signal });

    assert.strictEqual(result.errorReason, "aborted");
    assert.deepStrictEqual(result.data, []);
  });

  test("A read waiting for its lane is given up when its editor closes", async () => {
    const reader = new QvdReader();
    const lane = holdLane(readLanes.small);
    try {
      const controller = new AbortController();
      const read = reader.read(colors, 10, { signal: controller.signal });
      // Once it has read its header and joined the lane
      await until(() => readLanes.small.size === 2);
      controller.abort();

      const result = await read;
      assert.strictEqual(result.errorReason, "aborted");
      // Given up while it waited, it leaves the lane at once
      assert.strictEqual(readLanes.small.size, 1);
    } finally {
      lane.free();
    }
    await lane.done;
  });

  test("Reads asked for at once all complete", async () => {
    const reader = new QvdReader();
    const results = await Promise.all([
      reader.read(colors, 10),
      reader.read(colors, 0),
      reader.read(colors, 20),
    ]);

    assert.deepStrictEqual(
      results.map((result) => result.data.length),
      [10, 135, 20]
    );
    assert.ok(results.every((result) => result.error === null && result.errorReason === null));
    results.forEach((result) => result.release());
  });

  test("A failed read says which kind of qvdjs error it was", async () => {
    const reader = new QvdReader();
    const result = await reader.read(path.join(root, "test-data", "misc", "damaged.qvd"), 10);

    assert.strictEqual(result.errorName, "QvdCorruptedError");
    assert.ok(result.error.length > 0);
  });
});
