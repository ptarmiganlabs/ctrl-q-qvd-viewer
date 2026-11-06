import { isBlank } from "../cellValue.mjs";
import { DAY_MS } from "./naiveDates.mjs";

/**
 * What a column holds, from which a typed exporter picks the column's type
 * @typedef {object} ColumnType
 * @property {boolean} hasNull - Some value is null or missing
 * @property {boolean} hasBlank - Some value is blank text
 * @property {boolean} hasNumber - Some value is a number
 * @property {boolean} allIntegers - Every number is a safe integer
 * @property {boolean} hasString - Some value is text, counting blank text unless it is null
 * @property {boolean} hasBoolean - Some value is a boolean
 * @property {boolean} hasDate - Some value is a Date
 * @property {boolean} allMidnight - Every Date is at midnight UTC: a date without a time
 * @property {boolean} hasObject - Some value is an object other than a Date
 * @property {boolean} blanksAreNull - The column's blank text is a missing value
 */

/**
 * Scan every row for what each column holds
 *
 * Next to numbers, booleans or dates, blank text is a missing value: the column keeps
 * their type, becomes nullable, and its blanks are to be written as null. In a column
 * of text, or of nothing but blanks, blank text is text like any other.
 * @param {Array<Object>} rows - Array of row objects
 * @param {Array<string>} columnNames - Columns to scan
 * @returns {Object<string, ColumnType>} Each column's type information
 */
export function scanColumnTypes(rows, columnNames) {
  const columnTypes = {};
  for (const key of columnNames) {
    columnTypes[key] = {
      hasNull: false,
      hasBlank: false,
      hasNumber: false,
      allIntegers: true,
      hasString: false,
      hasBoolean: false,
      hasDate: false,
      allMidnight: true,
      hasObject: false,
      blanksAreNull: false,
    };
  }

  for (const row of rows) {
    for (const key of columnNames) {
      const value = row[key];
      const typeInfo = columnTypes[key];

      if (value === null || value === undefined) {
        typeInfo.hasNull = true;
      } else if (isBlank(value)) {
        typeInfo.hasBlank = true;
      } else if (typeof value === "number") {
        typeInfo.hasNumber = true;
        // Beyond 2^53 an integer may already be rounded, and beyond 2^63 it overflows 64 bits
        if (!Number.isSafeInteger(value)) {
          typeInfo.allIntegers = false;
        }
      } else if (typeof value === "string") {
        typeInfo.hasString = true;
      } else if (typeof value === "boolean") {
        typeInfo.hasBoolean = true;
      } else if (value instanceof Date) {
        typeInfo.hasDate = true;
        if (value.getTime() % DAY_MS !== 0) {
          typeInfo.allMidnight = false;
        }
      } else if (typeof value === "object") {
        typeInfo.hasObject = true;
      }
    }
  }

  for (const key of columnNames) {
    const typeInfo = columnTypes[key];
    if (typeInfo.hasBlank) {
      typeInfo.blanksAreNull =
        !typeInfo.hasString &&
        !typeInfo.hasObject &&
        !(typeInfo.hasNumber && typeInfo.hasBoolean) &&
        (typeInfo.hasNumber || typeInfo.hasBoolean || typeInfo.hasDate);
      if (typeInfo.blanksAreNull) {
        typeInfo.hasNull = true;
      } else {
        typeInfo.hasString = true;
      }
    }
  }

  return columnTypes;
}

/**
 * Check whether a value is to be written as null: it is null or missing, or blank
 * text that its column treats as missing
 * @param {*} value - Cell value
 * @param {ColumnType} typeInfo - Its column's type information
 * @returns {boolean} True if the value is to be written as null
 */
export function isMissing(value, typeInfo) {
  return value === null || value === undefined || (typeInfo.blanksAreNull && isBlank(value));
}
