const assert = require("assert");

// The module that reads wall clocks as instants in a time zone
let zoned;

// Milliseconds in an hour and in a quarter of one
const HOUR = 3600000;
const QUARTER = 15 * 60000;

/**
 * A wall clock as the reader makes a QVD's timestamp: a Date whose UTC fields are it
 * @param {number} year - Year
 * @param {number} month - Month, from 1
 * @param {number} day - Day of the month
 * @param {number} [hour] - Hour
 * @param {number} [minute] - Minute
 * @returns {Date} The wall clock
 */
function wallClock(year, month, day, hour = 0, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

/**
 * The instant a wall clock is in a time zone, by Temporal's "compatible" rule
 * @param {Date} date - The wall clock, in its UTC fields
 * @param {string} timeZone - The zone
 * @returns {number} The instant, in milliseconds
 */
function temporalInstant(date, timeZone) {
  return globalThis.Temporal.PlainDateTime.from({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  }).toZonedDateTime(timeZone).epochMilliseconds;
}

suite("Zoned Timestamps Test Suite", () => {
  suiteSetup(async () => {
    zoned = await import("../src/exporters/zonedTimestamps.mjs");
  });

  test("Wall clocks in Chicago are the instants they were, either side of a change of offset", () => {
    const chicago = zoned.zonedTimestamps("America/Chicago");
    const instant = (...wall) => new Date(chicago.instant(wallClock(...wall))).toISOString();

    // CST is 6 hours behind UTC, and CDT 5
    assert.strictEqual(instant(2016, 1, 13, 6, 15), "2016-01-13T12:15:00.000Z");
    assert.strictEqual(instant(2016, 3, 13, 1, 45), "2016-03-13T07:45:00.000Z");
    assert.strictEqual(instant(2016, 3, 13, 3, 0), "2016-03-13T08:00:00.000Z");
    assert.strictEqual(instant(2016, 11, 6, 0, 59), "2016-11-06T05:59:00.000Z");
    assert.strictEqual(instant(2016, 11, 6, 2, 0), "2016-11-06T08:00:00.000Z");
    // Before 1883, Chicago kept its local mean time, 5:50:36 behind UTC
    assert.strictEqual(instant(1800, 1, 1, 12, 0), "1800-01-01T17:50:36.000Z");

    // An hour and a quarter apart as wall clocks, a quarter as instants
    const before = chicago.instant(wallClock(2016, 3, 13, 1, 45));
    const after = chicago.instant(wallClock(2016, 3, 13, 3, 0));
    assert.strictEqual(after - before, QUARTER);
    assert.deepStrictEqual(chicago.summary(), {
      timeZone: "America/Chicago",
      moved: 0,
      ambiguous: 0,
      examples: {},
    });
  });

  test("A time the clocks skipped is moved past it, and one they showed twice is taken as the first", () => {
    const chicago = zoned.zonedTimestamps("America/Chicago");
    const skipped = wallClock(2016, 3, 13, 2, 30);
    const repeated = wallClock(2016, 11, 6, 1, 30);

    // 02:30 CST is 03:30 CDT, and 01:30 showed first as CDT, then as CST
    assert.deepStrictEqual(chicago.instantAndOffset(skipped, "at"), {
      instant: Date.UTC(2016, 2, 13, 8, 30),
      offset: -5 * HOUR,
    });
    assert.deepStrictEqual(chicago.instantAndOffset(repeated, "at"), {
      instant: Date.UTC(2016, 10, 6, 6, 30),
      offset: -5 * HOUR,
    });
    // Each side of a change has its own offset
    assert.strictEqual(chicago.instantAndOffset(wallClock(2016, 3, 13, 1, 45)).offset, -6 * HOUR);
    assert.strictEqual(chicago.instantAndOffset(wallClock(2016, 11, 6, 2, 0)).offset, -6 * HOUR);

    // Each timestamp counts, and each column notes its wall clocks once
    assert.strictEqual(chicago.instant(skipped, "at"), Date.UTC(2016, 2, 13, 8, 30));
    chicago.instant(repeated, "other");
    assert.deepStrictEqual(chicago.summary(), {
      timeZone: "America/Chicago",
      moved: 2,
      ambiguous: 2,
      examples: {
        at: { moved: ["2016-03-13 02:30:00"], ambiguous: ["2016-11-06 01:30:00"] },
        other: { moved: [], ambiguous: ["2016-11-06 01:30:00"] },
      },
    });
  });

  test("A column named like a member every object has is noted as any other", () => {
    const chicago = zoned.zonedTimestamps("America/Chicago");
    const skipped = wallClock(2016, 3, 13, 2, 30);
    for (const column of ["constructor", "toString", "__proto__"]) {
      chicago.instant(skipped, column);
    }
    const { moved, examples } = chicago.summary();
    assert.strictEqual(moved, 3);
    const noted = { moved: ["2016-03-13 02:30:00"], ambiguous: [] };
    assert.deepStrictEqual(Object.entries(examples), [
      ["constructor", noted],
      ["toString", noted],
      ["__proto__", noted],
    ]);
  });

  test("Wall clocks that already are UTC, or at a fixed offset, keep their time and nothing moves", () => {
    const skipped = wallClock(2016, 3, 13, 2, 30);
    const utc = zoned.zonedTimestamps("UTC");
    assert.deepStrictEqual(utc.instantAndOffset(skipped), { instant: skipped.getTime(), offset: 0 });

    const fixed = zoned.zonedTimestamps("-06:00");
    assert.strictEqual(new Date(fixed.instant(skipped)).toISOString(), "2016-03-13T08:30:00.000Z");
    assert.deepStrictEqual([utc.summary().moved, fixed.summary().moved], [0, 0]);
  });

  test("Instants are written as UTC text, or as the wall clock with its offset", () => {
    const chicago = zoned.zonedTimestamps("America/Chicago");
    assert.strictEqual(zoned.utcText(chicago.instant(wallClock(2016, 3, 13, 1, 45))), "2016-03-13 07:45:00Z");
    assert.strictEqual(zoned.utcText(Date.UTC(2016, 2, 13, 7, 45, 0, 250)), "2016-03-13 07:45:00.250Z");

    assert.strictEqual(zoned.offsetText(wallClock(2016, 3, 13, 1, 45), chicago), "2016-03-13 01:45:00-06");
    // A time the clocks skipped shows where it was moved to
    assert.strictEqual(zoned.offsetText(wallClock(2016, 3, 13, 2, 30), chicago), "2016-03-13 03:30:00-05");
    assert.strictEqual(zoned.offsetText(wallClock(1800, 1, 1, 12), chicago), "1800-01-01 12:00:00-05:50:36");
    const january = wallClock(2016, 1, 13, 6, 15);
    assert.strictEqual(zoned.offsetText(january, zoned.zonedTimestamps("Asia/Kolkata")), "2016-01-13 06:15:00+05:30");
    assert.strictEqual(zoned.offsetText(january, zoned.zonedTimestamps("UTC")), "2016-01-13 06:15:00+00");
  });

  test("Every quarter hour of a year converts as Temporal's compatible rule does", function () {
    if (typeof globalThis.Temporal === "undefined") {
      // VS Code 1.101.0's Node has no Temporal to compare with
      this.skip();
    }
    this.timeout(60000);
    // Zones with a change of an hour each way, of half an hour, at a half-hour offset,
    // with none, and one that skipped a whole day: Apia left out 2011-12-30
    const spans = [
      ["America/Chicago", wallClock(2016, 1, 1), wallClock(2017, 1, 1)],
      ["Australia/Lord_Howe", wallClock(2016, 1, 1), wallClock(2017, 1, 1)],
      ["America/St_Johns", wallClock(2016, 1, 1), wallClock(2017, 1, 1)],
      ["Europe/Stockholm", wallClock(2016, 1, 1), wallClock(2017, 1, 1)],
      ["Asia/Kolkata", wallClock(2016, 1, 1), wallClock(2017, 1, 1)],
      ["Pacific/Apia", wallClock(2011, 12, 28), wallClock(2012, 1, 3)],
    ];
    for (const [timeZone, start, end] of spans) {
      const converter = zoned.zonedTimestamps(timeZone);
      const differ = [];
      for (let wall = start.getTime(); wall < end.getTime(); wall += QUARTER) {
        const date = new Date(wall);
        const expected = temporalInstant(date, timeZone);
        if (converter.instant(date) !== expected) {
          differ.push(`${date.toISOString()}: ${new Date(converter.instant(date)).toISOString()}, not ${new Date(expected).toISOString()}`);
        }
      }
      assert.deepStrictEqual(differ.slice(0, 5), [], `${timeZone} should convert as Temporal does`);
    }
  });

  test("A time zone is known by the name Intl gives it, and an unknown one by none", () => {
    assert.strictEqual(zoned.resolveTimeZone("America/Chicago"), "America/Chicago");
    assert.strictEqual(zoned.resolveTimeZone(" america/chicago "), "America/Chicago");
    assert.strictEqual(zoned.resolveTimeZone("US/Central"), "America/Chicago");
    assert.strictEqual(zoned.resolveTimeZone("utc"), "UTC");
    assert.strictEqual(zoned.resolveTimeZone("GMT"), "UTC");
    assert.strictEqual(zoned.resolveTimeZone("-06:00"), "-06:00");
    assert.strictEqual(zoned.resolveTimeZone("America/Chicgo"), null);
    assert.strictEqual(zoned.resolveTimeZone(" "), null);
    assert.throws(() => zoned.zonedTimestamps("America/Chicgo"), RangeError);

    // The list an export offers has UTC, which Intl's own leaves out, and every name works
    const names = zoned.timeZoneNames();
    assert.ok(names.includes("UTC") && names.includes("America/Chicago"));
    assert.deepStrictEqual([...names].sort(), names);
    assert.deepStrictEqual(names.filter((name) => zoned.resolveTimeZone(name) === null), []);
  });

  test("The export's message says what DST did to the timestamps, and nothing when it did nothing", () => {
    const describe = (moved, ambiguous) =>
      zoned.describeTimeShifts({ timeZone: "America/Chicago", moved, ambiguous, examples: {} });
    assert.strictEqual(describe(0, 0), "");
    assert.strictEqual(
      describe(1, 0),
      "Of the timestamps read in America/Chicago, 1 fell in time its clocks skipped going forward, " +
        "and was moved past it. A clock there never shows a skipped time, so check that they were " +
        "read in America/Chicago."
    );
    assert.strictEqual(
      describe(0, 2),
      "Of the timestamps read in America/Chicago, 2 fell in time its clocks showed twice going back, " +
        "and were taken as the first."
    );
    assert.strictEqual(
      describe(3, 1),
      "Of the timestamps read in America/Chicago, 3 fell in time its clocks skipped going forward, " +
        "and were moved past it, and 1 fell in time its clocks showed twice going back, and was " +
        "taken as the first. A clock there never shows a skipped time, so check that they were " +
        "read in America/Chicago."
    );
  });
});
