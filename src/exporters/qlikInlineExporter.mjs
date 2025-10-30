import { promises as fs } from 'fs';

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

  data.forEach((row) => {
    Object.values(row).forEach((value) => {
      if (typeof value === "string") {
        counts.forEach((d) => {
          d.count += (
            value.match(
              new RegExp(d.char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
            ) || []
          ).length;
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
 * @returns {Promise<void>}
 */
export async function exportToQlikInline(
  data,
  filePath,
  maxRows = 0,
  delimiter = "tab"
) {
  try {
    if (data.length === 0) {
      await fs.writeFile(filePath, "// No data to export", "utf8");
      return;
    }

    // Limit data if maxRows is specified
    const exportData = maxRows > 0 ? data.slice(0, maxRows) : data;

    // Get delimiter configuration
    const delimiterConfig = getDelimiterConfig(delimiter, exportData);

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
    lines.push("// GitHub: https://github.com/ptarmiganlabs/qvd4vscode");
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

    // Add data rows (with chosen delimiter)
    exportData.forEach((row) => {
      const values = columns.map((col) => {
        const value = row[col];

        // Handle different value types
        if (value === null || value === undefined) {
          return "";
        } else if (typeof value === "string") {
          // Escape special characters in strings
          // Replace delimiter with space, and remove newlines/carriage returns
          return value
            .replace(
              new RegExp(
                delimiterConfig.char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                "g"
              ),
              " "
            )
            .replace(/\n/g, " ")
            .replace(/\r/g, "");
        } else if (value instanceof Date) {
          return value.toISOString();
        } else {
          return String(value);
        }
      });
      lines.push(values.join(delimiterConfig.char));
    });

    // Close the inline load with proper delimiter syntax
    lines.push(`] (Delimiter is '${delimiterConfig.escapeChar}');`);

    await fs.writeFile(filePath, lines.join("\n"), "utf8");
  } catch (error) {
    throw new Error(`Qlik Sense inline script export failed: ${error.message}`);
  }
}
