/**
 * Runs QVD reads one at a time, in the order they were asked for.
 *
 * qvdjs checks each read against the whole heap and doesn't count what other
 * reads already hold, so reads running side by side can each pass its check and
 * together run the extension host out of memory. Three editors opening a 1.79 GB
 * QVD at once do.
 */

/**
 * Create a queue that runs tasks one at a time, in order
 * A task's failure goes to its caller and doesn't stop the tasks queued after it.
 * A task given an AbortSignal rejects for its caller as soon as the signal is
 * aborted. If it was still waiting, it is skipped when its turn comes. If it was
 * running, the next task starts at once, even if this one never settles, as a
 * read of a file on a share that stopped answering may not.
 * @returns {{run: function(function(): Promise<any>, {signal?: AbortSignal}=): Promise<any>, size: number}}
 *   run(task, {signal}) resolves or rejects as the task does, or rejects with the
 *   signal's reason; size counts tasks neither finished nor given up
 */
export function createReadQueue() {
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
      // however it ends, or until this one is given up
      last = previous.then(() => result).catch(() => {});
      return result;
    },
  };
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
