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
 * @returns {{run: function(function(): Promise<any>): Promise<any>, size: number}}
 *   run(task) resolves or rejects as the task does; size counts queued and running tasks
 */
export function createReadQueue() {
  let last = Promise.resolve();
  let size = 0;

  return {
    get size() {
      return size;
    },
    run(task) {
      size++;
      const result = last.then(() => task());
      const settled = () => {
        size--;
      };
      // The next task waits for this one however it ends
      last = result.then(settled, settled);
      return result;
    },
  };
}
