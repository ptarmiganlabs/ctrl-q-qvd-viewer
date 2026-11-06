const assert = require("assert");

// Import the queue module
let createReadQueue;

/**
 * A task that records when it starts and ends
 * @param {Array<string>} events - Where to record
 * @param {string} name - The task's name
 * @param {number} ms - How long it takes
 * @returns {function(): Promise<string>} The task, resolving to its name
 */
function recordedTask(events, name, ms) {
  return async () => {
    events.push(`start ${name}`);
    await new Promise((resolve) => setTimeout(resolve, ms));
    events.push(`end ${name}`);
    return name;
  };
}

suite("Read Queue Test Suite", () => {
  // Load the module before running tests
  suiteSetup(async () => {
    // Import the ESM module
    ({ createReadQueue } = await import("../src/readQueue.mjs"));
  });

  test("Tasks run one at a time, in the order queued", async () => {
    const queue = createReadQueue();
    const events = [];

    // The first task is the slowest, so overlapping tasks would interleave
    const results = await Promise.all([
      queue.run(recordedTask(events, "a", 30)),
      queue.run(recordedTask(events, "b", 5)),
      queue.run(recordedTask(events, "c", 1)),
    ]);

    assert.deepStrictEqual(results, ["a", "b", "c"]);
    assert.deepStrictEqual(events, ["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  test("A failed task rejects for its caller, and the next task still runs", async () => {
    const queue = createReadQueue();
    const failed = queue.run(async () => {
      throw new Error("read failed");
    });
    const next = queue.run(async () => "next");

    await assert.rejects(failed, /read failed/);
    assert.strictEqual(await next, "next");
  });

  test("A task that throws at once rejects instead of throwing from run()", async () => {
    const queue = createReadQueue();
    const result = queue.run(() => {
      throw new Error("thrown at once");
    });

    await assert.rejects(result, /thrown at once/);
    assert.strictEqual(await queue.run(async () => 1), 1);
  });

  test("Size counts the tasks queued and running", async () => {
    const queue = createReadQueue();
    let finishFirst;
    const first = queue.run(() => new Promise((resolve) => (finishFirst = resolve)));
    const second = queue.run(async () => "second");
    assert.strictEqual(queue.size, 2);

    // The first task starts on a later turn of the event loop
    await new Promise((resolve) => setImmediate(resolve));
    finishFirst("first");

    assert.deepStrictEqual(await Promise.all([first, second]), ["first", "second"]);
    assert.strictEqual(queue.size, 0);
  });
});
