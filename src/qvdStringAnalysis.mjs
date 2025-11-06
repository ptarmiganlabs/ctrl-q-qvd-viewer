/**
 * QVD String/Text Field Analysis
 * Computes comprehensive text analysis for string fields
 */

/**
 * Detect if a field is a string field (non-numeric)
 * @param {Array<Object>} data - Array of data rows
 * @param {string} fieldName - Field name to check
 * @param {number} threshold - Percentage threshold for string values (default: 0.8)
 * @returns {boolean} True if field is predominantly string
 */
export function isStringField(data, fieldName, threshold = 0.8) {
  if (!data || data.length === 0) {
    return false;
  }

  let stringCount = 0;
  let nonNullCount = 0;

  // Sample up to 1000 rows for performance
  const sampleSize = Math.min(data.length, 1000);
  const step = Math.max(1, Math.floor(data.length / sampleSize));

  for (let i = 0; i < data.length; i += step) {
    const value = data[i][fieldName];
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
 * Calculate length statistics for string values
 * @param {Array<string>} stringValues - Array of string values
 * @returns {Object} Length statistics
 */
function calculateLengthStats(stringValues) {
  if (stringValues.length === 0) {
    return {
      min: 0,
      max: 0,
      average: 0,
      mostCommon: 0,
      distribution: {},
    };
  }

  const lengths = stringValues.map((v) => v.length);
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  const sum = lengths.reduce((acc, len) => acc + len, 0);
  const average = sum / lengths.length;

  // Length frequency distribution
  const lengthFreq = new Map();
  for (const len of lengths) {
    lengthFreq.set(len, (lengthFreq.get(len) || 0) + 1);
  }

  // Find most common length
  let mostCommon = 0;
  let maxFreq = 0;
  for (const [len, freq] of lengthFreq.entries()) {
    if (freq > maxFreq) {
      maxFreq = freq;
      mostCommon = len;
    }
  }

  // Create distribution object (for histogram)
  const distribution = {};
  for (const [len, freq] of lengthFreq.entries()) {
    distribution[len] = freq;
  }

  return {
    min,
    max,
    average: parseFloat(average.toFixed(2)),
    mostCommon,
    mostCommonCount: maxFreq,
    distribution,
  };
}

/**
 * Detect common prefixes in string values
 * @param {Array<string>} stringValues - Array of string values
 * @param {number} minLength - Minimum prefix length (default: 2)
 * @param {number} minOccurrences - Minimum occurrences (default: 2)
 * @returns {Array<Object>} Common prefixes sorted by frequency
 */
function detectPrefixes(stringValues, minLength = 2, minOccurrences = 2) {
  const prefixFreq = new Map();

  for (const value of stringValues) {
    if (value.length >= minLength) {
      // Check prefixes from minLength to half the string length
      const maxPrefixLen = Math.min(value.length, 10); // Cap at 10 chars
      for (let len = minLength; len <= maxPrefixLen; len++) {
        const prefix = value.substring(0, len);
        prefixFreq.set(prefix, (prefixFreq.get(prefix) || 0) + 1);
      }
    }
  }

  // Filter by minimum occurrences and sort
  return Array.from(prefixFreq.entries())
    .filter(([, count]) => count >= minOccurrences)
    .map(([prefix, count]) => ({
      prefix,
      count,
      percentage: ((count / stringValues.length) * 100).toFixed(1),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10 prefixes
}

/**
 * Detect common suffixes in string values
 * @param {Array<string>} stringValues - Array of string values
 * @param {number} minLength - Minimum suffix length (default: 2)
 * @param {number} minOccurrences - Minimum occurrences (default: 2)
 * @returns {Array<Object>} Common suffixes sorted by frequency
 */
function detectSuffixes(stringValues, minLength = 2, minOccurrences = 2) {
  const suffixFreq = new Map();

  for (const value of stringValues) {
    if (value.length >= minLength) {
      // Check suffixes from minLength to half the string length
      const maxSuffixLen = Math.min(value.length, 10); // Cap at 10 chars
      for (let len = minLength; len <= maxSuffixLen; len++) {
        const suffix = value.substring(value.length - len);
        suffixFreq.set(suffix, (suffixFreq.get(suffix) || 0) + 1);
      }
    }
  }

  // Filter by minimum occurrences and sort
  return Array.from(suffixFreq.entries())
    .filter(([, count]) => count >= minOccurrences)
    .map(([suffix, count]) => ({
      suffix,
      count,
      percentage: ((count / stringValues.length) * 100).toFixed(1),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10 suffixes
}

/**
 * Analyze character composition of string values
 * @param {Array<string>} stringValues - Array of string values
 * @returns {Object} Character composition analysis
 */
function analyzeCharacterComposition(stringValues) {
  if (stringValues.length === 0) {
    return {
      alphanumericPercentage: 0,
      alphabeticPercentage: 0,
      numericPercentage: 0,
      specialCharCount: 0,
      whitespaceCount: 0,
      leadingWhitespaceCount: 0,
      trailingWhitespaceCount: 0,
      nonAsciiCount: 0,
    };
  }

  let totalChars = 0;
  let alphanumericChars = 0;
  let alphabeticChars = 0;
  let numericChars = 0;
  let specialChars = 0;
  let whitespaceChars = 0;
  let leadingWhitespace = 0;
  let trailingWhitespace = 0;
  let nonAsciiChars = 0;

  for (const value of stringValues) {
    totalChars += value.length;

    // Check leading/trailing whitespace
    if (value.length > 0 && /^\s/.test(value)) {
      leadingWhitespace++;
    }
    if (value.length > 0 && /\s$/.test(value)) {
      trailingWhitespace++;
    }

    // Analyze each character
    for (const char of value) {
      if (/[a-zA-Z0-9]/.test(char)) {
        alphanumericChars++;
        if (/[a-zA-Z]/.test(char)) {
          alphabeticChars++;
        } else {
          numericChars++;
        }
      } else if (/\s/.test(char)) {
        whitespaceChars++;
      } else {
        specialChars++;
      }

      // Check for non-ASCII characters
      if (char.charCodeAt(0) > 127) {
        nonAsciiChars++;
      }
    }
  }

  return {
    alphanumericPercentage:
      totalChars > 0
        ? parseFloat(((alphanumericChars / totalChars) * 100).toFixed(1))
        : 0,
    alphabeticPercentage:
      totalChars > 0
        ? parseFloat(((alphabeticChars / totalChars) * 100).toFixed(1))
        : 0,
    numericPercentage:
      totalChars > 0
        ? parseFloat(((numericChars / totalChars) * 100).toFixed(1))
        : 0,
    specialCharPercentage:
      totalChars > 0
        ? parseFloat(((specialChars / totalChars) * 100).toFixed(1))
        : 0,
    whitespacePercentage:
      totalChars > 0
        ? parseFloat(((whitespaceChars / totalChars) * 100).toFixed(1))
        : 0,
    leadingWhitespaceCount: leadingWhitespace,
    trailingWhitespaceCount: trailingWhitespace,
    nonAsciiCount: nonAsciiChars,
    nonAsciiPercentage:
      totalChars > 0
        ? parseFloat(((nonAsciiChars / totalChars) * 100).toFixed(1))
        : 0,
  };
}

/**
 * Analyze case composition of string values
 * @param {Array<string>} stringValues - Array of string values
 * @returns {Object} Case analysis
 */
function analyzeCaseComposition(stringValues) {
  if (stringValues.length === 0) {
    return {
      uppercaseCount: 0,
      lowercaseCount: 0,
      mixedCaseCount: 0,
      titleCaseCount: 0,
    };
  }

  let uppercaseCount = 0;
  let lowercaseCount = 0;
  let mixedCaseCount = 0;
  let titleCaseCount = 0;

  for (const value of stringValues) {
    // Skip values with no letters
    if (!/[a-zA-Z]/.test(value)) {
      continue;
    }

    const hasUppercase = /[A-Z]/.test(value);
    const hasLowercase = /[a-z]/.test(value);

    if (hasUppercase && !hasLowercase) {
      uppercaseCount++;
    } else if (hasLowercase && !hasUppercase) {
      lowercaseCount++;
    } else if (hasUppercase && hasLowercase) {
      mixedCaseCount++;

      // Check for title case (first letter uppercase, rest lowercase per word)
      const words = value.split(/\s+/);
      const isTitleCase = words.every((word) => {
        if (word.length === 0) return true;
        const firstChar = word[0];
        const restChars = word.substring(1);
        return /[A-Z]/.test(firstChar) && !/[A-Z]/.test(restChars);
      });

      if (isTitleCase) {
        titleCaseCount++;
      }
    }
  }

  return {
    uppercaseCount,
    lowercaseCount,
    mixedCaseCount,
    titleCaseCount,
    uppercasePercentage: parseFloat(
      ((uppercaseCount / stringValues.length) * 100).toFixed(1)
    ),
    lowercasePercentage: parseFloat(
      ((lowercaseCount / stringValues.length) * 100).toFixed(1)
    ),
    mixedCasePercentage: parseFloat(
      ((mixedCaseCount / stringValues.length) * 100).toFixed(1)
    ),
    titleCasePercentage: parseFloat(
      ((titleCaseCount / stringValues.length) * 100).toFixed(1)
    ),
  };
}

/**
 * Detect and validate data formats in string values
 * @param {Array<string>} stringValues - Array of string values
 * @returns {Object} Format detection results
 */
function detectFormats(stringValues) {
  const formats = {
    email: { count: 0, samples: [] },
    phone: { count: 0, samples: [], countries: new Map() },
    ssn: { count: 0, samples: [], countries: new Map() },
    url: { count: 0, samples: [] },
    dateString: { count: 0, samples: [], patterns: new Map() },
  };

  // Regex patterns for format detection
  const patterns = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    url: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i,

    // Phone patterns for different countries
    phone: {
      US: /^(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/,
      UK: /^(\+44[-.\s]?)?(\d{4}[-.\s]?\d{6}|\d{5}[-.\s]?\d{5})$/,
      DE: /^(\+49[-.\s]?\d{2,4}[-.\s]?\d{5,8}|0\d{2,4}[-.\s]?\d{5,8})$/,
      FR: /^(\+33[-.\s]?\d{1}[-.\s]?\d{2}[-.\s]?\d{2}[-.\s]?\d{2}[-.\s]?\d{2}|0\d{1}[-.\s]?\d{2}[-.\s]?\d{2}[-.\s]?\d{2}[-.\s]?\d{2})$/,
      NL: /^(\+31[-.\s]?\d{1,2}[-.\s]?\d{8}|0\d{1}[-.\s]?\d{8})$/,
      BE: /^(\+32[-.\s]?\d{1,2}[-.\s]?\d{6,7}|0\d{1,2}[-.\s]?\d{6,7})$/,
      SE: /^(\+46[-.\s]?\d{2,3}[-.\s]?\d{6,7}|0\d{2,3}[-.\s]?\d{6,7})$/,
      DK: /^(\+45[-.\s]?)?\d{8}$/,
      FI: /^(\+358[-.\s]?\d{1,2}[-.\s]?\d{6,8}|0\d{1,2}[-.\s]?\d{6,8})$/,
      generic: /^\+\d{1,3}[-.\s]?\d{4,14}$/, // Generic country code format
    },

    // SSN patterns for different countries
    ssn: {
      US: /^\d{3}[-]?\d{2}[-]?\d{4}$/,
      UK: /^[A-Z]{2}\d{6}[A-Z]$/,
      DE: /^\d{2}\d{6}[A-Z]\d{3}$/,
      FR: /^[12]\d{2}(0[1-9]|1[0-2])\d{2}\d{3}\d{3}\d{2}$/,
      NL: /^\d{9}$/,
      BE: /^\d{2}\.\d{2}\.\d{2}-\d{3}\.\d{2}$/,
      SE: /^\d{6}[-]?\d{4}$/,
      DK: /^\d{6}[-]?\d{4}$/,
      FI: /^\d{6}[-+A]?\d{3}[0-9A-Z]$/,
    },

    // Date patterns
    dateString: {
      "ISO 8601":
        /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/,
      "US format": /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
      "EU format": /^\d{1,2}\.\d{1,2}\.\d{2,4}$/,
      "Long format": /^\w{3,9}\s+\d{1,2},?\s+\d{4}$/,
    },
  };

  for (const value of stringValues) {
    const trimmedValue = value.trim();

    // Email detection
    if (patterns.email.test(trimmedValue)) {
      formats.email.count++;
      if (formats.email.samples.length < 5) {
        formats.email.samples.push(trimmedValue);
      }
    }

    // URL detection
    if (patterns.url.test(trimmedValue)) {
      formats.url.count++;
      if (formats.url.samples.length < 5) {
        formats.url.samples.push(trimmedValue);
      }
    }

    // Phone detection (multiple countries)
    let phoneMatched = false;
    for (const [country, pattern] of Object.entries(patterns.phone)) {
      if (pattern.test(trimmedValue)) {
        phoneMatched = true;
        formats.phone.count++;
        formats.phone.countries.set(
          country,
          (formats.phone.countries.get(country) || 0) + 1
        );
        if (formats.phone.samples.length < 5) {
          formats.phone.samples.push(trimmedValue);
        }
        break; // Stop after first match
      }
    }

    // SSN detection (multiple countries)
    if (!phoneMatched) {
      // Don't check SSN if phone matched
      for (const [country, pattern] of Object.entries(patterns.ssn)) {
        if (pattern.test(trimmedValue)) {
          formats.ssn.count++;
          formats.ssn.countries.set(
            country,
            (formats.ssn.countries.get(country) || 0) + 1
          );
          if (formats.ssn.samples.length < 5) {
            formats.ssn.samples.push(trimmedValue);
          }
          break; // Stop after first match
        }
      }
    }

    // Date string detection
    for (const [patternName, pattern] of Object.entries(patterns.dateString)) {
      if (pattern.test(trimmedValue)) {
        formats.dateString.count++;
        formats.dateString.patterns.set(
          patternName,
          (formats.dateString.patterns.get(patternName) || 0) + 1
        );
        if (formats.dateString.samples.length < 5) {
          formats.dateString.samples.push(trimmedValue);
        }
        break; // Stop after first match
      }
    }
  }

  // Convert Maps to objects for easier serialization
  return {
    email: {
      count: formats.email.count,
      percentage: parseFloat(
        ((formats.email.count / stringValues.length) * 100).toFixed(1)
      ),
      samples: formats.email.samples,
    },
    phone: {
      count: formats.phone.count,
      percentage: parseFloat(
        ((formats.phone.count / stringValues.length) * 100).toFixed(1)
      ),
      samples: formats.phone.samples,
      countryBreakdown: Object.fromEntries(formats.phone.countries),
    },
    ssn: {
      count: formats.ssn.count,
      percentage: parseFloat(
        ((formats.ssn.count / stringValues.length) * 100).toFixed(1)
      ),
      samples: formats.ssn.samples,
      countryBreakdown: Object.fromEntries(formats.ssn.countries),
    },
    url: {
      count: formats.url.count,
      percentage: parseFloat(
        ((formats.url.count / stringValues.length) * 100).toFixed(1)
      ),
      samples: formats.url.samples,
    },
    dateString: {
      count: formats.dateString.count,
      percentage: parseFloat(
        ((formats.dateString.count / stringValues.length) * 100).toFixed(1)
      ),
      samples: formats.dateString.samples,
      patternBreakdown: Object.fromEntries(formats.dateString.patterns),
    },
  };
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

  // Extract string values (non-null, non-empty)
  const stringValues = [];
  let nullCount = 0;

  for (const row of data) {
    const value = row[fieldName];

    if (value === null || value === undefined || value === "") {
      nullCount++;
      continue;
    }

    stringValues.push(String(value));
  }

  if (stringValues.length === 0) {
    return {
      isString: false,
      error: "No non-null values available",
      nullCount,
    };
  }

  // Perform analyses
  const lengthStats = calculateLengthStats(stringValues);
  const prefixes = detectPrefixes(stringValues);
  const suffixes = detectSuffixes(stringValues);
  const characterComposition = analyzeCharacterComposition(stringValues);
  const caseAnalysis = analyzeCaseComposition(stringValues);
  const formatDetection = detectFormats(stringValues);

  return {
    isString: true,
    valueCount: stringValues.length,
    nullCount,

    // Length statistics
    lengthStats,

    // Pattern detection
    patterns: {
      prefixes,
      suffixes,
    },

    // Character composition
    characterComposition,

    // Case analysis
    caseAnalysis,

    // Format detection
    formatDetection,
  };
}
