/**
 * Distinct numbers in order, and what statistics read from them, a slice at a time
 *
 * A field can hold tens of millions of distinct numbers. Sorting them in one call
 * stops the extension host for seconds: 4.5 s for 50 million in random order. So
 * they are sorted by radix, which takes time in proportion to how many there are,
 * and every step here is a generator that yields after about STEP elements. A
 * caller in a hurry drains it at once; one on the extension host lets the event
 * loop run at each yield.
 */

/**
 * Elements a step takes between yields
 */
export const STEP = 1 << 20;

/**
 * Run a generator of steps to its end, at once
 * @param {Generator<void, T>} steps - The steps
 * @returns {T} What it returns
 * @template T
 */
export function drain(steps) {
  for (;;) {
    const step = steps.next();
    if (step.done) {
      return step.value;
    }
  }
}

/**
 * Sort numbers by value, carrying a payload along, in place: an LSD radix sort, 16
 * bits a pass, over the numbers' bits turned so that they compare as unsigned. -0
 * comes before 0; numbers that compare equal keep their order.
 * @param {Float64Array} numbers - The numbers, no NaN among them
 * @param {Uint32Array} payload - One per number, moved with it
 * @returns {Generator<void, void>} The steps
 */
export function* radixSort(numbers, payload) {
  const n = numbers.length;
  if (n < 2) {
    return;
  }
  // Each number as two 32-bit halves, little-endian: low, high
  let words = new Uint32Array(numbers.buffer, numbers.byteOffset, 2 * n);
  // Turned so that unsigned order is numeric order: a negative number's bits all
  // flipped, a positive number's sign bit set
  for (let i = 0; i < n; i++) {
    if (words[2 * i + 1] & 0x80000000) {
      words[2 * i] = ~words[2 * i];
      words[2 * i + 1] = ~words[2 * i + 1];
    } else {
      words[2 * i + 1] |= 0x80000000;
    }
    if ((i & (STEP - 1)) === STEP - 1) {
      yield;
    }
  }

  let spareWords = new Uint32Array(2 * n);
  let spare = new Uint32Array(n);
  let carried = payload;
  const counts = new Float64Array(65536);
  for (let digit = 0; digit < 4; digit++) {
    const word = digit >> 1;
    const shift = (digit & 1) * 16;
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      counts[(words[2 * i + word] >>> shift) & 0xffff]++;
    }
    yield;
    // A digit that is the same in every number moves nothing
    if (counts[(words[word] >>> shift) & 0xffff] === n) {
      continue;
    }
    let start = 0;
    for (let d = 0; d < 65536; d++) {
      const count = counts[d];
      counts[d] = start;
      start += count;
    }
    for (let i = 0; i < n; i++) {
      const at = counts[(words[2 * i + word] >>> shift) & 0xffff]++;
      spareWords[2 * at] = words[2 * i];
      spareWords[2 * at + 1] = words[2 * i + 1];
      spare[at] = carried[i];
      if ((i & (STEP - 1)) === STEP - 1) {
        yield;
      }
    }
    [words, spareWords] = [spareWords, words];
    [carried, spare] = [spare, carried];
  }
  // Back from the turned bits, into the caller's arrays
  const target = new Uint32Array(numbers.buffer, numbers.byteOffset, 2 * n);
  for (let i = 0; i < n; i++) {
    let low = words[2 * i];
    let high = words[2 * i + 1];
    if (high & 0x80000000) {
      high &= 0x7fffffff;
    } else {
      low = ~low;
      high = ~high;
    }
    target[2 * i] = low;
    target[2 * i + 1] = high;
    payload[i] = carried[i];
    if ((i & (STEP - 1)) === STEP - 1) {
      yield;
    }
  }
}

/**
 * Group codes by the number each stands for: the distinct numbers in ascending order,
 * each one's rows, and each code's group. -0 and 0 are one number, as they are to a
 * sort, and to a Map of numbers.
 * @param {Float64Array} numbers - The codes' numbers, sorted in place
 * @param {Uint32Array} codes - The codes, one per number
 * @param {ArrayLike<number>} counts - Each code's rows, by code
 * @param {Uint32Array|null} groupOf - Filled with each code's group, by code, unless null
 * @returns {Generator<void, {values: Float64Array, rows: Uint32Array}>} The steps, returning
 *   the distinct numbers and each one's rows
 */
export function* groupNumbers(numbers, codes, counts, groupOf) {
  yield* radixSort(numbers, codes);
  const n = numbers.length;
  let distinct = 0;
  for (let i = 0; i < n; i++) {
    if (i === 0 || numbers[i] !== numbers[i - 1]) {
      distinct++;
    }
    if ((i & (STEP - 1)) === STEP - 1) {
      yield;
    }
  }
  const rows = new Uint32Array(distinct);
  let group = -1;
  let last = NaN;
  for (let i = 0; i < n; i++) {
    const value = numbers[i];
    if (group < 0 || value !== last) {
      group++;
      last = value;
      // Moved down to its group's place: the numbers before it are read already
      numbers[group] = value;
    }
    const code = codes[i];
    rows[group] += counts[code];
    if (groupOf) {
      groupOf[code] = group;
    }
    if ((i & (STEP - 1)) === STEP - 1) {
      yield;
    }
  }
  return {
    // Where most are distinct, the sorted array is kept rather than copied
    values: distinct > n / 2 ? numbers.subarray(0, distinct) : numbers.slice(0, distinct),
    rows,
  };
}

/**
 * The numbers at positions of every row's number in sorted order
 * @param {Float64Array} values - The distinct numbers, ascending
 * @param {ArrayLike<number>} rows - Each one's rows
 * @param {Array<number>} positions - The positions, counted from 0
 * @returns {Generator<void, Map<number, {value: number, start: number}>>} The steps,
 *   returning each position's number and the position its number's rows start at
 */
export function* atPositions(values, rows, positions) {
  const wanted = [...new Set(positions)].sort((a, b) => a - b);
  const found = new Map();
  let next = 0;
  let start = 0;
  for (let i = 0; i < values.length && next < wanted.length; i++) {
    const end = start + rows[i];
    while (next < wanted.length && wanted[next] < end) {
      found.set(wanted[next], { value: values[i], start });
      next++;
    }
    start = end;
    if ((i & (STEP - 1)) === STEP - 1) {
      yield;
    }
  }
  return found;
}

/**
 * The most frequent numbers, unless every number is as frequent as one row
 * @param {Float64Array} values - The distinct numbers, ascending
 * @param {ArrayLike<number>} rows - Each one's rows
 * @param {number} most - Modes listed at most, the smallest
 * @returns {Generator<void, {modes: Array<number>, modeCount: number}>} The steps,
 *   returning the modes listed and how many there are
 */
export function* modesOf(values, rows, most) {
  let maxFreq = 0;
  for (let i = 0; i < rows.length; i++) {
    maxFreq = Math.max(maxFreq, rows[i]);
    if ((i & (STEP - 1)) === STEP - 1) {
      yield;
    }
  }
  const modes = [];
  let modeCount = 0;
  if (maxFreq > 1) {
    for (let i = 0; i < values.length; i++) {
      if (rows[i] === maxFreq) {
        modeCount++;
        if (modes.length < most) {
          // A Map of the numbers, as the rows count them, holds -0 as 0
          modes.push(values[i] === 0 ? 0 : values[i]);
        }
      }
      if ((i & (STEP - 1)) === STEP - 1) {
        yield;
      }
    }
  }
  return { modes, modeCount };
}

/**
 * Sort a field's numeric values into up to 20 bins of equal width, for the
 * profiling histogram
 * @param {ArrayLike<number>} values - The field's distinct numbers, in ascending order
 * @param {ArrayLike<number>} rows - The rows holding each
 * @param {number} count - Rows holding a number
 * @param {number} totalCount - Rows with a value, numeric or not: the percentages are shares of these
 * @returns {Generator<void, {labels: string[], counts: number[], rows: Array<{from: string, to: string, count: number, percentage: string}>}|null>}
 *   The steps, returning the chart's labels and bar heights and the histogram
 *   table's rows, or null when there are no values
 */
export function* histogramOf(values, rows, count, totalCount) {
  if (count === 0) {
    return null;
  }

  const percentage = (binCount) =>
    Number.isFinite(totalCount) && totalCount > 0 ? ((binCount / totalCount) * 100).toFixed(2) : "0.00";
  const min = values[0];
  const max = values[values.length - 1];

  // A single distinct value gets a single bin, labelled with the value itself
  if (min === max) {
    const value = String(min);
    return {
      labels: [value],
      counts: [count],
      rows: [{ from: value, to: value, count, percentage: percentage(count) }],
    };
  }

  const binCount = Math.min(20, Math.ceil(Math.sqrt(count)));
  const binWidth = (max - min) / binCount;
  // Enough decimals to tell neighbouring bin edges apart: one past binWidth's first significant digit
  const decimals = Math.min(20, Math.max(1, 1 - Math.floor(Math.log10(binWidth))));

  const counts = Array(binCount).fill(0);
  for (let i = 0; i < values.length; i++) {
    // The maximum falls on the last bin's upper edge
    counts[Math.min(binCount - 1, Math.floor((values[i] - min) / binWidth))] += rows[i];
    if ((i & (STEP - 1)) === STEP - 1) {
      yield;
    }
  }

  const binRows = counts.map((binRowCount, i) => ({
    from: (min + i * binWidth).toFixed(decimals),
    to: (min + (i + 1) * binWidth).toFixed(decimals),
    count: binRowCount,
    percentage: percentage(binRowCount),
  }));

  return {
    labels: binRows.map((row) => `${row.from} – ${row.to}`),
    counts,
    rows: binRows,
  };
}
