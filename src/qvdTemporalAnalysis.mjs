/**
 * QVD Temporal Analysis - Main Module
 * Provides specialized profiling for date and timestamp fields including
 * range analysis, temporal distribution, gap detection, and trend analysis
 *
 * This module orchestrates the various temporal analysis components.
 */

import { calculateDateRange } from "./temporal/dateRange.mjs";
import { detectDateGaps } from "./temporal/gapDetection.mjs";
import { analyzeTimeSeries } from "./temporal/trendAnalysis.mjs";
import { summarizeRows } from "./fieldSummary.mjs";

// Re-export detection functions
export { isDateField, isDateSample } from "./temporal/dateDetection.mjs";

/**
 * The temporal analysis of a date field, from its summary
 * @param {object} dates - The summary's dates: each distinct date's time and rows, their
 *   distribution, the valid, invalid and null rows, and the first values in row order:
 *   see FieldSummarizer.summary()
 * @returns {Object} Temporal analysis results
 */
export function temporalFrom(dates) {
  const { validCount, invalidCount, nullCount, totalRows, times, rows, distribution, firstValues } = dates;

  // Check if field is predominantly dates
  // Use 60% threshold to allow for some invalid entries while still
  // recognizing the field as temporal
  const totalNonNull = validCount + invalidCount;
  if (totalNonNull === 0 || validCount / totalNonNull < 0.6) {
    return {
      isDate: false,
      dateCount: validCount,
      invalidDateCount: invalidCount,
      nullCount,
    };
  }

  return {
    isDate: true,

    // Date range
    range: calculateDateRange(times, firstValues),

    // Temporal distribution, by year, month, day of week and quarter
    distribution,

    // Gap detection
    gaps: detectDateGaps(times, validCount),

    // Trend analysis
    trends: analyzeTimeSeries(times, rows, validCount),

    // Data quality
    quality: {
      nullCount,
      invalidDateCount: invalidCount,
      validDateCount: validCount,
      totalRows,
      validPercentage: (validCount / totalRows) * 100,
    },
  };
}

/**
 * Calculate comprehensive temporal analysis for a date field
 * @param {Array<Object>} data - Array of data rows
 * @param {string} fieldName - Field name to analyze
 * @returns {Object} Temporal analysis results
 */
export function calculateTemporalAnalysis(data, fieldName) {
  if (!data || data.length === 0) {
    return {
      isDate: false,
      error: "No data available",
    };
  }
  const { dates } = summarizeRows(data, fieldName, { kinds: { numeric: false, date: true, string: false } });
  return temporalFrom(dates);
}

/**
 * Format date for display
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return "N/A";
  }
  return date.toISOString().split("T")[0];
}

/**
 * Format datetime for display
 * @param {Date} date - Date to format
 * @returns {string} Formatted datetime string
 */
export function formatDateTime(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return "N/A";
  }
  return date.toISOString();
}
