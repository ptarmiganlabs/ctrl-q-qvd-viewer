/**
 * Trend Analysis
 * Analyzes time series trends using linear regression
 */

/**
 * Analyze time series trends
 * @param {Float64Array} times - Each distinct date's time, as milliseconds since 1970, in ascending order
 * @param {ArrayLike<number>} counts - How many rows hold each
 * @param {number} dateCount - Rows with a date, the distinct ones' repeats included
 * @returns {Object} Trend analysis results
 */
export function analyzeTimeSeries(times, counts, dateCount) {
  if (dateCount < 3) {
    return {
      hasTrend: false,
      trendType: 'insufficient_data',
      description: 'Insufficient data for trend analysis',
    };
  }

  // Group by time periods (daily, weekly, monthly depending on span)
  const spanDays = Math.floor((times[times.length - 1] - times[0]) / (24 * 60 * 60 * 1000));

  let groupSize;
  let groupUnit;
  if (spanDays <= 31) {
    groupSize = 1; // Daily
    groupUnit = 'day';
  } else if (spanDays <= 365) {
    groupSize = 7; // Weekly
    groupUnit = 'week';
  } else {
    groupSize = 30; // Monthly
    groupUnit = 'month';
  }

  // Count dates per period
  const periodCounts = {};
  const baseTime = times[0];

  for (let i = 0; i < times.length; i++) {
    const daysSinceBase = Math.floor((times[i] - baseTime) / (24 * 60 * 60 * 1000));
    const period = Math.floor(daysSinceBase / groupSize);
    periodCounts[period] = (periodCounts[period] || 0) + counts[i];
  }

  // Calculate simple linear trend
  const periods = Object.keys(periodCounts).map(Number).sort((a, b) => a - b);
  if (periods.length < 2) {
    return {
      hasTrend: false,
      trendType: 'constant',
      description: 'Constant distribution over time',
    };
  }

  const periodRows = periods.map(p => periodCounts[p]);
  const n = periods.length;

  // Calculate means
  const meanX = periods.reduce((sum, x) => sum + x, 0) / n;
  const meanY = periodRows.reduce((sum, y) => sum + y, 0) / n;

  // Calculate slope using least squares method
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (periods[i] - meanX) * (periodRows[i] - meanY);
    denominator += Math.pow(periods[i] - meanX, 2);
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;

  // Determine trend type based on slope
  let trendType;
  let description;
  const relativeSlope = Math.abs(slope) / meanY;

  if (relativeSlope < 0.05) {
    trendType = 'constant';
    description = 'Relatively constant over time';
  } else if (slope > 0) {
    if (relativeSlope > 0.2) {
      trendType = 'strong_growth';
      description = 'Strong growth trend detected';
    } else {
      trendType = 'moderate_growth';
      description = 'Moderate growth trend detected';
    }
  } else {
    if (relativeSlope > 0.2) {
      trendType = 'strong_decline';
      description = 'Strong decline trend detected';
    } else {
      trendType = 'moderate_decline';
      description = 'Moderate decline trend detected';
    }
  }

  return {
    hasTrend: trendType !== 'constant',
    trendType,
    description,
    slope,
    groupUnit,
    periodCount: n,
  };
}
