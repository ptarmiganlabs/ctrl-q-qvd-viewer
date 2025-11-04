/**
 * Date Detection and Parsing
 * Handles detection of date fields and parsing of various date formats
 */

/**
 * Date format patterns for detection
 */
const DATE_PATTERNS = {
  ISO_8601:
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/,
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
export function parseDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const valueStr = String(value).trim();

  // Try ISO 8601 format
  if (
    DATE_PATTERNS.ISO_8601.test(valueStr) ||
    DATE_PATTERNS.ISO_DATE.test(valueStr)
  ) {
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
    const parts = valueStr.split("/");
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
    const parts = valueStr.split(".");
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
  if (
    !isNaN(date.getTime()) &&
    date.getFullYear() >= 1900 &&
    date.getFullYear() <= 2100
  ) {
    return date;
  }

  return null;
}

/**
 * Detect the format of date values in a field
 * @param {Array<*>} values - Array of date values
 * @returns {Object} Format detection results
 */
export function detectDateFormat(values) {
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

    // Check ISO_DATE before ISO_8601 since ISO_DATE is more specific
    if (DATE_PATTERNS.ISO_DATE.test(valueStr)) {
      formatCounts.ISO_DATE++;
    } else if (DATE_PATTERNS.ISO_8601.test(valueStr)) {
      formatCounts.ISO_8601++;
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
  let dominantFormat = "OTHER";
  let maxCount = 0;
  for (const [format, count] of Object.entries(formatCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantFormat = format;
    }
  }

  const formatDescriptions = {
    ISO_8601: "ISO 8601 with time",
    ISO_DATE: "ISO 8601 date (YYYY-MM-DD)",
    US_DATE: "US format (M/D/YYYY)",
    EU_DATE: "EU format (D.M.YYYY)",
    TIMESTAMP_MS: "Unix timestamp (milliseconds)",
    TIMESTAMP_S: "Unix timestamp (seconds)",
    YYYYMMDD: "Compact format (YYYYMMDD)",
    OTHER: "Mixed or other format",
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
