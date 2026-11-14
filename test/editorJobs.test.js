const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { recordingWebview } = require("./fakes");

let setupMessageHandler;
let QvdReader;
let createJobSlot;
let withJobProgress;
let describeExportProgress;
let describeProfileProgress;

const testData = path.join(__dirname, "..", "test-data");

/**
 * A window whose notifications are recorded, and whose Cancel is pressed when asked
 * @param {function(string): boolean} [cancelAt] - Presses Cancel once a report says this
 * @returns {{window: {withProgress: Function}, titles: Array<string>, reports: Array<string>}}
 */
function progressWindow(cancelAt = () => false) {
  const titles = [];
  const reports = [];
  return {
    titles,
    reports,
    window: {
      withProgress: (options, task) => {
        assert.strictEqual(options.cancellable, true, "A job's notification can be cancelled");
        titles.push(options.title);
        let cancel = () => {};
        const token = {
          onCancellationRequested: (listener) => {
            cancel = listener;
            return { dispose: () => {} };
          },
        };
        return task(
          {
            report: ({ message }) => {
              reports.push(message);
              if (cancelAt(message)) {
                cancel();
              }
            },
          },
          token
        );
      },
    },
  };
}

/**
 * A copy of a test QVD in a folder of its own, removed afterwards
 * @param {function(string): Promise<void>} use - Given the copy's path
 * @returns {Promise<void>}
 */
async function withCopy(use) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qvd-viewer-jobs-"));
  try {
    const qvdPath = path.join(dir, "sets.qvd");
    fs.copyFileSync(path.join(testData, "lego", "sets.qvd"), qvdPath);
    await use(qvdPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Drive the message handler of one editor, with VS Code's dialogs, messages and
 * notifications answered here, and put back afterwards
 * @param {string} qvdPath - The editor's file
 * @param {object} options
 * @param {function(): Promise<*>} options.save - Answers the save dialog
 * @param {function(string): boolean} [options.cancelAt] - Presses Cancel once a report says this
 * @param {function(object): Promise<void>} use - Given {send, posted, infos, warnings, errors, progress}
 * @returns {Promise<void>}
 */
async function withHandler(qvdPath, { save, cancelAt }, use) {
  const vscode = await import("vscode");
  const progress = progressWindow(cancelAt);
  const infos = [];
  const warnings = [];
  const errors = [];
  const posted = [];
  const saved = {
    showSaveDialog: vscode.window.showSaveDialog,
    showInformationMessage: vscode.window.showInformationMessage,
    showWarningMessage: vscode.window.showWarningMessage,
    showErrorMessage: vscode.window.showErrorMessage,
    withProgress: vscode.window.withProgress,
  };
  const webview = recordingWebview(posted);
  try {
    vscode.window.showSaveDialog = save;
    vscode.window.showInformationMessage = async (message) => {
      infos.push(message);
      return undefined;
    };
    vscode.window.showWarningMessage = async (message) => {
      warnings.push(message);
      return undefined;
    };
    vscode.window.showErrorMessage = async (message) => {
      errors.push(message);
      return undefined;
    };
    vscode.window.withProgress = progress.window.withProgress;
    setupMessageHandler({ webview }, qvdPath, new QvdReader(), {}, async () => {}, null);
    await use({ send: (message) => webview.listener(message), posted, infos, warnings, errors, progress });
  } finally {
    Object.assign(vscode.window, saved);
  }
}

/**
 * The files in a folder, temporary files included
 * @param {string} dir - The folder
 * @returns {Array<string>} Their names, sorted
 */
const filesIn = (dir) => fs.readdirSync(dir).sort();

suite("Editor Jobs Test Suite", () => {
  suiteSetup(async () => {
    ({ setupMessageHandler } = await import("../src/webview/messageHandler.mjs"));
    ({ default: QvdReader } = await import("../src/qvdReader.mjs"));
    ({ createJobSlot, withJobProgress, describeExportProgress, describeProfileProgress } = await import(
      "../src/editorJobs.mjs"
    ));
  });

  test("Progress says which pass it is in, and how many rows it has read", () => {
    assert.strictEqual(
      describeExportProgress({ pass: "census", rows: 1200000, totalRows: 46900000 }),
      "Reading field types: 1,200,000 of 46,900,000 rows"
    );
    assert.strictEqual(
      describeExportProgress({ pass: "rows", rows: 3400000, totalRows: 46900000 }),
      "Writing 3,400,000 of 46,900,000 rows"
    );
    assert.strictEqual(
      describeProfileProgress({ field: "Amount", fieldIndex: 1, fields: 3, pass: 2, rows: 1e7, totalRows: 46900000 }),
      "Profiling Amount (2 of 3): pass 2, 10,000,000 of 46,900,000 rows"
    );
  });

  test("A slot holds one job at a time, and a release lets it go once", () => {
    const slot = createJobSlot();
    const release = slot.take("export");
    assert.strictEqual(slot.busy(), "export");
    assert.strictEqual(slot.take("profile"), null, "A second job is refused while the first runs");
    release();
    assert.strictEqual(slot.busy(), null);
    const next = slot.take("profile");
    release();
    assert.strictEqual(slot.busy(), "profile", "An old release doesn't let a later job go");
    next();
  });

  test("A job's notification shows from its first report, at most ten updates a second", async () => {
    const { window, reports, titles } = progressWindow();
    const result = await withJobProgress({ window, location: 15, title: "Job" }, async ({ report }) => {
      assert.deepStrictEqual(titles, [], "Nothing shows before the job reports");
      for (let i = 0; i < 1000; i++) {
        report(`step ${i}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
      return 42;
    });
    assert.deepStrictEqual(result, { value: 42, cancelled: false });
    assert.deepStrictEqual(titles, ["Job"]);
    // The first at once, and the last of the burst once its turn came
    assert.deepStrictEqual(reports, ["step 0", "step 999"]);
  });

  test("Cancel gives a job up, and closing its editor still throws", async () => {
    const cancelled = await withJobProgress(
      { window: progressWindow(() => true).window, location: 15, title: "Job" },
      async ({ signal, report }) => {
        report("go");
        assert.strictEqual(signal.aborted, true);
        signal.throwIfAborted();
      }
    );
    assert.deepStrictEqual(cancelled, { cancelled: true });

    const closed = new AbortController();
    await assert.rejects(
      withJobProgress({ window: progressWindow().window, location: 15, title: "Job", signal: closed.signal }, async ({ signal }) => {
        closed.abort();
        signal.throwIfAborted();
      }),
      { name: "AbortError" }
    );
  });

  test("An export shows its progress, and says which pass it is in", async () => {
    const vscode = await import("vscode");
    for (const [format, first] of [
      ["csv", /^Writing 0 of [\d,]+ rows$/],
      ["parquet", /^Reading field types: 0 of [\d,]+ rows$/],
    ]) {
      await withCopy(async (qvdPath) => {
        const target = path.join(path.dirname(qvdPath), `sets.${format}`);
        await withHandler(qvdPath, { save: async () => vscode.Uri.file(target) }, async ({ send, errors, progress, posted }) => {
          await send({ command: "exportData", format });
          assert.deepStrictEqual(errors, []);
          assert.ok(fs.existsSync(target), `The ${format} export is written`);
          assert.deepStrictEqual(progress.titles, [`Exporting sets.qvd to ${format === "csv" ? "CSV" : "Parquet"}`]);
          assert.match(progress.reports[0], first);
          // The page's buttons were busy for the export, and are free again
          const states = posted.filter((message) => message.command === "jobState").map((message) => message.busy);
          assert.deepStrictEqual(states, ["export", null]);
        });
      });
    }
  });

  test("A cancelled export leaves no file, and keeps the file it was to replace", async () => {
    const vscode = await import("vscode");
    // Cancelled as it starts to write, and, for Parquet, while it reads its field types
    for (const [format, at] of [
      ["csv", "Writing"],
      ["parquet", "Reading field types"],
      ["parquet", "Writing"],
    ]) {
      await withCopy(async (qvdPath) => {
        const dir = path.dirname(qvdPath);
        for (const existing of [false, true]) {
          const target = path.join(dir, `sets.${format}`);
          if (existing) {
            fs.writeFileSync(target, "the user's file");
          }
          await withHandler(
            qvdPath,
            { save: async () => vscode.Uri.file(target), cancelAt: (message) => message.startsWith(at) },
            async ({ send, infos, errors }) => {
              await send({ command: "exportData", format });
              assert.deepStrictEqual(errors, [], `${format} cancelled at ${at}`);
              assert.deepStrictEqual(infos, ["Export cancelled. No file was written or changed."]);
            }
          );
          if (existing) {
            assert.strictEqual(fs.readFileSync(target, "utf8"), "the user's file", "The file to replace is kept");
            fs.rmSync(target);
          }
          assert.deepStrictEqual(filesIn(dir), ["sets.qvd"], `Nothing is left of ${format} cancelled at ${at}`);
        }
      });
    }
  });

  test("A second export or profiling run in the same editor is refused while one runs", async () => {
    await withCopy(async (qvdPath) => {
      let answer;
      const asked = new Promise((resolve) => {
        answer = resolve;
      });
      let dialogOpen;
      const opened = new Promise((resolve) => {
        dialogOpen = resolve;
      });
      const save = () => {
        dialogOpen();
        return asked;
      };
      await withHandler(qvdPath, { save }, async ({ send, posted, warnings }) => {
        const first = send({ command: "exportData", format: "csv" });
        await opened;
        await send({ command: "exportData", format: "json" });
        assert.deepStrictEqual(warnings, [
          "An export of this file is still running. Wait for it to finish, or cancel it, before you start another.",
        ]);
        await send({ command: "profileFields", fieldNames: ["name"] });
        assert.deepStrictEqual(posted.filter((message) => message.command === "profilingError"), [
          {
            command: "profilingError",
            error: "An export of this file is still running. Wait for it to finish, or cancel it, before you start another.",
          },
        ]);
        // The page that loads again while the export runs is told so
        await send({ command: "jobState" });
        assert.deepStrictEqual(posted.at(-1), { command: "jobState", busy: "export" });

        // Its save dialog cancelled, the export ends, and profiling may run
        answer(undefined);
        await first;
        assert.deepStrictEqual(posted.at(-1), { command: "jobState", busy: null });
        await send({ command: "profileFields", fieldNames: ["name"] });
        const results = posted.find((message) => message.command === "profilingResults");
        assert.ok(results, "Profiling runs once the export is done");
        assert.strictEqual(results.results.fields[0].fieldName, "name");
      });
    });
  });

  test("Cancelled profiling tells the page, and frees the editor for the next job", async () => {
    await withCopy(async (qvdPath) => {
      await withHandler(
        qvdPath,
        { save: async () => undefined, cancelAt: (message) => message.startsWith("Profiling") },
        async ({ send, posted, progress }) => {
          await send({ command: "profileFields", fieldNames: ["name", "year"] });
          assert.deepStrictEqual(progress.titles, ["Profiling sets.qvd"]);
          assert.strictEqual(progress.reports[0], "Starting…");
          assert.ok(posted.some((message) => message.command === "profilingCancelled"));
          assert.ok(!posted.some((message) => message.command === "profilingResults"));
          assert.deepStrictEqual(posted.at(-1), { command: "jobState", busy: null });
        }
      );
    });
  });
});
