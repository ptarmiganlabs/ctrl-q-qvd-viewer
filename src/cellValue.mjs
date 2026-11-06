/**
 * What a cell's value is: the rules the reader, profiling and the exporters share
 */

// An optional minus, then digits without a leading zero, then an optional fraction
const PLAIN_DECIMAL = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/**
 * Turn text that is a plain decimal number, such as 42, -7 or 3.14, into that number.
 * Other text stays text: codes with a leading zero, an exponent or a hex prefix, text
 * with spaces around it, blank text, and numbers a double can't hold exactly. A number
 * the file stores as NaN or Infinity is an empty cell.
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
  // Keep the text where the number would show differently: -0 shows as 0, and below
  // 1e-6 or from 1e21 on a number shows in exponent form, as 0.0000001 shows as 1e-7.
  // Text such as 1 followed by 400 zeros, whose number is Infinity, is past 1e21 too
  const size = Math.abs(number);
  if (Object.is(number, -0) || (size !== 0 && (size < 1e-6 || size >= 1e21))) {
    return value;
  }
  return number;
}

/**
 * Check whether a value is blank text: empty, or nothing but whitespace
 * @param {*} value - Cell value
 * @returns {boolean} True if the value is blank text
 */
export function isBlank(value) {
  return typeof value === "string" && value.trim() === "";
}
