/**
 * QVD Temporal Analysis
 * Provides specialized profiling for date and timestamp fields including
 * range analysis, temporal distribution, gap detection, and trend analysis
 */

/**
 * Date format patterns for detection
 */
const DATE_PATTERNS = {
  ISO_8601: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/,
  ISO_DATE: /^\d{4}-\d{2}-\d{2}$/,
  US_DATE: /^\d{1,2}\/\d{1,2}\/\d{4}$/,
  EU_DATE: /^\d{1,2}\.\d{1,2}\.\d{4}$/,
  TIMESTAMP_MS: /^\d{13}$/,
  TIMESTAMP_S: /^\d{10}$/,
  YYYYMMDD: /^\d{8}$/,
};

/**
 * Check if a value can be parsed as a date
 * @param {*} value - Value to check
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const valueStr = String(value).trim();

  // Try ISO 8601 format
  if (DATE_PATTERNS.ISO_8601.test(valueStr) || DATE_PATTERNS.ISO_DATE.test(valueStr)) {
    const date = new Date(valueStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Try timestamp (milliseconds)
  if (DATE_PATTERNS.TIMESTAMP_MS.test(valueStr)) {
    const timestamp = parseInt(valueStr, 10);
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Try timestamp (seconds)
  if (DATE_PATTERNS.TIMESTAMP_S.test(valueStr)) {
    const timestamp = parseInt(valueStr, 10);
    const date = new Date(timestamp * 1000);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Try YYYYMMDD format
  if (DATE_PATTERNS.YYYYMMDD.test(valueStr)) {
    const year = parseInt(valueStr.substring(0, 4), 10);
    const month = parseInt(valueStr.substring(4, 6), 10) - 1;
    const day = parseInt(valueStr.substring(6, 8), 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Try US date format (M/D/YYYY or MM/DD/YYYY)
  if (DATE_PATTERNS.US_DATE.test(valueStr)) {
    const parts = valueStr.split('/');
    const month = parseInt(parts[0], 10) - 1;
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Try EU date format (D.M.YYYY or DD.MM.YYYY)
  if (DATE_PATTERNS.EU_DATE.test(valueStr)) {
    const parts = valueStr.split('.');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Try native Date parsing as last resort
  const date = new Date(valueStr);
  if (!isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() <= 2100) {
    return date;
  }

  return null;
}

/**
 * Detect the format of date values in a field
 * @param {Array<*>} values - Array of date values
 * @returns {Object} Format detection results
 */
function detectDateFormat(values) {
  const formatCounts = {
    ISO_8601: 0,
    ISO_DATE: 0,
    US_DATE: 0,
    EU_DATE: 0,
    TIMESTAMP_MS: 0,
    TIMESTAMP_S: 0,
    YYYYMMDD: 0,
    OTHER: 0,
  };

  let sampleCount = 0;
  const maxSamples = Math.min(values.length, 100);

  for (let i = 0; i < maxSamples && sampleCount < 100; i++) {
    const value = values[i];
    if (value === null || value === undefined || value === "") {
      continue;
    }

    const valueStr = String(value).trim();
    sampleCount++;

    if (DATE_PATTERNS.ISO_8601.test(valueStr)) {
      formatCounts.ISO_8601++;
    } else if (DATE_PATTERNS.ISO_DATE.test(valueStr)) {
      formatCounts.ISO_DATE++;
    } else if (DATE_PATTERNS.US_DATE.test(valueStr)) {
      formatCounts.US_DATE++;
    } else if (DATE_PATTERNS.EU_DATE.test(valueStr)) {
      formatCounts.EU_DATE++;
    } else if (DATE_PATTERNS.TIMESTAMP_MS.test(valueStr)) {
      formatCounts.TIMESTAMP_MS++;
    } else if (DATE_PATTERNS.TIMESTAMP_S.test(valueStr)) {
      formatCounts.TIMESTAMP_S++;
    } else if (DATE_PATTERNS.YYYYMMDD.test(valueStr)) {
      formatCounts.YYYYMMDD++;
    } else {
      formatCounts.OTHER++;
    }
  }

  // Find dominant format
  let dominantFormat = 'OTHER';
  let maxCount = 0;
  for (const [format, count] of Object.entries(formatCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantFormat = format;
    }
  }

  const formatDescriptions = {
    ISO_8601: 'ISO 8601 with time',
    ISO_DATE: 'ISO 8601 date (YYYY-MM-DD)',
    US_DATE: 'US format (M/D/YYYY)',
    EU_DATE: 'EU format (D.M.YYYY)',
    TIMESTAMP_MS: 'Unix timestamp (milliseconds)',
    TIMESTAMP_S: 'Unix timestamp (seconds)',
    YYYYMMDD: 'Compact format (YYYYMMDD)',
    OTHER: 'Mixed or other format',
  };

  return {
    dominantFormat,
    formatDescription: formatDescriptions[dominantFormat],
    formatCounts,
    confidence: sampleCount > 0 ? (maxCount / sampleCount) * 100 : 0,
  };
}

/**
 * Detect if a field contains date/timestamp values
 * @param {Array<Object>} data - Array of data rows
 * @param {string} fieldName - Field name to check
 * @param {number} threshold - Percentage threshold for date values (default: 0.8)
 * @returns {boolean} True if field is predominantly dates
 */
export function isDateField(data, fieldName, threshold = 0.8) {
  if (!data || data.length === 0) {
    return false;
  }

  let dateCount = 0;
  let nonNullCount = 0;

  // Sample up to 1000 rows for performance
  const sampleSize = Math.min(data.length, 1000);
  const step = Math.max(1, Math.floor(data.length / sampleSize));

  for (let i = 0; i < data.length; i += step) {
    const value = data[i][fieldName];
    if (value !== null && value !== undefined && value !== "") {
      nonNullCount++;
      if (parseDate(value) !== null) {
        dateCount++;
      }
    }
  }

  if (nonNullCount === 0) {
    return false;
  }

  return dateCount / nonNullCount >= threshold;
}

/**
 * Calculate date range analysis
 * @param {Array<Date>} dates - Array of parsed dates
 * @param {Array<*>} rawValues - Array of raw date values
 * @returns {Object} Date range analysis results
 */
function calculateDateRange(dates, rawValues) {
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

/**
 * Calculate temporal distribution
 * @param {Array<Date>} dates - Array of parsed dates
 * @returns {Object} Temporal distribution analysis
 */
function calculateTemporalDistribution(dates) {
  if (dates.length === 0) {
    return {
      byYear: {},
      byMonth: {},
      byDayOfWeek: {},
      byQuarter: {},
    };
  }

  const byYear = {};
  const byMonth = {};
  const byDayOfWeek = {};
  const byQuarter = {};

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  for (const date of dates) {
    // By year
    const year = date.getFullYear();
    byYear[year] = (byYear[year] || 0) + 1;

    // By month
    const month = monthNames[date.getMonth()];
    byMonth[month] = (byMonth[month] || 0) + 1;

    // By day of week
    const dayOfWeek = dayNames[date.getDay()];
    byDayOfWeek[dayOfWeek] = (byDayOfWeek[dayOfWeek] || 0) + 1;

    // By quarter
    const quarter = `Q${Math.floor(date.getMonth() / 3) + 1} ${year}`;
    byQuarter[quarter] = (byQuarter[quarter] || 0) + 1;
  }

  // Sort and format results
  const sortedYears = Object.entries(byYear)
    .sort((a, b) => a[0] - b[0])
    .map(([year, count]) => ({ period: year, count }));

  const sortedMonths = monthNames
    .map(month => ({ period: month, count: byMonth[month] || 0 }))
    .filter(item => item.count > 0);

  const sortedDaysOfWeek = dayNames
    .map(day => ({ period: day, count: byDayOfWeek[day] || 0 }))
    .filter(item => item.count > 0);

  const sortedQuarters = Object.entries(byQuarter)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([quarter, count]) => ({ period: quarter, count }));

  return {
    byYear: sortedYears,
    byMonth: sortedMonths,
    byDayOfWeek: sortedDaysOfWeek,
    byQuarter: sortedQuarters,
  };
}

/**
 * Detect gaps in date sequences
 * @param {Array<Date>} dates - Array of parsed dates (should be sorted)
 * @param {number} expectedGapDays - Expected gap between consecutive dates (default: 1)
 * @returns {Object} Gap detection analysis
 */
function detectDateGaps(dates, expectedGapDays = 1) {
  if (dates.length < 2) {
    return {
      hasGaps: false,
      gapCount: 0,
      largestGap: null,
      gaps: [],
      coverage: 100,
    };
  }

  const sortedDates = dates.slice().sort((a, b) => a - b);
  const gaps = [];
  const expectedGapMs = expectedGapDays * 24 * 60 * 60 * 1000;
  let largestGap = null;

  for (let i = 1; i < sortedDates.length; i++) {
    const gapMs = sortedDates[i] - sortedDates[i - 1];
    const gapDays = gapMs / (24 * 60 * 60 * 1000);

    // Consider it a gap if it's significantly larger than expected
    // Using 1.5x multiplier to allow for minor variations (e.g., weekends in daily data)
    if (gapMs > expectedGapMs * 1.5) {
      const gap = {
        from: sortedDates[i - 1],
        to: sortedDates[i],
        days: Math.floor(gapDays),
      };
      gaps.push(gap);

      if (largestGap === null || gapDays > largestGap.days) {
        largestGap = gap;
      }
    }
  }

  // Calculate coverage (actual unique dates vs. expected dates in range)
  // Note: Uses unique date count to handle duplicates correctly
  const uniqueDates = new Set(sortedDates.map(d => d.getTime()));
  const totalSpanDays = Math.floor((sortedDates[sortedDates.length - 1] - sortedDates[0]) / (24 * 60 * 60 * 1000));
  const expectedDates = Math.floor(totalSpanDays / expectedGapDays) + 1;
  const actualUniqueDates = uniqueDates.size;
  const coverage = expectedDates > 0 ? (actualUniqueDates / expectedDates) * 100 : 100;

  return {
    hasGaps: gaps.length > 0,
    gapCount: gaps.length,
    largestGap,
    gaps: gaps.slice(0, 10), // Return top 10 gaps
    coverage: Math.min(100, coverage),
    expectedDates,
    actualDates: actualUniqueDates,
  };
}

/**
 * Analyze time series trends
 * @param {Array<Date>} dates - Array of parsed dates
 * @returns {Object} Trend analysis results
 */
function analyzeTimeSeries(dates) {
  if (dates.length < 3) {
    return {
      hasTrend: false,
      trendType: 'insufficient_data',
      description: 'Insufficient data for trend analysis',
    };
  }

  const sortedDates = dates.slice().sort((a, b) => a - b);

  // Group by time periods (daily, weekly, monthly depending on span)
  const spanDays = Math.floor((sortedDates[sortedDates.length - 1] - sortedDates[0]) / (24 * 60 * 60 * 1000));

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
  const baseTime = sortedDates[0].getTime();

  for (const date of sortedDates) {
    const daysSinceBase = Math.floor((date.getTime() - baseTime) / (24 * 60 * 60 * 1000));
    const period = Math.floor(daysSinceBase / groupSize);
    periodCounts[period] = (periodCounts[period] || 0) + 1;
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

  const counts = periods.map(p => periodCounts[p]);
  const n = periods.length;
  
  // Calculate means
  const meanX = periods.reduce((sum, x) => sum + x, 0) / n;
  const meanY = counts.reduce((sum, y) => sum + y, 0) / n;

  // Calculate slope using least squares method
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (periods[i] - meanX) * (counts[i] - meanY);
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
      error: 'No data available',
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
  const totalNonNull = parsedDates.length + invalidDateCount;
  if (totalNonNull === 0 || parsedDates.length / totalNonNull < 0.8) {
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
    return 'N/A';
  }
  return date.toISOString().split('T')[0];
}

/**
 * Format datetime for display
 * @param {Date} date - Date to format
 * @returns {string} Formatted datetime string
 */
export function formatDateTime(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return 'N/A';
  }
  return date.toISOString();
}
