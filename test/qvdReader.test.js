const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// QvdReader is async because it's a CJS wrapper around ESM
let QvdReader;
let QvdDataFrame;
let qvdProfiler;
let outputDir;
let fileCount = 0;

const testData = path.join(__dirname, "..", "test-data");

/**
 * Check what the reader gives for each text, stored in a QVD as plain text by qvdjs's
 * own writer
 * @param {Array<[string, *]>} cases - Each text, and the value the reader should give for it
 * @returns {Promise<void>}
 */
async function assertReadsAs(cases) {
  const filePath = path.join(outputDir, `values-${++fileCount}.qvd`);
  const rows = cases.map(([text]) => [text]);
  await new QvdDataFrame(rows, ["value"]).toQvd(filePath, { allowedDir: outputDir });

  const result = await new QvdReader().read(filePath, 0);

  assert.strictEqual(result.error, null);
  assert.deepStrictEqual(
    cases.map(([text], index) => [text, result.data[index].value]),
    cases
  );
}

/**
 * Read every row of a QVD in the test data
 * @param {string} name - File path within test-data
 * @param {number} [maxRows] - Rows to read, 0 for all
 * @returns {Promise<Array<Object>>} The rows
 */
async function readTestData(name, maxRows = 0) {
  const result = await new QvdReader().read(path.join(testData, name), maxRows);
  assert.strictEqual(result.error, null);
  return result.data;
}

suite("QVD Reader Test Suite", () => {
  suiteSetup(async () => {
    QvdReader = await require("../src/qvdReader.cjs");
    ({ QvdDataFrame } = await import("qvdjs"));
    qvdProfiler = await import("../src/qvdProfiler.mjs");
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "qvd-viewer-reader-"));
  });

  suiteTeardown(() => {
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  test("Reader - text with a leading zero stays text, and 0 and 0.5 are numbers", async () => {
    await assertReadsAs([
      ["0901", "0901"],
      ["000000", "000000"],
      ["00.5", "00.5"],
      ["-07", "-07"],
      ["0", 0],
      ["0.5", 0.5],
      ["-0.5", -0.5],
      ["901", 901],
    ]);
  });

  test("Reader - text with an exponent stays text", async () => {
    await assertReadsAs([
      ["1e3", "1e3"],
      ["9391E4", "9391E4"],
      ["845E84", "845E84"],
      ["2E-5", "2E-5"],
      ["1000", 1000],
    ]);
  });

  test("Reader - text with a hex, octal or binary prefix stays text", async () => {
    await assertReadsAs([
      ["0x1F", "0x1F"],
      ["0X1f", "0X1f"],
      ["0o17", "0o17"],
      ["0b101", "0b101"],
      ["31", 31],
    ]);
  });

  test("Reader - text with spaces around it stays text", async () => {
    await assertReadsAs([
      [" 42", " 42"],
      ["42 ", "42 "],
      ["\t42\n", "\t42\n"],
      ["42", 42],
    ]);
  });

  test("Reader - text with more than 15 significant digits stays text", async () => {
    await assertReadsAs([
      ["12345678901234567891", "12345678901234567891"],
      ["1234567890123456", "1234567890123456"],
      ["0.1234567890123456", "0.1234567890123456"],
      // Trailing zeros count, so no number read from text reaches 2^53
      ["1000000000000000", "1000000000000000"],
      ["123456789012345", 123456789012345],
      ["0.123456789012345", 0.123456789012345],
      ["0.000123", 0.000123],
    ]);
  });

  test("Reader - text that converts to a number that isn't finite stays text", async () => {
    const huge = `1${"0".repeat(400)}`;
    await assertReadsAs([
      ["8E5597", "8E5597"],
      [huge, huge],
      ["Infinity", "Infinity"],
      ["-Infinity", "-Infinity"],
      ["NaN", "NaN"],
      ["5597", 5597],
    ]);
  });

  test("Reader - NaN and Infinity stored in a QVD are empty cells", async () => {
    // qvdjs refuses to write them, so write stand-ins and replace their bytes
    const filePath = path.join(outputDir, "non-finite.qvd");
    const stored = [Math.PI, Math.E, Math.SQRT2, 42.25];
    await new QvdDataFrame(stored.map((number) => [number]), ["value"]).toQvd(filePath, {
      allowedDir: outputDir,
    });
    const bytes = fs.readFileSync(filePath);
    const doubleBytes = (number) => {
      const buffer = Buffer.alloc(8);
      buffer.writeDoubleLE(number);
      return buffer;
    };
    for (const [standIn, number] of [
      [Math.PI, NaN],
      [Math.E, Infinity],
      [Math.SQRT2, -Infinity],
    ]) {
      const at = bytes.indexOf(doubleBytes(standIn));
      assert.ok(at > 0 && bytes.lastIndexOf(doubleBytes(standIn)) === at, `${standIn} once`);
      doubleBytes(number).copy(bytes, at);
    }
    fs.writeFileSync(filePath, bytes);

    const result = await new QvdReader().read(filePath, 0);

    assert.strictEqual(result.error, null);
    assert.deepStrictEqual(
      result.data.map((row) => row.value),
      [null, null, null, 42.25]
    );
  });

  test("Reader - blank text stays text", async () => {
    await assertReadsAs([
      ["", ""],
      [" ", " "],
      ["  ", "  "],
      ["\t", "\t"],
      ["7", 7],
    ]);
  });

  test("Reader - a minus makes a negative number, and other signs and points stay text", async () => {
    await assertReadsAs([
      ["-42", -42],
      ["-3.5", -3.5],
      // A trailing zero after the point is formatting, as in a price
      ["3.50", 3.5],
      ["12.0", 12],
      ["+42", "+42"],
      [".5", ".5"],
      ["5.", "5."],
      ["-.5", "-.5"],
      ["1,000", "1,000"],
      // -0 would show as 0
      ["-0", "-0"],
      ["-0.0", "-0.0"],
      ["- 42", "- 42"],
      ["--42", "--42"],
    ]);
  });

  test("Reader - colour codes in lego/colors.qvd keep their text", async () => {
    const rgbById = new Map(
      (await readTestData("lego/colors.qvd")).map((row) => [row.id, row.rgb])
    );

    assert.deepStrictEqual(
      [75, 132, 133, 373, 1001, 1007, 2, 308].map((id) => [id, rgbById.get(id)]),
      [
        [75, "000000"],
        [132, "000000"],
        [133, "000000"],
        [373, "845E84"],
        [1001, "9391E4"],
        [1007, "8E5597"],
        // A dual whose text is a plain decimal is a number, as in any other field
        [2, 237841],
        [308, 352100],
      ]
    );
  });

  test("Reader - part numbers in lego/parts.qvd keep their leading zero", async () => {
    const partNums = (await readTestData("lego/parts.qvd")).map((row) => row.part_num);

    assert.deepStrictEqual(
      partNums.filter((partNum) => /^090[1-4]$/.test(String(partNum))),
      ["0901", "0902", "0903", "0904"]
    );
    assert.ok(partNums.includes(3001), "3001 should be a number");
    assert.ok(partNums.includes("3001a"), "3001a should be text");
  });

  test("Profiling - an all-blank field in the taxi data is neither a date nor a number", async () => {
    const data = await readTestData(
      "chicago_taxi_rides/chicago_taxi_rides_2016_01.qvd",
      1000
    );

    const [field] = qvdProfiler.profileFields(data, ["pickup_census_tract"]).fields;

    assert.strictEqual(field.isDate, false, "A blank isn't the date 2000-01-01");
    assert.strictEqual(field.temporalAnalysis, null);
    assert.strictEqual(field.isNumeric, false, "A blank isn't the number 0");
    assert.strictEqual(field.statistics, null);
    assert.strictEqual(field.nullCount, 1000, "Every row should be blank");
  });
});
