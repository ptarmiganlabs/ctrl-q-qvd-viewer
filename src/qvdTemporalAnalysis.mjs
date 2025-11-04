/**
 * QVD Temporal Analysis - Main Module
 * Provides specialized profiling for date and timestamp fields including
 * range analysis, temporal distribution, gap detection, and trend analysis
 *
 * This module orchestrates the various temporal analysis components.
 */

import { isDateField, parseDate } from "./temporal/dateDetection.mjs";
import { calculateDateRange } from "./temporal/dateRange.mjs";
import { calculateTemporalDistribution } from "./temporal/distribution.mjs";
import { detectDateGaps } from "./temporal/gapDetection.mjs";
import { analyzeTimeSeries } from "./temporal/trendAnalysis.mjs";

// Re-export detection function
export { isDateField } from "./temporal/dateDetection.mjs";

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

  // Parse all dates
  const parsedDates = [];
  const rawValues = [];
  let nullCount = 0;
  let invalidDateCount = 0;

  for (const row of data) {
    const value = row[fieldName];

    if (value === null || value === undefined || value === "") {
      nullCount++;
      continue;
    }

    rawValues.push(value);
    const date = parseDate(value);
    if (date !== null) {
      parsedDates.push(date);
    } else {
      invalidDateCount++;
    }
  }

  // Check if field is predominantly dates
  // Use 60% threshold to allow for some invalid entries while still
  // recognizing the field as temporal
  const totalNonNull = parsedDates.length + invalidDateCount;
  if (totalNonNull === 0 || parsedDates.length / totalNonNull < 0.6) {
    return {
      isDate: false,
      dateCount: parsedDates.length,
      invalidDateCount,
      nullCount,
    };
  }

  // Calculate analyses
  const rangeAnalysis = calculateDateRange(parsedDates, rawValues);
  const distribution = calculateTemporalDistribution(parsedDates);
  const gapAnalysis = detectDateGaps(parsedDates);
  const trendAnalysis = analyzeTimeSeries(parsedDates);

  return {
    isDate: true,

    // Date range
    range: rangeAnalysis,

    // Temporal distribution
    distribution,

    // Gap detection
    gaps: gapAnalysis,

    // Trend analysis
    trends: trendAnalysis,

    // Data quality
    quality: {
      nullCount,
      invalidDateCount,
      validDateCount: parsedDates.length,
      totalRows: data.length,
      validPercentage: (parsedDates.length / data.length) * 100,
    },
  };
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
