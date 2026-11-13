const assert = require("assert");
const { createDataGrid, cellText, sortOf } = require("../src/webview/client/dataGrid.js");

/**
 * An element, as much of one as the grid uses: its children, text, class and
 * buttons. HTML set on it makes a button for each data-command it holds.
 * @param {string} [tagName] - Its tag
 * @returns {object} The element
 */
function fakeElement(tagName = "div") {
  const listeners = {};
  let markup = "";
  const element = {
    tagName: tagName.toUpperCase(),
    children: [],
    className: "",
    hidden: true,
    textContent: "",
    dataset: {},
    buttons: [],
    replaceChildren() {
      this.children = [];
      this.buttons = [];
    },
    append(...children) {
      this.children.push(...children);
    },
    addEventListener(type, listener) {
      (listeners[type] ??= []).push(listener);
    },
    click() {
      (listeners.click ?? []).forEach((listener) => listener({}));
    },
    querySelectorAll() {
      return this.buttons;
    },
    get innerHTML() {
      return markup;
    },
    set innerHTML(value) {
      markup = value;
      this.buttons = [...value.matchAll(/data-command="([^"]+)"(?: data-setting="([^"]+)")?/g)].map(
        ([, command, setting]) => Object.assign(fakeElement("button"), { dataset: setting ? { command, setting } : { command } })
      );
    },
  };
  return element;
}

/**
 * The text of an element and its children
 * @param {object} element - The element
 * @returns {string} The text
 */
function textOf(element) {
  return [element.textContent, ...element.children.map(textOf)].join(" ").trim();
}

/**
 * A Tabulator that keeps its options, filter and page
 */
class FakeTabulator {
  constructor(element, options) {
    this.element = element;
    this.options = options;
    this.filter = null;
    this.pagesSet = [];
    this.listeners = {};
    this.sorters = [];
    this.sortsSet = [];
  }
  getSorters() {
    return this.sorters;
  }
  setSort(field, dir) {
    this.sorters = [{ field, dir }];
    this.sortsSet.push([field, dir]);
  }
  clearSort() {
    this.sorters = [];
    this.sortsSet.push(null);
  }
  on(event, listener) {
    this.listeners[event] = listener;
  }
  setFilter(filter) {
    this.filter = filter;
  }
  clearFilter() {
    this.filter = null;
  }
  getPage() {
    return 3;
  }
  setPage(page) {
    this.pagesSet.push(page);
  }
  redraw() {}
}

/**
 * A grid of a file with the fields given, with what it posts
 * @param {object} [options] - fields, totalRows, pageSize
 * @returns {{grid: object, table: FakeTabulator, status: object, posted: Array<object>}} The grid
 */
function makeGrid({ fields = ["Id", "Name"], totalRows = 1234, pageSize = 100 } = {}) {
  const posted = [];
  const status = fakeElement();
  const searchInput = fakeElement("input");
  // Run later, when the test says
  const deferred = [];
  const grid = createDataGrid({
    element: fakeElement(),
    status,
    searchInput,
    defer: (fn) => deferred.push(fn),
    fields,
    totalRows,
    pageSize,
    pageSizes: [25, 50, 100],
    vscode: { postMessage: (message) => posted.push(message) },
    Tabulator: FakeTabulator,
    progressDelayMs: 60000,
  });
  return { grid, table: grid.table, status, posted, searchInput, deferred };
}

suite("Data Grid Test Suite", () => {
  let savedDocument;

  suiteSetup(() => {
    savedDocument = globalThis.document;
    globalThis.document = {
      createElement: fakeElement,
      createTextNode: (data) => ({ nodeType: 3, data }),
    };
  });

  suiteTeardown(() => {
    globalThis.document = savedDocument;
  });

  test("The columns are the file's fields in file order, keyed by their place, titled as text", () => {
    // A name that is a number would go first among an object's keys, and one with a dot is a path to Tabulator
    const { table } = makeGrid({ fields: ["Name", "2023", "Orders.Amount", "<b>x</b>"] });
    const columns = table.options.columns;
    assert.deepStrictEqual(
      columns.map((column) => [column.field, column.title]),
      [
        ["c0", "Name"],
        ["c1", "2023"],
        ["c2", "Orders.Amount"],
        ["c3", "<b>x</b>"],
      ]
    );
    assert.deepStrictEqual(columns[3].titleFormatter(), { nodeType: 3, data: "<b>x</b>" });
    assert.ok(columns.every((column) => column.headerSort === true && column.formatter === undefined));
    assert.strictEqual(table.options.nestedFieldSeparator, false);
    assert.strictEqual(table.options.paginationMode, "remote");
    // Sorted by the extension, one field at a time
    assert.strictEqual(table.options.sortMode, "remote");
    assert.strictEqual(table.options.columnHeaderSortMulti, false);
    assert.strictEqual(table.options.paginationSize, 100);
    assert.deepStrictEqual(table.options.paginationSizeSelector, [25, 50, 100]);
    assert.strictEqual(table.options.dataLoader, false);
  });

  test("A page is asked for by offset, and its rows answer Tabulator's request", async () => {
    const { grid, table, posted } = makeGrid({ totalRows: 1234 });
    const loading = table.options.ajaxRequestFunc("qvd:rows", {}, { page: 3, size: 50 });
    assert.deepStrictEqual(posted, [{ command: "page", requestId: 1, offset: 100, limit: 50, search: "", sort: null }]);
    assert.strictEqual(
      grid.handleMessage({ command: "pageRows", requestId: 1, offset: 100, rows: [[1, "a"], [2, null]], totalRows: 1234 }),
      true
    );
    assert.deepStrictEqual(await loading, {
      last_page: 25,
      last_row: 1234,
      data: [
        { c0: 1, c1: "a" },
        { c0: 2, c1: null },
      ],
    });
  });

  test("An answer to a request the grid no longer waits for is ignored", async () => {
    const { grid, table } = makeGrid();
    let firstSettled = false;
    table.options.ajaxRequestFunc("", {}, { page: 1, size: 100 }).then(() => (firstSettled = true));
    const second = table.options.ajaxRequestFunc("", {}, { page: 2, size: 100 });
    grid.handleMessage({ command: "pageRows", requestId: 1, rows: [[1, "old"]], totalRows: 1234 });
    grid.handleMessage({ command: "pageRows", requestId: 2, rows: [[2, "new"]], totalRows: 1234 });
    assert.deepStrictEqual((await second).data, [{ c0: 2, c1: "new" }]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(firstSettled, false);
    // Another tab's messages aren't the grid's
    assert.strictEqual(grid.handleMessage({ command: "profilingResults" }), false);
  });

  test("While the first page reads, the grid says how far it has got, and Cancel asks to give it up", async () => {
    const { grid, table, status, posted } = makeGrid();
    const loading = table.options.ajaxRequestFunc("", {}, { page: 1, size: 100 });
    grid.handleMessage({ command: "pageProgress", requestId: 1, text: "Reading field 3 of 21…", fraction: 3 / 21 });
    assert.strictEqual(status.hidden, false);
    assert.match(textOf(status), /Reading field 3 of 21…/);
    const cancel = status.children.find((child) => child.textContent === "Cancel");
    cancel.click();
    assert.deepStrictEqual(posted.at(-1), { command: "cancelPage", requestId: 1 });

    grid.handleMessage({ command: "pageCancelled", requestId: 1 });
    assert.deepStrictEqual((await loading).data, []);
    assert.match(textOf(status), /Cancelled/);
    // Read them asks for the page again
    status.children.find((child) => child.textContent === "Read them").click();
    assert.deepStrictEqual(table.pagesSet, [3]);
  });

  test("A page that failed shows the extension's notice, whose Retry asks for the page again", async () => {
    const { grid, table, status, posted } = makeGrid();
    const loading = table.options.ajaxRequestFunc("", {}, { page: 3, size: 100 });
    const html =
      '<div class="read-failure" data-kind="memory"><button data-command="retry">Retry</button>' +
      '<button data-command="openSettings" data-setting="ctrl-q-qvd-viewer.pageSize">Open Settings</button></div>';
    grid.handleMessage({ command: "pageFailed", requestId: 1, failure: { kind: "memory" }, html });
    assert.deepStrictEqual((await loading).data, []);
    assert.strictEqual(status.innerHTML, html);
    assert.strictEqual(status.hidden, false);

    const [retry, settings] = status.buttons;
    settings.click();
    assert.deepStrictEqual(posted.at(-1), { command: "openSettings", setting: "ctrl-q-qvd-viewer.pageSize" });
    retry.click();
    assert.deepStrictEqual(table.pagesSet, [3]);
    assert.strictEqual(status.hidden, true);
  });

  test("A search and a sort go to the extension with each page, and start at the first page", async () => {
    const { grid, table, posted, deferred } = makeGrid({ totalRows: 1234 });
    // A search asks for page 1 again, which then asks with the search
    grid.search("Åsa");
    assert.deepStrictEqual(table.pagesSet, [1]);
    const found = table.options.ajaxRequestFunc("", {}, { page: 1, size: 100 });
    assert.deepStrictEqual(posted.at(-1), { command: "page", requestId: 1, offset: 0, limit: 100, search: "Åsa", sort: null });
    grid.handleMessage({ command: "pageRows", requestId: 1, offset: 0, rows: [[1, "Åsa"]], totalRows: 1, fileRows: 1234 });
    assert.deepStrictEqual(await found, { last_page: 1, last_row: 1, data: [{ c0: 1, c1: "Åsa" }] });
    // The same search again asks for nothing
    grid.search("Åsa");
    assert.deepStrictEqual(table.pagesSet, [1]);

    // A sort from a page other than the first asks for none, and goes to the first
    table.options.ajaxRequestFunc("", {}, { page: 4, size: 100, sort: [{ field: "c1", dir: "desc" }] });
    assert.strictEqual(posted.length, 1);
    deferred.splice(0).forEach((later) => later());
    assert.deepStrictEqual(table.pagesSet, [1, 1]);
    table.options.ajaxRequestFunc("", {}, { page: 1, size: 100, sort: [{ field: "c1", dir: "desc" }] });
    assert.deepStrictEqual(posted.at(-1), {
      command: "page",
      requestId: 2,
      offset: 0,
      limit: 100,
      search: "Åsa",
      sort: { fieldIndex: 1, descending: true },
    });
    // Other pages of the same view are asked for as they are
    table.options.ajaxRequestFunc("", {}, { page: 3, size: 100, sort: [{ field: "c1", dir: "desc" }] });
    assert.strictEqual(posted.at(-1).offset, 200);
  });

  test("A cancelled search puts the search box and the view shown before back", async () => {
    const { grid, table, status, posted, searchInput } = makeGrid({ totalRows: 1234 });
    // Page 2 of every row is shown
    const shown = table.options.ajaxRequestFunc("", {}, { page: 2, size: 100 });
    grid.handleMessage({ command: "pageRows", requestId: 1, rows: [[1, "a"]], totalRows: 1234 });
    await shown;

    searchInput.value = "slow";
    grid.search("slow");
    const searching = table.options.ajaxRequestFunc("", {}, { page: 1, size: 100 });
    grid.handleMessage({ command: "pageProgress", requestId: 2, text: "Searching Name (field 2 of 2)…", fraction: 0.6 });
    assert.match(textOf(status), /Searching Name/);
    grid.handleMessage({ command: "pageCancelled", requestId: 2 });
    assert.deepStrictEqual((await searching).data, []);
    assert.match(textOf(status), /Search cancelled/);
    // The search box is as it was, and the page shown before is asked for again
    assert.strictEqual(searchInput.value, "");
    assert.deepStrictEqual(table.pagesSet, [1, 2]);
    table.options.ajaxRequestFunc("", {}, { page: 2, size: 100 });
    assert.deepStrictEqual(posted.at(-1), { command: "page", requestId: 3, offset: 100, limit: 100, search: "", sort: null });
    // Its answer leaves the status saying why
    grid.handleMessage({ command: "pageRows", requestId: 3, rows: [[1, "a"]], totalRows: 1234 });
    assert.match(textOf(status), /Search cancelled/);
  });

  test("A refused sort shows why, and puts the sort shown before back", async () => {
    const { grid, table, status } = makeGrid();
    const sorting = table.options.ajaxRequestFunc("", {}, { page: 1, size: 100, sort: [{ field: "c0", dir: "asc" }] });
    table.sorters = [{ field: "c0", dir: "asc" }];
    grid.handleMessage({
      command: "pageFailed",
      requestId: 1,
      failure: { kind: "memory" },
      html: '<div class="read-failure" data-kind="memory"><button data-command="retry">Retry</button></div>',
    });
    assert.deepStrictEqual((await sorting).data, []);
    assert.match(status.innerHTML, /data-kind="memory"/);
    // File order again, which asks for its page
    assert.deepStrictEqual(table.sortsSet, [null]);
  });

  test("The sort a page asks for is the first of Tabulator's, by its field's place", () => {
    assert.deepStrictEqual(sortOf([{ field: "c12", dir: "desc" }]), { fieldIndex: 12, descending: true });
    assert.deepStrictEqual(sortOf([{ field: "c0", dir: "asc" }, { field: "c1", dir: "desc" }]), {
      fieldIndex: 0,
      descending: false,
    });
    assert.strictEqual(sortOf([]), null);
    assert.strictEqual(sortOf(undefined), null);
    assert.strictEqual(sortOf([{ field: "Name", dir: "asc" }]), null);
  });

  test("A null cell's text is nothing, so copying it copies nothing", () => {
    assert.strictEqual(cellText(null), "");
    assert.strictEqual(cellText(undefined), "");
    assert.strictEqual(cellText(0), "0");
    assert.strictEqual(cellText(false), "false");
  });
});
