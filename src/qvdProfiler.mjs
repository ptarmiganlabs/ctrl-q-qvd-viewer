/**
 * QVD Data Profiler
 * Computes value distribution statistics for QVD fields
 */

import { isNumericField, calculateStatistics } from './qvdStatistics.mjs';

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

    // Calculate statistics if field is numeric
    const isNumeric = isNumericField(data, fieldName);
    let statistics = null;
    
    if (isNumeric) {
      statistics = calculateStatistics(data, fieldName);
    }

    results.push({
      fieldName,
      totalRows,
      uniqueValues: uniqueValueCount,
      nullCount,
      distributions: sortedValues,
      truncated,
      truncatedAt: maxUniqueValues,
      isNumeric,
      statistics,
    });
  }

  return {
    error: null,
    fields: results,
  };
}

/**
 * Escape special characters in values for QVS inline format
 * @param {string} value - Value to escape
 * @param {string} delimiter - Delimiter character to replace
 * @returns {string} Escaped value
 */
function escapeQvsValue(value, delimiter = "\t") {
  return String(value)
    .replace(new RegExp(delimiter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, "");
}

/**
 * Get delimiter configuration for QVS export
 * @param {string} delimiterChoice - User's delimiter choice
 * @returns {Object} Delimiter object with char and escapeChar
 */
function getDelimiterConfig(delimiterChoice) {
  const delimiters = {
    tab: { char: "\t", escapeChar: "\\t", description: "Tab" },
    pipe: { char: "|", escapeChar: "|", description: "Pipe (|)" },
    comma: { char: ",", escapeChar: ",", description: "Comma (,)" },
    semicolon: { char: ";", escapeChar: ";", description: "Semicolon (;)" },
  };

  return delimiters[delimiterChoice] || delimiters.tab;
}

/**
 * Generate Qlik .qvs script for loading profiling data
 * @param {Array<Object>} profilingResults - Results from profileFields
 * @param {string} qvdFileName - Original QVD file name
 * @param {Object} options - Export options
 * @param {string} options.delimiter - Delimiter choice ('tab', 'pipe', 'comma', 'semicolon')
 * @param {number} options.maxRows - Maximum rows per field (0 = all, 20, 100, 1000, 10000)
 * @returns {string} QVS script content
 */
export function generateQvsScript(profilingResults, qvdFileName, options = {}) {
  const { delimiter = 'tab', maxRows = 0 } = options;
  const delimiterConfig = getDelimiterConfig(delimiter);
  
  let script = `// QVD Profiling Data Export
// Generated: ${new Date().toISOString()}
// Source QVD: ${qvdFileName}
// Delimiter: ${delimiterConfig.description}
${maxRows > 0 ? `// Max rows per field: ${maxRows}\n` : ''}// 
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
    
    // Limit distributions if maxRows is specified
    const exportDistributions = maxRows > 0 ? distributions.slice(0, maxRows) : distributions;
    
    if (maxRows > 0 && maxRows < distributions.length) {
      script += `\n// NOTE: Exporting top ${maxRows} values out of ${distributions.length} total`;
    }

    script += `\n\n`;
    script += `[${fieldName}_Distribution]:\nLOAD * INLINE [\n`;
    script += `Value${delimiterConfig.char}Count${delimiterConfig.char}Percentage\n`;

    for (const dist of exportDistributions) {
      const escapedValue = escapeQvsValue(dist.value, delimiterConfig.char);
      script += `${escapedValue}${delimiterConfig.char}${dist.count}${delimiterConfig.char}${dist.percentage}\n`;
    }

    script += `] (Delimiter is '${delimiterConfig.escapeChar}');\n\n`;
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
