const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { recordingWebview } = require("./fakes");

// The ESM modules, imported in suiteSetup
let QvdDataFrame;
let QvdDual;
let openPager;
let createPageServer;
let scanColumn;
let chunkRowsFor;
let searchRows;
let sortRows;
let mergeSort;
let MAX_SORTED_TEXTS;
let guard;

const root = path.join(__dirname, "..");
const inventoryParts = path.join(root, "test-data", "lego", "inventory_parts.qvd");

/**
 * The fixture: names with å, ä and ö and numbers in them, amounts that are
 * numbers, text and null, days that are duals, a field whose name is a number,
 * and one with a dot in it, as Qlik's QUALIFY names a field
 * @returns {{columns: Array<string>, rows: Array<Array<*>>}} Its fields and rows
 */
function fixture(dual) {
  const columns = ["Name", "Amount", "Day", "2023", "Orders.Region"];
  const names = ["Örjan", "Åsa", "Zed", "Ärla", "Item 10", "Item 9", null, "åsa", "Bo", "Item 9"];
  const amounts = [10, -2.5, "n/a", 0, null, 1000, 7, -2.5, "N/A", 3];
  // Their serials and their text, which sorts otherwise: 13 Jan before 2 Feb
  const days = [
    [42412, "2/2/2016"],
    [42382, "13/1/2016"],
    null,
    [42383, "14/1/2016"],
    [42412, "2/2/2016"],
    [42382, "13/1/2016"],
    [42400, "31/1/2016"],
    [42383, "14/1/2016"],
    [42382, "13/1/2016"],
    null,
  ];
  const regions = ["North", "south", "North", "East", "West", "south", "North", null, "east", "West"];
  const rows = names.map((name, i) => [
    name,
    amounts[i],
    days[i] ? dual(days[i][0], days[i][1]) : null,
    i % 3,
    regions[i],
  ]);
  return { columns, rows };
}

suite("Whole-File Search and Sort Test Suite", () => {
  let dir;
  let file;

  suiteSetup(async function () {
    this.timeout(60000);
    ({ QvdDataFrame, QvdDual } = await import("qvdjs"));
    ({ openPager } = await import("../src/qvdPager.mjs"));
    ({ createPageServer } = await import("../src/webview/pageServer.mjs"));
    ({ scanColumn, chunkRowsFor } = await import("../src/columnScan.mjs"));
    ({ searchRows } = await import("../src/viewSearch.mjs"));
    ({ sortRows, mergeSort, MAX_SORTED_TEXTS } = await import("../src/viewSort.mjs"));
    guard = await import("../src/memoryGuard.mjs");
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "qvd-viewer-views-"));
    file = path.join(dir, "views.qvd");
    const { columns, rows } = fixture((number, text) => new QvdDual(number, text));
    await new QvdDataFrame(rows, columns).toQvd(file, { allowedDir: dir });
  });

  suiteTeardown(() => {
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * The rows of a view of the fixture, as the grid shows them
   * @param {object} view - search and sort
   * @param {object} [options] - locale
   * @returns {Promise<{rows: Array<Array<*>>, totalRows: number}>} Every row of the view
   */
  async function viewOf(view, { locale = "sv" } = {}) {
    const pager = await openPager(file, { locale });
    try {
      return await pager.page({ offset: 0, limit: 1000, ...view });
    } finally {
      await pager.close();
    }
  }

  test("A search covers every field, whatever the case, and an empty cell holds nothing", async () => {
    const names = async (search) => (await viewOf({ search })).rows.map((row) => row[0]);
    // Å and å are the same letter in another case
    assert.deepStrictEqual(await names("ÅSA"), ["Åsa", "åsa"]);
    // A dual's text, as the grid shows it
    assert.deepStrictEqual(await names("13/1"), ["Åsa", "Item 9", "Bo"]);
    // A field's value, wherever it is: "south" twice, and "n/a" in its own case and another
    assert.deepStrictEqual(await names("SOUTH"), ["Åsa", "Item 9"]);
    assert.deepStrictEqual(await names("n/a"), ["Zed", "Bo"]);
    // A number as the grid shows it
    assert.deepStrictEqual(await names("-2.5"), ["Åsa", "åsa"]);
    assert.deepStrictEqual(await names("null"), []);
    assert.deepStrictEqual((await viewOf({ search: "no such text" })).totalRows, 0);
  });

  test("A sort puts numbers and dates by their value first, then text as the language does, then nulls", async () => {
    const column = async (fieldIndex, descending, locale) =>
      (await viewOf({ sort: { fieldIndex, descending } }, { locale })).rows.map((row) => row[fieldIndex]);
    // Swedish puts å, ä and ö after z; numbers in text are compared as numbers
    assert.deepStrictEqual(await column(0, false, "sv"), [
      "Bo",
      "Item 9",
      "Item 9",
      "Item 10",
      "Zed",
      "åsa",
      "Åsa",
      "Ärla",
      "Örjan",
      null,
    ]);
    // Numbers first, by value, then text; nulls last either way
    assert.deepStrictEqual(await column(1, false, "sv"), [-2.5, -2.5, 0, 3, 7, 10, 1000, "n/a", "N/A", null]);
    assert.deepStrictEqual(await column(1, true, "sv"), ["N/A", "n/a", 1000, 10, 7, 3, 0, -2.5, -2.5, null]);
    // Dates by their serial, not their text: 13/1 before 31/1 before 2/2
    assert.deepStrictEqual(await column(2, false, "sv"), [
      "13/1/2016",
      "13/1/2016",
      "13/1/2016",
      "14/1/2016",
      "14/1/2016",
      "31/1/2016",
      "2/2/2016",
      "2/2/2016",
      null,
      null,
    ]);
  });

  test("Text that shows as nothing sorts last, with the nulls, either way", async () => {
    const blanks = path.join(dir, "blanks.qvd");
    await new QvdDataFrame([[""], [" "], ["b"], [null], [2], ["a"]], ["Value"]).toQvd(blanks, { allowedDir: dir });
    const sorted = async (descending) => {
      const pager = await openPager(blanks, { locale: "en" });
      try {
        return (await pager.page({ offset: 0, limit: 10, sort: { fieldIndex: 0, descending } })).rows.map((row) => row[0]);
      } finally {
        await pager.close();
      }
    };
    assert.deepStrictEqual(await sorted(false), [2, "a", "b", "", " ", null]);
    assert.deepStrictEqual(await sorted(true), ["b", "a", 2, "", " ", null]);
  });

  test("Rows whose values sort the same keep their order in the file", async () => {
    // "2023" is i % 3: rows 0, 3, 6 and 9 hold 0
    const sorted = (await viewOf({ sort: { fieldIndex: 3 } })).rows;
    assert.deepStrictEqual(
      sorted.map((row) => [row[3], row[0]]),
      [
        [0, "Örjan"],
        [0, "Ärla"],
        [0, null],
        [0, "Item 9"],
        [1, "Åsa"],
        [1, "Item 10"],
        [1, "åsa"],
        [2, "Zed"],
        [2, "Item 9"],
        [2, "Bo"],
      ]
    );
  });

  test("A search then a sort sorts the rows found, and pages through them", async () => {
    const pager = await openPager(file, { locale: "sv" });
    try {
      const view = { search: "north", sort: { fieldIndex: 0, descending: true } };
      const first = await pager.page({ offset: 0, limit: 2, ...view });
      assert.strictEqual(first.totalRows, 3);
      assert.strictEqual(first.fileRows, 10);
      assert.deepStrictEqual(
        first.rows.map((row) => row[0]),
        ["Örjan", "Zed"]
      );
      const second = await pager.page({ offset: 2, limit: 2, ...view });
      assert.deepStrictEqual(
        second.rows.map((row) => row[0]),
        [null]
      );
      assert.strictEqual(pager.viewRows, 3);
      // Another sort of the same search sorts the rows it found, without searching again
      const steps = [];
      const resorted = await pager.page({
        offset: 0,
        limit: 3,
        search: "north",
        sort: { fieldIndex: 0 },
        onProgress: ({ text }) => steps.push(text),
      });
      assert.deepStrictEqual(
        resorted.rows.map((row) => row[0]),
        ["Zed", "Örjan", null]
      );
      assert.ok(steps.length > 0 && steps.every((text) => text.startsWith("Sorting by Name")), steps.join(" | "));
      // No search and no sort is every row in file order again
      const all = await pager.page({ offset: 0, limit: 3 });
      assert.strictEqual(all.totalRows, 10);
      assert.deepStrictEqual(
        all.rows.map((row) => row[0]),
        ["Örjan", "Åsa", "Zed"]
      );
    } finally {
      await pager.close();
    }
  });

  test("Search and sort on a large file give what a full read and an in-memory sort give", async function () {
    this.timeout(120000);
    const QvdReader = (await import("../src/qvdReader.mjs")).default;
    const read = await new QvdReader().read(inventoryParts, 0);
    const rows = read.data.map((row) => read.columns.map((name) => row[name]));
    read.release();
    const pager = await openPager(inventoryParts);
    try {
      // quantity, a field of numbers, descending, among the rows that hold 3001 somewhere
      const view = { search: "3001", sort: { fieldIndex: 3, descending: true } };
      const found = rows
        .map((row, index) => [row, index])
        .filter(([row]) => row.some((value) => value !== null && String(value).toLowerCase().includes("3001")))
        .sort(([a, i], [b, j]) => b[3] - a[3] || i - j)
        .map(([row]) => row);
      const first = await pager.page({ offset: 0, limit: 1000, ...view });
      assert.strictEqual(first.totalRows, found.length);
      assert.deepStrictEqual(first.rows, found.slice(0, 1000));
      const last = await pager.page({ offset: found.length - 50, limit: 1000, ...view });
      assert.deepStrictEqual(last.rows, found.slice(-50));
    } finally {
      await pager.close();
    }
  });

  test("A scan that opens its file afresh as it goes gives the same values", async () => {
    const pager = await openPager(inventoryParts);
    const { fields, rowCount } = pager.header;
    await pager.close();
    const field = fields[1];
    const scanned = async (options) => {
      const values = [];
      const result = await scanColumn({
        filePath: inventoryParts,
        allowedDir: path.dirname(inventoryParts),
        field: field.name,
        symbols: field.symbols,
        totalRows: rowCount,
        onChunk: ({ codes, symbols }) => {
          for (const code of codes) {
            values.push(code < 0 ? null : symbols[code]);
          }
        },
        ...options,
      });
      return { values, ...result };
    };
    const whole = await scanned({});
    const reopened = await scanned({ chunkRows: 50000, heldBytes: 1 });
    assert.strictEqual(whole.values.length, rowCount);
    assert.ok(reopened.reopened > 5);
    assert.deepStrictEqual(reopened.values, whole.values);
    // Fewer rows to a chunk where most rows hold a value of their own
    assert.strictEqual(chunkRowsFor(10, 1000000), 1000000);
    assert.strictEqual(chunkRowsFor(47000000, 47000000), 250000);
    assert.strictEqual(chunkRowsFor(0, 0), 1000000);
  });

  test("A search or sort given up stops, holds nothing, and leaves the view shown", async () => {
    const before = guard.bookedBytes();
    const pager = await openPager(inventoryParts);
    try {
      await pager.page({ offset: 0, limit: 10 });
      const given = new AbortController();
      const page = pager.page({
        offset: 0,
        limit: 10,
        search: "no such text",
        signal: given.signal,
        onProgress: () => given.abort(),
      });
      await assert.rejects(page, { name: "AbortError" });
      assert.strictEqual(pager.viewRows, pager.totalRows, "the view shown is still every row");
      // The search stops at its next chunk, and lets its booking go
      for (let tries = 0; tries < 100 && guard.bookedBytes() - before > pager.heldBytes + 1; tries++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.ok(Math.abs(guard.bookedBytes() - before - pager.heldBytes) < 1);
    } finally {
      await pager.close();
    }
    assert.ok(Math.abs(guard.bookedBytes() - before) < 1);
  });

  test("A search or sort that doesn't fit in the memory left is refused, and says what it needed", async () => {
    const QvdReader = (await import("../src/qvdReader.mjs")).default;
    // qvdjs's budget is known once a read has asked for it
    (await new QvdReader().read(file, 1)).release();
    const pager = await openPager(inventoryParts);
    const release = guard.bookHeap(guard.knownBudget().bytes);
    try {
      await assert.rejects(pager.page({ offset: 0, limit: 10, sort: { fieldIndex: 1 } }), (error) => {
        assert.strictEqual(error.name, "QvdValidationError");
        assert.strictEqual(error.context.reason, "memory");
        assert.match(error.message, /^Sorting all 580,251 rows by part_num needs about .+ of memory, and about .+ is left/);
        assert.strictEqual(guard.memoryRefusalOf(error).forCaller, true);
        return true;
      });
    } finally {
      release();
      await pager.close();
    }
  });

  test("The page server sorts and searches as the grid asks, and says how far it has got", async () => {
    const messages = [];
    const pages = createPageServer({ filePath: file, webview: recordingWebview(messages), locale: "sv" });
    try {
      await pages.servePage({ requestId: 1, offset: 0, limit: 5, search: "item", sort: { fieldIndex: 0 } });
      await pages.servePage({ requestId: 2, offset: 0, limit: 5, sort: { fieldIndex: 9 } });
    } finally {
      await pages.close();
    }
    const rows = messages.find((message) => message.command === "pageRows");
    assert.strictEqual(rows.requestId, 1);
    assert.strictEqual(rows.totalRows, 3);
    assert.strictEqual(rows.fileRows, 10);
    assert.deepStrictEqual(
      rows.rows.map((row) => row[0]),
      ["Item 9", "Item 9", "Item 10"]
    );
    const progress = messages.filter((message) => message.command === "pageProgress" && message.requestId === 1);
    assert.ok(progress.some((message) => /^Searching Name \(field 1 of 5\)…$/.test(message.text)));
    assert.ok(progress.some((message) => /^Sorting by Name/.test(message.text)));
    assert.ok(progress.every((message) => message.fraction >= 0 && message.fraction <= 1));
    // A field the file doesn't have
    const refused = messages.find((message) => message.requestId === 2);
    assert.strictEqual(refused.command, "pageFailed");
    assert.strictEqual(refused.failure.kind, "option");
  });

  test("A sort of too many different texts is refused with why, and the merge sort is stable", async () => {
    const header = {
      rowCount: 3,
      fields: [{ name: "Key", symbols: 3, bytes: 30, tags: [] }],
    };
    // A scan that says its field holds more texts than a sort takes
    const scan = async ({ onChunk }) => {
      const symbols = [];
      const codes = new Int32Array(MAX_SORTED_TEXTS + 1);
      for (let i = 0; i <= MAX_SORTED_TEXTS; i++) {
        codes[i] = i;
      }
      onChunk({
        codes,
        symbols: new Proxy(symbols, { get: (_target, key) => (key === "length" ? codes.length : `text ${String(key)}`) }),
        offset: 0,
      });
    };
    await assert.rejects(
      sortRows({ filePath: "x.qvd", allowedDir: "/", header: { ...header, rowCount: MAX_SORTED_TEXTS + 1 }, fieldIndex: 0, scan }),
      (error) => {
        assert.strictEqual(error.name, "ViewRefusedError");
        assert.strictEqual(error.context.reason, "view");
        assert.match(error.message, /^Key has more than 5,000,000 different text values, too many to sort here/);
        return true;
      }
    );

    const keys = [3, 1, 2, 1, 3, 0, 1];
    const order = await mergeSort(Uint32Array.from(keys.keys()), (a, b) => keys[a] - keys[b]);
    assert.deepStrictEqual(Array.from(order), [5, 1, 3, 6, 2, 0, 4]);
  });

  test("searchRows finds the rows a scan's values match, and only those", async () => {
    const header = {
      rowCount: 40,
      fields: [
        { name: "A", symbols: 3, bytes: 0, tags: [] },
        { name: "B", symbols: 2, bytes: 0, tags: [] },
      ],
    };
    const values = { A: ["red", "Green", "blue"], B: [1, "Reddish"] };
    const looked = { A: 0, B: 0 };
    const scan = async ({ field, onChunk }) => {
      const symbols = values[field].map((value) => value);
      const codes = Int32Array.from({ length: 40 }, (_, row) => (row % 7 === 0 ? -1 : row % symbols.length));
      const counted = new Proxy(symbols, {
        get: (target, key) => {
          if (/^\d+$/.test(String(key))) {
            looked[field]++;
          }
          return target[key];
        },
      });
      onChunk({ codes: codes.subarray(0, 20), symbols: counted, offset: 0 });
      onChunk({ codes: codes.subarray(20), symbols: counted, offset: 20 });
    };
    const rows = await searchRows({ filePath: "x.qvd", allowedDir: "/", header, text: "RED", scan });
    const expected = [];
    for (let row = 0; row < 40; row++) {
      const a = row % 7 === 0 ? null : values.A[row % 3];
      const b = row % 7 === 0 ? null : values.B[row % 2];
      if ([a, b].some((value) => value !== null && String(value).toLowerCase().includes("red"))) {
        expected.push(row);
      }
    }
    assert.deepStrictEqual(Array.from(rows), expected);
    // Each value is looked at once, however many rows hold it
    assert.deepStrictEqual(looked, { A: 3, B: 2 });
  });
});
