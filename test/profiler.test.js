const assert = require("assert");
const path = require("path");

let QvdReader;
let qvdProfiler;
let qvdStatistics;

const testData = path.join(__dirname, "..", "test-data");

/**
 * Build rows of one field, holding each value the given number of times, in order
 * @param {Array<[*, number]>} counts - Each value and how many rows hold it
 * @returns {Array<Object>} Array of row objects
 */
function makeFieldRows(counts) {
  return counts.flatMap(([value, count]) => Array.from({ length: count }, () => ({ field: value })));
}

/**
 * Read every row of a QVD in the test data, with its header
 * @param {string} name - File path within test-data
 * @returns {Promise<{data: Array<Object>, metadata: object}>} The rows and the header
 */
async function readTestData(name) {
  const result = await new QvdReader().read(path.join(testData, name), 0);
  assert.strictEqual(result.error, null);
  return result;
}

suite("Profiler Test Suite", () => {
  suiteSetup(async () => {
    QvdReader = await require("../src/qvdReader.cjs");
    qvdProfiler = await import("../src/qvdProfiler.mjs");
    qvdStatistics = await import("../src/qvdStatistics.mjs");
  });

  suite("Distinct values (#157)", () => {
    test("Every distinct value is counted, past the values the distribution shows", () => {
      // 2,000 values, each in 50 rows, interleaved
      const data = Array.from({ length: 100000 }, (_, i) => ({ field: `v${i % 2000}` }));

      const [field] = qvdProfiler.profileFields(data, ["field"], 1000).fields;

      assert.strictEqual(field.uniqueValues, 2000);
      assert.strictEqual(field.truncated, true);
      assert.strictEqual(field.distributions.length, 1000);
      assert.ok(field.distributions.every((entry) => entry.count === 50));
      assert.strictEqual(field.qualityMetrics.cardinality.level, "Low");
      assert.strictEqual(field.qualityMetrics.cardinality.ratio, 0.02);
      assert.strictEqual(field.qualityMetrics.distribution.evennessScore.toFixed(3), "1.000");
    });

    test("The distribution shows the most frequent values, not the first ones", () => {
      // 1,000 values once each, then one value in most rows
      const data = makeFieldRows([
        ...Array.from({ length: 1000 }, (_, i) => [`once${i}`, 1]),
        ["UNKNOWN", 50000],
      ]);

      const [field] = qvdProfiler.profileFields(data, ["field"], 1000).fields;

      assert.strictEqual(field.uniqueValues, 1001);
      assert.deepStrictEqual(field.distributions[0], { value: "UNKNOWN", count: 50000, percentage: "98.04" });
      assert.strictEqual(field.distributions.length, 1000);
      // Values as frequent keep the order they first occur in
      assert.strictEqual(field.distributions[1].value, "once0");
      assert.strictEqual(field.distributions[999].value, "once998");
      assert.strictEqual(field.qualityMetrics.uniqueness.topDuplicates[0].value, "UNKNOWN");
    });

    test("Unique values match the file's distinct values in lego/sets.qvd", async () => {
      const { data, metadata } = await readTestData("lego/sets.qvd");
      const fieldNames = metadata.fields.map((field) => field.name);

      const results = qvdProfiler.profileFields(data, fieldNames).fields;

      // Its fields hold neither nulls nor empty text, so each symbol is one value
      assert.deepStrictEqual(
        results.map((result) => [result.fieldName, result.uniqueValues]),
        metadata.fields.map((header) => [header.name, header.noOfSymbols])
      );
    });
  });

  suite("Modes", () => {
    test("At most MAX_MODES modes are listed, the smallest, with how many there are", () => {
      const count = qvdStatistics.MAX_MODES * 3;
      // Every value twice, largest first
      const data = Array.from({ length: count * 2 }, (_, i) => ({ v: count - (i % count) }));

      const stats = qvdStatistics.calculateStatistics(data, "v");

      assert.strictEqual(stats.descriptive.modeCount, count);
      assert.strictEqual(stats.descriptive.mode.length, qvdStatistics.MAX_MODES);
      assert.deepStrictEqual(
        stats.descriptive.mode,
        Array.from({ length: qvdStatistics.MAX_MODES }, (_, i) => i + 1)
      );
    });

    test("A field with no repeated value has no mode, and counts none", () => {
      const data = Array.from({ length: 10 }, (_, i) => ({ v: i }));

      const stats = qvdStatistics.calculateStatistics(data, "v");

      assert.deepStrictEqual(stats.descriptive.mode, []);
      assert.strictEqual(stats.descriptive.modeCount, 0);
    });
  });
});
