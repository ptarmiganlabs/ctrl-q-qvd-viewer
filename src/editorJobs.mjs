/**
 * An editor's long jobs, an export or profiling: one at a time, with progress and Cancel
 *
 * A job reads its file a chunk at a time, for minutes on a large file. While it runs,
 * a notification says how far it has got, and its Cancel gives the job up as closing
 * the editor does: the job stops at its next chunk and an export's file is removed,
 * leaving any file it was to replace as it was. A second job in the same editor, of
 * either kind, is refused until the first ends.
 *
 * This module doesn't import vscode: its window is passed in, so tests can stand in for it.
 */

// Updates a notification takes at most, a second
const UPDATES_PER_SECOND = 10;

/**
 * What an export's progress says
 * @param {{pass: string, rows: number, totalRows: number}} progress - As openQvdSource() tells it
 * @returns {string} Such as "Writing 3,400,000 of 46,900,000 rows"
 */
export function describeExportProgress({ pass, rows, totalRows }) {
  const counted = `${rows.toLocaleString("en-US")} of ${totalRows.toLocaleString("en-US")} rows`;
  return pass === "census" ? `Reading field types: ${counted}` : `Writing ${counted}`;
}

/**
 * What profiling's progress says
 * @param {{field: string, fieldIndex: number, fields: number, pass: number, rows: number, totalRows: number}} progress -
 *   As profileFile() tells it
 * @returns {string} Such as "Profiling Amount (2 of 3): pass 2, 10,000,000 of 46,900,000 rows"
 */
export function describeProfileProgress({ field, fieldIndex, fields, pass, rows, totalRows }) {
  return (
    `Profiling ${field} (${fieldIndex + 1} of ${fields}): pass ${pass}, ` +
    `${rows.toLocaleString("en-US")} of ${totalRows.toLocaleString("en-US")} rows`
  );
}

/**
 * An editor's slot for one long job at a time
 * @returns {{busy: function(): (string|null), take: function(string): (function(): void)|null}}
 *   busy(): the kind of job running, or null; take(kind): a release for a job of that
 *   kind, or null while another job runs
 */
export function createJobSlot() {
  let running = null;
  return {
    busy: () => running,
    take(kind) {
      if (running) {
        return null;
      }
      running = kind;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          running = null;
        }
      };
    },
  };
}

/**
 * Run a job with a notification of its progress, which shows from its first report,
 * so that its dialogs come without one, and whose Cancel gives the job up
 * @template T
 * @param {object} options
 * @param {{withProgress: Function}} options.window - VS Code's window, or what stands in for it
 * @param {*} options.location - Where the notification shows: ProgressLocation.Notification
 * @param {string} options.title - What the notification is about, such as "Exporting sales.qvd to CSV"
 * @param {AbortSignal} [options.signal] - Gives the job up: its editor was closed
 * @param {function({signal: AbortSignal, report: function(string, boolean=): void}): Promise<T>} work -
 *   The job, given the signal it stops at, and what tells its progress: report(message,
 *   now), where now shows the message at once, as the start of a pass does
 * @returns {Promise<{value?: T, cancelled: boolean}>} What the job gave, or cancelled when
 *   its notification's Cancel gave it up
 * @throws {Error} What the job throws, an AbortError included when its editor was closed
 */
export async function withJobProgress({ window, location, title, signal }, work) {
  const cancel = new AbortController();
  const jobSignal = signal ? AbortSignal.any([signal, cancel.signal]) : cancel.signal;

  // The notification, once the job reports: it stays until the job ends
  let shown = null;
  let ended;
  const end = new Promise((resolve) => {
    ended = resolve;
  });
  let lastAt = 0;
  let pending = null;
  let timer = null;
  const flush = () => {
    timer = null;
    if (shown && pending !== null) {
      shown.report({ message: pending });
      pending = null;
      lastAt = Date.now();
    }
  };
  const report = (message, now = false) => {
    if (jobSignal.aborted) {
      return;
    }
    pending = message;
    if (!shown) {
      shown = { report: () => {} };
      window
        .withProgress({ location, title, cancellable: true }, (progress, token) => {
          shown = progress;
          token?.onCancellationRequested?.(() => cancel.abort());
          flush();
          return end;
        })
        ?.then?.(undefined, () => {});
      return;
    }
    // At most so many a second: a report too soon after the last waits for its turn,
    // replaced by any later one
    const wait = lastAt + 1000 / UPDATES_PER_SECOND - Date.now();
    if (now || wait <= 0) {
      clearTimeout(timer);
      flush();
    } else if (!timer) {
      timer = setTimeout(flush, wait);
    }
  };

  try {
    const value = await work({ signal: jobSignal, report });
    return { value, cancelled: false };
  } catch (error) {
    if (cancel.signal.aborted && !signal?.aborted) {
      return { cancelled: true };
    }
    throw error;
  } finally {
    clearTimeout(timer);
    ended();
  }
}
