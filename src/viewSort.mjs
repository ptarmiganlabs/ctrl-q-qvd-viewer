import { QvdDual } from "qvdjs";
import { scanColumn, shownValue } from "./columnScan.mjs";
import { isBlank } from "./cellValue.mjs";

/**
 * Whole-file sort for the viewer's grid: the rows of a QVD in the order of one field
 *
 * The order:
 * - Values with a number come first, by that number: numbers, and duals such as
 *   dates and timestamps, which then sort by time rather than by how their text reads.
 * - Text comes next, compared as the language VS Code shows, with numbers in it
 *   compared as numbers: "Item 9" before "Item 10", and å, ä and ö where Swedish
 *   puts them, for a Swedish VS Code.
 * - Nulls, and text that is empty or only spaces, which shows as nothing, come
 *   last, whichever way the sort goes.
 * Rows whose values sort the same keep their order in the file.
 *
 * The field is scanned once. Its distinct values are ranked, which takes a sort
 * of the values rather than of the rows, and the rows are then counted into
 * place by their value's rank: two passes over the rows, however many there are.
 */

/**
 * Most distinct text values a sort compares: past this, comparing them as the
 * language does would take minutes
 */
export const MAX_SORTED_TEXTS = 5_000_000;

// Comparisons between yields to the event loop: a few milliseconds of work
const COMPARISONS_PER_YIELD = 50_000;

/**
 * Heap a sort holds: the code of each row, the rows in order, and for each distinct
 * value its kind, number, rank and place, and its text
 * @param {import('./qvdReader.mjs').Header} header - The file's header
 * @param {number} fieldIndex - The field sorted by
 * @param {number} rows - Rows sorted
 * @returns {number} Bytes
 */
export function sortHeapBytes(header, fieldIndex, rows) {
  const field = header.fields[fieldIndex];
  const symbols = field.symbols;
  // A string of its text, held for each text value: its characters, and the string itself
  const texts = 2 * field.bytes + 40 * symbols;
  return 4 * header.rowCount + 4 * rows + symbols * (1 + 8 + 4 + 4 + 4 + 4) + texts;
}

/**
 * Error thrown when a sort can't be done, for a reason other than memory: the
 * message says why, in terms a VS Code user can act on
 */
export class ViewRefusedError extends Error {
  constructor(message) {
    super(message);
    this.name = "ViewRefusedError";
    this.context = { reason: "view" };
  }
}

/**
 * Sort a list of codes in place, stably, yielding to the event loop as it goes
 * @param {Uint32Array} items - The codes
 * @param {function(number, number): number} compare - Orders two codes
 * @param {AbortSignal} [signal] - Gives the sort up between yields
 * @param {function(number): void} [onFraction] - Told how much of the sort is done, from 0 to 1
 * @returns {Promise<Uint32Array>} The codes in order: items, or the buffer they ended in
 */
export async function mergeSort(items, compare, signal, onFraction) {
  const n = items.length;
  let from = items;
  let to = new Uint32Array(n);
  const passes = Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
  let pass = 0;
  let work = 0;
  for (let width = 1; width < n; width *= 2) {
    for (let start = 0; start < n; start += 2 * width) {
      const middle = Math.min(start + width, n);
      const end = Math.min(start + 2 * width, n);
      let left = start;
      let right = middle;
      let out = start;
      while (left < middle && right < end) {
        // The left one first when they are equal: stable
        to[out++] = compare(from[right], from[left]) < 0 ? from[right++] : from[left++];
      }
      while (left < middle) {
        to[out++] = from[left++];
      }
      while (right < end) {
        to[out++] = from[right++];
      }
      work += end - start;
      if (work >= COMPARISONS_PER_YIELD) {
        work = 0;
        await new Promise((resolve) => setImmediate(resolve));
        signal?.throwIfAborted();
        onFraction?.((pass + end / n) / passes);
      }
    }
    [from, to] = [to, from];
    pass++;
  }
  return from;
}

/**
 * Put the rows of a QVD in the order of one field
 * @param {object} options
 * @param {string} options.filePath - The QVD file
 * @param {string} options.allowedDir - The directory qvdjs may read in
 * @param {import('./qvdReader.mjs').Header} options.header - The file's header
 * @param {number} options.fieldIndex - The field to sort by, its place in the file
 * @param {boolean} [options.descending=false] - Largest first; nulls stay last
 * @param {Uint32Array|null} [options.rows] - The rows to sort, in file order, such
 *   as a search's; null for every row
 * @param {Intl.Collator} [options.collator] - Compares text
 * @param {AbortSignal} [options.signal] - Gives the sort up
 * @param {function({stage: string, fraction: number}): void} [options.onProgress] - Told how
 *   far it has got: "reading" the field, then "sorting" its values
 * @param {typeof scanColumn} [options.scan] - Scans the field, for tests to replace
 * @returns {Promise<Uint32Array>} The rows, counted from 0, in order
 * @throws {ViewRefusedError} When the field has more than MAX_SORTED_TEXTS distinct text values
 */
export async function sortRows({
  filePath,
  allowedDir,
  header,
  fieldIndex,
  descending = false,
  rows = null,
  collator = new Intl.Collator(undefined, { numeric: true }),
  signal,
  onProgress,
  scan = scanColumn,
}) {
  const field = header.fields[fieldIndex];
  const totalRows = header.rowCount;
  // The code of each row's value; -1 for null
  const rowCodes = new Int32Array(totalRows);
  // Each distinct value's kind (0 unseen, 1 a number, 2 text, 3 blank), number and text, by code
  let kinds = new Uint8Array(Math.max(0, field.symbols));
  let numbers = new Float64Array(kinds.length);
  const texts = [];
  let textCount = 0;

  /**
   * Make room for a code past what the header says
   * @param {number} code - The code
   */
  const grow = (code) => {
    const size = Math.max(code + 1, 2 * kinds.length);
    const moreKinds = new Uint8Array(size);
    moreKinds.set(kinds);
    const moreNumbers = new Float64Array(size);
    moreNumbers.set(numbers);
    kinds = moreKinds;
    numbers = moreNumbers;
  };

  onProgress?.({ stage: "reading", fraction: 0 });
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
        rowCodes[offset + i] = code < 0 ? -1 : code;
        if (code < 0) {
          continue;
        }
        if (code >= kinds.length) {
          grow(code);
        }
        if (kinds[code] !== 0) {
          continue;
        }
        const value = symbols[code];
        const shown = shownValue(value);
        if (value instanceof QvdDual && Number.isFinite(value.number)) {
          kinds[code] = 1;
          numbers[code] = value.number;
        } else if (shown === null || shown === undefined || isBlank(shown)) {
          // Shows as nothing, as a null does
          kinds[code] = 3;
        } else if (typeof shown === "number" && Number.isFinite(shown)) {
          kinds[code] = 1;
          numbers[code] = shown;
        } else {
          kinds[code] = 2;
          texts[code] = String(shown);
          textCount++;
          if (textCount > MAX_SORTED_TEXTS) {
            throw new ViewRefusedError(
              `${field.name} has more than ${MAX_SORTED_TEXTS.toLocaleString()} different text values, ` +
                "too many to sort here. Sort by another field, or search for the rows you want."
            );
          }
        }
      }
    },
    onRows: (done) => onProgress?.({ stage: "reading", fraction: done / Math.max(1, totalRows) }),
  });

  // The distinct values used, numbers first, then text
  let numberCount = 0;
  let used = 0;
  for (let code = 0; code < kinds.length; code++) {
    if (kinds[code] === 1) {
      numberCount++;
    }
    if (kinds[code] === 1 || kinds[code] === 2) {
      used++;
    }
  }
  const numberCodes = new Uint32Array(numberCount);
  const textCodes = new Uint32Array(used - numberCount);
  for (let code = 0, n = 0, t = 0; code < kinds.length; code++) {
    if (kinds[code] === 1) {
      numberCodes[n++] = code;
    } else if (kinds[code] === 2) {
      textCodes[t++] = code;
    }
  }

  // The share of the sorting each kind takes, for progress
  const share = numberCount / Math.max(1, used);
  onProgress?.({ stage: "sorting", fraction: 0 });
  const sortedNumbers = await mergeSort(
    numberCodes,
    (a, b) => numbers[a] - numbers[b],
    signal,
    (fraction) => onProgress?.({ stage: "sorting", fraction: fraction * share })
  );
  const compareText = collator.compare;
  const sortedTexts = await mergeSort(
    textCodes,
    (a, b) => compareText(texts[a], texts[b]),
    signal,
    (fraction) => onProgress?.({ stage: "sorting", fraction: share + fraction * (1 - share) })
  );

  // Each value's rank; values that sort the same share one, so that their rows keep file order
  const rank = new Uint32Array(kinds.length);
  let ranks = 0;
  for (let i = 0; i < sortedNumbers.length; i++) {
    const code = sortedNumbers[i];
    if (i === 0 || numbers[code] !== numbers[sortedNumbers[i - 1]]) {
      ranks++;
    }
    rank[code] = ranks - 1;
  }
  for (let i = 0; i < sortedTexts.length; i++) {
    const code = sortedTexts[i];
    if (i === 0 || compareText(texts[code], texts[sortedTexts[i - 1]]) !== 0) {
      ranks++;
    }
    rank[code] = ranks - 1;
  }
  signal?.throwIfAborted();

  // Count the rows into place by rank: nulls and blanks after every value, either way
  const nullRank = ranks;
  const rankOf = (row) => {
    const code = rowCodes[row];
    if (code < 0 || kinds[code] === 3) {
      return nullRank;
    }
    return descending ? ranks - 1 - rank[code] : rank[code];
  };
  const count = rows ? rows.length : totalRows;
  const starts = new Uint32Array(ranks + 2);
  for (let i = 0; i < count; i++) {
    starts[rankOf(rows ? rows[i] : i) + 1]++;
  }
  for (let r = 1; r < starts.length; r++) {
    starts[r] += starts[r - 1];
  }
  const ordered = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const row = rows ? rows[i] : i;
    ordered[starts[rankOf(row)]++] = row;
  }
  return ordered;
}
