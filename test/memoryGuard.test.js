const assert = require("assert");
const path = require("path");

// Import the guard, the reader and the exporters
let guard;
let toRowObjects;
let QvdReader;
let DataExporter;

const root = path.join(__dirname, "..");
const colors = path.join(root, "test-data", "lego", "colors.qvd");
const sets = path.join(root, "test-data", "lego", "sets.qvd");
const inventoryParts = path.join(root, "test-data", "lego", "inventory_parts.qvd");
const taxi = path.join(root, "test-data", "chicago_taxi_rides", "chicago_taxi_rides_2016_03.qvd");

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

suite("Memory Guard Test Suite", () => {
  // Load the modules before running tests
  suiteSetup(async () => {
    // Import the ESM modules
    guard = await import("../src/memoryGuard.mjs");
    ({ toRowObjects, default: QvdReader } = await import("../src/qvdReader.mjs"));
    ({ default: DataExporter } = await import("../src/exporters/index.mjs"));
  });

  test("With nothing held and nothing added, qvdjs keeps its own factor", () => {
    assert.strictEqual(
      guard.memorySafetyFactorFor(0, { booked: 0, usable: 4e9 }),
      guard.QVDJS_SAFETY_FACTOR
    );
  });

  test("Held rows and what the read adds come off qvdjs's budget", () => {
    // 0.8 of 4 GB, less 1 GB held and 1 GB added, is 1.2 GB: 0.3 of the heap
    const factor = guard.memorySafetyFactorFor(1e9, { booked: 1e9, usable: 4e9 });
    assert.ok(Math.abs(factor - 0.3) < 1e-12);
  });

  test("A budget used up still gives a factor above zero, which would switch qvdjs's check off", () => {
    const factor = guard.memorySafetyFactorFor(5e9, { booked: 0, usable: 4e9 });
    assert.ok(factor > 0);
    assert.ok(factor < 1e-5);
  });

  test("The costs cover what was measured, with room to spare", () => {
    // Reading every row of the taxi file needed 5.8 bytes per cell beyond qvdjs's estimate
    assert.ok(guard.CONVERSION_BYTES_PER_CELL >= 5.8 * 2);
    // Read rows held up to 25 bytes per cell
    assert.ok(guard.HELD_BYTES_PER_CELL >= 25 * 1.25);
    // Profiling a date field needed 181 bytes per value, and an Excel export 730 per cell
    assert.ok(guard.PROFILE_BYTES_PER_VALUE >= 181 * 1.5);
    assert.ok(guard.EXPORT_BYTES_PER_CELL.excel >= 730 * 1.5);
  });

  test("Every export format has a cost", () => {
    const formats = DataExporter.getExportFormats().map((format) => format.name).sort();
    assert.deepStrictEqual(Object.keys(guard.EXPORT_BYTES_PER_CELL).sort(), formats);
    for (const bytes of Object.values(guard.EXPORT_BYTES_PER_CELL)) {
      assert.ok(Number.isFinite(bytes) && bytes >= 0);
    }
  });

  test("Booked heap is held until released, once", () => {
    const before = guard.bookedBytes();
    const release = guard.bookHeap(1000);
    assert.strictEqual(guard.bookedBytes(), before + 1000);
    release();
    release();
    assert.strictEqual(guard.bookedBytes(), before);
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

  test("A read's rows book heap until released", async () => {
    const result = await new QvdReader().read(colors, 0);
    assert.strictEqual(result.error, null);

    // Read in one step, so nothing else can change the total in between
    const held = guard.bookedBytes();
    result.release();
    assert.strictEqual(held - guard.bookedBytes(), 135 * 4 * guard.HELD_BYTES_PER_CELL);
  });

  test("A read is refused while held rows have booked the heap", async () => {
    const reader = new QvdReader();
    const release = guard.bookHeap(guard.usableHeapBytes());
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

  test("Large reads run one at a time", async () => {
    const reader = new QvdReader();
    const finished = [];
    // Both take the large lane: what the caller builds puts sets.qvd's read in it.
    // The second starts once the first has read its header and joined the queue.
    const slow = reader.read(inventoryParts, 0).then((result) => {
      finished.push("inventory_parts");
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const fast = reader.read(sets, 0, { bytesPerCell: 4096 }).then((result) => {
      finished.push("sets");
      return result;
    });
    const results = await Promise.all([slow, fast]);

    assert.deepStrictEqual(finished, ["inventory_parts", "sets"]);
    assert.ok(results.every((result) => result.error === null));
    results.forEach((result) => result.release());
  });

  test("A small read doesn't wait for a large one", async () => {
    const reader = new QvdReader();
    const finished = [];
    // The large read is long enough to outlast the small one even though they
    // share the event loop: about 3.3 s against 0.9 s, measured in Node
    const large = reader.read(taxi, 0).then((result) => {
      finished.push("large");
      return result;
    });
    // Once the large read has joined its queue, as in the test above
    await new Promise((resolve) => setTimeout(resolve, 50));
    const small = reader.read(colors, 10).then((result) => {
      finished.push("small");
      return result;
    });
    const results = await Promise.all([large, small]);

    assert.ok(results.every((result) => result.error === null));
    assert.deepStrictEqual(finished, ["small", "large"]);
    results.forEach((result) => result.release());
  });

  test("A read whose editor is closed is given up", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await new QvdReader().read(colors, 10, { signal: controller.signal });

    assert.strictEqual(result.errorReason, "aborted");
    assert.deepStrictEqual(result.data, []);
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
