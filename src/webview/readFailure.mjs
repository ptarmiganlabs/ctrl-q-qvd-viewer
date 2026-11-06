import { basename } from "path";

/**
 * Says why a QVD couldn't be read, in terms a VS Code user can act on: one kind
 * of failure for each cause, with its own title and advice. Only damage is
 * called corruption: a missing file, a folder, a permission problem, a lock, a
 * memory refusal, a refused path and a bad option each say what they are.
 */

/**
 * The setting that says how many rows a file opens with
 */
export const PREVIEW_ROWS_SETTING = "ctrl-q-qvd-viewer.maxPreviewRows";

// Where a failure that is the viewer's own fault is reported
const ISSUES_URL = "https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues";

const RETRY = { command: "retry", label: "Retry" };
const SHOW_LOGS = { command: "showLogs", label: "Show Logs" };
const PREVIEW_ROWS_SETTINGS = {
  command: "openSettings",
  label: "Open Settings",
  setting: PREVIEW_ROWS_SETTING,
};

/**
 * A button on the page that says why a read failed
 * @typedef {object} FailureAction
 * @property {string} command - The message the page posts: retry, showLogs or openSettings
 * @property {string} label - The button's text
 * @property {number} [rows] - For retry: the rows to read, instead of the setting's
 * @property {string} [setting] - For openSettings: the setting to open
 */

/**
 * Why a read failed, as the page says it. Plain text: the page escapes it.
 * @typedef {object} ReadFailure
 * @property {string} kind - missing, directory, permission, locked, memory, path,
 *   option, damaged or unknown
 * @property {string} title - What happened, as a heading
 * @property {string} summary - What happened, in a sentence or two
 * @property {Array<string>} advice - What to do about it, in order
 * @property {string|null} detail - The technical message, as the reader or the
 *   system gave it; null when the summary already is that message
 * @property {boolean} dataOnly - Whether the file's header may still read: its rows
 *   are what failed, so its fields and metadata can still be shown
 * @property {Array<FailureAction>} actions - The page's buttons
 */

/**
 * Say why a read failed
 * @param {object} result - The failed read, as QvdReader.read() gives it: error,
 *   errorName, errorReason, errorCode, errorOption and refusal
 * @param {{filePath?: string, platform?: string}} [options] - filePath: the file read;
 *   platform: as process.platform gives it, which decides what an EPERM means
 * @returns {ReadFailure} Why
 */
export function describeReadFailure(result, { filePath = "", platform = process.platform } = {}) {
  const name = filePath ? basename(filePath) : "the file";
  const detail = result.error ? String(result.error) : null;
  const code = result.errorCode ?? null;

  // qvdjs's own classes and reasons first: they say more than a system code
  if (result.errorReason === "memory") {
    return memoryFailure(result);
  }
  if (result.errorReason === "option") {
    return optionFailure(result.errorOption ?? null, detail);
  }
  if (result.errorName === "QvdSecurityError") {
    return pathFailure(result.errorReason, detail);
  }
  if (result.errorName === "QvdCorruptedError" || result.errorName === "QvdParseError") {
    return damagedFailure(name, detail);
  }

  switch (code) {
    case "ENOENT":
    case "ENOTDIR":
      return failure("missing", {
        title: "The file can't be found",
        summary: `There is no file at ${filePath || "this path"}.`,
        advice: [
          "It may have been moved, renamed or deleted since this tab was opened, or since VS Code " +
            "last restored its tabs. Open it from where it is now.",
          "If it is being copied or stored there right now, wait until that is done, then Retry.",
        ],
        detail,
      });
    case "EISDIR":
      return failure("directory", {
        title: "This is a folder, not a QVD file",
        summary: `${name} is a folder whose name ends in .qvd. The viewer opens QVD files only.`,
        advice: ["Open a QVD file inside it from the Explorer instead."],
        detail,
        actions: [SHOW_LOGS],
      });
    case "EBUSY":
      return lockedFailure(name, code, detail);
    case "EPERM":
      // Windows reports a file another program holds as EPERM as well as EBUSY,
      // while elsewhere EPERM is a refusal of access
      return platform === "win32"
        ? lockedFailure(name, code, detail)
        : permissionFailure(name, code, platform, detail);
    case "EACCES":
      return permissionFailure(name, code, platform, detail);
  }

  return failure("unknown", {
    title: "The file couldn't be read",
    summary: `Reading ${name} failed${code ? `, and the system said ${code}` : ""}.`,
    advice: [
      code
        ? "If the file is on a network drive or share, check that it is connected. Then Retry."
        : "Retry.",
      `If it fails again, Show Logs, and report it at ${ISSUES_URL}.`,
    ],
    detail,
  });
}

/**
 * A failure, with the buttons most kinds have
 * @param {string} kind - Its kind
 * @param {object} parts - title, summary, advice, detail, and optionally dataOnly and actions
 * @returns {ReadFailure} The failure
 */
function failure(kind, { title, summary, advice, detail, dataOnly = false, actions = [RETRY, SHOW_LOGS] }) {
  return { kind, title, summary, advice, detail, dataOnly, actions };
}

/**
 * A read refused for memory: the refusal's own message says what didn't fit
 * @param {object} result - The failed read
 * @returns {ReadFailure} The failure
 */
function memoryFailure(result) {
  const refusal = result.refusal ?? null;
  // qvdjs's row count is for the budget this read had: one that fits now
  const fitRows = refusal && refusal.fitRows > 0 && refusal.fitRows < refusal.rows ? refusal.fitRows : 0;
  const advice = [
    "Other QVD tabs hold their rows in the same memory. Close the ones you don't need, then Retry.",
  ];
  const actions = [RETRY];
  if (fitRows > 0) {
    const rows = fitRows.toLocaleString();
    advice.push(`Or open fewer rows: the first ${rows} fit in the memory left.`);
    actions.push({ command: "retry", label: `Open the first ${rows} rows`, rows: fitRows });
  }
  advice.push(`To open every file with fewer rows, lower the setting ${PREVIEW_ROWS_SETTING}.`);
  actions.push(PREVIEW_ROWS_SETTINGS, SHOW_LOGS);
  return failure("memory", {
    title:
      refusal?.forCaller
        ? "Not enough memory for this"
        : fitRows > 0
          ? "Not enough memory to show this many rows"
          : "Not enough memory to read this file",
    summary: String(result.error ?? "The read needs more memory than VS Code gives its extensions."),
    advice,
    // The summary is the refusal's message
    detail: null,
    dataOnly: true,
    actions,
  });
}

/**
 * An option the reader refused
 * @param {string|null} option - Its name
 * @param {string|null} detail - The reader's message
 * @returns {ReadFailure} The failure
 */
function optionFailure(option, detail) {
  const report = `Show Logs, and report it at ${ISSUES_URL}.`;
  // The rows a file opens with come from a setting; the reader's other options are the viewer's own
  if (option === "maxRows") {
    return failure("option", {
      title: "A setting or option isn't valid",
      summary: "The QVD reader can't use the number of rows it was asked to read.",
      advice: [
        `The rows a file opens with come from the setting ${PREVIEW_ROWS_SETTING}, a whole number ` +
          "from 100 to 100,000. Check it, in Settings or in settings.json, then Retry.",
        `If it is set right, this is a bug in the viewer. ${report}`,
      ],
      detail,
      actions: [RETRY, PREVIEW_ROWS_SETTINGS, SHOW_LOGS],
    });
  }
  return failure("option", {
    title: "A setting or option isn't valid",
    summary: option
      ? `The QVD reader can't use the value the viewer gave for its option ${option}.`
      : "The QVD reader can't use an option the viewer gave it.",
    advice: [`This is a bug in the viewer. ${report}`],
    detail,
  });
}

/**
 * A path the reader's check refused
 * @param {string|null} reason - qvdjs's reason: null_byte, outside_allowed_directory
 *   or changed_after_check
 * @param {string|null} detail - The reader's message
 * @returns {ReadFailure} The failure
 */
function pathFailure(reason, detail) {
  const summaries = {
    null_byte: "The path contains a null character, which no file's path can.",
    outside_allowed_directory:
      "The file turned out to be outside the folder it was opened in, so the viewer didn't read it. " +
      "That happens when a link in its path points somewhere else, or changes while the file opens.",
    changed_after_check:
      "The file at this path was replaced, by another file or a link, while it was being opened, " +
      "so the viewer didn't read it.",
  };
  return failure("path", {
    title: "The viewer refused this file's path",
    summary: summaries[reason] ?? "The viewer's check of the file's path refused it.",
    advice: [
      "Open the file from the folder it is really in, rather than through a link. Then Retry.",
      `If it happens again, Show Logs, and report it at ${ISSUES_URL}.`,
    ],
    detail,
  });
}

/**
 * A file the reader found damaged, or that isn't a QVD: the one kind that is corruption
 * @param {string} name - The file's name
 * @param {string|null} detail - The reader's message
 * @returns {ReadFailure} The failure
 */
function damagedFailure(name, detail) {
  return failure("damaged", {
    title: "This QVD file appears to be corrupted or damaged",
    summary: `The QVD reader found ${name} damaged, or not a QVD at all.`,
    advice: [
      "That happens when a reload stopped before it had stored the file, when another program " +
        "changed it, when a copy or download of it was cut short, or when it isn't a QVD: a CSV " +
        "or Parquet file renamed .qvd, say.",
      "If it is being copied or stored right now, wait until that is done, then Retry.",
      "Otherwise, store it again from Qlik Sense or QlikView, or copy it again from where it came from.",
    ],
    detail,
    dataOnly: true,
  });
}

/**
 * A file another program holds
 * @param {string} name - The file's name
 * @param {string} code - EBUSY, or EPERM on Windows
 * @param {string|null} detail - The system's message
 * @returns {ReadFailure} The failure
 */
function lockedFailure(name, code, detail) {
  const advice = [
    "A Qlik Sense or QlikView reload that stores this QVD holds it until the reload is done. " +
      "So can a copy, a backup or a virus scan.",
    "Wait until that is done, then Retry.",
  ];
  if (code === "EPERM") {
    // Windows says EPERM for a file it won't let this account read, too
    advice.push("If it stays this way after that, check that your Windows account may read the file.");
  }
  return failure("locked", {
    title: "The file is in use by another program",
    summary: `Another program holds ${name}, so VS Code can't read it now (${code}).`,
    advice,
    detail,
  });
}

/**
 * A file the system won't let VS Code read
 * @param {string} name - The file's name
 * @param {string} code - EACCES, or EPERM outside Windows
 * @param {string} platform - As process.platform gives it
 * @param {string|null} detail - The system's message
 * @returns {ReadFailure} The failure
 */
function permissionFailure(name, code, platform, detail) {
  const advice = ["Check the file's permissions, or ask its owner to let you read it."];
  if (platform === "darwin" && code === "EPERM") {
    // macOS's privacy protection refuses with EPERM, whatever the file's permissions
    advice.push(
      "On macOS, VS Code may also need your permission to read files in this folder: see System " +
        "Settings, Privacy & Security, Files and Folders or Full Disk Access."
    );
  }
  advice.push("Then Retry.");
  return failure("permission", {
    title: "You don't have permission to read this file",
    summary: `The system didn't let VS Code read ${name} (${code}).`,
    advice,
    detail,
  });
}
