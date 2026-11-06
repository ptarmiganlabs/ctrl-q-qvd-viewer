/**
 * Dates as the typed exporters write them: naive, with no time zone
 *
 * A QVD's dates and timestamps are wall clocks with no time zone. The reader makes
 * each one a Date whose UTC fields are that wall clock, so these read the UTC fields,
 * whatever time zone the extension runs in.
 */

// Milliseconds in a day
export const DAY_MS = 86400000;

/**
 * A date as naive ISO text: 2016-01-13 06:15:00, with milliseconds only where it has
 * them, or 2016-01-13 for a date without a time
 * @param {Date} date - The date
 * @param {boolean} dateOnly - Whether to leave out the time
 * @returns {string} The text
 */
export function naiveDateText(date, dateOnly) {
  const iso = date.toISOString();
  if (dateOnly) {
    return iso.slice(0, 10);
  }
  const milliseconds = iso.slice(19, 23);
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}${milliseconds === ".000" ? "" : milliseconds}`;
}
