import { QvdDataFrame } from "qvdjs";
import { realpath } from "fs/promises";
import { dirname } from "path";
import { toCellValue } from "./cellValue.mjs";
import { budgetFor, fileVersion, headerOf, readLanes } from "./qvdReader.mjs";
import { bookHeap, bookedBytes, describePageRefusal } from "./memoryGuard.mjs";

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
 * @param {{signal?: AbortSignal, heldBytes?: number}} [options] - signal: gives
 *   reading the header up; heldBytes: what the open copy may hold before it is
 *   opened afresh, HELD_BYTES unless a test says otherwise
 * @returns {Promise<Pager>} The pager
 * @throws {Error} What reading the header throws
 */
export async function openPager(filePath, { signal, heldBytes = HELD_BYTES } = {}) {
  // As QvdReader.read() does: qvdjs resolves links before it checks the file is in
  // the directory it may read, so that directory is the real path's
  const realFilePath = await realpath(filePath).catch(() => filePath);
  const allowedDir = dirname(realFilePath);
  const header = await headerOf(filePath, realFilePath, allowedDir, signal);
  const budget = await budgetFor(filePath, allowedDir, header, signal);
  return new Pager({ filePath, realFilePath, allowedDir, header, budget, heldBytes });
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

  /**
   * @param {object} options - As openPager() finds them
   */
  constructor({ filePath, realFilePath, allowedDir, header, budget, heldBytes }) {
    this.#filePath = filePath;
    this.#realFilePath = realFilePath;
    this.#allowedDir = allowedDir;
    this.#budget = budget;
    this.#heldBytes = heldBytes;
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
   * Read a page of rows
   * Pages run in the read queue's small lane, one at a time in the whole
   * extension host, beside at most one large read, which leaves room for them.
   * @param {object} page - The page
   * @param {number} page.offset - Its first row, counted from 0
   * @param {number} page.limit - Its rows, at most MAX_PAGE_ROWS; fewer at the end of the file
   * @param {AbortSignal} [page.signal] - Gives the page up, queued or running
   * @param {function({stage: string, current: number, total: number, percent: number}): void} [page.onProgress] -
   *   Told how the page is getting on, as qvdjs tells it: "symbol-census" once for each
   *   column the page walks, the first time a page touches it
   * @returns {Promise<{rows: Array<Array<*>>, offset: number, totalRows: number}>} The
   *   rows, one array per row with one value per field in file order, each as
   *   toCellValue() makes it, a dual's text included; the offset asked for; and the
   *   rows in the file
   * @throws {Error} A QvdValidationError with context.reason "option" for a page that
   *   isn't a count of rows, or "memory" for one that doesn't fit in the memory left;
   *   FileChangedError when the file has changed since the pager was opened; an
   *   AbortError when the page is given up, or the pager is closed; and what qvdjs
   *   throws for a file it can't read
   */
  async page({ offset, limit, signal, onProgress } = {}) {
    requireRows(offset, "offset");
    requireRows(limit, "limit", MAX_PAGE_ROWS);
    if (this.#closed) {
      throw closedError();
    }
    return await readLanes.small.run(() => this.#pageNow(offset, limit, signal, onProgress), { signal });
  }

  /**
   * Read a page now, at its turn
   * @param {number} offset - Its first row
   * @param {number} limit - Its rows
   * @param {AbortSignal} [signal] - Gives it up
   * @param {Function} [onProgress] - Told how it is getting on
   * @returns {Promise<{rows: Array<Array<*>>, offset: number, totalRows: number}>} As page() gives it
   */
  async #pageNow(offset, limit, signal, onProgress) {
    signal?.throwIfAborted();
    if (this.#closed) {
      throw closedError();
    }
    // qvdjs would read a file rewritten since, by a reload say, under the header read before
    if (this.header.key && (await fileVersion(this.#realFilePath)) !== this.header.key) {
      throw new FileChangedError(this.#filePath);
    }
    const totalRows = this.header.rowCount;
    const rows = Math.max(0, Math.min(offset + limit, totalRows) - offset);
    if (rows === 0) {
      return { rows: [], offset, totalRows };
    }
    const progress = onProgress ?? null;

    // Opened afresh once it holds more than it may, letting go of the values it holds
    if (this.#used && this.#held > this.#heldBytes) {
      await this.#closeFile();
    }

    try {
      let file;
      for (;;) {
        file = await this.#openFile();
        // qvdjs prices the page from the values its rows use and what the copy holds
        // already, and walks the columns it touches first, which the page then uses
        const check = await file.check({ offset, limit: rows, signal, onProgress: progress });
        if (this.#closed) {
          throw closedError();
        }
        const neededBytes = heapNeeded(check);
        // What this copy holds is booked already, and is part of what the page needs
        const leftBytes = this.#budget
          ? this.#budget.factor * this.#budget.bytes - (bookedBytes() - this.#held)
          : Infinity;
        if (check.fits !== false && neededBytes <= leftBytes) {
          this.#book(neededBytes);
          break;
        }
        // What the copy holds may be why: opened afresh, it holds nothing
        if (this.#used) {
          await this.#closeFile();
          continue;
        }
        throw pageRefusal({ offset, rows, totalRows, neededBytes, leftBytes: Math.max(0, leftBytes) });
      }

      const frame = await file.rows({ offset, limit: rows, signal, onProgress: progress });
      this.#used = true;
      const data = frame.data;
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        for (let j = 0; j < row.length; j++) {
          row[j] = toCellValue(row[j]);
        }
      }
      return { rows: data, offset, totalRows };
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
    await this.#closeFile();
  }
}
