import { QvdDual, qlikSerialToDate } from "qvdjs";
import { isBlank } from "./cellValue.mjs";

/**
 * A QVD's dates and timestamps, as a read for an export makes them Dates
 *
 * Qlik stores a date or a timestamp as a dual: a serial, the days since 1899-12-30,
 * and the text Qlik shows. A field tagged $date or $timestamp holds them, but Qlik
 * drops its tags from a field with a blank, and doesn't always set them: so a field
 * also holds them when every value is a dual whose text shows the date its number is.
 *
 * A serial is a wall clock with no time zone. Its Date holds that wall clock in its
 * UTC fields, to the millisecond.
 */

// The serials of the first day of the year 1 and the last of 9999
const FIRST_SERIAL = -693593;
const LAST_SERIAL = 2958465;

// Cells to look at between yields to the event loop
const CELLS_PER_CHUNK = 250000;

/**
 * Check whether a dual's text shows the date its number is: the year, month and
 * day, and for a timestamp the hour and minute, each appear in it as a number
 * @param {QvdDual} dual - The dual
 * @returns {boolean} True if the text shows the date
 */
function showsItsDate({ number, text }) {
  const date = qlikSerialToDate(number);
  const wanted = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  if (!Number.isInteger(number)) {
    wanted.push(date.getUTCHours(), date.getUTCMinutes());
  }
  const parts = (text.match(/\d+/g) ?? []).map(Number);
  return wanted.every((part) => {
    const at = parts.indexOf(part);
    if (at < 0) {
      return false;
    }
    parts.splice(at, 1);
    return true;
  });
}

/**
 * The date a value is in a column, if it is one
 * @param {*} value - A cell's value as qvdjs reads it with duals: "both"
 * @param {boolean} tagged - Whether the field is tagged $date or $timestamp
 * @returns {Date|null} The date, or null for a value that isn't one
 */
function dateOf(value, tagged) {
  // A field tagged as dates may hold a serial without text
  const serial = value instanceof QvdDual ? value.number : tagged ? value : null;
  if (!(typeof serial === "number" && serial >= FIRST_SERIAL && serial <= LAST_SERIAL)) {
    return null;
  }
  if (!tagged && !showsItsDate(value)) {
    return null;
  }
  return qlikSerialToDate(serial);
}

/**
 * Find the columns of a read that hold dates or timestamps, and each of their dates
 * Blank cells don't count either way. A column with no date at all holds none.
 * @param {Array<Array>} rows - qvdjs's rows, read with duals: "both"
 * @param {Array<Array<string>>} tags - Each column's field tags
 * @param {AbortSignal} [signal] - Gives the search up between chunks
 * @returns {Promise<Array<Map<*, Date>|null>>} For each column, the Date of each
 *   value it holds, the dual or the serial, or null for a column that doesn't hold dates
 */
export async function findDateColumns(rows, tags, signal) {
  const columns = tags.map((fieldTags) => ({
    tagged: fieldTags.includes("$date") || fieldTags.includes("$timestamp"),
    dates: new Map(),
    holdsDates: true,
  }));
  let open = columns.length;
  const rowsPerChunk = Math.max(1, Math.floor(CELLS_PER_CHUNK / Math.max(1, columns.length)));

  for (let i = 0; i < rows.length && open > 0; i++) {
    const row = rows[i];
    for (let index = 0; index < columns.length; index++) {
      const column = columns[index];
      const value = row[index];
      if (!column.holdsDates || value === null || value === undefined || isBlank(value)) {
        continue;
      }
      if (!column.dates.has(value)) {
        const date = dateOf(value, column.tagged);
        if (date) {
          // One Date for each of the field's values, as the rows share its text
          column.dates.set(value, date);
        } else {
          column.holdsDates = false;
          open--;
        }
      }
    }
    if ((i + 1) % rowsPerChunk === 0 && i + 1 < rows.length) {
      await new Promise((resolve) => setImmediate(resolve));
      signal?.throwIfAborted();
    }
  }

  return columns.map((column) => (column.holdsDates && column.dates.size > 0 ? column.dates : null));
}
