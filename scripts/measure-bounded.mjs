// Measures what profiling a QVD costs: time, peak heap, peak memory in ArrayBuffers
// (typed arrays live there, outside the heap) and the process's, and the longest
// stretch it keeps the event loop from running anything else. Run it with the
// extension host's heap, 4 GiB, so that it is refused where the extension would be:
//
//   node --max-old-space-size=4096 --expose-gc scripts/measure-bounded.mjs profile <file.qvd> [field ...]
//
// Each field is profiled on its own, every field of the file unless some are named,
// and then, with --together, the named fields in one run, as the page asks for up to
// three. It prints a Markdown table.

import { monitorEventLoopDelay } from "node:perf_hooks";
import { getHeapStatistics } from "node:v8";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { QvdDataFrame } = await import("qvdjs");
const { profileFile } = await import(`${root}/src/qvdProfiler.mjs`);

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: { together: { type: "boolean", default: false } },
});
const [mode, file, ...named] = positionals;
if (mode !== "profile" || !file) {
  console.error("Usage: node --max-old-space-size=4096 scripts/measure-bounded.mjs profile <file.qvd> [field ...] [--together]");
  process.exit(2);
}

const MiB = 2 ** 20;
const metadata = await QvdDataFrame.readMetadata(resolve(file), { allowedDir: dirname(resolve(file)) });
const symbols = new Map(metadata.fields.map((field) => [field.fieldName, Number(field.noOfSymbols)]));
const fields = named.length > 0 ? named : metadata.fields.map((field) => field.fieldName);

/**
 * Run a job, watching its memory and the event loop
 * @param {function(function(): void): Promise<*>} job - The job, given a function to call
 *   at points worth sampling memory at
 * @returns {Promise<{result: *, error: Error|null, seconds: number, heapMiB: number, buffersMiB: number, rssMiB: number, stallMs: number, p99Ms: number}>}
 *   What it gave, and what it cost
 */
async function measured(job) {
  globalThis.gc?.();
  let heap = 0;
  let buffers = 0;
  let rss = 0;
  const sample = () => {
    heap = Math.max(heap, getHeapStatistics().used_heap_size);
    const usage = process.memoryUsage();
    buffers = Math.max(buffers, usage.arrayBuffers);
    rss = Math.max(rss, usage.rss);
  };
  const timer = setInterval(sample, 50);
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const started = performance.now();
  let result = null;
  let error = null;
  try {
    result = await job(sample);
  } catch (caught) {
    error = caught;
  }
  const seconds = (performance.now() - started) / 1000;
  delay.disable();
  clearInterval(timer);
  sample();
  return {
    result,
    error,
    seconds,
    heapMiB: heap / MiB,
    buffersMiB: buffers / MiB,
    rssMiB: rss / MiB,
    stallMs: delay.max / 1e6,
    p99Ms: delay.percentile(99) / 1e6,
  };
}

/**
 * Profile fields, and print a row of the table for them
 * @param {Array<string>} fieldNames - The fields
 */
async function profileRow(fieldNames) {
  const passes = new Set();
  const cost = await measured((sample) =>
    profileFile(resolve(file), fieldNames, {
      onProgress: ({ field, pass }) => {
        passes.add(`${field}:${pass}`);
        sample();
      },
    })
  );
  const distinct = fieldNames.map((name) => (symbols.get(name) ?? 0).toLocaleString()).join(", ");
  const outcome = cost.error
    ? `refused: ${cost.error.profileRefusal ?? cost.error.message}`
    : cost.result.error ?? "profiled";
  const passCount = passes.size;
  console.log(
    `| ${fieldNames.join(", ")} | ${distinct} | ${passCount} | ${cost.seconds.toFixed(1)} | ` +
      `${cost.heapMiB.toFixed(0)} | ${cost.buffersMiB.toFixed(0)} | ${cost.rssMiB.toFixed(0)} | ${cost.stallMs.toFixed(0)} | ${cost.p99Ms.toFixed(0)} | ${outcome} |`
  );
}

console.log(
  `${file}: ${Number(metadata.rowCount).toLocaleString()} rows, ${metadata.fields.length} fields; ` +
    `heap limit ${(getHeapStatistics().heap_size_limit / MiB).toFixed(0)} MiB`
);
console.log("");
console.log(
  "| Field | Distinct values | Passes | Seconds | Peak heap (MiB) | Peak ArrayBuffers (MiB) | Peak RSS (MiB) | Longest stall (ms) | p99 stall (ms) | Outcome |"
);
console.log("| --- | --: | --: | --: | --: | --: | --: | --: | --: | --- |");
for (const field of fields) {
  await profileRow([field]);
}
if (options.together && fields.length > 1) {
  await profileRow(fields);
}
