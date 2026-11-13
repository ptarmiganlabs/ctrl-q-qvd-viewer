import { scanColumn, shownText } from "./columnScan.mjs";

/**
 * Whole-file search for the viewer's grid: the rows of a QVD with a cell whose
 * text holds the search text, whatever its case
 *
 * Each field is scanned in turn, a chunk of rows at a time. Whether a value
 * matches is worked out once per distinct value, not once per row: a field of
 * 30 million rows usually has far fewer values, and each row is then a lookup.
 */

/**
 * Heap a search holds, beside what its scans hold: the rows that match, a bit
 * each, and for the field being scanned what each of its values gave
 * @param {import('./qvdReader.mjs').Header} header - The file's header
 * @returns {number} Bytes
 */
export function searchHeapBytes(header) {
  const symbols = header.fields.reduce((most, field) => Math.max(most, field.symbols), 0);
  // Matches as bits, and the result's row numbers at worst; per field, a byte per value, twice
  return Math.ceil(header.rowCount / 8) + 4 * header.rowCount + 2 * symbols;
}

/**
 * Find the rows with a cell whose text holds the search text
 * @param {object} options
 * @param {string} options.filePath - The QVD file
 * @param {string} options.allowedDir - The directory qvdjs may read in
 * @param {import('./qvdReader.mjs').Header} options.header - The file's header
 * @param {string} options.text - What to search for, in any case
 * @param {AbortSignal} [options.signal] - Gives the search up
 * @param {function({field: string, fieldIndex: number, fields: number, fraction: number}): void} [options.onProgress] -
 *   Told how far it has got: the field it scans, and how much of the whole search is done
 * @param {typeof scanColumn} [options.scan] - Scans a field, for tests to replace
 * @returns {Promise<Uint32Array>} The rows that match, counted from 0, in file order
 */
export async function searchRows({ filePath, allowedDir, header, text, signal, onProgress, scan = scanColumn }) {
  const term = String(text).toLowerCase();
  const totalRows = header.rowCount;
  const matched = new Uint32Array(Math.ceil(totalRows / 32));
  const fields = header.fields.length;

  for (let fieldIndex = 0; fieldIndex < fields; fieldIndex++) {
    const field = header.fields[fieldIndex];
    // What each value gave: 0 not yet looked at, 1 no match, 2 a match
    const verdicts = new Uint8Array(Math.max(0, field.symbols));
    const matches = (value) => {
      const shown = shownText(value);
      return shown !== null && shown.toLowerCase().includes(term);
    };
    onProgress?.({ field: field.name, fieldIndex, fields, fraction: fieldIndex / fields });
    await scan({
      filePath,
      allowedDir,
      field: field.name,
      symbols: field.symbols,
      totalRows,
      signal,
      onChunk: ({ codes, symbols, offset }) => {
        for (let i = 0; i < codes.length; i++) {
          const code = codes[i];
          if (code < 0) {
            continue;
          }
          let match;
          if (code < verdicts.length) {
            let verdict = verdicts[code];
            if (verdict === 0) {
              verdict = matches(symbols[code]) ? 2 : 1;
              verdicts[code] = verdict;
            }
            match = verdict === 2;
          } else {
            // A code past what the header says: looked at each time, rather than trusted
            match = matches(symbols[code]);
          }
          if (match) {
            const row = offset + i;
            matched[row >>> 5] |= 1 << (row & 31);
          }
        }
      },
      onRows: (rows) =>
        onProgress?.({
          field: field.name,
          fieldIndex,
          fields,
          fraction: (fieldIndex + rows / Math.max(1, totalRows)) / fields,
        }),
    });
  }

  let count = 0;
  for (let i = 0; i < matched.length; i++) {
    let word = matched[i];
    while (word !== 0) {
      word &= word - 1;
      count++;
    }
  }
  const rows = new Uint32Array(count);
  let at = 0;
  for (let i = 0; i < matched.length; i++) {
    let word = matched[i];
    while (word !== 0) {
      const bit = 31 - Math.clz32(word & -word);
      rows[at++] = i * 32 + bit;
      word &= word - 1;
    }
  }
  return rows;
}
