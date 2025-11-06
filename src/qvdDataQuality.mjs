/**
 * QVD Data Quality Metrics
 * Computes data quality metrics for QVD fields including completeness,
 * cardinality analysis, uniqueness, and distribution quality
 */

/**
 * Cardinality classification thresholds
 */
const CARDINALITY_THRESHOLDS = {
  HIGH: 0.8, // >80% unique values
  LOW: 0.05, // <5% unique values
};

/**
 * Calculate completeness metrics for a field
 * @param {Array<Object>} data - Array of data rows
 * @param {string} fieldName - Field name to analyze
 * @param {number} nullCount - Pre-calculated null count
 * @returns {Object} Completeness metrics
 */
function calculateCompletenessMetrics(data, fieldName, nullCount) {
  const totalRows = data.length;

  if (totalRows === 0) {
    return {
      nonNullPercentage: 0,
      fillRate: 0,
      missingCount: 0,
      missingPercentage: 0,
    };
  }

  // Count empty strings (not null/undefined, but empty)
  let emptyStringCount = 0;
  for (const row of data) {
    const value = row[fieldName];
    if (value === "") {
      emptyStringCount++;
    }
  }

  const nonNullCount = totalRows - nullCount;
  const populatedCount = nonNullCount - emptyStringCount;

  return {
    nonNullPercentage: (nonNullCount / totalRows) * 100,
    fillRate: (populatedCount / totalRows) * 100,
    missingCount: nullCount,
    missingPercentage: (nullCount / totalRows) * 100,
    emptyStringCount,
    emptyStringPercentage: (emptyStringCount / totalRows) * 100,
  };
}

/**
 * Classify cardinality level and provide recommendations
 * @param {number} cardinalityRatio - Ratio of unique values to total rows
 * @param {number} uniqueValues - Absolute number of unique values
 * @returns {Object} Classification and recommendations
 */
function classifyCardinality(cardinalityRatio, uniqueValues) {
  // For very small numbers of unique values (≤3), always classify as Low
  // regardless of the ratio (binary/ternary fields are always low cardinality)
  if (uniqueValues <= 3) {
    return {
      level: "Low",
      classification: "Low Cardinality",
      color: "green",
      recommendation:
        "Good dimension candidate. Suitable for filtering, grouping, and categorical analysis.",
    };
  }

  if (cardinalityRatio > CARDINALITY_THRESHOLDS.HIGH) {
    return {
      level: "High",
      classification: "High Cardinality",
      color: "blue",
      recommendation:
        "Potential identifier/key field. Consider using as a primary key or unique identifier.",
    };
  } else if (cardinalityRatio < CARDINALITY_THRESHOLDS.LOW) {
    return {
      level: "Low",
      classification: "Low Cardinality",
      color: "green",
      recommendation:
        "Good dimension candidate. Suitable for filtering, grouping, and categorical analysis.",
    };
  } else {
    return {
      level: "Medium",
      classification: "Medium Cardinality",
      color: "yellow",
      recommendation:
        "Good for filtering and grouping operations. Balanced selectivity for analysis.",
    };
  }
}

/**
 * Calculate uniqueness score and duplicate information
 * @param {Array<Object>} data - Array of data rows
 * @param {string} fieldName - Field name to analyze
 * @param {number} uniqueValues - Pre-calculated unique value count
 * @param {Map} valueCounts - Map of value frequencies (optional, for efficiency)
 * @returns {Object} Uniqueness metrics
 */
function calculateUniquenessMetrics(
  data,
  fieldName,
  uniqueValues,
  valueCounts = null
) {
  const totalRows = data.length;

  if (totalRows === 0) {
    return {
      uniquePercentage: 0,
      duplicateCount: 0,
      duplicatePercentage: 0,
      topDuplicates: [],
    };
  }

  // Build value counts if not provided
  if (!valueCounts) {
    valueCounts = new Map();
    for (const row of data) {
      const value = row[fieldName];
      if (value !== null && value !== undefined && value !== "") {
        const valueStr = String(value);
        valueCounts.set(valueStr, (valueCounts.get(valueStr) || 0) + 1);
      }
    }
  }

  // Count values that appear more than once
  let duplicateValueCount = 0; // Number of duplicate occurrences
  let duplicatedDistinctValues = 0; // Number of distinct values that have duplicates

  for (const [value, count] of valueCounts.entries()) {
    if (count > 1) {
      duplicateValueCount += count; // All occurrences of duplicated values
      duplicatedDistinctValues++;
    }
  }

  // Get top duplicated values (values with highest occurrence count)
  const topDuplicates = Array.from(valueCounts.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, count]) => ({
      value,
      count,
      percentage: ((count / totalRows) * 100).toFixed(2),
    }));

  return {
    uniquePercentage: (uniqueValues / totalRows) * 100,
    duplicateCount: duplicateValueCount,
    duplicatePercentage: (duplicateValueCount / totalRows) * 100,
    duplicatedDistinctValues,
    topDuplicates,
  };
}

/**
 * Calculate distribution evenness score using Pielou's evenness index
 * Based on Shannon entropy normalized by maximum entropy
 * @param {Map} valueCounts - Map of value frequencies
 * @param {number} totalNonNull - Total non-null values
 * @returns {Object} Distribution quality metrics
 */
function calculateDistributionQuality(valueCounts, totalNonNull) {
  if (totalNonNull === 0 || valueCounts.size === 0) {
    return {
      evennessScore: 0,
      shannonEntropy: 0,
      maxEntropy: 0,
      isSkewed: false,
      skewness: "N/A",
    };
  }

  // Calculate Shannon entropy: H = -Σ(p_i * log2(p_i))
  let shannonEntropy = 0;
  for (const count of valueCounts.values()) {
    const probability = count / totalNonNull;
    if (probability > 0) {
      shannonEntropy -= probability * Math.log2(probability);
    }
  }

  // Maximum entropy occurs when all values are equally distributed
  const maxEntropy = Math.log2(valueCounts.size);

  // Pielou's evenness index: J = H / H_max
  const evennessScore = maxEntropy > 0 ? shannonEntropy / maxEntropy : 0;

  // Determine if distribution is skewed
  // A distribution is considered skewed if evenness < 0.5
  const isSkewed = evennessScore < 0.5;

  // Classify skewness level
  let skewness;
  if (evennessScore >= 0.8) {
    skewness = "Very Even";
  } else if (evennessScore >= 0.6) {
    skewness = "Moderately Even";
  } else if (evennessScore >= 0.4) {
    skewness = "Slightly Skewed";
  } else if (evennessScore >= 0.2) {
    skewness = "Moderately Skewed";
  } else {
    skewness = "Highly Skewed";
  }

  return {
    evennessScore,
    shannonEntropy,
    maxEntropy,
    isSkewed,
    skewness,
  };
}

/**
 * Get quality status color based on metrics
 * @param {Object} metrics - Quality metrics
 * @returns {string} Color code (green/yellow/red)
 */
function getQualityColor(metrics) {
  const { completeness, cardinality, uniqueness, distribution } = metrics;

  // Red flags (critical issues)
  if (completeness.nonNullPercentage < 50) {
    return "red"; // More than 50% missing
  }
  if (completeness.fillRate < 30) {
    return "red"; // Very low fill rate
  }

  // Yellow flags (warnings)
  if (completeness.nonNullPercentage < 90) {
    return "yellow"; // More than 10% missing
  }
  if (completeness.fillRate < 80) {
    return "yellow"; // Low fill rate
  }
  if (distribution.isSkewed && distribution.evennessScore < 0.3) {
    return "yellow"; // Highly skewed distribution
  }

  // Green (good quality)
  return "green";
}

/**
 * Generate overall quality assessment
 * @param {Object} metrics - Quality metrics
 * @returns {Object} Assessment with score and summary
 */
function generateQualityAssessment(metrics) {
  const issues = [];
  const warnings = [];
  let qualityScore = 100;

  const { completeness, cardinality, uniqueness, distribution } = metrics;

  // Completeness checks
  if (completeness.nonNullPercentage < 50) {
    issues.push("Critical: More than 50% of values are missing");
    qualityScore -= 40;
  } else if (completeness.nonNullPercentage < 90) {
    warnings.push(
      `${completeness.missingPercentage.toFixed(1)}% of values are missing`
    );
    qualityScore -= 10;
  }

  if (completeness.fillRate < 50) {
    issues.push("Critical: Low fill rate with many empty strings");
    qualityScore -= 20;
  } else if (completeness.fillRate < 80) {
    warnings.push(
      `Fill rate is ${completeness.fillRate.toFixed(1)}% (many empty strings)`
    );
    qualityScore -= 5;
  }

  // Distribution checks
  if (distribution.isSkewed && distribution.evennessScore < 0.3) {
    warnings.push(`Distribution is ${distribution.skewness.toLowerCase()}`);
    qualityScore -= 5;
  }

  // Ensure score doesn't go below 0
  qualityScore = Math.max(0, qualityScore);

  return {
    qualityScore,
    qualityLevel:
      qualityScore >= 80 ? "Good" : qualityScore >= 50 ? "Fair" : "Poor",
    issues,
    warnings,
    color: getQualityColor(metrics),
  };
}

/**
 * Calculate comprehensive data quality metrics for a field
 * @param {Array<Object>} data - Array of data rows
 * @param {string} fieldName - Field name to analyze
 * @param {number} uniqueValues - Pre-calculated unique value count
 * @param {number} nullCount - Pre-calculated null count
 * @param {Map} valueCounts - Optional pre-calculated value frequencies
 * @returns {Object} Comprehensive quality metrics
 */
export function calculateDataQualityMetrics(
  data,
  fieldName,
  uniqueValues,
  nullCount,
  valueCounts = null
) {
  if (!data || data.length === 0) {
    return {
      error: "No data available for quality analysis",
    };
  }

  const totalRows = data.length;
  const totalNonNull = totalRows - nullCount;

  // Calculate cardinality ratio
  const cardinalityRatio = totalRows > 0 ? uniqueValues / totalRows : 0;
  const cardinalityInfo = classifyCardinality(cardinalityRatio, uniqueValues);

  // Calculate completeness metrics
  const completeness = calculateCompletenessMetrics(data, fieldName, nullCount);

  // Calculate uniqueness metrics
  const uniqueness = calculateUniquenessMetrics(
    data,
    fieldName,
    uniqueValues,
    valueCounts
  );

  // Calculate distribution quality
  // Build value counts if not provided
  let counts = valueCounts;
  if (!counts) {
    counts = new Map();
    for (const row of data) {
      const value = row[fieldName];
      if (value !== null && value !== undefined && value !== "") {
        const valueStr = String(value);
        counts.set(valueStr, (counts.get(valueStr) || 0) + 1);
      }
    }
  }
  const distribution = calculateDistributionQuality(counts, totalNonNull);

  // Cardinality analysis
  const cardinality = {
    ratio: cardinalityRatio,
    ...cardinalityInfo,
  };

  // Compile all metrics
  const metrics = {
    completeness,
    cardinality,
    uniqueness,
    distribution,
  };

  // Generate overall assessment
  const assessment = generateQualityAssessment(metrics);

  return {
    ...metrics,
    assessment,
  };
}

/**
 * Format quality metrics for display
 * @param {Object} quality - Quality metrics object
 * @returns {Object} Formatted metrics for UI display
 */
export function formatQualityMetrics(quality) {
  if (quality.error) {
    return { error: quality.error };
  }

  return {
    completeness: {
      nonNullPercentage: quality.completeness.nonNullPercentage.toFixed(2),
      fillRate: quality.completeness.fillRate.toFixed(2),
      missingCount: quality.completeness.missingCount,
      missingPercentage: quality.completeness.missingPercentage.toFixed(2),
      emptyStringCount: quality.completeness.emptyStringCount,
      emptyStringPercentage:
        quality.completeness.emptyStringPercentage.toFixed(2),
    },
    cardinality: {
      ratio: quality.cardinality.ratio.toFixed(4),
      ratioPercentage: (quality.cardinality.ratio * 100).toFixed(2),
      level: quality.cardinality.level,
      classification: quality.cardinality.classification,
      color: quality.cardinality.color,
      recommendation: quality.cardinality.recommendation,
    },
    uniqueness: {
      uniquePercentage: quality.uniqueness.uniquePercentage.toFixed(2),
      duplicateCount: quality.uniqueness.duplicateCount,
      duplicatePercentage: quality.uniqueness.duplicatePercentage.toFixed(2),
      duplicatedDistinctValues: quality.uniqueness.duplicatedDistinctValues,
      topDuplicates: quality.uniqueness.topDuplicates,
    },
    distribution: {
      evennessScore: quality.distribution.evennessScore.toFixed(3),
      evennessPercentage: (quality.distribution.evennessScore * 100).toFixed(1),
      shannonEntropy: quality.distribution.shannonEntropy.toFixed(3),
      maxEntropy: quality.distribution.maxEntropy.toFixed(3),
      isSkewed: quality.distribution.isSkewed,
      skewness: quality.distribution.skewness,
    },
    assessment: quality.assessment,
  };
}
