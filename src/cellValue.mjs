/**
 * What a cell's value is: the rules the reader, profiling and the exporters share
 */

// An optional minus, then digits without a leading zero, then an optional fraction
const PLAIN_DECIMAL = /^-?(0|[1-9]\d*)(\.\d+)?$/;

// The smallest normal double, 2^-1022 or about 2.2e-308. Below it a double holds fewer
// digits the smaller it is, until it holds none and is 0
const SMALLEST_NORMAL = 2 ** -1022;

/**
 * Turn text that is a plain decimal number, such as 42, -7 or 3.14, into that number,
 * whatever its size: 0.0000001 is 1e-7. Other text stays text: codes with a leading
 * zero, an exponent or a hex prefix, text with spaces around it, blank text, and
 * numbers a double can't hold exactly. A number the file stores as NaN or Infinity is
 * an empty cell.
 * @param {*} value - A cell's value as qvdjs reads it, with a dual's text for a dual
 * @returns {*} The number, null, or the value as it was
 */
export function toCellValue(value) {
  // Qlik has no NaN or Infinity: where JavaScript gives one, as for 1/0, Qlik gives NULL
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || !PLAIN_DECIMAL.test(value)) {
    return value;
  }
  // A double holds 15 significant digits exactly. With more, the number could differ
  // from the text, as 12345678901234567891 reads as 12345678901234567000. Zeros before
  // the first digit and after the last don't count, and text of 15 characters or fewer
  // can't have more, so only longer text is counted
  if (value.length > 15) {
    const digits = value
      .replace("-", "")
      .replace(".", "")
      .replace(/^0+/, "")
      .replace(/0+$/, "");
    if (digits.length > 15) {
      return value;
    }
  }
  const number = Number(value);
  // Keep the text where the number isn't what it says: -0 shows as 0, text such as 1
  // followed by 400 zeros is Infinity, and below the smallest normal double the number
  // holds fewer digits than the text, as 1 at the 400th decimal is 0. Text of nothing
  // but zeros, such as 0.00, is 0
  if (
    Object.is(number, -0) ||
    !Number.isFinite(number) ||
    (Math.abs(number) < SMALLEST_NORMAL && /[1-9]/.test(value))
  ) {
    return value;
  }
  return number;
}

/**
 * A date without a time of day: a Date at midnight UTC, as the reader makes a value of
 * a QVD's date field. A value of a timestamp field is a plain Date, even at midnight.
 */
export class CalendarDate extends Date {}

/**
 * Check whether a value is blank text: empty, or nothing but whitespace
 * @param {*} value - Cell value
 * @returns {boolean} True if the value is blank text
 */
export function isBlank(value) {
  return typeof value === "string" && value.trim() === "";
}
