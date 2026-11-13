import { isBlank, toCellValue } from "./cellValue.mjs";
import { parseDate } from "./temporal/dateDetection.mjs";
import { sampleStep } from "./profileSample.mjs";
import { StringStats } from "./stringFeatures.mjs";
import { STEP, atPositions, drain, groupNumbers, histogramOf, modesOf } from "./sortedNumbers.mjs";
import { DateDistribution } from "./temporal/distribution.mjs";
import { nextTurn } from "./memoryGuard.mjs";

/**
 * What profiling needs from one field, read a chunk of rows at a time
 *
 * A chunk is the field's codes for a run of rows, one per row, and the values the
 * codes stand for: a QVD's symbol indexes, or for rows held in memory, an index of
 * their distinct values. Profiling keeps a few numbers per distinct value, never
 * the rows, so its memory is set by the field's distinct values, whatever its
 * rows. The results are those profiling every row in memory gives, number for
 * number, which is why the field is read two or three times:
 *
 * 1. Each value's rows, and in row order the sum of the numbers, the rows that
 *    tell the field's kind, and the first values for the date format.
 * 2. In row order again, each distinct value at its first row, now that its rows
 *    are known: the distribution, the duplicates and the evenness, string
 *    analysis and dates, all in the order values first occur, as a profile of
 *    the rows counts them. Each row adds to the variance, about the mean pass 1
 *    found, in the order the rows come in, and gives format samples.
 * 3. For a numeric field, the skewness and kurtosis, about the standard deviation
 *    pass 2 found, in the order the rows come in.
 *
 * A field of few distinct values that wants nothing in row order from pass 2, being
 * neither numeric nor text, has its distinct values kept by pass 1, in the order
 * they first occur, and pass 2's work done from them without reading the rows again.
 *
 * The work between passes, such as sorting tens of millions of distinct numbers,
 * is done in steps that let the event loop run between them (sortedNumbers.mjs).
 *
 * Values that show the same text are one value to the distribution, as they are
 * to a Map of the rows' texts: a dual and a number, "1.50" and 1.5. They are told
 * apart by a 64-bit hash of their text, checked against the text itself in pass
 * 2. Two different texts with one hash are as good as never met; if they are, the
 * field is read again with other seeds, and if they meet again, with its texts
 * told apart by a Map of them, which takes more memory but can't be wrong.
 */

// What a value is to each part of profiling, as the bits of its tag
const NULLISH = 1; // null or missing: no value to anything
const EMPTY = 2; // "": no value to the distribution, a blank to statistics
const VALUE = 4; // a value to the distribution: neither null, missing nor ""
const STAT_NULL = 8; // no value to statistics: null, missing or blank text
const NUMERIC = 16; // a number to statistics

// Pass 2's marks of a code: its first row seen, and its group's
const CODE_SEEN = 1;
const GROUP_SEEN = 2;

// Values in row order kept for the date format, as detectDateFormat() looks at them
const FIRST_VALUES = 100;

// A chunk's work runs this long, at most, before it lets the event loop run: a
// value's first row costs from a microsecond to tens, for a text's analysis
const SLICE_MS = 50;
// First rows of values between looks at the clock
const SIGHTS_PER_LOOK = 256;

/**
 * Most modes a field's statistics list. Where every value occurs twice, each is a
 * mode, and listing them all would make the results as large as the field.
 */
export const MAX_MODES = 1000;

/**
 * Most entries the duplicates list
 */
const TOP_DUPLICATES = 10;

/**
 * Seeds of the text hash's two halves, and the step between a read's and the next's
 */
const SEEDS = [0x9747b28c, 0x5bd1e995];
const SEED_STEP = 0x2545f491;

/**
 * Memory profiling holds per distinct value of the field it profiles, at most, in
 * typed arrays, which live outside the heap: its rows, tag, number, text hash and
 * its slot in the hash table, its date, and the sort of the numbers or dates. About
 * 1.5 times the most measured, 57 bytes, on a field of 50 million distinct numbers,
 * qvdjs's own arrays for the field included.
 */
export const BYTES_PER_DISTINCT_VALUE = 88;

/**
 * Heap profiling holds at most, whatever the field: what its scan's open file holds,
 * up to SCAN_HELD_BYTES by the scan's count, which counts a dual's value short;
 * the samples, the most frequent values and their texts; and string analysis's
 * lengths and prefixes, which stop at PREFIXES_COUNTED. About 1.5 times the most
 * measured, 959 MiB, on a text field of 6.25 million distinct values.
 */
export const HEAP_BYTES = 1.4 * 1024 * 1024 * 1024;

/**
 * The heap a profile needs whatever its field: the samples, the most frequent values
 * and the code around them. About 1.5 times the most measured on a field of a few
 * thousand values, 71 MiB with the process's own.
 */
export const BASE_HEAP_BYTES = 96 * 1024 * 1024;

/**
 * Heap per distinct value of the field, and per byte of its symbols, held by the
 * scan's open file and string analysis, up to HEAP_BYTES: 1.5 times the 400 bytes and
 * two per byte of text the scan counts a value at
 */
export const HEAP_BYTES_PER_DISTINCT_VALUE = 600;
export const HEAP_BYTES_PER_SYMBOL_BYTE = 3;

/**
 * Times a field is read again with other seeds after two of its texts had one hash,
 * before its texts are told apart by a Map of them instead
 */
const SEED_TRIES = 2;

/**
 * Most distinct values whose values pass 1 keeps, so that a field that needs nothing
 * in row order from pass 2 doesn't need pass 2
 */
const RETAINED_VALUES = 1 << 16;

/**
 * Most rows a field may have: rows are counted in 32 bits
 */
export const MAX_ROWS = 0xffffffff;

/**
 * Two 32-bit hashes of a text, for two seeds, in one walk of it: MurmurHash3's mixing
 * over its UTF-16 code units for the first, FNV-1a's for the second, so that texts
 * made to collide in one, whatever its seed, don't collide in the other too
 * @param {string} text - The text
 * @param {number} seedA - The first seed
 * @param {number} seedB - The second seed
 * @param {Uint32Array} out - Takes the two hashes
 */
export function hashPair(text, seedA, seedB, out) {
  let a = seedA >>> 0;
  let b = seedB >>> 0;
  for (let i = 0; i < text.length; i++) {
    let k = Math.imul(text.charCodeAt(i), 0xcc9e2d51);
    k = Math.imul((k << 15) | (k >>> 17), 0x1b873593);
    a ^= k;
    a = (a << 13) | (a >>> 19);
    a = (Math.imul(a, 5) + 0xe6546b64) | 0;
    b = Math.imul(b ^ text.charCodeAt(i), 0x01000193);
  }
  out[0] = finish32(a, text.length);
  out[1] = finish32(b, text.length);
}

/**
 * MurmurHash3's finish: the length mixed in, and the bits avalanched
 * @param {number} h - The running hash
 * @param {number} length - The text's length
 * @returns {number} The hash, unsigned
 */
function finish32(h, length) {
  h ^= length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Group codes by the number each stands for, a slice at a time: see groupNumbers()
 * @param {number} codeCount - Codes there are
 * @param {function(number): boolean} takes - Whether a code's number is one of them
 * @param {function(number): number} numberOf - A code's number
 * @param {ArrayLike<number>} counts - Each code's rows
 * @param {Uint32Array|null} groupOf - Filled with each code's group, unless null
 * @returns {Generator<void, {values: Float64Array, rows: Uint32Array}>} The steps,
 *   returning the distinct numbers, ascending, and each one's rows
 */
function* numberGroups(codeCount, takes, numberOf, counts, groupOf) {
  let n = 0;
  for (let code = 0; code < codeCount; code++) {
    if (takes(code)) {
      n++;
    }
    if ((code & (STEP - 1)) === STEP - 1) {
      yield;
    }
  }
  const numbers = new Float64Array(n);
  const codes = new Uint32Array(n);
  for (let code = 0, next = 0; code < codeCount; code++) {
    if (takes(code)) {
      numbers[next] = numberOf(code);
      codes[next++] = code;
    }
    if ((code & (STEP - 1)) === STEP - 1) {
      yield;
    }
  }
  return yield* groupNumbers(numbers, codes, counts, groupOf);
}

/**
 * The best few of what is offered, by rows and then by order offered: what sorting
 * every entry of a Map by its count, ties kept in the Map's order, puts first
 */
class TopEntries {
  #capacity;
  #items = [];

  /**
   * @param {number} capacity - Entries kept
   */
  constructor(capacity) {
    this.#capacity = Math.max(0, capacity);
  }

  /**
   * Offer an entry. Entries come in the order of their first rows, so an entry
   * only as frequent as the least kept comes after it, and loses.
   * @param {number} count - Its rows
   * @param {number} rank - Its place in the order offered
   * @param {string} value - Its text
   */
  offer(count, rank, value) {
    const items = this.#items;
    if (items.length < this.#capacity) {
      items.push({ count, rank, value });
      this.#up(items.length - 1);
    } else if (this.#capacity > 0 && count > items[0].count) {
      items[0] = { count, rank, value };
      this.#down(0);
    }
  }

  /**
   * The entries kept, best first
   * @returns {Array<{count: number, value: string}>} The entries
   */
  sorted() {
    return this.#items
      .slice()
      .sort((a, b) => b.count - a.count || a.rank - b.rank)
      .map(({ count, value }) => ({ value, count }));
  }

  // Whether a is a worse entry than b: fewer rows, or as many and offered later
  static #worse(a, b) {
    return a.count < b.count || (a.count === b.count && a.rank > b.rank);
  }

  #up(index) {
    const items = this.#items;
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      if (!TopEntries.#worse(items[index], items[parent])) {
        return;
      }
      [items[index], items[parent]] = [items[parent], items[index]];
      index = parent;
    }
  }

  #down(index) {
    const items = this.#items;
    for (;;) {
      const left = 2 * index + 1;
      const right = left + 1;
      let worst = index;
      if (left < items.length && TopEntries.#worse(items[left], items[worst])) {
        worst = left;
      }
      if (right < items.length && TopEntries.#worse(items[right], items[worst])) {
        worst = right;
      }
      if (worst === index) {
        return;
      }
      [items[index], items[worst]] = [items[worst], items[index]];
      index = worst;
    }
  }
}

/**
 * The error for a code that stands for no value the field has
 * @param {number} code - The code
 * @param {number} symbolCount - The values the field has
 * @returns {Error} The error
 */
function unknownCode(code, symbolCount) {
  return Object.assign(
    new Error(`A row holds value ${code} of a field that has ${symbolCount.toLocaleString()} values`),
    { name: "QvdCorruptedError" }
  );
}

/**
 * The kinds of analysis a field gets
 * @typedef {{numeric: boolean, date: boolean, string: boolean}} Kinds
 */

/**
 * A field's profile, a pass over its rows at a time
 */
export class FieldSummarizer {
  #totalRows;
  #symbolCount;
  #toValue;
  #decideKinds;
  #kinds;
  #seeds;
  #hashPair;
  #hashed = new Uint32Array(2);
  #exactText;
  #texts = null;
  #retainedCodes = [];
  #retainedValues = [];
  #pass = 0;
  #sights = 0;
  #sliceStart = 0;
  // Whether pass 2 read the rows, rather than its distinct values being replayed
  #readPass2 = true;

  // Per code
  #counts;
  #tags;
  #numbers = null;
  #marks = null;

  // Grouping codes by their text
  #hashing = false;
  #h1 = null;
  #h2 = null;
  #table = null;
  #mask = 0;
  #mergedInto = new Map();
  #groupRows = new Map();
  #groupText = new Map();
  #valueCodes = 0;
  #collided = false;

  // Pass 1, per row
  #nullRows = 0;
  #emptyRows = 0;
  #statNullRows = 0;
  #numericRows = 0;
  #sum = 0;
  #step;
  #sample = [];
  #firstValues = [];
  #negativeZeros = 0;
  #positiveZeros = 0;

  // The distinct numbers, and for a field of numbers alone each code's
  #distinct = null;
  #groupOf = null;
  #numberSeen = null;

  // Pass 2: the distinct values, in the order they first occur
  #rank = 0;
  #top;
  #duplicates = new TopEntries(TOP_DUPLICATES);
  #duplicateRows = 0;
  #duplicatedValues = 0;
  #entropy = 0;

  // Statistics
  #statistics = false;
  #mean = 0;
  #varianceSum = 0;
  #variance = null;
  #stdDev = null;
  #skewSum = 0;
  #kurtSum = 0;
  #positions = null;
  #modes = null;
  #histogram = null;
  #zeroRanks = null;
  #zeroSigns = null;
  #zeroRow = 0;

  // Dates
  #dates = false;
  #times = null;
  #validDates = 0;
  #invalidDates = 0;
  #dateDistribution = null;
  #distinctTimes = null;

  // Strings
  #strings = null;
  #formats = null;

  /**
   * @param {object} options
   * @param {number} options.totalRows - Rows in the field
   * @param {number} options.symbolCount - Codes it may hold, from 0
   * @param {function(*): *} [options.toValue] - A code's value as profiling takes it,
   *   from the value a chunk holds for it; as it is unless said
   * @param {function(Array<*>): Kinds} [options.decideKinds] - The kinds of analysis, from
   *   the values at the rows profileSample.mjs looks at
   * @param {Kinds} [options.kinds] - The kinds of analysis, whatever the rows
   * @param {number} [options.maxUniqueValues] - Entries the distribution keeps
   * @param {Array<number>} [options.seeds] - The text hash's seeds
   * @param {function(string, number, number, Uint32Array): void} [options.hashPair] - The text hash,
   *   hashPair() unless a test says otherwise
   * @param {boolean} [options.exactText] - Whether to tell texts apart by a Map of them,
   *   rather than by their hash
   */
  constructor({
    totalRows,
    symbolCount,
    toValue = (value) => value,
    decideKinds,
    kinds,
    maxUniqueValues = 1000,
    seeds = SEEDS,
    hashPair: hashTexts = hashPair,
    exactText = false,
  }) {
    if (totalRows > MAX_ROWS) {
      throw new RangeError(
        `Profiling counts rows in 32 bits, and this field has ${totalRows.toLocaleString()} rows, ` +
          `more than ${MAX_ROWS.toLocaleString()}`
      );
    }
    this.#totalRows = totalRows;
    this.#symbolCount = Math.max(0, symbolCount);
    this.#toValue = toValue;
    this.#decideKinds = decideKinds;
    this.#kinds = kinds ?? null;
    this.#seeds = seeds;
    this.#hashPair = hashTexts;
    this.#exactText = exactText;
    this.#step = sampleStep(totalRows);
    this.#top = new TopEntries(maxUniqueValues);
    this.#counts = new Uint32Array(this.#symbolCount);
    this.#tags = new Uint8Array(this.#symbolCount);
  }

  /**
   * Move on to the next pass, at once
   * @returns {number} The pass to read the rows for, from 1, or 0 when there is none
   */
  nextPass() {
    return drain(this.#advance());
  }

  /**
   * Move on to the next pass, letting the event loop run between the steps of the
   * work between passes
   * @param {AbortSignal} [signal] - Gives it up between steps
   * @returns {Promise<number>} The pass to read the rows for, from 1, or 0 when there is none
   */
  async nextPassAsync(signal) {
    const steps = this.#advance();
    for (;;) {
      const step = steps.next();
      if (step.done) {
        return step.value;
      }
      await nextTurn();
      signal?.throwIfAborted();
    }
  }

  *#advance() {
    if (this.#pass === 1) {
      yield* this.#endPass1();
      // Nothing in row order wanted from pass 2: its distinct values, kept in the order
      // they first occurred, do it
      if (this.#retainedCodes && !this.#statistics && !this.#strings) {
        yield* this.#replayFirstSights();
        this.#pass = 2;
      } else {
        // Pass 2 reads the rows: the values kept for it aren't needed
        this.#retainedCodes = null;
        this.#retainedValues = null;
      }
    }
    if (this.#pass === 2) {
      yield* this.#endPass2();
    }
    if (this.#pass === 0) {
      this.#pass = 1;
    } else if (this.#pass === 1) {
      this.#pass = 2;
    } else if (this.#pass === 2 && this.#readPass2 && !this.#collided && this.#statistics && this.#numericRows >= 3 && this.#stdDev !== 0) {
      this.#pass = 3;
    } else {
      this.#pass = -1;
    }
    return Math.max(0, this.#pass);
  }

  /**
   * Whether the field must be read again from the start, with other seeds: two of its
   * texts had one hash
   * @returns {boolean} True if so
   */
  get collided() {
    return this.#collided;
  }

  /**
   * Seeds for reading the field again
   * @returns {Array<number>} The seeds
   */
  get nextSeeds() {
    return this.#seeds.map((seed) => (seed + SEED_STEP) >>> 0);
  }

  /**
   * Take a chunk of rows, in row order, for the pass nextPass() named
   * @param {ArrayLike<number>} codes - One code per row, negative for null
   * @param {ArrayLike<*>} symbols - The values the codes stand for, by code
   * @param {number} offset - The chunk's first row
   */
  take(codes, symbols, offset) {
    drain(this.#takeSteps(codes, symbols, offset));
  }

  /**
   * As take(), letting the event loop run every SLICE_MS or so, as values' first
   * rows take their time
   * @param {ArrayLike<number>} codes - One code per row, negative for null
   * @param {ArrayLike<*>} symbols - The values the codes stand for, by code
   * @param {number} offset - The chunk's first row
   * @param {AbortSignal} [signal] - Gives the chunk up between slices
   * @returns {Promise<void>} Resolves once the chunk is taken
   */
  async takeAsync(codes, symbols, offset, signal) {
    const steps = this.#takeSteps(codes, symbols, offset);
    while (!steps.next().done) {
      await nextTurn();
      signal?.throwIfAborted();
    }
  }

  /**
   * Take rows that are all null, in row order, for the pass nextPass() named: in time
   * for the rows the kind is told from, not for every row
   * @param {number} count - Rows
   * @param {number} offset - The first of them
   */
  takeNulls(count, offset) {
    if (this.#pass !== 1) {
      // Nulls add nothing to the later passes
      return;
    }
    this.#nullRows += count;
    this.#statNullRows += count;
    const step = this.#step;
    for (let row = Math.ceil(offset / step) * step; row < offset + count; row += step) {
      this.#sample.push(null);
    }
  }

  *#takeSteps(codes, symbols, offset) {
    this.#sliceStart = performance.now();
    if (this.#pass === 1) {
      yield* this.#take1(codes, symbols, offset);
    } else if (this.#pass === 2) {
      yield* this.#take2(codes, symbols);
    } else if (this.#pass === 3) {
      this.#take3(codes);
    }
  }

  // Whether a slice of a chunk's work has run long enough to let the event loop run
  #sliceDone() {
    if (++this.#sights % SIGHTS_PER_LOOK !== 0 || performance.now() - this.#sliceStart < SLICE_MS) {
      return false;
    }
    this.#sliceStart = performance.now();
    return true;
  }

  *#take1(codes, symbols, offset) {
    const counts = this.#counts;
    const tags = this.#tags;
    const step = this.#step;
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      let tag = NULLISH | STAT_NULL;
      if (code >= 0) {
        if (code >= this.#symbolCount) {
          throw unknownCode(code, this.#symbolCount);
        }
        if (counts[code]++ === 0) {
          this.#firstSight(code, symbols[code]);
          if (this.#sliceDone()) {
            yield;
          }
        }
        tag = tags[code];
      }
      if (tag & NULLISH) {
        this.#nullRows++;
      } else if (tag & EMPTY) {
        this.#emptyRows++;
      }
      if (tag & STAT_NULL) {
        this.#statNullRows++;
      } else if (tag & NUMERIC) {
        this.#numericRows++;
        this.#sum += this.#numbers[code];
      }
      if ((offset + i) % step === 0) {
        this.#sample.push(code < 0 ? null : this.#toValue(symbols[code]));
      }
      if (tag & VALUE && this.#firstValues.length < FIRST_VALUES) {
        this.#firstValues.push(this.#toValue(symbols[code]));
      }
    }
  }

  #firstSight(code, symbol) {
    const value = this.#toValue(symbol);
    let tag;
    if (value === null || value === undefined) {
      tag = NULLISH | STAT_NULL;
    } else if (value === "") {
      tag = EMPTY | STAT_NULL;
    } else {
      tag = VALUE;
      if (isBlank(value)) {
        tag |= STAT_NULL;
      } else {
        const number = toCellValue(value);
        if (typeof number === "number") {
          tag |= NUMERIC;
          this.#numbers ??= new Float64Array(this.#symbolCount);
          this.#numbers[code] = number;
          if (number === 0) {
            if (Object.is(number, -0)) {
              this.#negativeZeros++;
            } else {
              this.#positiveZeros++;
            }
          }
        }
      }
    }
    this.#tags[code] = tag;
    if (tag & VALUE) {
      if (this.#retainedCodes) {
        if (this.#retainedCodes.length < RETAINED_VALUES) {
          this.#retainedCodes.push(code);
          this.#retainedValues.push(symbol);
        } else {
          this.#retainedCodes = null;
          this.#retainedValues = null;
        }
      }
      this.#valueCodes++;
      // A field of numbers alone is grouped by number: two numbers show one text when they are equal
      if (!this.#hashing && !(typeof value === "number" && tag & NUMERIC)) {
        this.#startHashing(code);
      }
      if (this.#hashing) {
        this.#addText(code, String(value));
      }
    }
  }

  #startHashing(except) {
    this.#hashing = true;
    if (this.#exactText) {
      this.#texts = new Map();
    } else {
      this.#startTable();
    }
    // The numbers seen so far, by the text they show
    for (let code = 0; code < this.#symbolCount; code++) {
      if (code !== except && this.#counts[code] > 0 && this.#tags[code] & VALUE) {
        this.#addText(code, String(this.#numbers[code]));
      }
    }
  }

  #startTable() {
    this.#h1 = new Uint32Array(this.#symbolCount);
    this.#h2 = new Uint32Array(this.#symbolCount);
    let size = 16;
    while (size * 0.7 < this.#symbolCount) {
      size *= 2;
    }
    this.#table = new Int32Array(size);
    this.#mask = size - 1;
  }

  #addText(code, text) {
    if (this.#texts) {
      const rep = this.#texts.get(text);
      if (rep === undefined) {
        this.#texts.set(text, code);
      } else {
        this.#mergedInto.set(code, rep);
      }
      return;
    }
    this.#hashPair(text, this.#seeds[0], this.#seeds[1], this.#hashed);
    const a = this.#hashed[0];
    const b = this.#hashed[1];
    this.#h1[code] = a;
    this.#h2[code] = b;
    const table = this.#table;
    const mask = this.#mask;
    for (let slot = a & mask; ; slot = (slot + 1) & mask) {
      const held = table[slot];
      if (held === 0) {
        table[slot] = code + 1;
        return;
      }
      const other = held - 1;
      if (this.#h1[other] === a && this.#h2[other] === b) {
        this.#mergedInto.set(code, other);
        return;
      }
    }
  }

  *#endPass1() {
    const kinds = this.#kinds ?? this.#decideKinds?.(this.#sample) ?? { numeric: false, date: false, string: false };
    this.#kinds = kinds;

    if (this.#hashing) {
      for (const [code, rep] of this.#mergedInto) {
        this.#groupRows.set(rep, (this.#groupRows.get(rep) ?? this.#counts[rep]) + this.#counts[code]);
      }
      this.#h1 = null;
      this.#h2 = null;
      this.#table = null;
      this.#texts = null;
    }

    // The distinct numbers: the distribution's values when the field holds nothing
    // else, and statistics' when it is numeric
    const byNumber = !this.#hashing && this.#valueCodes > 0;
    const counts = this.#counts;
    const tags = this.#tags;
    if (byNumber || kinds.numeric) {
      this.#groupOf = byNumber ? new Uint32Array(this.#symbolCount) : null;
      this.#distinct = yield* numberGroups(
        this.#symbolCount,
        (code) => counts[code] > 0 && (tags[code] & NUMERIC) !== 0,
        (code) => this.#numbers[code],
        counts,
        this.#groupOf
      );
    }
    if (byNumber) {
      this.#numberSeen = new Uint8Array(this.#distinct.values.length);
    }

    // Statistics only for a field whose values are numbers, nine in ten of them
    const nonNumericRows = this.#totalRows - this.#statNullRows - this.#numericRows;
    const nonNull = this.#numericRows + nonNumericRows;
    this.#statistics = kinds.numeric && nonNull > 0 && this.#numericRows / nonNull >= 0.9;
    if (this.#statistics) {
      this.#mean = this.#sum / this.#numericRows;
      yield* this.#readSorted(nonNull);
    }

    if (kinds.date) {
      this.#dates = true;
      this.#times = new Float64Array(this.#symbolCount);
      this.#dateDistribution = new DateDistribution();
    }
    if (kinds.string) {
      this.#strings = new StringStats();
      this.#formats = new Uint8Array(this.#symbolCount);
    }
    this.#marks = new Uint8Array(this.#symbolCount);
  }

  /**
   * What statistics read from the sorted numbers: the numbers at the positions min,
   * max and the percentiles read, the modes and the histogram
   * A sort keeps rows that compare equal in row order, so where a field holds both
   * -0 and 0, which of them a position holds is the row order's. Pass 2 finds it
   * for the positions in the zeros' rows.
   * @param {number} nonNull - Rows with a value, numeric or not
   */
  *#readSorted(nonNull) {
    const { values, rows } = this.#distinct;
    const n = this.#numericRows;
    const positions = [0, n - 1];
    for (const p of [0.1, 0.5, 0.9]) {
      const position = (n - 1) * p;
      positions.push(Math.floor(position), Math.ceil(position));
    }
    this.#positions = yield* atPositions(values, rows, positions);
    this.#modes = yield* modesOf(values, rows, MAX_MODES);
    this.#histogram = yield* histogramOf(values, rows, n, nonNull);

    if (this.#negativeZeros > 0 && this.#positiveZeros > 0) {
      this.#zeroRanks = new Set();
      for (const [position, { value, start }] of this.#positions) {
        if (value === 0) {
          this.#zeroRanks.add(position - start);
        }
      }
      this.#zeroSigns = new Map();
    }
  }

  // Pass 2's work at each distinct value's first row, from the values pass 1 kept
  *#replayFirstSights() {
    this.#readPass2 = false;
    const codes = this.#retainedCodes;
    const symbols = this.#retainedValues;
    this.#retainedCodes = null;
    this.#retainedValues = null;
    for (let i = 0; i < codes.length; i++) {
      this.#marks[codes[i]] |= CODE_SEEN;
      this.#firstSight2(codes[i], symbols[i]);
      if ((i & 4095) === 4095) {
        yield;
      }
    }
  }

  *#take2(codes, symbols) {
    const marks = this.#marks;
    const tags = this.#tags;
    const strings = this.#strings;
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code < 0) {
        continue;
      }
      if (code >= this.#symbolCount) {
        throw unknownCode(code, this.#symbolCount);
      }
      if ((marks[code] & CODE_SEEN) === 0) {
        marks[code] |= CODE_SEEN;
        this.#firstSight2(code, symbols[code]);
        if (this.#sliceDone()) {
          yield;
        }
      }
      if (strings?.sampling) {
        const formats = this.#formats[code];
        if (formats !== 0 && strings.wantsSample(formats)) {
          strings.sample(formats, String(this.#toValue(symbols[code])).trim());
        }
      }
      if (this.#statistics && tags[code] & NUMERIC) {
        const value = this.#numbers[code];
        this.#varianceSum += Math.pow(value - this.#mean, 2);
        if (value === 0 && this.#zeroRanks) {
          const rank = this.#zeroRow++;
          if (this.#zeroRanks.has(rank)) {
            this.#zeroSigns.set(rank, Object.is(value, -0));
          }
        }
      }
    }
  }

  #firstSight2(code, symbol) {
    if ((this.#tags[code] & VALUE) === 0) {
      return;
    }
    const value = this.#toValue(symbol);
    const count = this.#counts[code];
    this.#group(code, value);
    if (this.#strings) {
      this.#formats[code] = this.#strings.add(String(value), count);
    }
    if (this.#dates) {
      const date = parseDate(value);
      if (date !== null) {
        const time = date.getTime();
        this.#times[code] = time;
        this.#validDates += count;
        this.#dateDistribution.add(time, count);
      } else {
        this.#times[code] = NaN;
        this.#invalidDates += count;
      }
    }
  }

  // A distinct value's first row: its group's, if no other code of the group came first
  #group(code, value) {
    if (this.#hashing) {
      const rep = this.#mergedInto.get(code) ?? code;
      const text = String(value);
      if ((this.#marks[rep] & GROUP_SEEN) === 0) {
        this.#marks[rep] |= GROUP_SEEN;
        const merged = this.#groupRows.get(rep);
        if (merged !== undefined) {
          this.#groupText.set(rep, text);
        }
        this.#takeGroup(merged ?? this.#counts[rep], text);
      } else if (this.#groupText.get(rep) !== text) {
        // Two texts with one hash
        this.#collided = true;
      }
    } else {
      const index = this.#groupOf[code];
      if (this.#numberSeen[index] === 0) {
        this.#numberSeen[index] = 1;
        this.#takeGroup(this.#distinct.rows[index], String(value));
      }
    }
  }

  #takeGroup(rows, text) {
    const rank = this.#rank++;
    this.#top.offer(rows, rank, text);
    if (rows > 1) {
      this.#duplicateRows += rows;
      this.#duplicatedValues++;
      this.#duplicates.offer(rows, rank, text);
    }
    // Shannon entropy, H = -Σ(p_i * log2(p_i)), in the order values first occur
    const probability = rows / (this.#totalRows - this.#nullRows - this.#emptyRows);
    if (probability > 0) {
      this.#entropy -= probability * Math.log2(probability);
    }
  }

  *#endPass2() {
    if (this.#collided) {
      return;
    }
    if (this.#statistics) {
      const n = this.#numericRows;
      // Sample variance, n - 1
      this.#variance = n === 1 ? 0 : this.#varianceSum / (n - 1);
      this.#stdDev = Math.sqrt(this.#variance);
    }
    if (this.#dates) {
      const counts = this.#counts;
      const tags = this.#tags;
      const times = this.#times;
      this.#distinctTimes = yield* numberGroups(
        this.#symbolCount,
        (code) => counts[code] > 0 && (tags[code] & VALUE) !== 0 && Number.isFinite(times[code]),
        (code) => times[code],
        counts,
        null
      );
    }
  }

  #take3(codes) {
    const tags = this.#tags;
    const numbers = this.#numbers;
    const mean = this.#mean;
    const stdDev = this.#stdDev;
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code >= this.#symbolCount) {
        throw unknownCode(code, this.#symbolCount);
      }
      if (code >= 0 && tags[code] & NUMERIC) {
        const standardized = (numbers[code] - mean) / stdDev;
        this.#skewSum += Math.pow(standardized, 3);
        this.#kurtSum += Math.pow(standardized, 4);
      }
    }
  }

  /**
   * What the passes found
   * @returns {FieldSummary} The summary
   */
  summary() {
    const totalRows = this.#totalRows;
    const uniqueValues = this.#hashing
      ? this.#valueCodes - this.#mergedInto.size
      : (this.#distinct?.values.length ?? 0);
    const kinds = this.#kinds;

    let numbers = null;
    if (kinds.numeric) {
      const nonNumericCount = totalRows - this.#statNullRows - this.#numericRows;
      numbers = {
        isNumeric: this.#statistics,
        numericCount: this.#numericRows,
        nonNumericCount,
        nullCount: this.#statNullRows,
        totalRows,
      };
      if (this.#statistics) {
        Object.assign(numbers, {
          sum: this.#sum,
          mean: this.#mean,
          variance: this.#variance,
          stdDev: this.#stdDev,
          skewSum: this.#skewSum,
          kurtSum: this.#kurtSum,
          positions: this.#positions,
          zeroSigns: this.#zeroSigns,
          modes: this.#modes.modes,
          modeCount: this.#modes.modeCount,
          histogram: this.#histogram,
        });
      }
    }

    let dates = null;
    if (kinds.date) {
      dates = {
        validCount: this.#validDates,
        invalidCount: this.#invalidDates,
        nullCount: this.#nullRows + this.#emptyRows,
        totalRows,
        times: this.#distinctTimes.values,
        rows: this.#distinctTimes.rows,
        distribution: this.#dateDistribution.result(),
        firstValues: this.#firstValues,
      };
    }

    return {
      totalRows,
      nullCount: this.#nullRows,
      emptyStringCount: this.#emptyRows,
      uniqueValues,
      top: this.#top.sorted(),
      kinds,
      quality: {
        uniqueValues,
        duplicateCount: this.#duplicateRows,
        duplicatedDistinctValues: this.#duplicatedValues,
        topDuplicates: this.#duplicates.sorted(),
        shannonEntropy: this.#entropy,
      },
      numbers,
      dates,
      strings: kinds.string ? this.#strings.result(this.#nullRows + this.#emptyRows) : null,
    };
  }
}

/**
 * A field's profile, as the passes found it
 * @typedef {object} FieldSummary
 * @property {number} totalRows - Rows in the field
 * @property {number} nullCount - Rows null or missing
 * @property {number} emptyStringCount - Rows ""
 * @property {number} uniqueValues - Distinct values, by the text they show
 * @property {Array<{value: string, count: number}>} top - The most frequent, most first
 * @property {Kinds} kinds - The kinds of analysis it got
 * @property {object} quality - Duplicates and evenness, for the quality metrics
 * @property {object|null} numbers - For statistics, of a numeric field
 * @property {object|null} dates - For temporal analysis, of a date field
 * @property {object|null} strings - String analysis, of a text field
 */

/**
 * Run a field's passes over its chunks, again with other seeds if two texts had one hash
 * @param {object} options - FieldSummarizer's options
 * @param {function(FieldSummarizer, number): void} readPass - Reads every row of the
 *   field into the summarizer, in row order, for the pass given
 * @returns {FieldSummary} The summary
 */
export function summarize(options, readPass) {
  let summarizer = new FieldSummarizer(options);
  for (let tries = 1; ; tries++) {
    let pass;
    while ((pass = summarizer.nextPass()) !== 0) {
      readPass(summarizer, pass);
    }
    if (!summarizer.collided) {
      return summarizer.summary();
    }
    summarizer = new FieldSummarizer(againOptions(options, summarizer, tries));
  }
}

/**
 * The options for reading a field again after two of its texts had one hash: other
 * seeds, and after SEED_TRIES of them, a Map of the texts, which can't collide
 * @param {object} options - The options it was read with
 * @param {FieldSummarizer} summarizer - The summarizer that found the texts
 * @param {number} tries - Reads so far
 * @returns {object} The options
 */
function againOptions(options, summarizer, tries) {
  return tries >= SEED_TRIES ? { ...options, exactText: true } : { ...options, seeds: summarizer.nextSeeds };
}

/**
 * As summarize(), for passes that read the rows asynchronously. The work between
 * passes lets the event loop run as it goes.
 * @param {object} options - FieldSummarizer's options
 * @param {function(FieldSummarizer, number): Promise<void>} readPass - As for summarize()
 * @param {AbortSignal} [signal] - Gives the work between passes up
 * @returns {Promise<FieldSummary>} The summary
 */
export async function summarizeAsync(options, readPass, signal) {
  let summarizer = new FieldSummarizer(options);
  for (let tries = 1; ; tries++) {
    let pass;
    while ((pass = await summarizer.nextPassAsync(signal)) !== 0) {
      await readPass(summarizer, pass);
    }
    if (!summarizer.collided) {
      return summarizer.summary();
    }
    summarizer = new FieldSummarizer(againOptions(options, summarizer, tries));
  }
}

/**
 * One field of rows held in memory, as codes and the values they stand for
 * Values are told apart as a Map's keys are, and -0 from 0.
 * @param {Array<Object>} data - Array of row objects
 * @param {string} fieldName - The field
 * @returns {{codes: Int32Array, symbols: Array<*>}} One code per row, and the values
 */
export function codesOf(data, fieldName) {
  const codes = new Int32Array(data.length);
  const symbols = [];
  const index = new Map();
  let negativeZero = -1;
  for (let i = 0; i < data.length; i++) {
    const value = data[i][fieldName];
    let code;
    if (Object.is(value, -0)) {
      if (negativeZero < 0) {
        negativeZero = symbols.length;
        symbols.push(value);
      }
      code = negativeZero;
    } else {
      code = index.get(value);
      if (code === undefined) {
        code = symbols.length;
        index.set(value, code);
        symbols.push(value);
      }
    }
    codes[i] = code;
  }
  return { codes, symbols };
}

/**
 * Profile one field of rows held in memory
 * @param {Array<Object>} data - Array of row objects
 * @param {string} fieldName - The field
 * @param {object} [options] - FieldSummarizer's options but totalRows and symbolCount,
 *   and chunkRows: rows taken at a time, for tests; all at once unless said
 * @returns {FieldSummary} The summary
 */
export function summarizeRows(data, fieldName, { chunkRows, ...options } = {}) {
  const { codes, symbols } = codesOf(data, fieldName);
  const step = Math.max(1, chunkRows ?? codes.length);
  return summarize({ ...options, totalRows: data.length, symbolCount: symbols.length }, (summarizer) => {
    for (let offset = 0; offset < codes.length; offset += step) {
      summarizer.take(codes.subarray(offset, offset + step), symbols, offset);
    }
  });
}
