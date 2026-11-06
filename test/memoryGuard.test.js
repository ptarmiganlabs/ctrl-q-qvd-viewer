const assert = require("assert");
const path = require("path");

// Import the guard and the reader
let guard;
let toRowObjects;
let QvdReader;

const root = path.join(__dirname, "..");

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
  });

  test("A read of every row leaves room in qvdjs's budget for the row objects", () => {
    assert.strictEqual(
      guard.memorySafetyFactorFor(0),
      guard.QVDJS_SAFETY_FACTOR / guard.ROW_OBJECT_OVERHEAD
    );
    assert.ok(guard.memorySafetyFactorFor(0) < guard.QVDJS_SAFETY_FACTOR);
  });

  test("A window of rows keeps qvdjs's own factor", () => {
    assert.strictEqual(guard.memorySafetyFactorFor(5000), undefined);
    assert.strictEqual(guard.memorySafetyFactorFor(100000), undefined);
  });

  test("The overhead is well above what reading every row was measured to need", () => {
    // qvdjs approves a read of every row when heap / estimate reaches this
    const approvedAt = guard.ROW_OBJECT_OVERHEAD / guard.QVDJS_SAFETY_FACTOR;
    // chicago_taxi_rides_2016_03.qvd needed 1.48 times qvdjs's estimate, the most of the test files
    assert.ok(approvedAt >= 1.48 * 1.5);
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

  test("When the symbols alone don't fit, no row count is offered", () => {
    const message = guard.describeMemoryRefusal(
      memoryRefusal({ totalRows: 30000000, maxRows: 5000, recommendedMaxRows: 0 })
    );
    assert.ok(message.includes("fewer rows won't help"));
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

  test("Reads asked for at once all complete, one after another", async () => {
    const reader = new QvdReader();
    const filePath = path.join(root, "test-data", "lego", "colors.qvd");
    const results = await Promise.all([
      reader.read(filePath, 10),
      reader.read(filePath, 0),
      reader.read(filePath, 20),
    ]);

    assert.deepStrictEqual(
      results.map((result) => result.data.length),
      [10, 135, 20]
    );
    assert.ok(results.every((result) => result.error === null && result.errorReason === null));
  });

  test("A failed read says which kind of qvdjs error it was", async () => {
    const reader = new QvdReader();
    const result = await reader.read(path.join(root, "test-data", "misc", "damaged.qvd"), 10);

    assert.strictEqual(result.errorName, "QvdCorruptedError");
    assert.ok(result.error.length > 0);
  });
});
