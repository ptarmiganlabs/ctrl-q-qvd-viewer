/**
 * QVD Statistical Analysis
 * Computes statistical metrics for numeric fields
 *
 * The statistics come from a field's summary (fieldSummary.mjs): its distinct
 * numbers and their rows, and the sum, variance and higher moments taken over its
 * rows in row order, so that they are the numbers a profile of every row gives.
 */

import { isBlank, toCellValue } from "./cellValue.mjs";
import { summarizeRows } from "./fieldSummary.mjs";
import { drain, histogramOf } from "./sortedNumbers.mjs";
import { sampleOf } from "./profileSample.mjs";

// Most modes a field's statistics list
export { MAX_MODES } from "./fieldSummary.mjs";

/**
 * Check if a value is numeric: a number, or text the reader reads as one, so that a
 * code such as 0901 or blank text isn't a number here either
 * @param {*} value - Value to check
 * @returns {boolean} True if numeric
 */
function isNumeric(value) {
  return typeof toCellValue(value) === "number";
}

/**
 * Detect if sampled values are predominantly numeric
 * @param {Array<*>} values - A field's values at the rows sampleOf() looks at
 * @param {number} threshold - Percentage threshold for numeric values (default: 0.9)
 * @returns {boolean} True if they are predominantly numeric
 */
export function isNumericSample(values, threshold = 0.9) {
  let numericCount = 0;
  let nonNullCount = 0;

  for (const value of values) {
    // Blank text, like a null, is no value
    if (value !== null && value !== undefined && !isBlank(value)) {
      nonNullCount++;
      if (isNumeric(value)) {
        numericCount++;
      }
    }
  }

  if (nonNullCount === 0) {
    return false;
  }

  return numericCount / nonNullCount >= threshold;
}

/**
 * Detect if a field is numeric by examining its values
 * About a thousand rows, spread over the field, are looked at: see profileSample.mjs
 * @param {Array<Object>} data - Array of data rows
 * @param {string} fieldName - Field name to check
 * @param {number} threshold - Percentage threshold for numeric values (default: 0.9)
 * @returns {boolean} True if field is predominantly numeric
 */
export function isNumericField(data, fieldName, threshold = 0.9) {
  if (!data || data.length === 0) {
    return false;
  }
  return isNumericSample(sampleOf(data, fieldName), threshold);
}

/**
 * Sort a field's numeric values into up to 20 bins of equal width, for the
 * profiling histogram
 * @param {number[]} sortedValues - Every numeric value of the field, in ascending order
 * @param {number} totalCount - Rows with a value, numeric or not: the percentages are shares of these
 * @returns {{labels: string[], counts: number[], rows: Array<{from: string, to: string, count: number, percentage: string}>}|null}
 *   The chart's labels and bar heights and the histogram table's rows, or null when there are no values
 */
export function calculateHistogram(sortedValues, totalCount) {
  if (!sortedValues || sortedValues.length === 0) {
    return null;
  }
  const values = [];
  const rows = [];
  for (const value of sortedValues) {
    if (values.length > 0 && value === values[values.length - 1]) {
      rows[rows.length - 1]++;
    } else {
      values.push(value);
      rows.push(1);
    }
  }
  return drain(histogramOf(values, rows, sortedValues.length, totalCount));
}

/**
 * The statistics of a numeric field, from its summary
 * @param {object} numbers - The summary's numbers: see FieldSummarizer.summary()
 * @returns {Object} Statistical analysis results
 */
export function statisticsFrom(numbers) {
  const { numericCount: count, nonNumericCount, nullCount, totalRows } = numbers;
  if (!numbers.isNumeric) {
    return {
      isNumeric: false,
      numericCount: count,
      nonNumericCount,
      nullCount,
    };
  }

  const { positions, zeroSigns } = numbers;
  // The number at a position of every row's number in sorted order, rows that hold
  // the same in row order: -0 or 0 as their rows have them
  const at = (position) => {
    const { value, start } = positions.get(position);
    if (value === 0 && zeroSigns) {
      const negative = zeroSigns.get(position - start);
      if (negative !== undefined) {
        return negative ? -0 : 0;
      }
    }
    return value;
  };
  // Percentile by linear interpolation (R-7 method / pandas default)
  const percentile = (p) => {
    if (count === 1) {
      return at(0);
    }
    const position = (count - 1) * p;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const weight = position - lower;
    if (lower === upper) {
      return at(lower);
    }
    return at(lower) * (1 - weight) + at(upper) * weight;
  };

  // Descriptive statistics
  const min = at(0);
  const max = at(count - 1);
  const median = percentile(0.5);

  // Spread measures
  const range = max - min;
  const { mean, variance, stdDev } = numbers;

  // Distribution metrics: skewness and excess kurtosis, from the third and fourth
  // powers of the standardized values
  const skewness =
    count < 3 || stdDev === 0 || stdDev === null
      ? null
      : (count / ((count - 1) * (count - 2))) * numbers.skewSum;
  const kurtosis =
    count < 4 || stdDev === 0 || stdDev === null
      ? null
      : ((count * (count + 1)) / ((count - 1) * (count - 2) * (count - 3))) * numbers.kurtSum -
        (3 * Math.pow(count - 1, 2)) / ((count - 2) * (count - 3));

  return {
    isNumeric: true,

    // Descriptive statistics
    descriptive: {
      min,
      max,
      mean,
      median,
      // The smallest modes, if there are more than can be listed
      mode: numbers.modes,
      // How many modes there are, listed or not
      modeCount: numbers.modeCount,
      sum: numbers.sum,
      count,
    },

    // Spread measures
    spread: {
      range,
      variance,
      stdDev,
    },

    // Distribution metrics
    distribution: {
      percentiles: {
        p10: percentile(0.1),
        p50: median,
        p90: percentile(0.9),
      },
      skewness,
      kurtosis,
    },

    // Histogram bins over every numeric value, for the profiling chart and table
    histogram: numbers.histogram,

    // Data quality
    quality: {
      nullCount,
      nonNumericCount,
      totalRows,
    },
  };
}

/**
 * Calculate comprehensive statistics for numeric field
 * @param {Array<Object>} data - Array of data rows
 * @param {string} fieldName - Field name to analyze
 * @returns {Object} Statistical analysis results
 */
export function calculateStatistics(data, fieldName) {
  if (!data || data.length === 0) {
    return {
      isNumeric: false,
      error: "No data available",
    };
  }
  const { numbers } = summarizeRows(data, fieldName, { kinds: { numeric: true, date: false, string: false } });
  return statisticsFrom(numbers);
}

/**
 * Format number for display with appropriate precision
 * @param {number} value - Number to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted number
 */
export function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined) {
    return "N/A";
  }
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  // Use exponential notation for very small numbers, but not if we have enough decimals
  if (Math.abs(value) < 0.01 && value !== 0) {
    // Check if the value can be represented with the given decimals
    const formatted = value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    // If the formatted value rounds to 0, use exponential notation
    if (parseFloat(formatted.replace(/,/g, "")) === 0) {
      return value.toExponential(2);
    }
    return formatted;
  }

  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
