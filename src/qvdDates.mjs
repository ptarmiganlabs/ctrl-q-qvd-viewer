import { QvdDual, qlikSerialToDate } from "qvdjs";
import { CalendarDate, isBlank } from "./cellValue.mjs";
import { nextTurn } from "./memoryGuard.mjs";

/**
 * A QVD's dates and timestamps, as a read for an export makes them Dates
 *
 * Qlik stores a date or a timestamp as a dual: a serial, the days since 1899-12-30,
 * and the text Qlik shows. A field tagged $date or $timestamp holds them, but Qlik
 * drops its tags from a field with a blank, and doesn't always set them: so a field
 * also holds them when every value is a dual whose text shows the date its number is.
 *
 * A field holds timestamps when it is tagged $timestamp, when its text shows a time
 * of day, even at midnight, or when a value read has one, whatever its tag. Otherwise
 * it holds dates. So for a field Qlik shows as days, the rows a read takes decide:
 * rows that all fall at midnight make dates where the whole field makes timestamps.
 * Telling for the whole field would take every value in its symbol table, which a
 * read of some rows doesn't.
 *
 * A serial is a wall clock with no time zone. Its Date holds that wall clock in its
 * UTC fields, to the millisecond, as the exports write it, and a time of day counts
 * from there: float noise far below a millisecond is none. A date field's Date is a
 * CalendarDate, at midnight.
 */

// The serials of the first day of the year 1 and the last of 9999
const FIRST_SERIAL = -693593;
const LAST_SERIAL = 2958465;

// Milliseconds in a day
const DAY_MS = 86400000;

// Cells to look at between yields to the event loop
const CELLS_PER_CHUNK = 250000;

/**
 * Take a number out of a list of numbers, if it is there
 * @param {Array<number>} parts - The numbers, changed in place
 * @param {Array<number>} candidates - The number, in each form it may take
 * @returns {boolean} True if one of them was there
 */
function takePart(parts, candidates) {
  for (const candidate of candidates) {
    const at = parts.indexOf(candidate);
    if (at >= 0) {
      parts.splice(at, 1);
      return true;
    }
  }
  return false;
}

/**
 * What a dual's text shows of the date its number is: its year, month and day, each
 * as a number, and maybe its time, as the hour and minute
 * @param {string} text - The dual's text
 * @param {Date} date - Its number's Date
 * @returns {"date"|"timestamp"|null} Whether the text shows the date, the date and
 *   its time, or neither
 */
function whatTextShows(text, date) {
  const parts = (text.match(/\d+/g) ?? []).map(Number);
  const day = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  if (!day.every((part) => takePart(parts, [part]))) {
    return null;
  }
  if (parts.length === 0) {
    return "date";
  }
  // A time of day, on a 24- or a 12-hour clock
  const hour = date.getUTCHours();
  const shown = takePart(parts, [hour, ((hour + 11) % 12) + 1]) && takePart(parts, [date.getUTCMinutes()]);
  return shown ? "timestamp" : null;
}

/**
 * What a column's values say so far about whether it holds dates, and of which kind
 * @typedef {object} DateColumn
 * @property {boolean} tagged - Whether the field is tagged $date or $timestamp
 * @property {boolean} timestamps - Whether they are timestamps rather than dates
 * @property {boolean} holdsDates - Whether every value so far is a date
 */

/**
 * A column of a field with these tags, before any of its values is taken
 * @param {Array<string>} fieldTags - The field's tags
 * @returns {DateColumn} The column
 */
export function dateColumnOf(fieldTags) {
  return {
    tagged: fieldTags.includes("$date") || fieldTags.includes("$timestamp"),
    // A $timestamp tag makes timestamps from the start, the text or a value later
    timestamps: fieldTags.includes("$timestamp"),
    holdsDates: true,
  };
}

/**
 * Whether a value counts either way: a blank cell doesn't
 * @param {*} value - A cell's value as qvdjs reads it with duals: "both"
 * @returns {boolean} True for a value that is a date or ends a column's dates
 */
export function countsAsDate(value) {
  return value !== null && value !== undefined && !isBlank(value);
}

/**
 * The time of the date a value of a column of dates is
 * @param {*} value - A value that counts, as qvdjs reads it with duals: "both"
 * @returns {number} Its wall clock in milliseconds since 1970, as a Date's UTC fields hold it
 */
export function dateTimeOf(value) {
  return qlikSerialToDate(value instanceof QvdDual ? value.number : value).getTime();
}

/**
 * Take one more value of a column: a date of its kind, or the end of its dates
 * The outcome for a column doesn't depend on the order its values come in, nor on a
 * value taken twice.
 * @param {DateColumn} column - The column, changed in place
 * @param {*} value - A value that counts, as qvdjs reads it with duals: "both"
 * @returns {number|null} The date's time, as dateTimeOf() gives it; null once the
 *   column holds no dates
 */
export function takeDateValue(column, value) {
  // A field tagged as dates may hold a serial without text
  const serial = value instanceof QvdDual ? value.number : column.tagged ? value : null;
  if (!(typeof serial === "number" && serial >= FIRST_SERIAL && serial <= LAST_SERIAL)) {
    column.holdsDates = false;
    return null;
  }
  const date = qlikSerialToDate(serial);
  // Untagged, a dual's text must show its date. Tagged or not, text that shows a time
  // of day makes timestamps
  if (value instanceof QvdDual && !(column.tagged && column.timestamps)) {
    const shows = whatTextShows(value.text, date);
    if (shows === null && !column.tagged) {
      column.holdsDates = false;
      return null;
    }
    if (shows === "timestamp") {
      column.timestamps = true;
    }
  }
  // So does a time of day in the value itself, even where the text shows only the day
  if (date.getTime() % DAY_MS !== 0) {
    column.timestamps = true;
  }
  return date.getTime();
}

/**
 * Find the columns of a read that hold dates or timestamps, and each of their dates
 * Blank cells don't count either way. A column with no date at all holds none.
 * @param {Array<Array>} rows - qvdjs's rows, read with duals: "both"
 * @param {Array<Array<string>>} tags - Each column's field tags
 * @param {AbortSignal} [signal] - Gives the search up between chunks
 * @returns {Promise<Array<Map<*, Date>|null>>} For each column, the Date of each
 *   value it holds, the dual or the serial: a CalendarDate for a date field. Null for
 *   a column that doesn't hold dates
 */
export async function findDateColumns(rows, tags, signal) {
  const columns = tags.map((fieldTags) => ({ ...dateColumnOf(fieldTags), times: new Map() }));
  let open = columns.length;
  const rowsPerChunk = Math.max(1, Math.floor(CELLS_PER_CHUNK / Math.max(1, columns.length)));

  for (let i = 0; i < rows.length && open > 0; i++) {
    const row = rows[i];
    for (let index = 0; index < columns.length; index++) {
      const column = columns[index];
      const value = row[index];
      if (column.holdsDates && countsAsDate(value) && !column.times.has(value)) {
        const time = takeDateValue(column, value);
        if (time === null) {
          open--;
        } else {
          column.times.set(value, time);
        }
      }
    }
    if ((i + 1) % rowsPerChunk === 0 && i + 1 < rows.length) {
      await nextTurn();
      signal?.throwIfAborted();
    }
  }

  // One Date for each of the field's values, as its rows share its text, in place of
  // its time. Every value of a date field falls at midnight, so its CalendarDate is the
  // day its Date is on, not the day its serial rounds down to
  return columns.map((column) => {
    if (!column.holdsDates || column.times.size === 0) {
      return null;
    }
    const DateOfKind = column.timestamps ? Date : CalendarDate;
    for (const [value, time] of column.times) {
      column.times.set(value, new DateOfKind(time));
    }
    return column.times;
  });
}
