/**
 * Check whether a value is blank text: empty, or nothing but whitespace
 * @param {*} value - Cell value
 * @returns {boolean} True if the value is blank text
 */
export function isBlank(value) {
  return typeof value === "string" && value.trim() === "";
}

/**
 * Decide what a column's blank text is, once every row has been scanned
 *
 * Next to numbers, booleans or dates, blank text is a missing value: the column keeps
 * their type, and becomes nullable. In a column of text, or of nothing but blanks, it
 * is text like any other.
 * @param {Object} typeInfo - The column's type information, updated in place. Uses
 *   hasBlank, hasString, hasNumber, hasBoolean, hasDate and, where it is tracked,
 *   hasObject; sets blanksAreNull and hasNull, or hasString
 * @returns {void}
 */
export function settleBlanks(typeInfo) {
  if (!typeInfo.hasBlank) {
    return;
  }

  const typed =
    !typeInfo.hasString &&
    !typeInfo.hasObject &&
    !(typeInfo.hasNumber && typeInfo.hasBoolean) &&
    (typeInfo.hasNumber || typeInfo.hasBoolean || typeInfo.hasDate);

  if (typed) {
    typeInfo.blanksAreNull = true;
    typeInfo.hasNull = true;
  } else {
    typeInfo.hasString = true;
  }
}
