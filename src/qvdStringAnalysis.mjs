/**
 * QVD String/Text Field Analysis
 * Computes comprehensive text analysis for string fields
 *
 * What is counted, a distinct value at a time, is in stringFeatures.mjs.
 */

import { summarizeRows } from "./fieldSummary.mjs";
import { sampleOf } from "./profileSample.mjs";

/**
 * Detect if sampled values are predominantly strings (non-numeric)
 * @param {Array<*>} values - A field's values at the rows sampleOf() looks at
 * @param {number} threshold - Percentage threshold for string values (default: 0.8)
 * @returns {boolean} True if they are predominantly strings
 */
export function isStringSample(values, threshold = 0.8) {
  let stringCount = 0;
  let nonNullCount = 0;

  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") {
      nonNullCount++;
      // Check if it's a string and not a pure number
      const strValue = String(value);
      const num = Number(value);
      if (isNaN(num) || !isFinite(num) || strValue !== num.toString()) {
        stringCount++;
      }
    }
  }

  if (nonNullCount === 0) {
    return false;
  }

  return stringCount / nonNullCount >= threshold;
}

/**
 * Detect if a field is a string field (non-numeric)
 * About a thousand rows, spread over the field, are looked at: see profileSample.mjs
 * @param {Array<Object>} data - Array of data rows
 * @param {string} fieldName - Field name to check
 * @param {number} threshold - Percentage threshold for string values (default: 0.8)
 * @returns {boolean} True if field is predominantly string
 */
export function isStringField(data, fieldName, threshold = 0.8) {
  if (!data || data.length === 0) {
    return false;
  }
  return isStringSample(sampleOf(data, fieldName), threshold);
}

/**
 * Calculate comprehensive string analysis for a field
 * @param {Array<Object>} data - Array of data rows
 * @param {string} fieldName - Field name to analyze
 * @returns {Object} String analysis results
 */
export function calculateStringAnalysis(data, fieldName) {
  if (!data || data.length === 0) {
    return {
      isString: false,
      error: "No data available",
    };
  }
  return summarizeRows(data, fieldName, { kinds: { numeric: false, date: false, string: true } }).strings;
}
