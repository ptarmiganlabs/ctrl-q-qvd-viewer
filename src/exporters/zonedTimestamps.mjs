import { DAY_MS, naiveDateText } from "./naiveDates.mjs";

/**
 * Timestamps as instants: a QVD's wall clocks, read in a time zone the export names
 *
 * A QVD's timestamps are wall clocks with no time zone, and the reader makes each one
 * a Date whose UTC fields are that wall clock. Told the time zone they were read in,
 * an export can store each as the instant it was. Intl gives a zone's offset from UTC
 * at any instant on every VS Code this extension runs on. Temporal, which would do the
 * whole conversion, is missing from the oldest.
 *
 * Where a zone's clocks went forward, a time in the gap they skipped never showed on
 * them: it is moved forward by the gap, as 02:30 in America/Chicago on 2016-03-13 is
 * 03:30 CDT, 08:30 UTC. Where they went back, a time in the stretch they showed twice
 * is taken as the first, as 01:30 on 2016-11-06 is 01:30 CDT, 06:30 UTC. That is
 * Temporal's "compatible" rule, and java.time's and RFC 5545's.
 */

// A second, in milliseconds: a zone's offset changes on a whole second
const SECOND_MS = 1000;

// Days whose offsets a conversion keeps, at most: over 270 years of daily timestamps
const CACHED_DAYS = 100000;

// Wall clocks a conversion notes of each kind, per column, for the log
const NOTED_WALL_CLOCKS = 3;

// An offset as Intl's longOffset gives it: GMT for none, GMT-06:00, or GMT-05:50:36 for
// a local mean time from before a zone kept standard time
const LONG_OFFSET = /^GMT(?:([+-])(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * The name Intl knows a time zone by
 * Intl takes IANA names in any case, their aliases, such as US/Central, and offsets,
 * such as -06:00, and gives each its own name for it: US/Central is America/Chicago.
 * @param {string} name - The time zone as the user names it
 * @returns {string|null} Intl's name for it, or null for an empty name or one Intl doesn't know
 */
export function resolveTimeZone(name) {
  if (typeof name !== "string" || name.trim() === "") {
    return null;
  }
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: name.trim() }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/**
 * Every time zone Intl knows, as an export lists them: its IANA zones, and UTC, which
 * Intl's list leaves out
 * @returns {Array<string>} The names, sorted
 */
export function timeZoneNames() {
  const names = new Set(Intl.supportedValuesOf("timeZone"));
  names.add("UTC");
  return [...names].sort();
}

/**
 * A zone's offset from UTC at an instant, as Intl gives it
 * @param {string} timeZone - The zone
 * @returns {function(number): number} Given an instant in milliseconds, its offset in milliseconds
 */
function offsetReader(timeZone) {
  const format = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" });
  return (instant) => {
    const name = format.formatToParts(instant).find((part) => part.type === "timeZoneName")?.value;
    const match = LONG_OFFSET.exec(name ?? "");
    if (!match) {
      throw new Error(`Intl gave ${timeZone} an offset it couldn't read: ${name}`);
    }
    if (!match[1]) {
      return 0;
    }
    const seconds = (Number(match[2]) * 60 + Number(match[3])) * 60 + Number(match[4] ?? 0);
    return (match[1] === "-" ? -seconds : seconds) * SECOND_MS;
  };
}

/**
 * The offsets of a zone that a day's wall clocks can have
 * Any instant one of the day's wall clocks can be lies within a day of the day itself,
 * as no offset reaches a day. So when the offsets a day before and two days after are
 * the same, every wall clock of the day has it. Otherwise the change between them is
 * found to the second. That takes a zone not to change its offset twice in three days,
 * and none does: of the 67,173 changes in tzdata 2026d's 419 zones from the year 1 to
 * 2200, the closest two are further apart.
 * @param {function(number): number} offsetAt - The zone's offset at an instant
 * @param {number} day - The day, in days since 1970-01-01
 * @returns {number|{before: number, after: number, at: number}} The offset, or the
 *   offsets before and after the change and the instant it happens, all in milliseconds
 */
function dayOffsets(offsetAt, day) {
  let low = (day - 1) * (DAY_MS / SECOND_MS);
  let high = (day + 2) * (DAY_MS / SECOND_MS);
  const before = offsetAt(low * SECOND_MS);
  const after = offsetAt(high * SECOND_MS);
  if (before === after) {
    return before;
  }
  // The first second with the new offset
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (offsetAt(middle * SECOND_MS) === before) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return { before, after, at: high * SECOND_MS };
}

/**
 * What a conversion did with the timestamps it was given
 * @typedef {object} TimeShifts
 * @property {string} timeZone - The zone they were read in, as Intl names it
 * @property {number} moved - Timestamps in time the clocks skipped, moved forward past it
 * @property {number} ambiguous - Timestamps in time the clocks showed twice, taken as the first
 * @property {Object<string, {moved: Array<string>, ambiguous: Array<string>}>} examples -
 *   For each column with either, its first few such wall clocks
 */

/**
 * Read wall clocks as instants in a time zone
 * @param {string} timeZone - The zone, as resolveTimeZone() takes it
 * @returns {{timeZone: string, instant: function(Date, string=): number, instantAndOffset: function(Date, string=): {instant: number, offset: number}, summary: function(): TimeShifts}}
 *   timeZone: Intl's name for the zone; instant: a timestamp's instant, in
 *   milliseconds, noting it under its column when it is moved or ambiguous;
 *   instantAndOffset: that, and the zone's offset from UTC at the instant; summary:
 *   what was moved or ambiguous
 * @throws {RangeError} For a zone Intl doesn't know
 */
export function zonedTimestamps(timeZone) {
  const resolved = resolveTimeZone(timeZone);
  if (resolved === null) {
    throw new RangeError(`Unknown time zone: ${timeZone}`);
  }
  const offsetAt = offsetReader(resolved);
  const days = new Map();
  const counts = { moved: 0, ambiguous: 0 };
  // Each column's first few wall clocks of each kind, in milliseconds until summary()
  // writes them as text. A Map, as a column may be named constructor or __proto__
  const examples = new Map();

  // The offsets of the day a wall clock is on
  const offsetsOn = (wallClock) => {
    const day = Math.floor(wallClock / DAY_MS);
    let offsets = days.get(day);
    if (offsets === undefined) {
      if (days.size >= CACHED_DAYS) {
        days.clear();
      }
      offsets = dayOffsets(offsetAt, day);
      days.set(day, offsets);
    }
    return offsets;
  };

  // Note a timestamp that was moved or is ambiguous, and the first few of each column's
  const note = (kind, column, wallClock) => {
    counts[kind]++;
    const key = column ?? "";
    let noted = examples.get(key);
    if (noted === undefined) {
      noted = { moved: [], ambiguous: [] };
      examples.set(key, noted);
    }
    const wallClocks = noted[kind];
    if (wallClocks.length < NOTED_WALL_CLOCKS && !wallClocks.includes(wallClock)) {
      wallClocks.push(wallClock);
    }
  };

  // A wall clock's instant by the compatible rule, from the offsets of its day, noting
  // it when it is moved or ambiguous: the one place the rule is applied
  const toInstant = (wallClock, offsets, column) => {
    if (typeof offsets === "number") {
      return wallClock - offsets;
    }
    // The day the offset changes. Wall clocks from the change's earlier one to its
    // later one are skipped, going forward, or shown twice, going back; before them
    // the old offset holds, and from their end the new one
    const { before, after, at } = offsets;
    if (wallClock >= at + Math.max(before, after)) {
      return wallClock - after;
    }
    if (wallClock >= at + Math.min(before, after)) {
      note(after > before ? "moved" : "ambiguous", column, wallClock);
    }
    return wallClock - before;
  };

  const text = (wallClock) => naiveDateText(new Date(wallClock), false);

  return {
    timeZone: resolved,

    instant(date, column) {
      const wallClock = date.getTime();
      return toInstant(wallClock, offsetsOn(wallClock), column);
    },

    instantAndOffset(date, column) {
      const wallClock = date.getTime();
      const offsets = offsetsOn(wallClock);
      const instant = toInstant(wallClock, offsets, column);
      if (typeof offsets === "number") {
        return { instant, offset: offsets };
      }
      // The offset on the side of the change the instant is on
      return { instant, offset: instant < offsets.at ? offsets.before : offsets.after };
    },

    summary() {
      const noted = Array.from(examples, ([column, { moved, ambiguous }]) => [
        column,
        { moved: moved.map(text), ambiguous: ambiguous.map(text) },
      ]);
      return {
        timeZone: resolved,
        moved: counts.moved,
        ambiguous: counts.ambiguous,
        examples: Object.fromEntries(noted),
      };
    },
  };
}

/**
 * Read wall clocks as instants in the time zone an exporter's options name, if they name one
 * @param {{timeZone?: string|null}} [options] - The exporter's options
 * @returns {ReturnType<typeof zonedTimestamps>|null} The conversion, or null without a time zone
 * @throws {RangeError} For a zone Intl doesn't know
 */
export function zonedTimestampsFor(options) {
  const timeZone = options?.timeZone;
  return timeZone ? zonedTimestamps(timeZone) : null;
}

/**
 * An instant as UTC text: 2016-03-13 07:45:00Z, with milliseconds only where it has them
 * @param {number} instant - The instant, in milliseconds
 * @returns {string} The text
 */
export function utcText(instant) {
  return `${naiveDateText(new Date(instant), false)}Z`;
}

/**
 * An offset from UTC as ISO text: -06, +05:30, or -05:50:36 for a local mean time
 * @param {number} offset - The offset, in milliseconds
 * @returns {string} The text
 */
function offsetSuffix(offset) {
  const seconds = Math.abs(offset) / SECOND_MS;
  const pad = (number) => String(number).padStart(2, "0");
  let text = `${offset < 0 ? "-" : "+"}${pad(Math.floor(seconds / 3600))}`;
  if (seconds % 3600 !== 0) {
    text += `:${pad(Math.floor((seconds % 3600) / 60))}`;
    if (seconds % 60 !== 0) {
      text += `:${pad(seconds % 60)}`;
    }
  }
  return text;
}

/**
 * A timestamp as the wall clock of its instant in the zone, with its offset from UTC:
 * 2016-03-13 01:45:00-06. A timestamp moved past skipped time shows where it was moved
 * to, as 2016-03-13 02:30 shows as 2016-03-13 03:30:00-05.
 * @param {Date} date - The timestamp, its wall clock in its UTC fields
 * @param {ReturnType<typeof zonedTimestamps>} zoned - The conversion
 * @param {string} [column] - Its column, to note it under
 * @returns {string} The text
 */
export function offsetText(date, zoned, column) {
  const { instant, offset } = zoned.instantAndOffset(date, column);
  const wallClock = instant + offset;
  const shown = wallClock === date.getTime() ? date : new Date(wallClock);
  return `${naiveDateText(shown, false)}${offsetSuffix(offset)}`;
}

/**
 * Say what reading the timestamps in their zone did with those that DST makes
 * impossible or ambiguous there
 * @param {TimeShifts} shifts - What the conversion did
 * @returns {string} The sentences, or "" when there were none
 */
export function describeTimeShifts({ timeZone, moved, ambiguous }) {
  const parts = [];
  if (moved > 0) {
    parts.push(
      `${moved.toLocaleString()} fell in time its clocks skipped going forward, and ` +
        `${moved === 1 ? "was" : "were"} moved past it`
    );
  }
  if (ambiguous > 0) {
    parts.push(
      `${ambiguous.toLocaleString()} fell in time its clocks showed twice going back, and ` +
        `${ambiguous === 1 ? "was" : "were"} taken as the first`
    );
  }
  if (parts.length === 0) {
    return "";
  }
  let text = `Of the timestamps read in ${timeZone}, ${parts.join(", and ")}.`;
  if (moved > 0) {
    text += ` A clock there never shows a skipped time, so check that they were read in ${timeZone}.`;
  }
  return text;
}
