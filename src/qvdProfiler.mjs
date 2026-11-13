/**
 * QVD Data Profiler
 * Computes value distribution statistics for QVD fields
 *
 * A field is profiled from its summary (fieldSummary.mjs): its rows read a chunk
 * at a time, a few numbers kept per distinct value. A QVD is read only for the
 * fields profiled, one after another, through its columns, so profiling needs
 * memory for the largest of those fields' distinct values, not for its rows.
 */

import { realpath } from "fs/promises";
import { dirname } from "path";
import { isNumericSample, statisticsFrom } from "./qvdStatistics.mjs";
import { qualityMetricsFrom } from "./qvdDataQuality.mjs";
import { isDateSample, temporalFrom } from "./qvdTemporalAnalysis.mjs";
import { isStringSample } from "./qvdStringAnalysis.mjs";
import { BYTES_PER_DISTINCT_VALUE, FIXED_BYTES, summarize, summarizeAsync, summarizeRows } from "./fieldSummary.mjs";
import { SCAN_PEAK_BYTES, openColumnScanner, shownValue } from "./columnScan.mjs";
import { budgetFor, headerOf } from "./qvdReader.mjs";
import { describeViewRefusal, tryBookHeap } from "./memoryGuard.mjs";

/**
 * Heap profiling built per value of each profiled field, when it read every row of
 * the file: about one and a half times the most measured, on 1,000,000 rows of
 * chicago_taxi_rides_2016_03.qvd. Profiling no longer reads the rows, and doesn't use it.
 */
export const PROFILE_BYTES_PER_VALUE = 288;

/**
 * The kinds of analysis a field gets, from the values at the rows profileSample.mjs looks at
 * @param {Array<*>} sample - The values
 * @returns {{numeric: boolean, date: boolean, string: boolean}} The kinds
 */
function kindsOf(sample) {
  const numeric = isNumericSample(sample);
  const date = isDateSample(sample);
  // String analysis is for a field that is neither numeric nor dates
  const string = !numeric && !date && isStringSample(sample);
  return { numeric, date, string };
}

/**
 * A field's profiling results, from its summary
 * @param {string} fieldName - The field
 * @param {import('./fieldSummary.mjs').FieldSummary} summary - Its summary
 * @param {number} maxUniqueValues - Values the distribution shows at most
 * @returns {Object} The field's results, as profileFields() gives them
 */
function fieldResultOf(fieldName, summary, maxUniqueValues) {
  const { totalRows, uniqueValues, kinds } = summary;

  // The most frequent values first, values as frequent in the order they first occur
  const sortedValues = summary.top.map(({ value, count }) => ({
    value,
    count,
    percentage: ((count / totalRows) * 100).toFixed(2),
  }));

  // Add null count if present, empty strings included
  const nullOrEmptyCount = summary.nullCount + summary.emptyStringCount;
  if (nullOrEmptyCount > 0) {
    sortedValues.push({
      value: "(NULL/Empty)",
      count: nullOrEmptyCount,
      percentage: ((nullOrEmptyCount / totalRows) * 100).toFixed(2),
    });
  }

  return {
    fieldName,
    totalRows,
    uniqueValues,
    nullCount: nullOrEmptyCount,
    distributions: sortedValues,
    // The distribution shows the most frequent values only
    truncated: uniqueValues > maxUniqueValues,
    truncatedAt: maxUniqueValues,
    isNumeric: kinds.numeric,
    statistics: kinds.numeric ? statisticsFrom(summary.numbers) : null,
    isDate: kinds.date,
    temporalAnalysis: kinds.date ? temporalFrom(summary.dates) : null,
    isString: kinds.string,
    stringAnalysis: kinds.string ? summary.strings : null,
    qualityMetrics: qualityMetricsFrom(summary),
  };
}

/**
 * Compute value frequency distribution for specified fields
 * @param {Array<Object>} data - Array of data rows
 * @param {Array<string>} fieldNames - Field names to profile
 * @param {number} maxUniqueValues - Values the distribution shows at most (default: 1000)
 * @returns {Object} Profiling results with frequency distributions
 */
export function profileFields(data, fieldNames, maxUniqueValues = 1000) {
  if (!data || data.length === 0) {
    return {
      error: "No data available for profiling",
      fields: [],
    };
  }

  const fields = fieldNames.map((fieldName) =>
    fieldResultOf(fieldName, summarizeRows(data, fieldName, { maxUniqueValues, decideKinds: kindsOf }), maxUniqueValues)
  );
  return {
    error: null,
    fields,
  };
}

/**
 * The heap profiling fields of a QVD needs at most: a field is profiled at a time,
 * so the largest one's distinct values, beside what a scan holds
 * @param {import('./qvdReader.mjs').Header} header - The file's header
 * @param {Array<string>} fieldNames - The fields to profile
 * @returns {number} Bytes
 */
export function profileHeapBytes(header, fieldNames) {
  let symbols = 0;
  for (const field of header.fields) {
    if (fieldNames.includes(field.name)) {
      symbols = Math.max(symbols, field.symbols);
    }
  }
  return SCAN_PEAK_BYTES + FIXED_BYTES + symbols * BYTES_PER_DISTINCT_VALUE;
}

/**
 * The refusal of a profile that doesn't fit in the memory left
 * @param {import('./qvdReader.mjs').Header} header - The file's header
 * @param {Array<string>} fieldNames - The fields to profile
 * @param {number} neededBytes - Heap it needs
 * @param {number} leftBytes - Heap left
 * @returns {Error} The error, with the message to show as profileRefusal
 */
function profileRefusal(header, fieldNames, neededBytes, leftBytes) {
  const largest = header.fields
    .filter((field) => fieldNames.includes(field.name))
    .reduce((a, b) => (b.symbols > a.symbols ? b : a));
  const what = `Profiling ${largest.name}, a field of ${largest.symbols.toLocaleString()} distinct values,`;
  const message = describeViewRefusal({ what, neededBytes, leftBytes });
  return Object.assign(new Error(message), {
    name: "QvdValidationError",
    context: { reason: "memory" },
    pricing: { forCaller: true, neededBytes, leftBytes },
    profileRefusal: message,
  });
}

/**
 * Profile fields of a QVD, reading only those fields, a chunk of rows at a time
 * @param {string} filePath - The QVD file
 * @param {Array<string>} fieldNames - Field names to profile
 * @param {object} [options]
 * @param {number} [options.maxUniqueValues] - Values the distribution shows at most (default: 1000)
 * @param {AbortSignal} [options.signal] - Gives profiling up between chunks
 * @param {function({field: string, fieldIndex: number, fields: number, pass: number, rows: number, totalRows: number}): void} [options.onProgress] -
 *   Told how far it has got: the field, the pass over its rows, and the rows read in it
 * @param {number} [options.heldBytes] - What a scan's open file may hold, for tests
 * @param {number} [options.chunkRows] - Rows a chunk holds, for tests
 * @returns {Promise<Object>} Profiling results, as profileFields() gives them
 * @throws {Error} What reading the file throws; an AbortError when given up; and,
 *   when the memory left is too little, an error whose profileRefusal says so
 */
export async function profileFile(filePath, fieldNames, { maxUniqueValues = 1000, signal, onProgress, heldBytes, chunkRows } = {}) {
  // As QvdReader.read() does: qvdjs resolves links before it checks the file is in
  // the directory it may read, so that directory is the real path's
  const realFilePath = await realpath(filePath).catch(() => filePath);
  const allowedDir = dirname(realFilePath);
  const header = await headerOf(filePath, realFilePath, allowedDir, signal);
  const totalRows = header.rowCount;
  if (totalRows === 0) {
    return {
      error: "No data available for profiling",
      fields: [],
    };
  }

  const budget = await budgetFor(filePath, allowedDir, header, signal);
  const neededBytes = profileHeapBytes(header, fieldNames);
  const booked = tryBookHeap(neededBytes, budget ?? undefined);
  if (!("release" in booked)) {
    throw profileRefusal(header, fieldNames, neededBytes, booked.leftBytes);
  }

  const scanner = openColumnScanner({ filePath, allowedDir, heldBytes });
  try {
    const fields = [];
    for (const [fieldIndex, fieldName] of fieldNames.entries()) {
      const field = header.fields.find((candidate) => candidate.name === fieldName);
      const options = { maxUniqueValues, decideKinds: kindsOf, totalRows };
      const progress = (pass, rows) =>
        onProgress?.({ field: fieldName, fieldIndex, fields: fieldNames.length, pass, rows, totalRows });
      let summary;
      if (field) {
        summary = await summarizeAsync(
          { ...options, symbolCount: field.symbols, toValue: shownValue },
          async (summarizer, pass) => {
            progress(pass, 0);
            await scanner.scan({
              field: fieldName,
              symbols: field.symbols,
              totalRows,
              signal,
              chunkRows,
              onChunk: ({ codes, symbols, offset }) => summarizer.take(codes, symbols, offset),
              onRows: (rows) => progress(pass, rows),
            });
          }
        );
      } else {
        // A field the file doesn't have: no value in any row, as a row object without it
        summary = summarize({ ...options, symbolCount: 0 }, (summarizer) => {
          const nulls = new Int32Array(Math.min(totalRows, 1 << 20)).fill(-1);
          for (let offset = 0; offset < totalRows; offset += nulls.length) {
            summarizer.take(nulls.subarray(0, Math.min(nulls.length, totalRows - offset)), [], offset);
          }
        });
      }
      fields.push(fieldResultOf(fieldName, summary, maxUniqueValues));
    }
    return {
      error: null,
      fields,
    };
  } finally {
    await scanner.close();
    booked.release();
  }
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
