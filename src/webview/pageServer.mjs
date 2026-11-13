import { openPager as openQvdPager } from "../qvdPager.mjs";
import { errorFacts } from "../qvdReader.mjs";
import { memoryRefusalOf } from "../memoryGuard.mjs";
import { describeReadFailure, describeViewerFailure } from "./readFailure.mjs";
import { failureNoticeHtml } from "./templates/errorTemplate.mjs";
import logger from "../logger.mjs";

/**
 * Answers the Data tab's requests for pages, for one editor
 *
 * The grid asks for a page with {command: "page", requestId, offset, limit}, and
 * is answered with one of:
 * - {command: "pageRows", requestId, offset, rows, totalRows}: rows, one array per
 *   row, one value per field in file order;
 * - {command: "pageFailed", requestId, failure, html}: why, as describeReadFailure()
 *   says it, and the notice that says so, written by failureNoticeHtml();
 * - {command: "pageCancelled", requestId}: the user cancelled it, with
 *   {command: "cancelPage", requestId}.
 * While a page walks the file's columns, the first time a page touches them, the
 * grid is told how far it has got with {command: "pageProgress", requestId,
 * current, total}: columns walked, of those the page walks.
 *
 * A request supersedes the one before it, which is given up without an answer:
 * the grid shows one page at a time. The file is opened once, by the first page,
 * and closed with close().
 */

// Least time between two progress messages
const PROGRESS_MS = 100;

/**
 * Whether an error is the reader's account of the file, not the viewer's own failure
 * @param {Error} error - What was thrown
 * @returns {boolean} Whether it is
 */
function isReadError(error) {
  const { errorName, errorCode } = errorFacts(error);
  return Boolean(errorCode) || (typeof errorName === "string" && errorName.startsWith("Qvd"));
}

/**
 * Create the page server for one editor
 * @param {object} options
 * @param {string} options.filePath - The QVD file
 * @param {object} options.webview - The editor's webview, to answer
 * @param {AbortSignal} [options.signal] - Aborted once the editor is closed
 * @param {function(): Promise<void>} [options.onFileChanged] - Shows the file again,
 *   once a page finds it changed on disk since it was opened
 * @param {typeof openQvdPager} [options.openPager] - Opens the file, for tests to replace
 * @returns {{servePage: function(object): Promise<void>, cancel: function(*): void, close: function(): Promise<void>}}
 *   servePage answers a page message; cancel gives up the request it names, and
 *   answers it pageCancelled; close gives up what runs and closes the file
 */
export function createPageServer({ filePath, webview, signal, onFileChanged, openPager = openQvdPager }) {
  // The pager, once a page has opened it, or while one opens it
  let pager = null;
  // The request running, if any: {requestId, controller, cancelled}
  let current = null;
  let closed = false;

  /**
   * The pager, opened now if no page has opened it yet
   * A pager that fails to open is opened again by the next page.
   * @param {AbortSignal} requestSignal - Gives opening it up
   * @returns {Promise<import('../qvdPager.mjs').Pager>} The pager
   */
  function pagerFor(requestSignal) {
    if (!pager) {
      const opening = openPager(filePath, { signal: requestSignal });
      pager = opening;
      opening.catch(() => {
        if (pager === opening) {
          pager = null;
        }
      });
    }
    return pager;
  }

  /**
   * Close the pager, if a page has opened it
   * @returns {Promise<void>} Resolves once it is closed
   */
  async function closePager() {
    const opening = pager;
    pager = null;
    const opened = await opening?.catch(() => null);
    await opened?.close();
  }

  /**
   * Post a message to the grid, unless the editor has closed
   * @param {object} message - The message
   * @returns {Promise<void>} Resolves once it is posted
   */
  async function post(message) {
    if (!closed && !signal?.aborted) {
      await webview.postMessage(message);
    }
  }

  /**
   * Answer a request for a page
   * @param {{requestId: *, offset: number, limit: number}} message - The request
   * @returns {Promise<void>} Resolves once it is answered, or given up
   */
  async function servePage({ requestId, offset, limit }) {
    if (closed) {
      return;
    }
    current?.controller.abort();
    const request = { requestId, controller: new AbortController(), cancelled: false };
    current = request;
    const requestSignal = signal
      ? AbortSignal.any([request.controller.signal, signal])
      : request.controller.signal;

    let lastProgress = 0;
    const onProgress = ({ stage, current: done, total }) => {
      if (stage !== "symbol-census") {
        return;
      }
      const now = Date.now();
      if (done < total && now - lastProgress < PROGRESS_MS) {
        return;
      }
      lastProgress = now;
      post({ command: "pageProgress", requestId, current: done, total }).catch(() => {});
    };

    try {
      const opened = await pagerFor(requestSignal);
      // Superseded, cancelled or closed while the file opened
      requestSignal.throwIfAborted();
      const page = await opened.page({ offset, limit, signal: requestSignal, onProgress });
      await post({
        command: "pageRows",
        requestId,
        offset: page.offset,
        rows: page.rows,
        totalRows: page.totalRows,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        // Superseded by the next page, or the editor closed: nobody waits for an answer
        if (request.cancelled) {
          await post({ command: "pageCancelled", requestId });
        }
        return;
      }
      if (error?.name === "QvdFileChangedError") {
        // Its rows, and maybe its fields, are not the ones the page shows
        logger.log(`${filePath} changed on disk, so it is shown again`);
        await closePager();
        await onFileChanged?.();
        return;
      }
      logger.error(`Page of ${filePath} failed, from row ${offset}:`, error);
      const failure = isReadError(error)
        ? describeReadFailure(
            { error: error?.message ?? String(error), ...errorFacts(error), refusal: memoryRefusalOf(error) },
            { filePath, headerRead: true }
          )
        : describeViewerFailure(error, { filePath });
      await post({
        command: "pageFailed",
        requestId,
        failure,
        html: String(failureNoticeHtml(failure, { headerShown: true, heading: "h3" })),
      });
    } finally {
      if (current === request) {
        current = null;
      }
    }
  }

  /**
   * Give up the request named, if it is running, and answer it pageCancelled
   * @param {*} requestId - The request
   */
  function cancel(requestId) {
    if (current && current.requestId === requestId) {
      current.cancelled = true;
      current.controller.abort();
    }
  }

  /**
   * Give up what runs, and close the file
   * @returns {Promise<void>} Resolves once the file is closed
   */
  async function close() {
    closed = true;
    current?.controller.abort();
    await closePager();
  }

  return { servePage, cancel, close };
}
