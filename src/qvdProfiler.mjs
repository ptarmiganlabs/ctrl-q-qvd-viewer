/**
 * QVD Data Profiler
 * Computes value distribution statistics for QVD fields
 */

/**
 * Compute value frequency distribution for specified fields
 * @param {Array<Object>} data - Array of data rows
 * @param {Array<string>} fieldNames - Field names to profile
 * @param {number} maxUniqueValues - Maximum unique values to track (default: 1000)
 * @returns {Object} Profiling results with frequency distributions
 */
export function profileFields(data, fieldNames, maxUniqueValues = 1000) {
  if (!data || data.length === 0) {
    return {
      error: "No data available for profiling",
      fields: [],
    };
  }

  const totalRows = data.length;
  const results = [];

  for (const fieldName of fieldNames) {
    // Count value frequencies
    const valueCounts = new Map();
    let nullCount = 0;
    let uniqueValueCount = 0;

    for (const row of data) {
      const value = row[fieldName];
      
      // Handle null/undefined/empty values
      if (value === null || value === undefined || value === "") {
        nullCount++;
        continue;
      }

      // Convert to string for consistent handling
      const valueStr = String(value);
      
      if (valueCounts.has(valueStr)) {
        valueCounts.set(valueStr, valueCounts.get(valueStr) + 1);
      } else {
        uniqueValueCount++;
        if (uniqueValueCount <= maxUniqueValues) {
          valueCounts.set(valueStr, 1);
        }
      }
    }

    // Check if we exceeded max unique values
    const truncated = uniqueValueCount > maxUniqueValues;

    // Sort by frequency (descending) and convert to array
    const sortedValues = Array.from(valueCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({
        value,
        count,
        percentage: ((count / totalRows) * 100).toFixed(2),
      }));

    // Add null count if present
    if (nullCount > 0) {
      sortedValues.push({
        value: "(NULL/Empty)",
        count: nullCount,
        percentage: ((nullCount / totalRows) * 100).toFixed(2),
      });
    }

    results.push({
      fieldName,
      totalRows,
      uniqueValues: uniqueValueCount,
      nullCount,
      distributions: sortedValues,
      truncated,
      truncatedAt: maxUniqueValues,
    });
  }

  return {
    error: null,
    fields: results,
  };
}

/**
 * Generate Qlik .qvs script for loading profiling data
 * @param {Array<Object>} profilingResults - Results from profileFields
 * @param {string} qvdFileName - Original QVD file name
 * @returns {string} QVS script content
 */
export function generateQvsScript(profilingResults, qvdFileName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  let script = `// QVD Profiling Data Export
// Generated: ${new Date().toISOString()}
// Source QVD: ${qvdFileName}
// 
// This script loads value distribution data for analyzed fields
//\n\n`;

  for (const fieldResult of profilingResults) {
    const { fieldName, totalRows, uniqueValues, distributions, truncated } = fieldResult;

    script += `// Field: ${fieldName}
// Total Rows: ${totalRows.toLocaleString()}
// Unique Values: ${uniqueValues.toLocaleString()}`;

    if (truncated) {
      script += `\n// WARNING: Distribution truncated to top ${distributions.length} values`;
    }

    script += `\n\n`;
    script += `[${fieldName}_Distribution]:\nLOAD * INLINE [\n`;
    script += `Value\tCount\tPercentage\n`;

    for (const dist of distributions) {
      // Escape tabs and newlines in values
      const escapedValue = String(dist.value)
        .replace(/\t/g, " ")
        .replace(/\n/g, " ")
        .replace(/\r/g, "");
      script += `${escapedValue}\t${dist.count}\t${dist.percentage}\n`;
    }

    script += `];\n\n`;
  }

  return script;
}

/**
 * Check if file size warrants a warning before profiling
 * @param {number} rowCount - Number of rows in the QVD
 * @param {number} warningThreshold - Row count threshold for warning (default: 100000)
 * @returns {boolean} True if warning should be shown
 */
export function shouldWarnLargeFile(rowCount, warningThreshold = 100000) {
  return rowCount > warningThreshold;
}
