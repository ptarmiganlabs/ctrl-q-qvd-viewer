/**
 * QVD Statistical Analysis
 * Computes statistical metrics for numeric fields
 */

/**
 * Check if a value is numeric
 * @param {*} value - Value to check
 * @returns {boolean} True if numeric
 */
function isNumeric(value) {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  const num = Number(value);
  return !Number.isNaN(num) && Number.isFinite(num);
}

/**
 * Detect if a field is numeric by examining its values
 * @param {Array<Object>} data - Array of data rows
 * @param {string} fieldName - Field name to check
 * @param {number} threshold - Percentage threshold for numeric values (default: 0.9)
 * @returns {boolean} True if field is predominantly numeric
 */
export function isNumericField(data, fieldName, threshold = 0.9) {
  if (!data || data.length === 0) {
    return false;
  }

  let numericCount = 0;
  let nonNullCount = 0;

  // Sample up to 1000 rows for performance
  const sampleSize = Math.min(data.length, 1000);
  const step = Math.max(1, Math.floor(data.length / sampleSize));

  for (let i = 0; i < data.length; i += step) {
    const value = data[i][fieldName];
    if (value !== null && value !== undefined && value !== "") {
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
 * Sort numeric array for percentile calculations
 * @param {Array<number>} arr - Array to sort
 * @returns {Array<number>} Sorted array
 */
function sortNumeric(arr) {
  return arr.slice().sort((a, b) => a - b);
}

/**
 * Calculate percentile value using linear interpolation (R-7 method / pandas default)
 * @param {Array<number>} sortedData - Sorted numeric array
 * @param {number} percentile - Percentile to calculate (0-1)
 * @returns {number} Percentile value
 */
function calculatePercentile(sortedData, percentile) {
  if (sortedData.length === 0) {
    return null;
  }
  if (sortedData.length === 1) {
    return sortedData[0];
  }

  const n = sortedData.length;

  // R-7 method (default in R and pandas): h = 1 + (n-1)*p
  // Convert to 0-indexed: position = (n-1)*p
  const position = (n - 1) * percentile;

  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;

  if (lower === upper) {
    return sortedData[lower];
  }

  return sortedData[lower] * (1 - weight) + sortedData[upper] * weight;
}

/**
 * Calculate median directly from sorted values
 * @param {Array<number>} sortedValues - Sorted numeric array
 * @returns {number} Median value
 */
function calculateMedianDirect(sortedValues) {
  const n = sortedValues.length;
  if (n === 0) {
    return null;
  }
  if (n === 1) {
    return sortedValues[0];
  }

  const mid = Math.floor(n / 2);
  if (n % 2 === 0) {
    return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
  }
  return sortedValues[mid];
}

/**
 * Calculate mean (average)
 * @param {Array<number>} values - Array of numeric values
 * @returns {number} Mean value
 */
function calculateMean(values) {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/**
 * Calculate median
 * @param {Array<number>} sortedValues - Sorted array of numeric values
 * @returns {number} Median value
 */
function calculateMedian(sortedValues) {
  return calculatePercentile(sortedValues, 0.5);
}

/**
 * Calculate mode (most frequent value)
 * @param {Array<number>} values - Array of numeric values
 * @returns {Array<number>} Array of mode values (can be multiple)
 */
function calculateMode(values) {
  if (values.length === 0) {
    return [];
  }

  const frequency = new Map();
  let maxFreq = 0;

  for (const value of values) {
    const count = (frequency.get(value) || 0) + 1;
    frequency.set(value, count);
    maxFreq = Math.max(maxFreq, count);
  }

  // Return all values with maximum frequency
  const modes = [];
  for (const [value, count] of frequency.entries()) {
    if (count === maxFreq) {
      modes.push(value);
    }
  }

  // If all values appear once, there's no meaningful mode
  if (maxFreq === 1) {
    return [];
  }

  return modes.sort((a, b) => a - b);
}

/**
 * Calculate variance (sample variance)
 * @param {Array<number>} values - Array of numeric values
 * @param {number} mean - Pre-calculated mean
 * @returns {number} Sample variance
 */
function calculateVariance(values, mean) {
  if (values.length === 0) {
    return null;
  }
  if (values.length === 1) {
    return 0;
  }
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  // Use sample variance (n-1) for better statistical inference
  return squaredDiffs.reduce((acc, val) => acc + val, 0) / (values.length - 1);
}

/**
 * Calculate standard deviation
 * @param {number} variance - Pre-calculated variance
 * @returns {number} Standard deviation
 */
function calculateStdDev(variance) {
  return variance !== null ? Math.sqrt(variance) : null;
}

/**
 * Calculate skewness (distribution asymmetry)
 * @param {Array<number>} values - Array of numeric values
 * @param {number} mean - Pre-calculated mean
 * @param {number} stdDev - Pre-calculated standard deviation
 * @returns {number} Skewness
 */
function calculateSkewness(values, mean, stdDev) {
  if (values.length < 3 || stdDev === 0 || stdDev === null) {
    return null;
  }

  const n = values.length;
  const cubedDiffs = values.map((val) => Math.pow((val - mean) / stdDev, 3));
  const sum = cubedDiffs.reduce((acc, val) => acc + val, 0);

  return (n / ((n - 1) * (n - 2))) * sum;
}

/**
 * Calculate kurtosis (tail heaviness)
 * @param {Array<number>} values - Array of numeric values
 * @param {number} mean - Pre-calculated mean
 * @param {number} stdDev - Pre-calculated standard deviation
 * @returns {number} Excess kurtosis
 */
function calculateKurtosis(values, mean, stdDev) {
  if (values.length < 4 || stdDev === 0 || stdDev === null) {
    return null;
  }

  const n = values.length;
  const fourthPowerDiffs = values.map((val) =>
    Math.pow((val - mean) / stdDev, 4)
  );
  const sum = fourthPowerDiffs.reduce((acc, val) => acc + val, 0);

  // Excess kurtosis (subtract 3 for normal distribution baseline)
  const kurtosis =
    ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum -
    (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));

  return kurtosis;
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

  // Extract and filter numeric values
  const numericValues = [];
  let nullCount = 0;
  let nonNumericCount = 0;

  for (const row of data) {
    const value = row[fieldName];

    if (value === null || value === undefined || value === "") {
      nullCount++;
      continue;
    }

    if (isNumeric(value)) {
      numericValues.push(Number(value));
    } else {
      nonNumericCount++;
    }
  }

  // Check if field is predominantly numeric
  const totalNonNull = numericValues.length + nonNumericCount;
  if (totalNonNull === 0 || numericValues.length / totalNonNull < 0.9) {
    return {
      isNumeric: false,
      numericCount: numericValues.length,
      nonNumericCount,
      nullCount,
    };
  }

  // Sort values for percentile calculations
  const sortedValues = sortNumeric(numericValues);

  // Descriptive statistics
  const min = sortedValues[0];
  const max = sortedValues[sortedValues.length - 1];
  const sum = numericValues.reduce((acc, val) => acc + val, 0);
  const count = numericValues.length;
  const mean = calculateMean(numericValues);
  const median = calculateMedian(sortedValues);
  const mode = calculateMode(numericValues);

  // Spread measures
  const range = max - min;
  const variance = calculateVariance(numericValues, mean);
  const stdDev = calculateStdDev(variance);

  // Distribution metrics
  const percentiles = {
    p10: calculatePercentile(sortedValues, 0.1),
    p50: median,
    p90: calculatePercentile(sortedValues, 0.9),
  };

  const skewness = calculateSkewness(numericValues, mean, stdDev);
  const kurtosis = calculateKurtosis(numericValues, mean, stdDev);

  return {
    isNumeric: true,

    // Descriptive statistics
    descriptive: {
      min,
      max,
      mean,
      median,
      mode,
      sum,
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
      percentiles,
      skewness,
      kurtosis,
    },

    // Data quality
    quality: {
      nullCount,
      nonNumericCount,
      totalRows: data.length,
    },
  };
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
