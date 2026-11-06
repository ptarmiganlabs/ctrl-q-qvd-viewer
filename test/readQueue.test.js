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

  test("A task aborted before its turn is skipped, and the next one still runs", async () => {
    const queue = createReadQueue();
    const events = [];
    const controller = new AbortController();

    const first = queue.run(recordedTask(events, "first", 30));
    const skipped = queue.run(recordedTask(events, "skipped", 1), { signal: controller.signal });
    const next = queue.run(recordedTask(events, "next", 1));
    controller.abort();

    // Its caller hears at once, without waiting for the task before it
    await assert.rejects(skipped, { name: "AbortError" });
    events.push("skipped rejected");
    assert.deepStrictEqual(await Promise.all([first, next]), ["first", "next"]);
    assert.deepStrictEqual(events, [
      "start first",
      "skipped rejected",
      "end first",
      "start next",
      "end next",
    ]);
  });

  test("A task given a signal aborted before it is queued leaves no rejection unhandled", async () => {
    const queue = createReadQueue();
    const controller = new AbortController();
    controller.abort();
    const unhandled = [];
    const listener = (reason) => unhandled.push(reason);
    process.on("unhandledRejection", listener);
    try {
      await assert.rejects(queue.run(async () => "ran", { signal: controller.signal }), {
        name: "AbortError",
      });
      // Node reports an unhandled rejection once the microtasks have drained
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      process.off("unhandledRejection", listener);
    }
    assert.deepStrictEqual(unhandled, []);
    assert.strictEqual(await queue.run(async () => "next"), "next");
  });

  test("Aborting a running task lets the next one start, even if it never settles", async () => {
    const queue = createReadQueue();
    const controller = new AbortController();

    // A read of a file on a share that stopped answering
    const stuck = queue.run(() => new Promise(() => {}), { signal: controller.signal });
    const next = queue.run(async () => "next");
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();

    await assert.rejects(stuck, { name: "AbortError" });
    assert.strictEqual(await next, "next");
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
