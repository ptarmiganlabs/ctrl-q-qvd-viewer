const assert = require("assert");
const path = require("path");

// Import the guard, the reader and the exporters
let guard;
let toRowObjects;
let readLanes;
let QvdReader;
let DataExporter;
let QvdDataFrame;

const root = path.join(__dirname, "..");
const colors = path.join(root, "test-data", "lego", "colors.qvd");
const sets = path.join(root, "test-data", "lego", "sets.qvd");
const inventoryParts = path.join(root, "test-data", "lego", "inventory_parts.qvd");

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

suite("Memory Guard Test Suite", () => {
  // Load the modules before running tests
  suiteSetup(async () => {
    // Import the ESM modules
    guard = await import("../src/memoryGuard.mjs");
    ({ toRowObjects, readLanes, default: QvdReader } = await import("../src/qvdReader.mjs"));
    ({ default: DataExporter } = await import("../src/exporters/index.mjs"));
    ({ QvdDataFrame } = await import("qvdjs"));
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
    // Profiling a date field needed 181 bytes per value, an Excel export 730 per cell and 2.3 per character
    assert.ok(guard.PROFILE_BYTES_PER_VALUE >= 181 * 1.5);
    assert.ok(guard.EXPORT_BYTES_PER_CELL.excel >= 730 * 1.5);
    assert.ok(guard.EXPORT_BYTES_PER_TEXT_CHAR.excel >= 2.3 * 2);
  });

  test("Every export format has a cost per cell and per character", () => {
    const formats = DataExporter.getExportFormats().map((format) => format.name).sort();
    for (const table of [guard.EXPORT_BYTES_PER_CELL, guard.EXPORT_BYTES_PER_TEXT_CHAR]) {
      assert.deepStrictEqual(Object.keys(table).sort(), formats);
      for (const bytes of Object.values(table)) {
        assert.ok(Number.isFinite(bytes) && bytes >= 0);
      }
    }
  });

  test("A name that isn't a format costs nothing, not a function", () => {
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty", "nope"]) {
      assert.strictEqual(guard.exportCost(guard.EXPORT_BYTES_PER_CELL, name), 0);
    }
    assert.strictEqual(guard.exportCost(guard.EXPORT_BYTES_PER_CELL, "excel"), 1100);
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

  test("An export is priced by its rows' cells and text", () => {
    const rows = [
      { id: 1, note: "x".repeat(1000) },
      { id: 2, note: "y".repeat(3000) },
      { id: 3, note: null },
    ];
    const all = guard.exportHeapBytes("excel", rows, 2);
    assert.deepStrictEqual(all, {
      rows: 3,
      bytes: 3 * 2 * guard.EXPORT_BYTES_PER_CELL.excel + 4000 * guard.EXPORT_BYTES_PER_TEXT_CHAR.excel,
    });
    // A row limit prices only the rows exported
    const first = guard.exportHeapBytes("qlik", rows, 2, 1);
    assert.deepStrictEqual(first, {
      rows: 1,
      bytes: 2 * guard.EXPORT_BYTES_PER_CELL.qlik + 1000 * guard.EXPORT_BYTES_PER_TEXT_CHAR.qlik,
    });
  });

  test("A refused export says what it needs and what is left", () => {
    const message = guard.describeExportRefusal("Excel", 300000, 6.5 * 2 ** 30, 380 * 2 ** 20);
    assert.ok(message.startsWith(`Exporting ${(300000).toLocaleString()} rows to Excel needs about 6.5 GiB`));
    assert.ok(message.includes("about 380 MiB is left"));
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
  });

  test("A read's rows book their objects and text until released", async () => {
    const header = await QvdDataFrame.readMetadata(colors, { allowedDir: path.dirname(colors) });
    const fields = header.fields.map((field) => ({
      symbols: Number(field.noOfSymbols),
      bytes: Number(field.length),
    }));
    const result = await new QvdReader().read(colors, 0);
    assert.strictEqual(result.error, null);

    // Read in one step, so nothing else can change the total in between
    const held = guard.bookedBytes();
    result.release();
    assert.strictEqual(
      held - guard.bookedBytes(),
      135 * 4 * guard.HELD_BYTES_PER_CELL + guard.heldTextBytes(fields, 135)
    );
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

    const read = await reader.read(colors, 10);
    assert.strictEqual(read.data.length, 10);
    read.release();
  });

  test("A read is refused when what the caller builds won't fit", async () => {
    const result = await new QvdReader().read(inventoryParts, 0, { bytesPerCell: 1e6 });
    assert.strictEqual(result.errorReason, "memory");
  });

  test("A large read waits while the large lane is busy", async () => {
    const reader = new QvdReader();
    const lane = holdLane(readLanes.large);
    // What the caller builds puts this small file's read in the large lane
    const read = reader.read(sets, 0, { bytesPerCell: 4096 });

    assert.strictEqual(await settledWithin(read, 300), "waiting");
    lane.free();
    const result = await read;
    assert.strictEqual(result.error, null);
    assert.strictEqual(result.data.length, 11673);
    result.release();
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
    const controller = new AbortController();
    const read = reader.read(colors, 10, { signal: controller.signal });
    // Let it read its header and join the lane
    await new Promise((resolve) => setTimeout(resolve, 50));
    controller.abort();

    const result = await read;
    assert.strictEqual(result.errorReason, "aborted");
    lane.free();
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
