const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

let QvdReader;
let QvdDataFrame;
let QvdDual;
let legacy;
let profiler;
let fieldSummary;
let columnScan;
let memoryGuard;
let setupMessageHandler;
let dir;
let crafted;

const testData = path.join(__dirname, "..", "test-data");

/**
 * A seeded generator of numbers from 0 to 1, so that the crafted file is the same each run
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

/**
 * Rows of awkward values: different symbols that show the same text, duals of one
 * text and two numbers, numbers in text, blanks, nulls and formats to find
 * @param {number} count - Rows
 * @returns {{rows: Array<Array<*>>, columns: Array<string>}} The rows, as qvdjs writes them
 */
function awkwardRows(count) {
  const random = mulberry32(162);
  const pick = (values) => values[Math.floor(random() * values.length)];
  const amounts = [0, 1.5, "1.50", 2, 2.25, 1e21, "1e+21", 12345678901234568, "12345678901234568", -3, 100, 7];
  const days = [
    new QvdDual(43831.25, "2020-01-01"),
    new QvdDual(43831.75, "2020-01-01"),
    new QvdDual(43832, "2020-01-02"),
    new QvdDual(43840.5, "2020-01-10 12:00"),
    new QvdDual(43900, "2020-03-10"),
    new QvdDual(44000, "2020-06-18"),
  ];
  const codes = [
    "ann@example.com",
    "bob@example.org",
    "+46 70 123 4567",
    "https://example.com/a",
    "0901",
    "007",
    "Item 9",
    "Item 10",
    "Åsa Öberg",
    "  padded ",
    "2021-05-06",
    "",
  ];
  const rows = [];
  for (let i = 0; i < count; i++) {
    const r = random();
    rows.push([
      r < 0.04 ? null : r < 0.06 ? " " : pick(amounts),
      r < 0.05 ? null : r < 0.07 ? "" : pick(days),
      r < 0.03 ? null : pick(codes),
      Math.floor(random() * 40) - 5,
      pick(["Norr", "Söder", "Öst", "Väst"]),
      random() < 0.97 ? null : `rare ${Math.floor(random() * 5)}`,
      // A dual whose text is formatted, so that numbers apart show one text
      new QvdDual(1000 + Math.floor(random() * 400) / 100, `${(1000 + Math.floor(random() * 4)).toLocaleString("en-US")}.00`),
    ]);
  }
  return { rows, columns: ["Amount", "Day", "Code", "2023", "Orders.Region", "Mostly empty", "Formatted"] };
}

/**
 * Read every row of a QVD, with its header
 * @param {string} file - The QVD
 * @returns {Promise<{data: Array<Object>, metadata: object}>} The rows and the header
 */
async function readAll(file) {
  const result = await new QvdReader().read(file, 0);
  assert.strictEqual(result.error, null);
  return result;
}

/**
 * Check that profiling a QVD, field by field, gives the frozen profiler's results
 * on every row read into memory
 * @param {string} file - The QVD
 * @param {object} [options] - profileFile()'s options
 */
async function assertProfilesAsReference(file, options = {}) {
  const { data, metadata } = await readAll(file);
  for (const { name } of metadata.fields) {
    const expected = legacy.profileFields(data, [name]).fields[0];
    const actual = (await profiler.profileFile(file, [name], options)).fields[0];
    assert.deepStrictEqual(actual, expected, `${path.basename(file)}: ${name}`);
  }
}

suite("Profiling Identity Test Suite", function () {
  this.timeout(120000);

  suiteSetup(async () => {
    QvdReader = await require("../src/qvdReader.cjs");
    ({ QvdDataFrame, QvdDual } = await import("qvdjs"));
    legacy = await import("./legacyProfiler/qvdProfiler.mjs");
    profiler = await import("../src/qvdProfiler.mjs");
    fieldSummary = await import("../src/fieldSummary.mjs");
    columnScan = await import("../src/columnScan.mjs");
    memoryGuard = await import("../src/memoryGuard.mjs");
    ({ setupMessageHandler } = await import("../src/webview/messageHandler.mjs"));

    dir = fs.mkdtempSync(path.join(os.tmpdir(), "qvd-viewer-profile-"));
    crafted = path.join(dir, "awkward.qvd");
    const { rows, columns } = awkwardRows(5000);
    await new QvdDataFrame(rows, columns).toQvd(crafted, { allowedDir: dir });
  });

  suiteTeardown(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  suite("Reading a QVD a chunk at a time", () => {
    test("The scan shows each row's value as a read of every row does", async () => {
      for (const file of [crafted, path.join(testData, "lego", "sets.qvd")]) {
        const { data, metadata } = await readAll(file);
        for (const field of metadata.fields) {
          const shown = [];
          await columnScan.scanColumn({
            filePath: file,
            allowedDir: path.dirname(file),
            field: field.name,
            symbols: field.noOfSymbols,
            totalRows: data.length,
            chunkRows: 997,
            onChunk: ({ codes, symbols }) => {
              for (const code of codes) {
                shown.push(code < 0 ? null : columnScan.shownValue(symbols[code]));
              }
            },
          });
          assert.deepStrictEqual(shown, data.map((row) => row[field.name]), `${path.basename(file)}: ${field.name}`);
        }
      }
    });

    test("Profiling the awkward file gives the reference's results", async () => {
      await assertProfilesAsReference(crafted);
    });

    test("...in chunks that end anywhere, and with its file opened afresh between them", async () => {
      await assertProfilesAsReference(crafted, { chunkRows: 777, heldBytes: 1024 });
    });

    test("Profiling the lego and Stockholm files gives the reference's results", async () => {
      const files = ["colors", "themes", "sets", "parts", "part_categories", "inventories", "inventory_sets"].map(
        (name) => path.join(testData, "lego", `${name}.qvd`)
      );
      files.push(path.join(testData, "stockholm_temp", "stockholm_temp.qvd"));
      for (const file of files) {
        await assertProfilesAsReference(file);
      }
    });

    test("Profiling all of lego/inventory_parts.qvd gives the reference's results", async () => {
      await assertProfilesAsReference(path.join(testData, "lego", "inventory_parts.qvd"));
    });

    test("Several fields are profiled one after another, each as on its own", async () => {
      const file = path.join(testData, "lego", "sets.qvd");
      const { data } = await readAll(file);
      const fields = ["name", "year", "num_parts"];

      const actual = await profiler.profileFile(file, fields);

      assert.deepStrictEqual(actual, legacy.profileFields(data, fields));
    });

    test("A field the file doesn't have is profiled as a field of nulls", async () => {
      const file = path.join(testData, "lego", "colors.qvd");
      const { data } = await readAll(file);

      const actual = await profiler.profileFile(file, ["No such field"]);

      assert.deepStrictEqual(actual, legacy.profileFields(data, ["No such field"]));
    });
  });

  suite("Profiling rows held in memory", () => {
    /**
     * Check that profiling rows in memory, whole and in chunks, gives the reference's results
     * @param {Array<Object>} data - The rows
     * @param {string} name - What they are, for the message
     */
    function assertAsReference(data, name) {
      const expected = legacy.profileFields(data, ["v"]).fields[0];
      assert.deepStrictEqual(profiler.profileFields(data, ["v"]).fields[0], expected, name);
      // Statistics and the other analyses on their own, whatever the field's kind
      const kinds = { numeric: true, date: true, string: true };
      assert.deepStrictEqual(
        fieldSummary.summarizeRows(data, "v", { kinds, chunkRows: 3 }),
        fieldSummary.summarizeRows(data, "v", { kinds }),
        `${name}, in chunks`
      );
    }

    test("-0 and 0 keep the order their rows put them in, as a sort of the rows does", () => {
      const cases = [
        [0, -0, 0],
        [-0, 0, -0],
        [-0, -0],
        [0, -0, 1, -0, 0, 2, -0, -1, 0, 0],
        [5, -0, 0, -0, 0, -0, 0, -0, 0, -0, 0, -5],
      ];
      for (const values of cases) {
        assertAsReference(
          values.map((v) => ({ v })),
          values.map((v) => (Object.is(v, -0) ? "-0" : v)).join(",")
        );
      }
    });

    test("Values that show the same text are one value, numbers and text told apart for statistics", () => {
      const values = [1.5, "1.50", "1.5", 1e21, "1e+21", 12345678901234568, "12345678901234568", "x", 1.5, null, "", " "];
      const data = Array.from({ length: 300 }, (_, i) => ({ v: values[(i * 7) % values.length] }));
      assertAsReference(data, "mixed");
    });

    test("Values a QVD can't hold, profiled from rows in memory, give the reference's results", () => {
      const values = [Infinity, -Infinity, NaN, true, false, new Date(Date.UTC(2020, 0, 1)), 3, 3, 4];
      assertAsReference(values.map((v) => ({ v })), "unusual");
    });

    test("Two different texts with one hash are told apart by reading the field again", () => {
      const data = Array.from({ length: 200 }, (_, i) => ({ v: `value ${i % 37}` }));
      const seeds = [1, 2];
      let weak = 0;
      // Every text has one hash with the first seeds
      const hashPair = (text, seedA, seedB, out) => {
        if (seedA === seeds[0]) {
          weak++;
          out[0] = 7;
          out[1] = 7;
          return;
        }
        fieldSummary.hashPair(text, seedA, seedB, out);
      };
      const kinds = { numeric: false, date: false, string: true };

      const summary = fieldSummary.summarizeRows(data, "v", { seeds, hashPair, kinds });

      assert.ok(weak > 0, "The weak hash was used");
      assert.deepStrictEqual(summary, fieldSummary.summarizeRows(data, "v", { kinds }));
      assert.strictEqual(summary.uniqueValues, 37);
    });

    test("Texts with one hash whatever the seeds are told apart by the texts themselves", async () => {
      const data = Array.from({ length: 300 }, (_, i) => ({ v: `value ${(i * 7) % 41}` }));
      // Every text has one hash, whatever the seeds
      const hashPair = (text, seedA, seedB, out) => {
        out[0] = 7;
        out[1] = 7;
      };
      const kinds = { numeric: false, date: false, string: true };
      const expected = fieldSummary.summarizeRows(data, "v", { kinds });

      assert.deepStrictEqual(fieldSummary.summarizeRows(data, "v", { hashPair, kinds }), expected);

      // And as a QVD's field is, a pass and a chunk at a time, the event loop let run
      const { codes, symbols } = fieldSummary.codesOf(data, "v");
      let reads = 0;
      const summary = await fieldSummary.summarizeAsync(
        { hashPair, kinds, totalRows: data.length, symbolCount: symbols.length },
        async (summarizer) => {
          reads++;
          for (let offset = 0; offset < codes.length; offset += 64) {
            await summarizer.takeAsync(codes.subarray(offset, offset + 64), symbols, offset);
          }
        }
      );
      assert.deepStrictEqual(summary, expected);
      // Two reads with seeds, then one with the texts: two passes each
      assert.strictEqual(reads, 6);
    });

    test("A field of few values that needs nothing in row order is read once", async () => {
      const values = ["2020-01-01", "2020-02-15", "", null, "2021-07-04", "not a date"];
      const data = Array.from({ length: 3000 }, (_, i) => ({ v: values[(i * 5) % values.length] }));
      const { codes, symbols } = fieldSummary.codesOf(data, "v");
      const passes = [];

      const summary = await fieldSummary.summarizeAsync(
        { kinds: { numeric: false, date: true, string: false }, totalRows: data.length, symbolCount: symbols.length },
        async (summarizer, pass) => {
          passes.push(pass);
          await summarizer.takeAsync(codes, symbols, 0);
        }
      );

      assert.deepStrictEqual(passes, [1]);
      assert.deepStrictEqual(
        summary,
        fieldSummary.summarizeRows(data, "v", { kinds: { numeric: false, date: true, string: false }, chunkRows: 1 })
      );
      assert.deepStrictEqual(
        profiler.profileFields(data, ["v"]).fields[0],
        legacy.profileFields(data, ["v"]).fields[0]
      );
    });

    test("A field of more rows than 32 bits count is refused", () => {
      assert.throws(
        () => new fieldSummary.FieldSummarizer({ totalRows: 2 ** 32, symbolCount: 1 }),
        (error) => error instanceof RangeError && /32 bits/.test(error.message)
      );
    });

    test("Past PREFIXES_COUNTED distinct prefixes, the prefixes are estimates, and say so", async () => {
      const { PREFIXES_COUNTED } = await import("../src/stringFeatures.mjs");
      const random = mulberry32(7);
      // Each value has its own prefixes from 3 characters on
      const values = Array.from({ length: Math.ceil(PREFIXES_COUNTED / 5) }, () =>
        `Q${Math.floor(random() * 1e9).toString(36).padStart(9, "0")}`
      );
      const data = values.map((v) => ({ v }));

      const strings = fieldSummary.summarizeRows(data, "v", { kinds: { numeric: false, date: false, string: true } }).strings;

      assert.strictEqual(strings.patterns.estimated, true);
      // The prefix every value shares is still found, with every row
      assert.deepStrictEqual(strings.patterns.prefixes[0], {
        prefix: values[0].substring(0, 2),
        count: values.length,
        percentage: "100.0",
      });
    });
  });

  suite("Memory and giving up", () => {
    test("Profiling is refused when the largest field's values don't fit, naming that field", async () => {
      const file = path.join(testData, "lego", "sets.qvd");
      // Everything the guard has to give, taken
      const release = memoryGuard.bookHeap(1e15);
      try {
        await assert.rejects(profiler.profileFile(file, ["year", "name"]), (error) => {
          assert.ok(error.profileMessage.startsWith("Profiling name, a field of 10,368 distinct values, needs about"), error.profileMessage);
          return true;
        });
      } finally {
        release();
      }
    });

    test("What profiling needs follows its largest field, up to HEAP_BYTES", async () => {
      const fields = [
        { name: "small", symbols: 2, bytes: 12 },
        { name: "large", symbols: 50000000, bytes: 450000000 },
      ];
      const small = profiler.profileMemory({ fields }, ["small"]);
      const large = profiler.profileMemory({ fields }, ["small", "large"]);

      assert.ok(small.heapBytes < 128 * 2 ** 20, `${small.heapBytes}`);
      assert.strictEqual(large.heapBytes, fieldSummary.HEAP_BYTES);
      assert.strictEqual(large.outsideBytes, 50000000 * fieldSummary.BYTES_PER_DISTINCT_VALUE);

      // A small field profiles with too little heap left for a large one
      const file = path.join(testData, "lego", "colors.qvd");
      await profiler.profileFile(file, ["is_trans"]);
      const budget = memoryGuard.knownBudget();
      const left = budget.factor * budget.bytes - memoryGuard.bookedBytes();
      const release = memoryGuard.bookHeap(left - 256 * 2 ** 20);
      try {
        const { fields: [result] } = await profiler.profileFile(file, ["is_trans"]);
        assert.strictEqual(result.uniqueValues, 2);
      } finally {
        release();
      }
    });

    test("A refusal for fields the file doesn't have says what is short, rather than failing", async () => {
      const release = memoryGuard.bookHeap(1e15);
      try {
        await assert.rejects(profiler.profileFile(path.join(testData, "lego", "colors.qvd"), ["No such field"]), (error) => {
          assert.ok(error.profileMessage.startsWith("Profiling needs about"), error.profileMessage);
          return true;
        });
      } finally {
        release();
      }
    });

    test("A file rewritten between passes is reported, not profiled from both", async () => {
      const file = path.join(dir, "rewritten.qvd");
      const rows = Array.from({ length: 2000 }, (_, i) => [i % 50, `t${i % 7}`]);
      await new QvdDataFrame(rows, ["n", "t"]).toQvd(file, { allowedDir: dir });
      let touched = false;

      await assert.rejects(
        profiler.profileFile(file, ["n"], {
          chunkRows: 500,
          // Once the first pass has read a chunk, the file is stored again, as a reload would
          onProgress: ({ pass, rows }) => {
            if (pass === 1 && rows > 0 && !touched) {
              touched = true;
              const later = new Date(Date.now() + 60000);
              fs.utimesSync(file, later, later);
            }
          },
        }),
        (error) => {
          assert.ok(error.profileMessage?.startsWith("The file changed on disk"), error.message);
          return true;
        }
      );
      assert.ok(touched);
    });

    test("The work between passes is given up at its next step", async () => {
      const n = 1100000;
      const codes = Int32Array.from({ length: n }, (_, i) => i);
      const symbols = Array.from({ length: n }, (_, i) => n - i);
      const summarizer = new fieldSummary.FieldSummarizer({
        totalRows: n,
        symbolCount: n,
        kinds: { numeric: true, date: false, string: false },
      });
      assert.strictEqual(await summarizer.nextPassAsync(), 1);
      await summarizer.takeAsync(codes, symbols, 0);
      const controller = new AbortController();
      controller.abort();

      // Sorting a million and more numbers takes several steps: it stops after the first
      await assert.rejects(summarizer.nextPassAsync(controller.signal), { name: "AbortError" });
    });

    test("Profiling given up between chunks stops, and gives its memory back", async () => {
      const file = path.join(testData, "lego", "inventory_parts.qvd");
      const before = memoryGuard.bookedBytes();
      const controller = new AbortController();

      await assert.rejects(
        profiler.profileFile(file, ["part_num"], {
          chunkRows: 10000,
          signal: controller.signal,
          onProgress: ({ rows }) => {
            if (rows > 0) {
              controller.abort();
            }
          },
        }),
        { name: "AbortError" }
      );
      assert.strictEqual(memoryGuard.bookedBytes(), before);
    });
  });

  suite("The page's request", () => {
    /**
     * Ask the message handler to profile fields, as the page does
     * @param {string} file - The QVD
     * @param {Array<string>} fieldNames - The fields
     * @returns {Promise<object>} The message it answers with
     */
    async function profileThroughHandler(file, fieldNames) {
      let onMessage;
      const answers = [];
      const panel = {
        webview: {
          onDidReceiveMessage: (listener) => (onMessage = listener),
          postMessage: (message) => answers.push(message),
        },
      };
      setupMessageHandler(panel, file, null, {}, async () => {}, null);
      await onMessage({ command: "profileFields", fieldNames, maxUniqueValues: 1000 });
      assert.strictEqual(answers.length, 1);
      return answers[0];
    }

    test("Profiling the file's fields answers with their results", async () => {
      const file = path.join(testData, "lego", "themes.qvd");
      const { data } = await readAll(file);

      const answer = await profileThroughHandler(file, ["name", "parent_id"]);

      assert.strictEqual(answer.command, "profilingResults");
      assert.deepStrictEqual(answer.results, legacy.profileFields(data, ["name", "parent_id"]));
    });

    test("A file that can't be read answers with why", async () => {
      const answer = await profileThroughHandler(path.join(testData, "misc", "damaged.qvd"), ["x"]);

      assert.strictEqual(answer.command, "profilingError");
      assert.ok(answer.error.startsWith("Failed to read QVD:"), answer.error);
    });
  });
});
