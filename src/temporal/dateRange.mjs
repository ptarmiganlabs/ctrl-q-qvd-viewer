/**
 * Date Range Analysis
 * Calculates date ranges, spans, and format detection
 */

import { detectDateFormat } from './dateDetection.mjs';

/**
 * Calculate date range analysis
 * @param {Array<Date>} dates - Array of parsed dates
 * @param {Array<*>} rawValues - Array of raw date values
 * @returns {Object} Date range analysis results
 */
export function calculateDateRange(dates, rawValues) {
  if (dates.length === 0) {
    return {
      earliest: null,
      latest: null,
      spanDays: 0,
      spanDescription: 'No valid dates',
    };
  }

  // Sort dates
  const sortedDates = dates.slice().sort((a, b) => a - b);
  const earliest = sortedDates[0];
  const latest = sortedDates[sortedDates.length - 1];

  // Calculate span
  const spanMs = latest - earliest;
  const spanDays = Math.floor(spanMs / (1000 * 60 * 60 * 24));

  // Generate span description
  // Note: Uses approximations (7 days/week, 30 days/month, 365 days/year) for readability
  let spanDescription;
  if (spanDays === 0) {
    spanDescription = 'Single day';
  } else if (spanDays < 7) {
    spanDescription = `${spanDays} day${spanDays > 1 ? 's' : ''}`;
  } else if (spanDays < 31) {
    const weeks = Math.floor(spanDays / 7);
    const remainingDays = spanDays % 7;
    spanDescription = `${weeks} week${weeks > 1 ? 's' : ''}`;
    if (remainingDays > 0) {
      spanDescription += `, ${remainingDays} day${remainingDays > 1 ? 's' : ''}`;
    }
  } else if (spanDays < 365) {
    const months = Math.floor(spanDays / 30);
    spanDescription = `${months} month${months > 1 ? 's' : ''}`;
  } else {
    const years = Math.floor(spanDays / 365);
    const remainingMonths = Math.floor((spanDays % 365) / 30);
    spanDescription = `${years} year${years > 1 ? 's' : ''}${remainingMonths > 0 ? `, ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}` : ''}`;
  }

  // Detect format
  const formatInfo = detectDateFormat(rawValues);

  return {
    earliest,
    latest,
    spanDays,
    spanDescription,
    format: formatInfo,
  };
}
