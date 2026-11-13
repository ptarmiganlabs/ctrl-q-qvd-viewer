// Measures what profiling or exporting a QVD costs: time, peak heap, peak memory in
// ArrayBuffers (typed arrays live there, outside the heap) and the process's, and the
// longest stretch it keeps the event loop from running anything else. Run it with the
// extension host's heap, 4 GiB, so that it is refused where the extension would be:
//
//   node --max-old-space-size=4096 --expose-gc scripts/measure-bounded.mjs profile <file.qvd> [field ...]
//   node --max-old-space-size=4096 --expose-gc scripts/measure-bounded.mjs export <file.qvd> [format ...] [--out <dir>] [--keep]
//
// Profile: each field is profiled on its own, every field of the file unless some are
// named, and then, with --together, the named fields in one run, as the page asks for
// up to three. Export: each format is exported on its own, every format unless some are
// named, with the dialogs' defaults and UTC for the time zone, into --out (the system's
// temporary folder unless said), and the file is removed once measured unless --keep.
// It prints a Markdown table.

import { monitorEventLoopDelay } from "node:perf_hooks";
import { getHeapStatistics } from "node:v8";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { QvdDataFrame } = await import("qvdjs");
const { profileFile } = await import(`${root}/src/qvdProfiler.mjs`);
const { runExport } = await import(`${root}/src/exportRun.mjs`);
const { default: DataExporter } = await import(`${root}/src/exporters/index.mjs`);
const { mkdtempSync, rmSync, statSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { basename, join } = await import("node:path");

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    together: { type: "boolean", default: false },
    out: { type: "string" },
    keep: { type: "boolean", default: false },
  },
});
const [mode, file, ...named] = positionals;
if (!["profile", "export"].includes(mode) || !file) {
  console.error(
    "Usage: node --max-old-space-size=4096 scripts/measure-bounded.mjs profile <file.qvd> [field ...] [--together]\n" +
      "       node --max-old-space-size=4096 scripts/measure-bounded.mjs export <file.qvd> [format ...] [--out <dir>] [--keep]"
  );
  process.exit(2);
}

const MiB = 2 ** 20;
const metadata = await QvdDataFrame.readMetadata(resolve(file), { allowedDir: dirname(resolve(file)) });
const symbols = new Map(metadata.fields.map((field) => [field.fieldName, Number(field.noOfSymbols)]));
const fields = mode === "profile" && named.length > 0 ? named : metadata.fields.map((field) => field.fieldName);

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

/**
 * Export to a format, and print a row of the table for it
 * @param {string} format - The format, written into outDir
 */
async function exportRow(format) {
  const extension = { excel: "xlsx", sqlite: "db", postgres: "sql", qlik: "qvs" }[format] ?? format;
  const target = join(outDir, `${basename(file, ".qvd")}.${extension}`);
  // The defaults, UTC for a time zone, and every row for the formats that ask how many
  const pick = (items) => items.find((item) => item.value === "UTC") ?? items.find((item) => item.value === "0") ?? items[0];
  const vscode = {
    window: { showQuickPick: async (items) => pick(items), showInputBox: async (input) => input.value, showSaveDialog: async () => ({ fsPath: target }) },
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
    Uri: { file: (fsPath) => ({ fsPath }) },
  };
  const passes = { census: 0, rows: 0 };
  const cost = await measured((sample) =>
    runExport({
      filePath: resolve(file),
      format,
      vscode,
      workspaceFolder: outDir,
      warn: (message) => console.error(message),
      onProgress: ({ pass, rows }) => {
        if (rows === 0) {
          passes[pass]++;
        }
        sample();
      },
    })
  );
  let size = "";
  try {
    size = (statSync(target).size / MiB).toFixed(0);
  } catch {
    // Nothing written
  }
  if (!options.keep) {
    rmSync(target, { force: true });
  }
  const outcome = cost.error ? `failed: ${cost.error.message}` : cost.result ? "exported" : "cancelled";
  console.log(
    `| ${DataExporter.formatLabel(format)} | ${passes.census} + ${passes.rows} | ${cost.seconds.toFixed(1)} | ${size} | ` +
      `${cost.heapMiB.toFixed(0)} | ${cost.buffersMiB.toFixed(0)} | ${cost.rssMiB.toFixed(0)} | ${cost.stallMs.toFixed(0)} | ${cost.p99Ms.toFixed(0)} | ${outcome} |`
  );
}

console.log(
  `${file}: ${Number(metadata.rowCount).toLocaleString()} rows, ${metadata.fields.length} fields; ` +
    `heap limit ${(getHeapStatistics().heap_size_limit / MiB).toFixed(0)} MiB`
);
console.log("");
const outDir = mode === "export" ? resolve(options.out ?? mkdtempSync(join(tmpdir(), "qvd-measure-"))) : null;
if (mode === "export") {
  console.log(
    "| Format | Passes (census + rows) | Seconds | File (MiB) | Peak heap (MiB) | Peak ArrayBuffers (MiB) | Peak RSS (MiB) | Longest stall (ms) | p99 stall (ms) | Outcome |"
  );
  console.log("| --- | --: | --: | --: | --: | --: | --: | --: | --: | --- |");
  const formats = named.length > 0 ? named : DataExporter.getExportFormats().map(({ name }) => name);
  for (const format of formats) {
    await exportRow(format);
  }
  process.exit(0);
}
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
