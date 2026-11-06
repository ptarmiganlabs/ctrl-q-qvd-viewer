/**
 * Runs QVD reads one at a time, in the order they were asked for.
 *
 * qvdjs checks each read against the whole heap and doesn't count what other
 * reads already hold, so reads running side by side can each pass its check and
 * together run the extension host out of memory. Three editors opening a 1.79 GB
 * QVD at once do.
 */

/**
 * How long a task given up while it runs gets to stop before the next one
 * starts. A read stops at its next look at its signal, well within a second,
 * and until then still holds what it has read.
 */
const GIVEN_UP_GRACE_MS = 5000;

/**
 * Create a queue that runs tasks one at a time, in order
 * A task's failure goes to its caller and doesn't stop the tasks queued after it.
 * A task given an AbortSignal rejects for its caller as soon as the signal is
 * aborted. If it was still waiting, it is skipped when its turn comes. If it was
 * running, the next task starts once it stops, or after graceMs if it hasn't:
 * a read of a file on a share that stopped answering may never stop.
 * @param {{graceMs?: number}} [options] - graceMs: how long a task given up while
 *   it runs gets to stop
 * @returns {{run: function(function(): Promise<any>, {signal?: AbortSignal}=): Promise<any>, size: number}}
 *   run(task, {signal}) resolves or rejects as the task does, or rejects with the
 *   signal's reason; size counts tasks neither finished nor given up
 */
export function createReadQueue({ graceMs = GIVEN_UP_GRACE_MS } = {}) {
  let last = Promise.resolve();
  let size = 0;
  const settled = () => {
    size--;
  };

  return {
    get size() {
      return size;
    },
    run(task, { signal } = {}) {
      size++;
      const previous = last;
      const turn = previous.then(() => {
        signal?.throwIfAborted();
        return task();
      });
      // A failure reaches the caller through result. A task given up before it
      // was queued leaves result settled without ever watching turn, so turn is
      // watched here, or its rejection would go unhandled.
      turn.catch(() => {});
      const result = untilAborted(turn, signal);
      result.then(settled, settled);
      // The next task waits for every one before it, and then for this one,
      // however it ends. Given up, this one gets graceMs to stop first.
      const ended = turn.then(
        () => {},
        () => {}
      );
      last = previous.then(() => result).then(
        () => {},
        () => endedWithin(ended, graceMs)
      );
      return result;
    },
  };
}

/**
 * Wait for a task to end, or for a while, whichever is sooner
 * @param {Promise<void>} ended - Resolves when the task ends, however it ends
 * @param {number} ms - The while
 * @returns {Promise<void>} Resolves at the sooner of the two
 */
function endedWithin(ended, ms) {
  let timer;
  // Not unref'd: the tasks waiting behind a task that never ends start on this timer
  const waited = new Promise((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([ended, waited]).finally(() => clearTimeout(timer));
}

/**
 * Settle as a promise does, or reject with the signal's reason once it is aborted
 * @param {Promise<any>} promise - The promise
 * @param {AbortSignal} [signal] - Gives up on it
 * @returns {Promise<any>} As the promise, or rejected with the signal's reason
 */
function untilAborted(promise, signal) {
  if (!signal) {
    return promise;
  }
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}
