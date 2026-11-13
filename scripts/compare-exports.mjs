#!/usr/bin/env node
/**
 * Export QVDs to every format with this checkout's code and with another's, such as
 * a worktree of origin/main, and compare the files
 *
 *   node scripts/compare-exports.mjs [--base <checkout>] [--out <dir>] <file.qvd...>
 *
 * Without --base, a temporary worktree of origin/main is made, with this checkout's
 * node_modules, and removed afterwards. Each export runs in a process of its own,
 * under a 16 GiB heap so that the base's whole-file read fits: Arrow's dictionary ids
 * come from a counter that runs for the whole process. The dialogs are answered as a
 * user taking the defaults would, and once more with UTC for a format that asks for a
 * time zone, and with auto-detect for the Qlik delimiter.
 *
 * Before they are compared, what differs from run to run is set aside: the
 * "Generated" lines of the text formats, Excel's dates in docProps/core.xml and its
 * zip's entry dates (each entry is compared once inflated), and Avro's random sync
 * marker. SQLite databases are compared by schema, and by each row's values with the
 * storage class of each. An export that fails is compared by its failure, its first
 * line. Prints a table, and exits with 1 if any pair differs.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const FORMATS = {
  csv: "csv",
  json: "json",
  xml: "xml",
  yaml: "yaml",
  excel: "xlsx",
  parquet: "parquet",
  arrow: "arrow",
  avro: "avro",
  sqlite: "db",
  postgres: "sql",
  qlik: "qvs",
};
const ZONED = new Set(["arrow", "avro", "parquet", "postgres", "sqlite"]);

// A worker: exports one QVD to one format with the code of the checkout it is given
const WORKER = `
const [repo, qvd, format, outFile, variant] = process.argv.slice(1);
const path = await import("node:path");
const fs = await import("node:fs");
const pick = (items) => {
  if (variant === "auto") { const a = items.find((i) => i.value === "auto-detect"); if (a) return a; }
  if (variant === "utc") { const u = items.find((i) => i.value === "UTC"); if (u) return u; }
  return items[0];
};
const vscode = {
  window: { showQuickPick: async (items) => pick(items), showInputBox: async (o) => o.value, showSaveDialog: async () => ({ fsPath: outFile }) },
  workspace: { getConfiguration: () => ({ get: (k, fallback) => fallback }) },
  Uri: { file: (p) => ({ fsPath: p }) },
};
let shifts = null;
const report = (s) => (shifts = s);
const streamed = path.join(repo, "src", "exportRun.mjs");
if (fs.existsSync(streamed)) {
  const { runExport } = await import(streamed);
  await runExport({ filePath: qvd, format, vscode, workspaceFolder: path.dirname(outFile), report, warn: () => {} });
} else {
  const { default: QvdReader } = await import(path.join(repo, "src", "qvdReader.mjs"));
  const { default: DataExporter } = await import(path.join(repo, "src", "exporters", "index.mjs"));
  const result = await new QvdReader().read(qvd, 0, { dates: DataExporter.writesDates(format) });
  if (result.error) throw new Error(result.error);
  await DataExporter.exportData(result.data, format, path.basename(qvd, ".qvd"), vscode, path.dirname(outFile), 0, result.columns, { report, warn: () => {} });
}
if (shifts) fs.writeFileSync(outFile + ".shifts.json", JSON.stringify(shifts));
`;

/**
 * The exports to make of a QVD: each format, and its variants
 * @param {string} qvd - The QVD
 * @returns {Array<{format: string, variant: string, name: string}>} The exports
 */
function exportsOf(qvd) {
  const stem = basename(qvd, ".qvd");
  const list = [];
  for (const [format, extension] of Object.entries(FORMATS)) {
    const variants = ["default", ...(ZONED.has(format) ? ["utc"] : []), ...(format === "qlik" ? ["auto"] : [])];
    for (const variant of variants) {
      list.push({ format, variant, name: `${stem}.${variant}.${extension}` });
    }
  }
  return list;
}

/**
 * Export with a checkout's code, in a process of its own
 * @param {string} repo - The checkout
 * @param {string} qvd - The QVD
 * @param {string} format - The format
 * @param {string} variant - How the dialogs are answered
 * @param {string} outFile - The file to write
 * @returns {{seconds: number, failure: string|null}} How long it took, and its failure's first line
 */
function runOne(repo, qvd, format, variant, outFile) {
  const started = Date.now();
  try {
    execFileSync(process.execPath, ["--max-old-space-size=16384", "--input-type=module", "-e", WORKER, repo, qvd, format, outFile, variant], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { seconds: (Date.now() - started) / 1000, failure: null };
  } catch (error) {
    const lines = String(error.stderr).split("\n").filter((line) => /Error|failed/.test(line));
    return { seconds: (Date.now() - started) / 1000, failure: lines[0]?.trim() ?? "failed" };
  }
}

// The bytes at the start of a text export that may hold its "Generated" line
const HEAD_BYTES = 4096;

/**
 * Whether two text exports are the same but for their "Generated" lines, which are in
 * their first lines. The rest is compared as bytes: a file can be longer than a string
 * can hold
 * @param {Buffer} left - One file
 * @param {Buffer} right - The other
 * @returns {boolean} Whether they are
 */
function sameText(left, right) {
  const head = (bytes) =>
    bytes
      .subarray(0, HEAD_BYTES)
      .toString("latin1")
      .replace(/("generated": )"[^"]*"/g, '$1"…"')
      .replace(/^((?:#|--|\/\/)? ?Generated: ).*$/gm, "$1…");
  return (
    left.length === right.length &&
    head(left) === head(right) &&
    left.subarray(HEAD_BYTES).equals(right.subarray(HEAD_BYTES))
  );
}

/**
 * An Avro file with its sync marker, random for each file, set to zeros
 * @param {Buffer} bytes - The file
 * @returns {Buffer} The same bytes, but the marker's
 */
function normalAvro(bytes) {
  // The header: magic, a map of metadata in blocks, then the 16-byte marker
  let at = 4;
  const long = () => {
    let shift = 0n;
    let value = 0n;
    for (;;) {
      const byte = BigInt(bytes[at++]);
      value |= (byte & 0x7fn) << shift;
      shift += 7n;
      if (byte < 0x80n) {
        return Number((value >> 1n) ^ -(value & 1n));
      }
    }
  };
  for (let count = long(); count !== 0; count = long()) {
    if (count < 0) {
      long();
      count = -count;
    }
    for (let i = 0; i < count; i++) {
      // A key, then its value: each its length, then its bytes
      for (let part = 0; part < 2; part++) {
        const length = long();
        at += length;
      }
    }
  }
  const marker = Buffer.from(bytes.subarray(at, at + 16));
  const out = Buffer.from(bytes);
  for (let found = out.indexOf(marker); found !== -1; found = out.indexOf(marker, found + 16)) {
    out.fill(0, found, found + 16);
  }
  return out;
}

/**
 * An Excel file's entries, inflated, with its dates set aside
 * @param {Buffer} bytes - The file
 * @returns {Promise<Map<string, Buffer>>} Each entry's content, by name: a sheet's can be
 *   longer than a string can hold
 */
async function excelEntries(bytes) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  const entries = new Map();
  for (const name of Object.keys(zip.files).sort()) {
    let content = await zip.files[name].async("nodebuffer");
    if (name === "docProps/core.xml") {
      content = Buffer.from(content.toString("utf8").replace(/(<dcterms:(?:created|modified)[^>]*>)[^<]*/g, "$1…"));
    }
    entries.set(name, content);
  }
  return entries;
}

/**
 * A SQLite database's schema and rows, each value with its storage class
 * @param {string} file - The database
 * @returns {string} Them, as JSON
 */
async function sqliteContent(file) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const schema = db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY name").all();
    const tables = schema.filter((entry) => entry.type === "table").map((entry) => entry.name);
    const rows = {};
    for (const table of tables) {
      const columns = db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table).map((column) => column.name);
      const select = columns.map((column) => `"${column}", typeof("${column}")`).join(", ");
      rows[table] = select ? db.prepare(`SELECT ${select} FROM "${table}" ORDER BY rowid`).all() : [];
    }
    return JSON.stringify({ schema, rows }, (_, value) => (typeof value === "bigint" ? `${value}n` : value));
  } finally {
    db.close();
  }
}

/**
 * Whether two exports are the same, once what differs from run to run is set aside
 * @param {string} format - The format
 * @param {string} a - One file
 * @param {string} b - The other
 * @returns {Promise<"identical"|"same once normalized"|"different">} How they compare
 */
async function compare(format, a, b) {
  const left = readFileSync(a);
  const right = readFileSync(b);
  if (left.equals(right)) {
    return "identical";
  }
  let same = false;
  if (["csv", "json", "xml", "yaml", "postgres", "qlik"].includes(format)) {
    same = sameText(left, right);
  } else if (format === "avro") {
    same = normalAvro(left).equals(normalAvro(right));
  } else if (format === "excel") {
    const [l, r] = [await excelEntries(left), await excelEntries(right)];
    same = l.size === r.size && [...l].every(([name, content]) => r.get(name)?.equals(content));
  } else if (format === "sqlite") {
    same = (await sqliteContent(a)) === (await sqliteContent(b));
  }
  return same ? "same once normalized" : "different";
}

/**
 * A worktree of origin/main, with this checkout's node_modules
 * @returns {{path: string, remove: function(): void}} Where it is, and what removes it
 */
function mainWorktree() {
  const path = mkdtempSync(join(tmpdir(), "qvd-export-base-"));
  rmSync(path, { recursive: true });
  execFileSync("git", ["fetch", "--quiet", "origin", "main"], { cwd: here, stdio: "inherit" });
  execFileSync("git", ["worktree", "add", "--quiet", "--detach", path, "origin/main"], { cwd: here, stdio: "inherit" });
  symlinkSync(join(here, "node_modules"), join(path, "node_modules"));
  return {
    path,
    remove: () => execFileSync("git", ["worktree", "remove", "--force", path], { cwd: here, stdio: "inherit" }),
  };
}

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? null : args.splice(at, 2)[1];
};

// --dirs <base> <this>: compare two folders of exports made already, named as above
const dirsAt = args.indexOf("--dirs");
if (dirsAt !== -1) {
  const [baseDir, hereDir] = args.splice(dirsAt, 3).slice(1).map((dir) => resolve(dir));
  const { readdirSync } = await import("node:fs");
  const formatOf = new Map(Object.entries(FORMATS).map(([format, extension]) => [extension, format]));
  let differs = 0;
  for (const name of readdirSync(baseDir).filter((file) => !file.endsWith(".shifts.json")).sort()) {
    const format = formatOf.get(name.split(".").pop());
    const other = join(hereDir, name);
    const shifts = [baseDir, hereDir].map((dir) =>
      existsSync(join(dir, `${name}.shifts.json`)) ? readFileSync(join(dir, `${name}.shifts.json`), "utf8") : ""
    );
    let outcome = existsSync(other) ? await compare(format, join(baseDir, name), other) : "missing";
    if (shifts[0] !== shifts[1]) {
      outcome = `${outcome}, time shifts differ`;
    }
    if (outcome !== "identical" && outcome !== "same once normalized") {
      differs++;
    }
    console.log(`${name}: ${outcome}`);
  }
  console.log(differs === 0 ? "\nEvery export matches." : `\n${differs} exports differ.`);
  process.exit(differs === 0 ? 0 : 1);
}
const baseOption = option("--base");
const outDir = resolve(option("--out") ?? mkdtempSync(join(tmpdir(), "qvd-export-compare-")));
const qvds = args.map((qvd) => resolve(qvd));
if (qvds.length === 0) {
  console.error("Usage: node scripts/compare-exports.mjs [--base <checkout>] [--out <dir>] <file.qvd...>");
  process.exit(2);
}

const base = baseOption ? { path: resolve(baseOption), remove: () => {} } : mainWorktree();
let differ = 0;
try {
  console.log(`| QVD | Format | Dialogs | Base (s) | This (s) | Outcome |`);
  console.log(`| --- | --- | --- | --: | --: | --- |`);
  for (const qvd of qvds) {
    for (const { format, variant, name } of exportsOf(qvd)) {
      const files = { base: join(outDir, "base", name), here: join(outDir, "here", name) };
      for (const file of Object.values(files)) {
        execFileSync("mkdir", ["-p", dirname(file)]);
        rmSync(file, { force: true });
      }
      const ran = { base: runOne(base.path, qvd, format, variant, files.base), here: runOne(here, qvd, format, variant, files.here) };
      let outcome;
      if (ran.base.failure || ran.here.failure) {
        outcome =
          ran.base.failure === ran.here.failure
            ? `both fail: ${ran.base.failure}`
            : `base: ${ran.base.failure ?? "ok"}; this: ${ran.here.failure ?? "ok"}`;
        if (ran.base.failure !== ran.here.failure) {
          differ++;
        }
      } else {
        outcome = await compare(format, files.base, files.here);
        const shifts = [files.base, files.here].map((file) => (existsSync(`${file}.shifts.json`) ? readFileSync(`${file}.shifts.json`, "utf8") : ""));
        if (shifts[0] !== shifts[1]) {
          outcome = `${outcome}, time shifts differ`;
        }
        if (outcome !== "identical" && outcome !== "same once normalized") {
          differ++;
        }
      }
      console.log(`| ${basename(qvd)} | ${format} | ${variant} | ${ran.base.seconds.toFixed(1)} | ${ran.here.seconds.toFixed(1)} | ${outcome} |`);
    }
  }
} finally {
  base.remove();
}
writeFileSync(join(outDir, "done"), `${differ}\n`);
console.log(differ === 0 ? "\nEvery export matches." : `\n${differ} exports differ.`);
process.exit(differ === 0 ? 0 : 1);
