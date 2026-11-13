/**
 * The QVD editor's Data tab: a Tabulator grid that asks the extension for one
 * page of rows at a time, wherever it is in the file. The editor page inlines
 * this file after Tabulator: it is copied into dist/webview when the extension
 * is built, see copyWebviewLibsPlugin in esbuild.js. The extension answers the
 * grid's requests in src/webview/pageServer.mjs, which says what each message
 * holds.
 *
 * The page's Content Security Policy allows no fetch, so the grid's remote
 * pagination asks through postMessage, with Tabulator's ajaxRequestFunc. Its
 * columns come from the file's field list, in file order, each keyed by its
 * position: a field's name is whatever the file says, and Tabulator would read a
 * name with a dot in it as a path, and puts a name that is a number first in an
 * object's keys.
 *
 * Search and sort cover every row of the file: each page asks for them, and the
 * extension makes the rows of the search, in the order of the sort, once.
 */

/* exported createDataGrid */

/**
 * The key of a field's column in a row of the grid
 * @param {number} index - The field's position in the file
 * @returns {string} Its key
 */
function columnKey(index) {
  return "c" + index;
}

/**
 * A row of the grid, from the row as the extension sends it
 * @param {Array<*>} values - One value per field, in file order
 * @returns {Object} The row, keyed by columnKey()
 */
function rowObject(values) {
  const row = {};
  for (let i = 0; i < values.length; i++) {
    row[columnKey(i)] = values[i];
  }
  return row;
}

/**
 * The text a cell shows, which a copy copies: none for a null
 * @param {*} value - The cell's value
 * @returns {string} The text
 */
function cellText(value) {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * The sort a page asks for, from Tabulator's
 * @param {Array<{field: string, dir: string}>|undefined} sorters - Tabulator's sorters, the first of which counts
 * @returns {{fieldIndex: number, descending: boolean}|null} The sort, null for file order
 */
function sortOf(sorters) {
  const sorter = sorters && sorters[0];
  if (!sorter || typeof sorter.field !== "string" || sorter.field.charAt(0) !== "c") {
    return null;
  }
  const fieldIndex = Number(sorter.field.slice(1));
  if (!Number.isInteger(fieldIndex) || fieldIndex < 0) {
    return null;
  }
  return { fieldIndex: fieldIndex, descending: sorter.dir === "desc" };
}

/**
 * The key a view is known by: two pages of the same view have the same key
 * @param {string} search - The search
 * @param {{fieldIndex: number, descending: boolean}|null} sort - The sort
 * @returns {string} The key
 */
function viewKey(search, sort) {
  return JSON.stringify([search, sort]);
}

/**
 * Create the Data tab's grid
 * @param {object} options
 * @param {HTMLElement} options.element - Where the grid goes
 * @param {HTMLElement} options.status - Where the grid says what it is waiting for,
 *   with a Cancel button, and why a page failed
 * @param {HTMLInputElement} [options.searchInput] - The search box, put back when a search is cancelled
 * @param {Array<string>} options.fields - The file's field names, in file order
 * @param {number} options.totalRows - Rows in the file
 * @param {number} options.pageSize - Rows a page shows to begin with
 * @param {Array<number>} options.pageSizes - The page sizes offered
 * @param {{postMessage: function(object): void}} options.vscode - The page's VS Code API
 * @param {function} [options.Tabulator] - Tabulator, for tests to replace
 * @param {function(Event, object): void} [options.onCellContext] - Called on a cell's context menu
 * @param {number} [options.progressDelayMs=250] - How long a page may take before the grid says it waits
 * @param {function(function(), number): *} [options.defer] - Runs a function later, setTimeout unless a test says otherwise
 * @returns {{table: object, handleMessage: function(object): boolean, search: function(string): void, retry: function(): void}}
 *   handleMessage takes a message from the extension, and says whether it was the
 *   grid's; search shows only the rows of the file with a cell that holds the
 *   text; retry asks for the page shown again
 */
function createDataGrid(options) {
  const {
    element,
    status,
    searchInput,
    fields,
    totalRows,
    pageSize,
    pageSizes,
    vscode,
    onCellContext,
    progressDelayMs = 250,
  } = options;
  const TabulatorClass = options.Tabulator || Tabulator;
  const defer = options.defer || setTimeout;

  // Requests the extension hasn't answered: requestId -> the request
  const pending = new Map();
  let lastRequestId = 0;
  // The request the grid waits for: an older one's answer is for a page no longer shown
  let waitingFor = null;
  let progressTimer = null;
  // The search the next page asks for
  let currentSearch = "";
  // The view of the last page shown, and of the last page asked for
  let shown = { key: viewKey("", null), search: "", sort: null, page: 1, rows: totalRows };
  let lastKey = shown.key;
  // Whether the next request's answer leaves the status as it is: it puts back
  // the view shown before one that was cancelled or failed, which the status says
  let keepStatusNext = false;

  /**
   * Say what the grid waits for, with a Cancel button
   * @param {string} text - What it waits for
   * @param {number|null} fraction - How far it has got, from 0 to 1; null when not known
   */
  function showWaiting(text, fraction) {
    clearTimeout(progressTimer);
    status.replaceChildren();
    status.className = "data-grid-status waiting";
    const label = document.createElement("span");
    label.className = "data-grid-status-text";
    label.textContent = text;
    const bar = document.createElement("progress");
    bar.className = "data-grid-progress";
    if (fraction !== null) {
      bar.max = 1;
      bar.value = fraction;
    }
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "data-grid-cancel";
    cancel.textContent = "Cancel";
    const requestId = waitingFor;
    cancel.addEventListener("click", function () {
      vscode.postMessage({ command: "cancelPage", requestId: requestId });
    });
    status.append(label, bar, cancel);
    status.hidden = false;
  }

  /**
   * Say nothing: the page shown is the one asked for
   */
  function clearStatus() {
    clearTimeout(progressTimer);
    progressTimer = null;
    status.replaceChildren();
    status.className = "data-grid-status";
    status.hidden = true;
  }

  /**
   * Say why a page couldn't be read, with the notice the extension wrote
   * Its Retry asks for the page again; its other buttons post their commands.
   * @param {string} noticeHtml - The notice, from failureNoticeHtml(), every part of the failure escaped
   */
  function showFailure(noticeHtml) {
    clearStatus();
    status.className = "data-grid-status failed";
    // The extension's own markup, which escapes what the file says
    status.innerHTML = noticeHtml;
    status.querySelectorAll("button[data-command]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.dataset.command === "retry") {
          retry();
          return;
        }
        const message = { command: button.dataset.command };
        if (button.dataset.setting) {
          message.setting = button.dataset.setting;
        }
        vscode.postMessage(message);
      });
    });
    status.hidden = false;
  }

  /**
   * Say that a page was cancelled, with a button to ask for it again
   * @param {string} text - What was cancelled
   */
  function showCancelled(text) {
    clearStatus();
    status.className = "data-grid-status cancelled";
    const label = document.createElement("span");
    label.className = "data-grid-status-text";
    label.textContent = text;
    status.append(label);
    status.hidden = false;
  }

  /**
   * The answer Tabulator's remote pagination takes
   * @param {Array<Object>} data - The page's rows
   * @param {number} size - Rows a page shows
   * @param {number} rows - Rows there are to page through
   * @returns {{last_page: number, last_row: number, data: Array<Object>}} The answer
   */
  function answer(data, size, rows) {
    return {
      last_page: Math.max(1, Math.ceil(rows / size)),
      last_row: rows,
      data: data,
    };
  }

  /**
   * Put the search box and the sort back as they were for the view shown, and ask
   * for its page again, once a view that was to take its place was cancelled or failed
   */
  function restoreShown() {
    currentSearch = shown.search;
    if (searchInput) {
      searchInput.value = shown.search;
    }
    keepStatusNext = true;
    // The view shown is asked for at the page it was on, not taken for a new one
    lastKey = shown.key;
    const sortNow = sortOf(table.getSorters ? table.getSorters() : []);
    if (viewKey("", sortNow) !== viewKey("", shown.sort)) {
      // Either asks for the page again
      if (shown.sort) {
        table.setSort(columnKey(shown.sort.fieldIndex), shown.sort.descending ? "desc" : "asc");
      } else {
        table.clearSort();
      }
    } else {
      table.setPage(shown.page);
    }
  }

  /**
   * Ask the extension for a page, as Tabulator's ajaxRequestFunc
   * A request that is superseded is never answered: Tabulator ignores an answer
   * to a request older than its latest, but its pagination would read it first.
   * @param {string} _url - Unused: there is no URL to fetch
   * @param {object} _config - Unused
   * @param {{page: number, size: number, sort?: Array<object>}} params - The page,
   *   counted from 1, its size, and Tabulator's sort
   * @returns {Promise<object>} Resolves with the page, as answer() makes it
   */
  function requestPage(_url, _config, params) {
    const size = Number(params.size) || pageSize;
    const page = Math.max(1, Number(params.page) || 1);
    const search = currentSearch;
    const sort = sortOf(params.sort);
    const key = viewKey(search, sort);
    const keepStatus = keepStatusNext;
    keepStatusNext = false;
    pending.clear();
    if (key !== lastKey && page !== 1) {
      // A new search or sort starts at its first page. Tabulator ignores this
      // request's answer once it asks for that page, so none is asked for.
      lastKey = key;
      keepStatusNext = keepStatus;
      defer(function () {
        table.setPage(1);
      }, 0);
      return new Promise(function () {});
    }
    lastKey = key;
    const requestId = ++lastRequestId;
    waitingFor = requestId;
    clearTimeout(progressTimer);
    if (!keepStatus) {
      progressTimer = defer(function () {
        if (waitingFor === requestId) {
          showWaiting(search || sort ? "Searching and sorting…" : "Reading rows…", null);
        }
      }, progressDelayMs);
    }
    return new Promise(function (resolve) {
      pending.set(requestId, {
        resolve: resolve,
        size: size,
        page: page,
        key: key,
        search: search,
        sort: sort,
        keepStatus: keepStatus,
      });
      vscode.postMessage({
        command: "page",
        requestId: requestId,
        offset: (page - 1) * size,
        limit: size,
        search: search,
        sort: sort,
      });
    });
  }

  const table = new TabulatorClass(element, {
    columns: fields.map(function (name, index) {
      return {
        title: name,
        // The field's name as text: Tabulator sets a title as HTML
        titleFormatter: function () {
          return document.createTextNode(name);
        },
        field: columnKey(index),
        headerSort: true,
        // Ascending, descending, then file order again
        headerSortTristate: true,
        headerFilter: false,
      };
    }),
    // A key is a key: no column's is a path
    nestedFieldSeparator: false,
    layout: "fitDataStretch",
    pagination: true,
    paginationMode: "remote",
    // The extension sorts every row of the file, one field at a time
    sortMode: "remote",
    columnHeaderSortMulti: false,
    paginationSize: pageSize,
    paginationSizeSelector: pageSizes,
    // As text: a search's text is whatever was typed
    paginationCounter: function (size, firstRow, _page, rows) {
      const last = Math.min(firstRow + size - 1, rows);
      let text =
        rows === 0
          ? "No rows"
          : "Showing " + firstRow.toLocaleString() + "-" + last.toLocaleString() + " of " + rows.toLocaleString() + " rows";
      if (shown.search) {
        text += " that hold “" + shown.search + "”, of " + totalRows.toLocaleString();
      }
      return document.createTextNode(text);
    },
    movableColumns: true,
    // Any URL: Tabulator loads remotely only when it has one, and asks requestPage() for it
    ajaxURL: "qvd:rows",
    ajaxRequestFunc: requestPage,
    // The grid says itself what it waits for, with a Cancel button
    dataLoader: false,
    placeholder: totalRows === 0 ? "This QVD has no rows." : "No rows to show.",
  });

  if (onCellContext) {
    table.on("cellContext", function (event, cell) {
      event.preventDefault();
      onCellContext(event, cell);
    });
  }

  /**
   * Take a message from the extension
   * @param {object} message - The message
   * @returns {boolean} Whether it was the grid's
   */
  function handleMessage(message) {
    const request = pending.get(message && message.requestId);
    switch (message && message.command) {
      case "pageRows":
        if (request) {
          pending.delete(message.requestId);
          waitingFor = null;
          if (!request.keepStatus) {
            clearStatus();
          } else {
            clearTimeout(progressTimer);
          }
          shown = { key: request.key, search: request.search, sort: request.sort, page: request.page, rows: message.totalRows };
          request.resolve(answer(message.rows.map(rowObject), request.size, message.totalRows));
        }
        return true;
      case "pageProgress":
        if (request && !request.keepStatus) {
          showWaiting(message.text, typeof message.fraction === "number" ? message.fraction : null);
        }
        return true;
      case "pageFailed":
        if (request) {
          pending.delete(message.requestId);
          waitingFor = null;
          showFailure(message.html);
          request.resolve(answer([], request.size, shown.rows));
          if (request.key !== shown.key) {
            restoreShown();
          }
        }
        return true;
      case "pageCancelled":
        if (request) {
          pending.delete(message.requestId);
          waitingFor = null;
          request.resolve(answer([], request.size, shown.rows));
          if (request.key !== shown.key) {
            showCancelled(request.search ? "Search cancelled." : "Sort cancelled.");
            restoreShown();
          } else {
            showCancelled("Cancelled. The rows of this page weren't read.");
            const again = document.createElement("button");
            again.type = "button";
            again.className = "data-grid-retry";
            again.textContent = "Read them";
            again.addEventListener("click", retry);
            status.append(again);
          }
        }
        return true;
      default:
        return false;
    }
  }

  /**
   * Ask for the page shown again
   */
  function retry() {
    clearStatus();
    table.setPage(table.getPage() || 1);
  }

  /**
   * Show only the rows of the file with a cell that holds the text, whatever its case
   * @param {string} text - The text; none shows every row
   */
  function search(text) {
    const term = String(text || "");
    if (term === currentSearch) {
      return;
    }
    currentSearch = term;
    table.setPage(1);
  }

  return { table: table, handleMessage: handleMessage, search: search, retry: retry };
}

if (typeof module !== "undefined") {
  module.exports = { createDataGrid, cellText, columnKey, rowObject, sortOf };
}
