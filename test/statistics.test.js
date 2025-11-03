const assert = require("assert");

// Import statistics functions
let qvdStatistics;

suite("Statistical Analysis Test Suite", () => {
  // Load the module before running tests
  suiteSetup(async () => {
    // Import the ESM module
    qvdStatistics = await import("../src/qvdStatistics.mjs");
  });

  test("Numeric field detection - pure numeric data", () => {
    const data = [
      { value: "10" },
      { value: "20" },
      { value: "30" },
      { value: "40" },
      { value: "50" },
    ];

    const isNumeric = qvdStatistics.isNumericField(data, "value");
    assert.strictEqual(isNumeric, true, "Should detect numeric field");
  });

  test("Numeric field detection - mixed data", () => {
    const data = [
      { value: "10" },
      { value: "20" },
      { value: "abc" },
      { value: "40" },
      { value: "50" },
    ];

    const isNumeric = qvdStatistics.isNumericField(data, "value");
    assert.strictEqual(
      isNumeric,
      false,
      "Should not detect as numeric with <90% numeric values"
    );
  });

  test("Numeric field detection - with nulls", () => {
    const data = [
      { value: "10" },
      { value: "20" },
      { value: null },
      { value: "40" },
      { value: "50" },
    ];

    const isNumeric = qvdStatistics.isNumericField(data, "value");
    assert.strictEqual(
      isNumeric,
      true,
      "Should detect numeric field ignoring nulls"
    );
  });

  test("Statistics calculation - basic metrics", () => {
    const data = [
      { temp: 10 },
      { temp: 20 },
      { temp: 30 },
      { temp: 40 },
      { temp: 50 },
    ];

    const stats = qvdStatistics.calculateStatistics(data, "temp");

    assert.strictEqual(stats.isNumeric, true);
    assert.strictEqual(stats.descriptive.min, 10);
    assert.strictEqual(stats.descriptive.max, 50);
    assert.strictEqual(stats.descriptive.mean, 30);
    assert.strictEqual(stats.descriptive.median, 30);
    assert.strictEqual(stats.descriptive.sum, 150);
    assert.strictEqual(stats.descriptive.count, 5);
  });

  test("Statistics calculation - spread measures", () => {
    const data = [
      { value: 10 },
      { value: 20 },
      { value: 30 },
      { value: 40 },
      { value: 50 },
    ];

    const stats = qvdStatistics.calculateStatistics(data, "value");

    assert.strictEqual(stats.spread.range, 40);
    assert.ok(
      Math.abs(stats.spread.stdDev - 15.81) < 0.1,
      "Sample standard deviation should be approximately 15.81"
    );
    assert.strictEqual(stats.spread.iqr, 20); // Q3(40) - Q1(20)
  });

  test("Statistics calculation - quartiles", () => {
    const data = [
      { value: 1 },
      { value: 2 },
      { value: 3 },
      { value: 4 },
      { value: 5 },
      { value: 6 },
      { value: 7 },
      { value: 8 },
      { value: 9 },
    ];

    const stats = qvdStatistics.calculateStatistics(data, "value");

    assert.strictEqual(stats.distribution.quartiles.q1, 2.5);
    assert.strictEqual(stats.distribution.quartiles.q2, 5);
    assert.strictEqual(stats.distribution.quartiles.q3, 7.5);
  });

  test("Statistics calculation - outlier detection", () => {
    const data = [
      { value: 10 },
      { value: 12 },
      { value: 14 },
      { value: 16 },
      { value: 18 },
      { value: 20 },
      { value: 100 }, // Outlier
    ];

    const stats = qvdStatistics.calculateStatistics(data, "value");

    assert.ok(
      stats.outliers.count > 0,
      "Should detect outliers"
    );
    assert.ok(
      stats.outliers.values.includes(100),
      "Should include 100 as outlier"
    );
  });

  test("Statistics calculation - with nulls", () => {
    const data = [
      { value: 10 },
      { value: null },
      { value: 20 },
      { value: "" },
      { value: 30 },
    ];

    const stats = qvdStatistics.calculateStatistics(data, "value");

    assert.strictEqual(stats.isNumeric, true);
    assert.strictEqual(stats.descriptive.count, 3);
    assert.strictEqual(stats.quality.nullCount, 2);
    assert.strictEqual(stats.descriptive.mean, 20);
  });

  test("Statistics calculation - single value", () => {
    const data = [{ value: 42 }];

    const stats = qvdStatistics.calculateStatistics(data, "value");

    assert.strictEqual(stats.isNumeric, true);
    assert.strictEqual(stats.descriptive.min, 42);
    assert.strictEqual(stats.descriptive.max, 42);
    assert.strictEqual(stats.descriptive.mean, 42);
    assert.strictEqual(stats.descriptive.median, 42);
  });

  test("Statistics calculation - negative values", () => {
    const data = [
      { temp: -10 },
      { temp: -5 },
      { temp: 0 },
      { temp: 5 },
      { temp: 10 },
    ];

    const stats = qvdStatistics.calculateStatistics(data, "temp");

    assert.strictEqual(stats.isNumeric, true);
    assert.strictEqual(stats.descriptive.min, -10);
    assert.strictEqual(stats.descriptive.max, 10);
    assert.strictEqual(stats.descriptive.mean, 0);
    assert.strictEqual(stats.descriptive.median, 0);
  });

  test("Statistics calculation - decimal values", () => {
    const data = [
      { value: 1.5 },
      { value: 2.5 },
      { value: 3.5 },
      { value: 4.5 },
      { value: 5.5 },
    ];

    const stats = qvdStatistics.calculateStatistics(data, "value");

    assert.strictEqual(stats.isNumeric, true);
    assert.strictEqual(stats.descriptive.min, 1.5);
    assert.strictEqual(stats.descriptive.max, 5.5);
    assert.strictEqual(stats.descriptive.mean, 3.5);
    assert.strictEqual(stats.descriptive.median, 3.5);
  });

  test("Format number - standard values", () => {
    assert.strictEqual(qvdStatistics.formatNumber(1234.567), "1,234.57");
    assert.strictEqual(qvdStatistics.formatNumber(0.001, 3), "0.001");
    assert.strictEqual(qvdStatistics.formatNumber(null), "N/A");
    assert.strictEqual(qvdStatistics.formatNumber(undefined), "N/A");
    assert.strictEqual(qvdStatistics.formatNumber(Infinity), "N/A");
  });

  test("Format number - very small values", () => {
    const result = qvdStatistics.formatNumber(0.00001);
    assert.ok(
      result.includes("e"),
      "Very small numbers should use exponential notation"
    );
  });

  test("Statistics calculation - mode detection", () => {
    const data = [
      { value: 1 },
      { value: 2 },
      { value: 2 },
      { value: 3 },
      { value: 3 },
      { value: 3 },
    ];

    const stats = qvdStatistics.calculateStatistics(data, "value");

    assert.strictEqual(stats.isNumeric, true);
    assert.ok(Array.isArray(stats.descriptive.mode));
    assert.ok(stats.descriptive.mode.includes(3), "Mode should include 3");
  });

  test("Statistics calculation - non-numeric field", () => {
    const data = [
      { name: "Alice" },
      { name: "Bob" },
      { name: "Charlie" },
    ];

    const stats = qvdStatistics.calculateStatistics(data, "name");

    assert.strictEqual(stats.isNumeric, false);
    assert.strictEqual(stats.nonNumericCount, 3);
  });

  test("Statistics calculation - percentiles", () => {
    const data = [];
    for (let i = 1; i <= 100; i++) {
      data.push({ value: i });
    }

    const stats = qvdStatistics.calculateStatistics(data, "value");

    // Check percentiles are in expected range
    assert.ok(
      stats.distribution.percentiles.p10 >= 9 &&
        stats.distribution.percentiles.p10 <= 11,
      "10th percentile should be around 10"
    );
    assert.ok(
      stats.distribution.percentiles.p90 >= 89 &&
        stats.distribution.percentiles.p90 <= 91,
      "90th percentile should be around 90"
    );
  });

  test("Statistics calculation - empty data", () => {
    const data = [];
    const stats = qvdStatistics.calculateStatistics(data, "value");

    assert.strictEqual(stats.isNumeric, false);
    assert.strictEqual(stats.error, "No data available");
  });

  test("Statistics calculation - all nulls", () => {
    const data = [
      { value: null },
      { value: null },
      { value: null },
    ];

    const stats = qvdStatistics.calculateStatistics(data, "value");

    assert.strictEqual(stats.isNumeric, false);
    assert.strictEqual(stats.quality ? stats.quality.nullCount : stats.nullCount, 3);
  });
});
