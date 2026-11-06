/**
 * What a cell's value is: the rules the reader, profiling and the exporters share
 */

/**
 * Check whether a value is blank text: empty, or nothing but whitespace
 * @param {*} value - Cell value
 * @returns {boolean} True if the value is blank text
 */
export function isBlank(value) {
  return typeof value === "string" && value.trim() === "";
}
