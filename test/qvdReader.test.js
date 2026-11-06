const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// QvdReader is async because it's a CJS wrapper around ESM
let QvdReader;
let QvdDataFrame;
let QvdDual;
let CalendarDate;
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
 * @param {object} [options] - The reader's options, such as dates
 * @returns {Promise<Array<Object>>} The rows
 */
async function readTestData(name, maxRows = 0, options = {}) {
  const result = await new QvdReader().read(path.join(testData, name), maxRows, options);
  assert.strictEqual(result.error, null);
  return result.data;
}

suite("QVD Reader Test Suite", () => {
  suiteSetup(async () => {
    QvdReader = await require("../src/qvdReader.cjs");
    ({ QvdDataFrame, QvdDual } = await import("qvdjs"));
    ({ CalendarDate } = await import("../src/cellValue.mjs"));
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
      // 2^53 + 1, which a double can't hold
      ["9007199254740993", "9007199254740993"],
      ["123456789012345", 123456789012345],
      ["0.123456789012345", 0.123456789012345],
      // Zeros before the first digit and after the last don't count
      ["0.000123", 0.000123],
      ["1000000000000000", 1e15],
      ["1.000000000000000", 1],
      ["123456789012345000000", 123456789012345000000],
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

  test("Reader - text whose number would show in exponent form stays text", async () => {
    await assertReadsAs([
      ["0.0000001", "0.0000001"],
      ["-0.00000012", "-0.00000012"],
      ["1000000000000000000000", "1000000000000000000000"],
      ["0.000001", 0.000001],
      ["-0.0000010", -0.000001],
      ["100000000000000000000", 1e20],
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

  test("Reader - for an export, a field of dates or timestamps reads as Dates of Qlik's wall clock", async () => {
    const taxi = "chicago_taxi_rides/chicago_taxi_rides_2016_01.qvd";
    const [asText] = await readTestData(taxi, 1);
    const [asDates] = await readTestData(taxi, 1, { dates: true });

    assert.strictEqual(asText.trip_start_timestamp, "2016-1-13 06:15:00");
    // Tagged $timestamp, and with no tags at all
    const start = new Date(Date.UTC(2016, 0, 13, 6, 15));
    assert.deepStrictEqual(asDates.trip_start_timestamp, start);
    assert.deepStrictEqual(asDates.trip_end_timestamp, start);
    // The other fields read as they do without dates
    const without = (row) => ({ ...row, trip_start_timestamp: null, trip_end_timestamp: null });
    assert.deepStrictEqual(without(asDates), without(asText));

    // Tagged $numeric and $integer, with a day's serial and its date in every dual
    const [day] = await readTestData("stockholm_temp/stockholm_temp.qvd", 1, { dates: true });
    assert.deepStrictEqual(day.date, new CalendarDate(Date.UTC(1756, 0, 1)));

    // As serials, the years 1950 to 2017 are days in 1905, which their text doesn't show
    const sets = await readTestData("lego/sets.qvd", 0, { dates: true });
    assert.ok(sets.every((row) => typeof row.year === "number"));
  });

  test("Reader - a field of duals reads as dates only if every value's text shows its date", async () => {
    const filePath = path.join(outputDir, "dates.qvd");
    const columns = ["timestamp", "dayFirst", "year", "mixed", "wrongDay", "serial"];
    const rows = [
      [
        new QvdDual(42382.25, "2016-1-13 06:00:00"),
        new QvdDual(42382, "13/1/2016"),
        new QvdDual(1950, "1950"),
        new QvdDual(42382, "2016-1-13"),
        new QvdDual(42382, "2016-1-14"),
        42382,
      ],
      [
        "",
        new QvdDual(42383, "1/14/2016"),
        new QvdDual(2017, "2017"),
        "unknown",
        new QvdDual(42383, "2016-1-15"),
        42383,
      ],
    ];
    await new QvdDataFrame(rows, columns).toQvd(filePath, { allowedDir: outputDir });

    const result = await new QvdReader().read(filePath, 0, { dates: true });

    assert.strictEqual(result.error, null);
    // A blank is no date either way; a serial without text, untagged, is a number
    assert.deepStrictEqual(result.data, [
      {
        timestamp: new Date(Date.UTC(2016, 0, 13, 6)),
        dayFirst: new CalendarDate(Date.UTC(2016, 0, 13)),
        year: 1950,
        mixed: "2016-1-13",
        wrongDay: "2016-1-14",
        serial: 42382,
      },
      {
        timestamp: "",
        dayFirst: new CalendarDate(Date.UTC(2016, 0, 14)),
        year: 2017,
        mixed: "unknown",
        wrongDay: "2016-1-15",
        serial: 42383,
      },
    ]);
  });

  test("Reader - a field's tag or text, not its values, says whether it holds dates or timestamps", async () => {
    const filePath = path.join(outputDir, "date-kinds.qvd");
    const columns = ["shownAsDates", "midnights", "twelveHour"];
    const rows = [
      [
        new QvdDual(42382.75, "2016-1-13"),
        new QvdDual(42382, "2016-1-13 00:00:00"),
        new QvdDual(42382.75, "1/13/2016 6:00 PM"),
      ],
      [
        new QvdDual(42383.25, "2016-1-14"),
        new QvdDual(42383, "2016-1-14 00:00:00"),
        new QvdDual(42383.25, "1/14/2016 6:00 AM"),
      ],
    ];
    await new QvdDataFrame(rows, columns).toQvd(filePath, { allowedDir: outputDir });

    const result = await new QvdReader().read(filePath, 0, { dates: true });

    assert.strictEqual(result.error, null);
    assert.deepStrictEqual(result.data, [
      {
        // Timestamps Qlik shows as dates are dates, as shown
        shownAsDates: new CalendarDate(Date.UTC(2016, 0, 13)),
        // Text with a time makes timestamps, even at midnight
        midnights: new Date(Date.UTC(2016, 0, 13)),
        twelveHour: new Date(Date.UTC(2016, 0, 13, 18)),
      },
      {
        shownAsDates: new CalendarDate(Date.UTC(2016, 0, 14)),
        midnights: new Date(Date.UTC(2016, 0, 14)),
        twelveHour: new Date(Date.UTC(2016, 0, 14, 6)),
      },
    ]);
    assert.ok(!(result.data[0].midnights instanceof CalendarDate), "A timestamp isn't a date");
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
