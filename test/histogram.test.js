const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");
const { buildOptions } = require("../esbuild.js");

// Import the histogram module
let computeHistogram;
let outputDir;

/**
 * Build a distribution with each value held by the given number of rows
 * @param {Array<[*, number]>} pairs - Value and row count pairs
 * @returns {Array<{value: *, count: number}>} Distribution as the profiler returns it
 */
function distribution(pairs) {
  return pairs.map(([value, count]) => ({ value, count }));
}

/**
 * Turn a function's source text back into a function, as the webviews do
 * when the templates inline it
 * @param {Function} fn - Function to recreate
 * @returns {Function} The function, built from its source text alone
 */
function fromSourceText(fn) {
  return new Function(`return (${fn.toString()});`)();
}

suite("Histogram Test Suite", () => {
  // Load the module and create an output directory before running tests
  suiteSetup(async () => {
    // Import the ESM module
    ({ computeHistogram } = await import("../src/webview/histogram.mjs"));
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "qvd-viewer-histogram-"));
  });

  suiteTeardown(() => {
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  test("Negative bounds - every bin has a From and a To", () => {
    const histogram = computeHistogram(
      distribution([
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
    assert.strictEqual(
      histogram.counts.reduce((sum, count) => sum + count, 0),
      200
    );
  });

  test("Narrow range - bin edges keep enough decimals to differ", () => {
    // 0.00 to 0.30 in 20 bins of 0.015
    const values = Array.from({ length: 31 }, (_, i) => [(i / 100).toFixed(2), 1]);
    const histogram = computeHistogram(distribution(values), 400);

    assert.strictEqual(histogram.rows.length, 20);
    assert.strictEqual(histogram.rows[0].from, "0.000");
    assert.strictEqual(histogram.rows[0].to, "0.015");
    assert.strictEqual(histogram.rows[19].to, "0.300");
    assert.strictEqual(new Set(histogram.rows.map((row) => row.from)).size, 20);
  });

  test("One distinct value - zero-width bins hold every row in the first", () => {
    const histogram = computeHistogram(distribution([[5, 10]]), 10);

    assert.deepStrictEqual(histogram.counts, [10, 0, 0, 0]);
    assert.ok(histogram.rows.every((row) => row.from === "5.0" && row.to === "5.0"));
  });

  test("Values that are not numbers are left out", () => {
    const histogram = computeHistogram(
      distribution([
        ["abc", 3],
        ["10", 2],
        ["20", 2],
      ]),
      7
    );
    assert.strictEqual(
      histogram.counts.reduce((sum, count) => sum + count, 0),
      4
    );

    assert.strictEqual(computeHistogram(distribution([["abc", 3]]), 3), null);
  });

  test("Runs from its source text, as the webviews inline it", () => {
    const values = distribution([
      [-999, 7],
      [0, 100],
      [28.3, 75],
    ]);
    assert.deepStrictEqual(
      fromSourceText(computeHistogram)(values, 182),
      computeHistogram(values, 182)
    );
  });

  test("Runs from its source text once minified by the extension build", async () => {
    const outfile = path.join(outputDir, "histogram.js");
    await esbuild.build({
      ...buildOptions,
      entryPoints: [path.join(__dirname, "..", "src", "webview", "histogram.mjs")],
      outfile,
      minify: true,
      sourcemap: false,
      logLevel: "silent",
      plugins: [],
    });
    const minified = require(outfile).computeHistogram;

    // Minification renamed the local variables
    assert.ok(!minified.toString().includes("numericValues"));

    const values = distribution([
      [-999, 7],
      [0, 100],
      [28.3, 75],
    ]);
    assert.deepStrictEqual(
      fromSourceText(minified)(values, 182),
      computeHistogram(values, 182)
    );
  });
});
