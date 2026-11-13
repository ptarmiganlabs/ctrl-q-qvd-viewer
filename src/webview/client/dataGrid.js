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
 * The text a cell shows, which a search matches and a copy copies: none for a null
 * @param {*} value - The cell's value
 * @returns {string} The text
 */
function cellText(value) {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Create the Data tab's grid
 * @param {object} options
 * @param {HTMLElement} options.element - Where the grid goes
 * @param {HTMLElement} options.status - Where the grid says what it is waiting for,
 *   with a Cancel button, and why a page failed
 * @param {Array<string>} options.fields - The file's field names, in file order
 * @param {number} options.totalRows - Rows in the file
 * @param {number} options.pageSize - Rows a page shows to begin with
 * @param {Array<number>} options.pageSizes - The page sizes offered
 * @param {string|null} [options.headerKey] - The version of the file the page shows,
 *   sent with each request, so that the extension notices a file rewritten since
 * @param {{postMessage: function(object): void}} options.vscode - The page's VS Code API
 * @param {function} [options.Tabulator] - Tabulator, for tests to replace
 * @param {function(Event, object): void} [options.onCellContext] - Called on a cell's context menu
 * @param {number} [options.progressDelayMs=250] - How long a page may take before the grid says it waits
 * @returns {{table: object, handleMessage: function(object): boolean, search: function(string): void, retry: function(): void}}
 *   handleMessage takes a message from the extension, and says whether it was the
 *   grid's; search shows only the page's rows with a cell that holds the text;
 *   retry asks for the page shown again
 */
function createDataGrid(options) {
  const {
    element,
    status,
    fields,
    totalRows,
    pageSize,
    pageSizes,
    headerKey = null,
    vscode,
    onCellContext,
    progressDelayMs = 250,
  } = options;
  const TabulatorClass = options.Tabulator || Tabulator;

  // Requests the extension hasn't answered: requestId -> {resolve, size}
  const pending = new Map();
  let lastRequestId = 0;
  // The request the grid waits for: an older one's answer is for a page no longer shown
  let waitingFor = null;
  let progressTimer = null;

  /**
   * Say what the grid waits for, with a Cancel button
   * @param {string} text - What it waits for
   * @param {number|null} fraction - How far it has got, from 0 to 1; null when not known
   */
  function showWaiting(text, fraction) {
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
   * Say why the page shown couldn't be read, with the notice the extension wrote
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
   * Say that the page was cancelled, with a button to ask for it again
   */
  function showCancelled() {
    clearStatus();
    status.className = "data-grid-status cancelled";
    const label = document.createElement("span");
    label.className = "data-grid-status-text";
    label.textContent = "Cancelled. The rows of this page weren't read.";
    const again = document.createElement("button");
    again.type = "button";
    again.className = "data-grid-retry";
    again.textContent = "Read them";
    again.addEventListener("click", retry);
    status.append(label, again);
    status.hidden = false;
  }

  // Rows there are to page through, as the extension last said
  let knownRows = totalRows;

  /**
   * The answer Tabulator's remote pagination takes
   * @param {Array<Object>} data - The page's rows
   * @param {number} size - Rows a page shows
   * @returns {{last_page: number, last_row: number, data: Array<Object>}} The answer
   */
  function answer(data, size) {
    return {
      last_page: Math.max(1, Math.ceil(knownRows / size)),
      last_row: knownRows,
      data: data,
    };
  }

  /**
   * Ask the extension for a page, as Tabulator's ajaxRequestFunc
   * A request that is superseded is never answered: Tabulator ignores an answer
   * to a request older than its latest, but its pagination would read it first.
   * @param {string} _url - Unused: there is no URL to fetch
   * @param {object} _config - Unused
   * @param {{page: number, size: number}} params - The page, counted from 1, and its size
   * @returns {Promise<object>} Resolves with the page, as answer() makes it
   */
  function requestPage(_url, _config, params) {
    const size = Number(params.size) || pageSize;
    const page = Math.max(1, Number(params.page) || 1);
    const requestId = ++lastRequestId;
    pending.clear();
    waitingFor = requestId;
    clearTimeout(progressTimer);
    progressTimer = setTimeout(function () {
      if (waitingFor === requestId) {
        showWaiting("Reading rows…", null);
      }
    }, progressDelayMs);
    return new Promise(function (resolve) {
      pending.set(requestId, { resolve: resolve, size: size });
      vscode.postMessage({
        command: "page",
        requestId: requestId,
        offset: (page - 1) * size,
        limit: size,
        headerKey: headerKey,
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
        headerSort: false,
        headerFilter: false,
      };
    }),
    // A key is a key: no column's is a path
    nestedFieldSeparator: false,
    layout: "fitDataStretch",
    pagination: true,
    paginationMode: "remote",
    paginationSize: pageSize,
    paginationSizeSelector: pageSizes,
    paginationCounter: "rows",
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
    const request = pending.get(message?.requestId);
    switch (message?.command) {
      case "pageRows":
        if (request) {
          pending.delete(message.requestId);
          waitingFor = null;
          clearStatus();
          if (typeof message.totalRows === "number") {
            knownRows = message.totalRows;
          }
          request.resolve(answer(message.rows.map(rowObject), request.size));
        }
        return true;
      case "pageProgress":
        if (request && message.total > 0) {
          clearTimeout(progressTimer);
          showWaiting(
            "Reading field " + message.current.toLocaleString() + " of " + message.total.toLocaleString() + "…",
            message.current / message.total
          );
        }
        return true;
      case "pageFailed":
        if (request) {
          pending.delete(message.requestId);
          waitingFor = null;
          showFailure(message.html);
          request.resolve(answer([], request.size));
        }
        return true;
      case "pageCancelled":
        if (request) {
          pending.delete(message.requestId);
          waitingFor = null;
          showCancelled();
          request.resolve(answer([], request.size));
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
   * Show only the rows of the page shown with a cell that holds the text, whatever its case
   * @param {string} text - The text; none shows every row
   */
  function search(text) {
    const term = String(text || "").toLowerCase();
    if (!term) {
      table.clearFilter();
      return;
    }
    table.setFilter(function (row) {
      for (const key in row) {
        if (cellText(row[key]).toLowerCase().includes(term)) {
          return true;
        }
      }
      return false;
    });
  }

  return { table: table, handleMessage: handleMessage, search: search, retry: retry };
}

if (typeof module !== "undefined") {
  module.exports = { createDataGrid, cellText, columnKey, rowObject };
}
