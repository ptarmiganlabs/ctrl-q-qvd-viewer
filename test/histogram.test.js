const assert = require("assert");

// Import the profiling modules
let qvdStatistics;
let qvdProfiler;

/**
 * Build a sorted list of values, each repeated the given number of times
 * @param {Array<[number, number]>} pairs - Value and repeat count pairs, in ascending order of value
 * @returns {number[]} The values in ascending order
 */
function repeated(pairs) {
  return pairs.flatMap(([value, count]) => Array(count).fill(value));
}

/**
 * Add up a histogram's bin counts
 * @param {{counts: number[]}} histogram - Histogram to add up
 * @returns {number} Values in all bins
 */
function binTotal(histogram) {
  return histogram.counts.reduce((sum, count) => sum + count, 0);
}

suite("Histogram Test Suite", () => {
  // Load the modules before running tests
  suiteSetup(async () => {
    // Import the ESM modules
    qvdStatistics = await import("../src/qvdStatistics.mjs");
    qvdProfiler = await import("../src/qvdProfiler.mjs");
  });

  test("Negative bounds - every bin has a From and a To", () => {
    const histogram = qvdStatistics.calculateHistogram(
      repeated([
        [-999, 7],
        [-50.5, 18],
        [0, 100],
        [28.3, 75],
      ]),
      200
    );

    // 15 bins of width 68.49, so one decimal
    assert.strictEqual(histogram.rows.length, 15);
    assert.deepStrictEqual(histogram.rows[0], {
      from: "-999.0",
      to: "-930.5",
      count: 7,
      percentage: "3.50",
    });
    assert.strictEqual(histogram.rows[14].to, "28.3");
    assert.ok(histogram.rows.every((row) => row.from !== "" && row.to !== ""));
    assert.strictEqual(histogram.labels[0], "-999.0 – -930.5");
    assert.strictEqual(binTotal(histogram), 200);
  });

  test("Narrow range - bin edges keep enough decimals to differ", () => {
    // 0.00 to 0.30, 13 rows each: 403 values in 20 bins of 0.015
    const values = [];
    for (let i = 0; i <= 30; i++) {
      values.push(...Array(13).fill(i / 100));
    }
    const histogram = qvdStatistics.calculateHistogram(values, values.length);

    assert.strictEqual(histogram.rows.length, 20);
    assert.strictEqual(histogram.rows[0].from, "0.000");
    assert.strictEqual(histogram.rows[0].to, "0.015");
    assert.strictEqual(histogram.rows[19].to, "0.300");
    assert.strictEqual(new Set(histogram.rows.map((row) => row.from)).size, 20);
  });

  test("One distinct value - a single bin showing the value", () => {
    assert.deepStrictEqual(
      qvdStatistics.calculateHistogram(Array(400).fill(5), 400),
      {
        labels: ["5"],
        counts: [400],
        rows: [{ from: "5", to: "5", count: 400, percentage: "100.00" }],
      }
    );

    // Not rounded to one decimal
    const small = qvdStatistics.calculateHistogram([0.005, 0.005], 2);
    assert.deepStrictEqual(small.labels, ["0.005"]);
  });

  test("Percentages are shares of the rows with a value", () => {
    // 4 numeric values among 8 rows with a value
    const histogram = qvdStatistics.calculateHistogram([1, 2, 3, 4], 8);
    assert.deepStrictEqual(
      histogram.rows.map((row) => row.percentage),
      ["25.00", "25.00"]
    );

    // A total that is not a number gives 0% rather than an error
    const noTotal = qvdStatistics.calculateHistogram([1, 2, 3, 4], NaN);
    assert.ok(noTotal.rows.every((row) => row.percentage === "0.00"));

    assert.strictEqual(qvdStatistics.calculateHistogram([], 0), null);
  });

  test("Text and infinite values are left out of the bins", () => {
    // 95 numbers and 5 other values: still a numeric field
    const data = [
      ...Array(50).fill({ v: 10 }),
      ...Array(45).fill({ v: 20 }),
      { v: "1,250.00" },
      { v: "2023-01-05" },
      { v: "12 kg" },
      { v: Infinity },
      { v: -Infinity },
    ];
    const stats = qvdStatistics.calculateStatistics(data, "v");

    assert.strictEqual(stats.isNumeric, true);
    const { histogram } = stats;
    assert.strictEqual(histogram.rows[0].from, "10.0");
    assert.strictEqual(histogram.rows.at(-1).to, "20.0");
    assert.strictEqual(binTotal(histogram), 95);
    assert.strictEqual(histogram.counts[0], 50);
    assert.strictEqual(histogram.counts.at(-1), 45);
    assert.strictEqual(histogram.rows[0].percentage, "50.00");
  });

  test("Bins cover every row when the distribution is truncated", () => {
    // 2,000 distinct values, more than the profiler keeps in its distribution
    const data = Array.from({ length: 2000 }, (_, i) => ({ v: i + 1 }));
    const [field] = qvdProfiler.profileFields(data, ["v"], 1000).fields;

    assert.strictEqual(field.truncated, true);
    assert.strictEqual(field.distributions.length, 1000);
    const { histogram } = field.statistics;
    assert.strictEqual(histogram.rows[0].from, "1.0");
    assert.strictEqual(histogram.rows.at(-1).to, "2000.0");
    assert.strictEqual(binTotal(histogram), 2000);
  });
});
