const assert = require("assert");

let sortedNumbers;

/**
 * A seeded generator of numbers from 0 to 1
 * @param {number} seed - The seed
 * @returns {function(): number} The generator
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Numbers whose bits are awkward to sort by: signs, zeros, the smallest and largest
const AWKWARD = [
  0, -0, 1, -1, 5e-324, -5e-324, 2.2250738585072014e-308, Number.MAX_VALUE, -Number.MAX_VALUE,
  1e21, -1e21, 0.1, 0.2, 0.30000000000000004, 123456789, -123456789, 2 ** 53, -(2 ** 53),
];

/**
 * Numbers to sort: awkward ones, small whole numbers and wide-ranging fractions
 * @param {number} n - How many
 * @param {number} seed - The seed
 * @returns {Float64Array} The numbers
 */
function numbersOf(n, seed) {
  const random = mulberry32(seed);
  const numbers = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = random();
    numbers[i] =
      r < 0.2
        ? AWKWARD[i % AWKWARD.length]
        : r < 0.5
          ? Math.round((random() - 0.5) * 1000)
          : (random() - 0.5) * 10 ** Math.floor(random() * 40);
  }
  return numbers;
}

suite("Sorted Numbers Test Suite", () => {
  suiteSetup(async () => {
    sortedNumbers = await import("../src/sortedNumbers.mjs");
  });

  test("The radix sort puts numbers in the order a numeric sort does, -0 before 0", () => {
    for (const n of [0, 1, 2, 17, 1000, sortedNumbers.STEP + 7]) {
      const numbers = numbersOf(n, n + 1);
      const expected = numbers.slice().sort();
      const sorted = numbers.slice();
      const payload = Uint32Array.from({ length: n }, (_, i) => i);

      sortedNumbers.drain(sortedNumbers.radixSort(sorted, payload));

      for (let i = 0; i < n; i++) {
        assert.ok(Object.is(sorted[i], expected[i]), `${n} numbers, at ${i}: ${sorted[i]}, not ${expected[i]}`);
        assert.ok(Object.is(numbers[payload[i]], sorted[i]), `${n} numbers: the payload moved with its number`);
        if (i > 0 && Object.is(sorted[i], sorted[i - 1])) {
          assert.ok(payload[i] > payload[i - 1], "Equal numbers keep their order");
        }
      }
    }
  });

  test("Grouping gives each distinct number once, with its rows, and each code's group", () => {
    const n = 50000;
    const numbers = numbersOf(n, 7);
    const random = mulberry32(8);
    const counts = Uint32Array.from({ length: n }, () => 1 + Math.floor(random() * 3));
    const groupOf = new Uint32Array(n);

    const { values, rows } = sortedNumbers.drain(
      sortedNumbers.groupNumbers(numbers.slice(), Uint32Array.from({ length: n }, (_, i) => i), counts, groupOf)
    );

    // A Map of the numbers, which holds -0 and 0 as one
    const expected = new Map();
    numbers.forEach((number, i) => expected.set(number, (expected.get(number) ?? 0) + counts[i]));
    assert.strictEqual(values.length, expected.size);
    for (let g = 0; g < values.length; g++) {
      assert.strictEqual(rows[g], expected.get(values[g]));
      assert.ok(g === 0 || values[g] > values[g - 1], "Ascending, each once");
    }
    numbers.forEach((number, code) => assert.ok(values[groupOf[code]] === number));
  });

  test("Sorting lets the event loop run between steps", () => {
    const numbers = numbersOf(3 * sortedNumbers.STEP, 3);
    let steps = 0;
    const sort = sortedNumbers.radixSort(numbers, new Uint32Array(numbers.length));
    while (!sort.next().done) {
      steps++;
    }
    assert.ok(steps >= 4 * 3, `${steps} steps`);
  });
});
