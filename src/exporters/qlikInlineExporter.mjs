import { writeFileAtomically } from "./atomicWrite.mjs";

// Rows turned into script text at a time, so a large export never holds the whole
// script as one string
export const CHUNK_ROWS = 10000;

/**
 * Heap a Qlik inline script export builds, a chunk of rows at a time, for the memory
 * guard. With every row in one chunk it needed 9.2 bytes per cell, and in its own
 * chunks up to 5.2 per character of a chunk's text: three runs needed 3.1 to 5.2.
 * Only its largest chunk is priced. Measured by the smallest heap that let
 * 1,000,000 rows of chicago_taxi_rides_2016_03.qvd export in one chunk, against
 * reading them alone, and 50,000 rows of four unique 400-character values for the
 * cost per character. All of the million rows, in its own chunks, needed nothing
 * measurable beyond reading them. See DataExporter.memoryCost() for the margins.
 */
export const memoryCost = {
  bytesPerCell: 14,
  bytesPerTextChar: 11,
  chunkRows: CHUNK_ROWS,
  writesAsItGoes: true,
};

/**
 * A pattern that finds a delimiter wherever it is in a value
 * @param {string} char - The delimiter
 * @returns {RegExp} The pattern, global
 */
function delimiterPattern(char) {
  return new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
}

/**
 * Auto-detect the best delimiter for the data
 * @param {Array<Object>} data - Array of row objects
 * @returns {Object} Delimiter object with char and escapeChar
 */
function autoDetectDelimiter(data) {
  const delimiters = [
    { name: "tab", char: "\t", escapeChar: "\\t", priority: 1 },
    { name: "pipe", char: "|", escapeChar: "|", priority: 2 },
    { name: "semicolon", char: ";", escapeChar: ";", priority: 3 },
    { name: "comma", char: ",", escapeChar: ",", priority: 4 },
  ];

  // Count occurrences of each delimiter in the data
  const counts = delimiters.map((d) => ({
    ...d,
    count: 0,
  }));
  const patterns = counts.map((d) => delimiterPattern(d.char));

  data.forEach((row) => {
    Object.values(row).forEach((value) => {
      if (typeof value === "string") {
        counts.forEach((d, i) => {
          d.count += (value.match(patterns[i]) || []).length;
        });
      }
    });
  });

  // Find delimiter with lowest occurrence (best option)
  // If tied, use priority (tab > pipe > semicolon > comma)
  counts.sort((a, b) => {
    if (a.count === b.count) {
      return a.priority - b.priority;
    }
    return a.count - b.count;
  });

  return counts[0];
}

/**
 * Get delimiter configuration
 * @param {string} delimiterChoice - User's delimiter choice
 * @param {Array<Object>} data - Array of row objects (for auto-detect)
 * @returns {Object} Delimiter object with char and escapeChar
 */
function getDelimiterConfig(delimiterChoice, data) {
  const delimiters = {
    tab: { char: "\t", escapeChar: "\\t", description: "Tab" },
    pipe: { char: "|", escapeChar: "|", description: "Pipe (|)" },
    comma: { char: ",", escapeChar: ",", description: "Comma (,)" },
    semicolon: { char: ";", escapeChar: ";", description: "Semicolon (;)" },
  };

  if (delimiterChoice === "auto-detect") {
    return autoDetectDelimiter(data);
  }

  return delimiters[delimiterChoice] || delimiters.tab;
}

/**
 * Export data to Qlik Sense inline load script format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @param {number} maxRows - Maximum number of rows to include (0 = all)
 * @param {string} delimiter - Delimiter choice ('tab', 'pipe', 'comma', 'semicolon', 'auto-detect')
 * @param {object} [options]
 * @param {number} [options.chunkRows] - Rows turned into text at a time
 * @returns {Promise<void>}
 */
export async function exportToQlikInline(
  data,
  filePath,
  maxRows = 0,
  delimiter = "tab",
  { chunkRows = CHUNK_ROWS } = {}
) {
  try {
    if (data.length === 0) {
      await writeFileAtomically(filePath, (file) => file.writeFile("// No data to export"));
      return;
    }

    // Limit data if maxRows is specified
    const exportData = maxRows > 0 ? data.slice(0, maxRows) : data;

    // Get delimiter configuration
    const delimiterConfig = getDelimiterConfig(delimiter, exportData);
    const delimiterInValue = delimiterPattern(delimiterConfig.char);

    // Get column names from first row
    const columns = Object.keys(exportData[0]);

    // Build the inline load script
    const lines = [];

    // Add header comment
    lines.push("// Qlik Sense Inline Load Script");
    lines.push("// Created by: Ctrl-Q QVD Viewer for VS Code");
    lines.push(
      "// VS Code Extension: https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer"
    );
    lines.push("// GitHub: https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer");
    lines.push(`// Generated: ${new Date().toISOString()}`);
    lines.push(`// Rows: ${exportData.length}`);
    lines.push(
      `// Delimiter: ${
        delimiterConfig.description || delimiterConfig.name || delimiter
      }`
    );
    lines.push("");

    // Start the LOAD statement
    lines.push("DataTable:");
    lines.push("LOAD * INLINE [");

    // Add column headers (with chosen delimiter)
    lines.push(columns.join(delimiterConfig.char));

    // A row's line, with the chosen delimiter
    const rowLine = (row) =>
      columns
        .map((col) => {
          const value = row[col];

          // Handle different value types
          if (value === null || value === undefined) {
            return "";
          } else if (typeof value === "string") {
            // Escape special characters in strings
            // Replace delimiter with space, and remove newlines/carriage returns
            return value.replace(delimiterInValue, " ").replace(/\n/g, " ").replace(/\r/g, "");
          } else if (value instanceof Date) {
            return value.toISOString();
          } else {
            return String(value);
          }
        })
        .join(delimiterConfig.char);

    // The script so far, then its rows a chunk at a time, a line apart as they are
    await writeFileAtomically(filePath, async (file) => {
      await file.writeFile(lines.join("\n"));
      for (let start = 0; start < exportData.length; start += chunkRows) {
        const end = Math.min(start + chunkRows, exportData.length);
        const rowLines = [];
        for (let i = start; i < end; i++) {
          rowLines.push(rowLine(exportData[i]));
        }
        await file.writeFile(`\n${rowLines.join("\n")}`);
      }

      // Close the inline load with proper delimiter syntax
      await file.writeFile(`\n] (Delimiter is '${delimiterConfig.escapeChar}');`);
    });
  } catch (error) {
    throw new Error(`Qlik Sense inline script export failed: ${error.message}`, { cause: error });
  }
}
