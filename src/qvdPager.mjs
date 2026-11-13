import { QvdDataFrame } from "qvdjs";
import { realpath } from "fs/promises";
import { dirname } from "path";
import { toCellValue } from "./cellValue.mjs";
import { budgetFor, fileVersion, headerOf, readLanes } from "./qvdReader.mjs";
import { bookHeap, bookedBytes, describePageRefusal, describeViewRefusal, tryBookHeap } from "./memoryGuard.mjs";
import { SCAN_PEAK_BYTES } from "./columnScan.mjs";
import { searchHeapBytes, searchRows } from "./viewSearch.mjs";
import { sortHeapBytes, sortRows } from "./viewSort.mjs";

/**
 * Pages of a QVD for the viewer's grid, from one open copy of the file per editor
 *
 * The file is opened with qvdjs's QvdDataFrame.open(), which reads its header
 * only. A page reads the records of its rows, and decodes only the values they
 * use. The first page to touch a column walks that column's symbols once, which
 * on a file of a few GB takes seconds; later pages take milliseconds, wherever
 * they are in the file.
 *
 * qvdjs keeps the values a page decodes, for later pages, until the file is
 * closed. What the open copy holds is booked with the memory guard, so that
 * other reads are priced against it, and once it is more than HELD_BYTES the
 * copy is closed and opened again, which lets those values go.
 */

/**
 * Most rows a page holds
 */
export const MAX_PAGE_ROWS = 1000;

/**
 * Heap the open copy of a file may hold before it is opened afresh
 */
export const HELD_BYTES = 128 * 1024 * 1024;

/**
 * Most rows between two of a page's rows that are read with them, rather than
 * apart: a sorted or searched page's rows are spread through the file, and each
 * read of a few rows costs more than the rows between near ones
 */
const GAP_ROWS = 8;

/**
 * What the grid shows: the file's rows in file order, or those of a search, in
 * the order of a sort
 * @typedef {{search: string, sort: {fieldIndex: number, descending: boolean}|null}} View
 *   search: the text a cell must hold, whatever its case; none for every row.
 *   sort: the field to order the rows by, and which way; null for file order
 */

/**
 * The key a view is known by, and the view, from what a page asks for
 * @param {*} search - The search text
 * @param {*} sort - The sort
 * @param {import('./qvdReader.mjs').Header} header - The file's header
 * @returns {View & {key: string}} The view
 * @throws {Error} A QvdValidationError with context.reason "option" for a search
 *   that isn't text, or a sort by a field the file doesn't have
 */
function viewOf(search, sort, header) {
  if (search !== undefined && search !== null && typeof search !== "string") {
    throw Object.assign(new Error(`search must be text, not ${typeof search}`), {
      name: "QvdValidationError",
      context: { reason: "option", option: "search" },
    });
  }
  const text = search ?? "";
  let order = null;
  if (sort !== undefined && sort !== null) {
    const fieldIndex = sort.fieldIndex;
    if (!Number.isSafeInteger(fieldIndex) || fieldIndex < 0 || fieldIndex >= header.fields.length) {
      throw Object.assign(new Error(`sort.fieldIndex must be a field's place in the file, not ${String(fieldIndex)}`), {
        name: "QvdValidationError",
        context: { reason: "option", option: "sort" },
      });
    }
    order = { fieldIndex, descending: sort.descending === true };
  }
  return { search: text, sort: order, key: JSON.stringify([text, order]) };
}

/**
 * The rows of a page of a view, as windows of the file to read: near rows together
 * @param {Uint32Array} rows - The page's rows, in view order
 * @returns {Array<{start: number, end: number}>} Windows, in file order, end exclusive
 */
function windowsOf(rows) {
  const sorted = Uint32Array.from(rows).sort();
  const windows = [];
  for (const row of sorted) {
    const last = windows.at(-1);
    if (last && row < last.end + GAP_ROWS) {
      last.end = Math.max(last.end, row + 1);
    } else {
      windows.push({ start: row, end: row + 1 });
    }
  }
  return windows;
}

/**
 * Error thrown when the file has changed on disk since its header was read: its
 * rows, its fields or their number may no longer be what the page shows
 */
export class FileChangedError extends Error {
  constructor(filePath) {
    super(`${filePath} has changed since it was opened`);
    this.name = "QvdFileChangedError";
    this.context = { reason: "changed" };
  }
}

/**
 * The error a page throws once its pager is closed: the editor is gone
 * @returns {DOMException} An AbortError
 */
function closedError() {
  return new DOMException("The viewer was closed", "AbortError");
}

/**
 * Refuse a page that isn't a whole number of rows, or too many, the way qvdjs refuses an option
 * @param {*} value - The value
 * @param {string} name - The option's name
 * @param {number} [most] - The largest value allowed
 * @throws {Error} A QvdValidationError with context.reason "option"
 */
function requireRows(value, name, most = Infinity) {
  if (!Number.isSafeInteger(value) || value < 0 || value > most) {
    const range = most === Infinity ? "of 0 or more" : `from 0 to ${most}`;
    throw Object.assign(new Error(`${name} must be a whole number ${range}, not ${String(value)}`), {
      name: "QvdValidationError",
      context: { reason: "option", option: name },
    });
  }
}

/**
 * The heap qvdjs says a page needs, what the open copy holds included
 * qvdjs counts its memory outside the heap against a container's limit, not the heap's.
 * @param {object} check - qvdjs's check of the page
 * @returns {number} Bytes
 */
function heapNeeded(check) {
  const estimate = check?.estimate ?? {};
  // Whole bytes, so that booking and releasing it leaves the ledger as it was
  return Math.ceil(
    (Number(estimate.heapBytes) || 0) +
      (check?.budget?.bound === "process" ? Number(estimate.externalBytes) || 0 : 0)
  );
}

/**
 * The refusal of a page that doesn't fit in the memory left, as the memory guard reads one
 * @param {{offset: number, rows: number, totalRows: number, neededBytes: number, leftBytes: number}} page - The page
 * @returns {Error} A QvdValidationError with context.reason "memory"
 */
function pageRefusal({ offset, rows, totalRows, neededBytes, leftBytes }) {
  return Object.assign(new Error(describePageRefusal({ offset, rows, neededBytes, leftBytes })), {
    name: "QvdValidationError",
    context: { reason: "memory", maxRows: rows, totalRows, recommendedMaxRows: 0 },
    page: { offset, rows, neededBytes, leftBytes },
  });
}

/**
 * Open a QVD for paging
 * Its header is read now, from the headers kept unless the file has changed;
 * the file itself is opened by the first page.
 * @param {string} filePath - Path to the QVD file
 * @param {{signal?: AbortSignal, heldBytes?: number, locale?: string}} [options] - signal: gives
 *   reading the header up; heldBytes: what the open copy may hold before it is
 *   opened afresh, HELD_BYTES unless a test says otherwise; locale: the language
 *   text sorts in, such as VS Code's, the system's unless given
 * @returns {Promise<Pager>} The pager
 * @throws {Error} What reading the header throws
 */
export async function openPager(filePath, { signal, heldBytes = HELD_BYTES, locale } = {}) {
  // As QvdReader.read() does: qvdjs resolves links before it checks the file is in
  // the directory it may read, so that directory is the real path's
  const realFilePath = await realpath(filePath).catch(() => filePath);
  const allowedDir = dirname(realFilePath);
  const header = await headerOf(filePath, realFilePath, allowedDir, signal);
  const budget = await budgetFor(filePath, allowedDir, header, signal);
  return new Pager({ filePath, realFilePath, allowedDir, header, budget, heldBytes, locale });
}

/**
 * One open QVD, paged for the viewer's grid
 */
export class Pager {
  #filePath;
  #realFilePath;
  #allowedDir;
  #budget;
  #heldBytes;
  // The open copy of the file, once a page has opened it
  #file = null;
  // Whether a page has read from #file: the values it holds are then worth letting go of
  #used = false;
  // The heap booked for #file, and what releases it
  #held = 0;
  #release = () => {};
  #closed = false;
  #collator;
  // The view shown: its key, its rows in order, null for every row in file order, and what releases them
  #view = { key: JSON.stringify(["", null]), rows: null, release: () => {} };
  // The rows the last search found, in file order, for a sort of them by another field to start from
  #searched = { text: "", rows: null, release: () => {} };

  /**
   * @param {object} options - As openPager() finds them
   */
  constructor({ filePath, realFilePath, allowedDir, header, budget, heldBytes, locale }) {
    this.#filePath = filePath;
    this.#realFilePath = realFilePath;
    this.#allowedDir = allowedDir;
    this.#budget = budget;
    this.#heldBytes = heldBytes;
    // Numbers in text compared as numbers: "Item 9" before "Item 10"
    this.#collator = new Intl.Collator(locale || undefined, { numeric: true });
    /**
     * The file's header, as it was when the pager was opened
     * @type {import('./qvdReader.mjs').Header}
     */
    this.header = header;
  }

  /**
   * Rows in the file
   * @returns {number} Rows
   */
  get totalRows() {
    return this.header.rowCount;
  }

  /**
   * Heap booked for the open copy of the file
   * @returns {number} Bytes
   */
  get heldBytes() {
    return this.#held;
  }

  /**
   * Whether the pager is closed
   * @returns {boolean} Whether it is
   */
  get closed() {
    return this.#closed;
  }

  /**
   * Rows the view shown holds: the file's, or the search's
   * @returns {number} Rows
   */
  get viewRows() {
    return this.#view.rows ? this.#view.rows.length : this.header.rowCount;
  }

  /**
   * Read a page of rows, of the file in file order or of a view of it
   * A view other than the one shown is made first: the rows of a search, in the
   * order of a sort, from every row of the file. That runs in the read queue's
   * large lane, one large read at a time in the extension host, and is priced
   * against the memory left first. The view is then kept for the pages that follow.
   * Pages run in the small lane, beside at most one large read, which leaves room for them.
   * @param {object} page - The page
   * @param {number} page.offset - Its first row in the view, counted from 0
   * @param {number} page.limit - Its rows, at most MAX_PAGE_ROWS; fewer at the end of the view
   * @param {string} [page.search] - Text a row must have a cell holding, whatever its case; none for every row
   * @param {{fieldIndex: number, descending?: boolean}|null} [page.sort] - The field to order
   *   the rows by, its place in the file; null for file order
   * @param {AbortSignal} [page.signal] - Gives the page up, queued or running, its view included
   * @param {function({text: string, fraction: number|null}): void} [page.onProgress] -
   *   Told how the page is getting on, in words for the grid, and how much is done:
   *   while it walks the columns it touches first, and while its view is made
   * @returns {Promise<{rows: Array<Array<*>>, offset: number, totalRows: number, fileRows: number}>}
   *   The rows, one array per row with one value per field in file order, each as
   *   toCellValue() makes it, a dual's text included; the offset asked for; the rows
   *   in the view; and the rows in the file
   * @throws {Error} A QvdValidationError with context.reason "option" for a page that
   *   isn't a count of rows, or a view that isn't one, or "memory" for a page or view
   *   that doesn't fit in the memory left; a ViewRefusedError for a sort too large to
   *   make; FileChangedError when the file has changed since the pager was opened; an
   *   AbortError when the page is given up, or the pager is closed; and what qvdjs
   *   throws for a file it can't read
   */
  async page({ offset, limit, search, sort, signal, onProgress } = {}) {
    requireRows(offset, "offset");
    requireRows(limit, "limit", MAX_PAGE_ROWS);
    const view = viewOf(search, sort, this.header);
    if (this.#closed) {
      throw closedError();
    }
    if (view.key !== this.#view.key) {
      await readLanes.large.run(() => this.#makeView(view, signal, onProgress), { signal });
    }
    return await readLanes.small.run(() => this.#pageNow(offset, limit, signal, onProgress), { signal });
  }

  /**
   * Throw unless the file is as it was when the pager was opened
   * @throws {FileChangedError} When it has changed
   */
  async #checkFile() {
    // qvdjs would read a file rewritten since, by a reload say, under the header read before
    if (this.header.key && (await fileVersion(this.#realFilePath)) !== this.header.key) {
      throw new FileChangedError(this.#filePath);
    }
  }

  /**
   * Make a view, at its turn, in place of the one shown
   * @param {View & {key: string}} view - The view
   * @param {AbortSignal} [signal] - Gives it up
   * @param {Function} [onProgress] - Told how it is getting on
   * @returns {Promise<void>} Resolves once it is the view shown
   */
  async #makeView(view, signal, onProgress) {
    signal?.throwIfAborted();
    if (this.#closed) {
      throw closedError();
    }
    if (view.key === this.#view.key) {
      return;
    }
    if (!view.search && !view.sort) {
      this.#showView(view.key, null);
      return;
    }
    await this.#checkFile();

    const header = this.header;
    const field = view.sort ? header.fields[view.sort.fieldIndex] : null;
    // A search already made for this text is sorted again, not made again
    const searchedBefore = view.search && view.search === this.#searched.text ? this.#searched.rows : null;
    // A field is scanned at a time, each with a file of its own, closed once it is scanned
    const neededBytes =
      SCAN_PEAK_BYTES +
      (view.search && !searchedBefore ? searchHeapBytes(header) : 0) +
      (view.sort ? sortHeapBytes(header, view.sort.fieldIndex, header.rowCount) : 0);
    const booked = tryBookHeap(neededBytes, this.#budget ?? undefined);
    if (!("release" in booked)) {
      const all = `all ${header.rowCount.toLocaleString()} rows`;
      let what = `Searching ${all}`;
      if (view.sort) {
        what = view.search ? `Searching ${all}, and sorting the rows found by ${field.name},` : `Sorting ${all} by ${field.name}`;
      }
      throw Object.assign(new Error(describeViewRefusal({ what, neededBytes, leftBytes: booked.leftBytes })), {
        name: "QvdValidationError",
        context: { reason: "memory", maxRows: header.rowCount, totalRows: header.rowCount, recommendedMaxRows: 0 },
        // Not the rows the grid shows: what is made from them
        pricing: { forCaller: true, neededBytes, leftBytes: booked.leftBytes },
      });
    }

    const scanned = { filePath: this.#filePath, allowedDir: this.#allowedDir, header, signal };
    // A search and a sort share the progress bar: the search its first half. A sort
    // reads its field in its first half, and sorts its values in the second.
    const searchShare = view.search ? (view.sort ? 0.5 : 1) : 0;
    let rows = null;
    try {
      if (searchedBefore) {
        rows = searchedBefore;
      } else if (view.search) {
        rows = await searchRows({
          ...scanned,
          text: view.search,
          onProgress: ({ field: name, fieldIndex, fields, fraction }) =>
            onProgress?.({
              text: `Searching ${name} (field ${fieldIndex + 1} of ${fields})…`,
              fraction: fraction * searchShare,
            }),
        });
        this.#keepSearch(view.search, rows);
      }
      if (view.sort && (!rows || rows.length > 0)) {
        rows = await sortRows({
          ...scanned,
          fieldIndex: view.sort.fieldIndex,
          descending: view.sort.descending,
          rows,
          collator: this.#collator,
          onProgress: ({ stage, fraction }) =>
            onProgress?.({
              text: stage === "reading" ? `Sorting by ${field.name}: reading its values…` : `Sorting by ${field.name}…`,
              fraction: searchShare + (1 - searchShare) * (stage === "reading" ? fraction / 2 : 0.5 + fraction / 2),
            }),
        });
      }
    } finally {
      booked.release();
    }
    signal?.throwIfAborted();
    if (this.#closed) {
      throw closedError();
    }
    // A file rewritten while it was scanned may have given rows of both
    await this.#checkFile();
    this.#showView(view.key, rows);
  }

  /**
   * Keep the rows a search found, for sorts of them, in place of the last search's
   * @param {string} text - The search text
   * @param {Uint32Array} rows - The rows it found, in file order
   */
  #keepSearch(text, rows) {
    const kept = this.#searched;
    this.#searched = { text, rows, release: bookHeap(rows.byteLength) };
    kept.release();
  }

  /**
   * Show a view: book its rows, and let the view shown before go
   * @param {string} key - The view's key
   * @param {Uint32Array|null} rows - Its rows in order, null for every row in file order
   */
  #showView(key, rows) {
    const shown = this.#view;
    this.#view = { key, rows, release: rows ? bookHeap(rows.byteLength) : () => {} };
    shown.release();
  }

  /**
   * Price a read of rows of the file, and book what the open copy then holds
   * The open copy is opened afresh first if it holds more than it may, and again
   * if what it holds is why the read doesn't fit.
   * @param {number} offset - The read's first row in the file
   * @param {number} rows - Its rows
   * @param {AbortSignal} [signal] - Gives it up
   * @param {Function|null} progress - Told how it is getting on, as qvdjs tells it
   * @param {{offset: number, rows: number, totalRows: number}} page - The page, for a refusal
   * @returns {Promise<object>} qvdjs's QvdFile, priced for the read
   */
  async #pricedFile(offset, rows, signal, progress, page) {
    // Opened afresh once it holds more than it may, letting go of the values it holds
    if (this.#used && this.#held > this.#heldBytes) {
      await this.#closeFile();
    }
    for (;;) {
      const file = await this.#openFile();
      // qvdjs prices the read from the values its rows use and what the copy holds
      // already, and walks the columns it touches first, which the read then uses
      const check = await file.check({ offset, limit: rows, signal, onProgress: progress });
      if (this.#closed) {
        throw closedError();
      }
      const neededBytes = heapNeeded(check);
      // What this copy holds is booked already, and is part of what the read needs
      const leftBytes = this.#budget
        ? this.#budget.factor * this.#budget.bytes - (bookedBytes() - this.#held)
        : Infinity;
      if (check.fits !== false && neededBytes <= leftBytes) {
        this.#book(neededBytes);
        return file;
      }
      // What the copy holds may be why: opened afresh, it holds nothing
      if (this.#used) {
        await this.#closeFile();
        continue;
      }
      throw pageRefusal({ ...page, neededBytes, leftBytes: Math.max(0, leftBytes) });
    }
  }

  /**
   * Read a page now, at its turn
   * @param {number} offset - Its first row in the view
   * @param {number} limit - Its rows
   * @param {AbortSignal} [signal] - Gives it up
   * @param {Function} [onProgress] - Told how it is getting on
   * @returns {Promise<{rows: Array<Array<*>>, offset: number, totalRows: number, fileRows: number}>} As page() gives it
   */
  async #pageNow(offset, limit, signal, onProgress) {
    signal?.throwIfAborted();
    if (this.#closed) {
      throw closedError();
    }
    await this.#checkFile();
    const fileRows = this.header.rowCount;
    const viewRows = this.#view.rows;
    const totalRows = viewRows ? viewRows.length : fileRows;
    const rows = Math.max(0, Math.min(offset + limit, totalRows) - offset);
    if (rows === 0) {
      return { rows: [], offset, totalRows, fileRows };
    }
    const progress = onProgress
      ? ({ stage, current, total }) => {
          if (stage === "symbol-census" && total > 0) {
            onProgress({ text: `Reading field ${current} of ${total}…`, fraction: current / total });
          }
        }
      : null;
    const page = { offset, rows, totalRows };

    try {
      let data;
      if (!viewRows) {
        const file = await this.#pricedFile(offset, rows, signal, progress, page);
        data = (await file.rows({ offset, limit: rows, signal, onProgress: progress })).data;
      } else {
        // The page's rows are spread through the file: read near ones together, in file order
        const wanted = viewRows.subarray(offset, offset + rows);
        const windows = windowsOf(wanted);
        const byRow = new Map();
        // Priced by its first window: qvdjs prices each read itself too, and the next
        // page's price counts what this one leaves the open copy holding
        const file = await this.#pricedFile(windows[0].start, windows[0].end - windows[0].start, signal, progress, page);
        for (const { start, end } of windows) {
          const read = await file.rows({ offset: start, limit: end - start, signal, onProgress: progress });
          for (let i = 0; i < read.data.length; i++) {
            byRow.set(start + i, read.data[i]);
          }
        }
        data = Array.from(wanted, (row) => byRow.get(row));
      }
      this.#used = true;
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        for (let j = 0; j < row.length; j++) {
          row[j] = toCellValue(row[j]);
        }
      }
      return { rows: data, offset, totalRows, fileRows };
    } catch (error) {
      // Closed while it ran: qvdjs refuses a closed file's page, and nobody waits for it
      if (this.#closed && error?.name !== "AbortError") {
        throw closedError();
      }
      throw error;
    }
  }

  /**
   * The open copy of the file, opened now if it isn't
   * @returns {Promise<object>} qvdjs's QvdFile
   */
  async #openFile() {
    if (!this.#file) {
      this.#file = await QvdDataFrame.open(this.#filePath, {
        allowedDir: this.#allowedDir,
        // A dual value, such as a date or a formatted number, as the text Qlik shows
        duals: "text",
      });
      this.#used = false;
    }
    return this.#file;
  }

  /**
   * Book what the open copy of the file holds, in place of what was booked for it
   * @param {number} bytes - Heap it holds
   */
  #book(bytes) {
    const release = this.#release;
    this.#release = bookHeap(bytes);
    this.#held = bytes;
    release();
  }

  /**
   * Close the open copy of the file, letting go of the values it holds
   * @returns {Promise<void>} Resolves once qvdjs has closed it
   */
  async #closeFile() {
    const file = this.#file;
    this.#file = null;
    this.#used = false;
    this.#release();
    this.#release = () => {};
    this.#held = 0;
    await file?.close();
  }

  /**
   * Close the pager: its pages from now on are given up, and the open copy of the
   * file is closed. Calling it again does nothing.
   * @returns {Promise<void>} Resolves once the file is closed
   */
  async close() {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#view.release();
    this.#view = { key: this.#view.key, rows: null, release: () => {} };
    this.#searched.release();
    this.#searched = { text: "", rows: null, release: () => {} };
    await this.#closeFile();
  }
}
