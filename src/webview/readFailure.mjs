import { basename } from "path";
import { PAGE_SIZE_SETTING } from "./pageSize.mjs";

/**
 * Says why a QVD couldn't be read, in terms a VS Code user can act on: one kind
 * of failure for each cause, with its own title and advice. Only damage is
 * called corruption: a missing file, a folder, a permission problem, a lock, a
 * memory refusal, a refused path and a bad option each say what they are, and
 * so does a failure of the viewer's own.
 */

// Where a failure that is the viewer's own fault is reported
const ISSUES_URL = "https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues";

const RETRY = { command: "retry", label: "Retry" };
const SHOW_LOGS = { command: "showLogs", label: "Show Logs" };
const PAGE_SIZE_SETTINGS = {
  command: "openSettings",
  label: "Open Settings",
  setting: PAGE_SIZE_SETTING,
};

/**
 * A button on the page that says why a read failed
 * @typedef {object} FailureAction
 * @property {string} command - The message the page posts: retry, showLogs or openSettings
 * @property {string} label - The button's text
 * @property {string} [setting] - For openSettings: the setting to open
 */

/**
 * Why a read failed, as the page says it. Plain text: the page escapes it.
 * @typedef {object} ReadFailure
 * @property {string} kind - missing, directory, permission, locked, memory, path,
 *   option, damaged or unknown for a read; viewer for the viewer's own failure
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
 * @param {{filePath?: string, platform?: string, headerRead?: boolean}} [options] -
 *   filePath: the file read; platform: as process.platform gives it, which decides
 *   what an EPERM means; headerRead: the file's header has been read since, so it is
 *   a QVD, whatever is wrong with its rows
 * @returns {ReadFailure} Why
 */
export function describeReadFailure(
  result,
  { filePath = "", platform = process.platform, headerRead = false } = {}
) {
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
    return damagedFailure(name, detail, headerRead);
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
 * Say why the viewer couldn't show a file: its own failure, such as a page it
 * couldn't build, not the file's. Reads never throw, so whatever is thrown while
 * a file is shown is the viewer's, and its system code, if it has one, is about
 * the viewer's own files, not the QVD.
 * @param {Error} error - What was thrown
 * @param {{filePath?: string}} [options] - filePath: the file being shown
 * @returns {ReadFailure} Why
 */
export function describeViewerFailure(error, { filePath = "" } = {}) {
  const name = filePath ? basename(filePath) : "the file";
  return failure("viewer", {
    title: "The viewer couldn't show this file",
    summary: `The viewer failed while showing ${name}. The file itself may well be fine.`,
    advice: ["Retry.", `If it fails again, Show Logs, and report it at ${ISSUES_URL}.`],
    detail: error?.message ?? String(error),
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
  return failure("memory", {
    title: refusal?.forCaller ? "Not enough memory for this" : "Not enough memory to show these rows",
    summary: String(result.error ?? "The read needs more memory than VS Code gives its extensions."),
    advice: [
      "Other QVD tabs, and exports and profiling running now, use the same memory. Close the tabs " +
        "you don't need, or wait for the export to finish, then Retry.",
      `Or show fewer rows at a time: pick a smaller page size below the grid, or lower the setting ${PAGE_SIZE_SETTING}.`,
    ],
    // The summary is the refusal's message
    detail: null,
    dataOnly: true,
    actions: [RETRY, PAGE_SIZE_SETTINGS, SHOW_LOGS],
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
  // A page's rows come from a setting; the reader's other options are the viewer's own
  if (option === "limit") {
    return failure("option", {
      title: "A setting or option isn't valid",
      summary: "The QVD reader can't use the number of rows a page was asked to show.",
      advice: [
        `A page's rows come from the setting ${PAGE_SIZE_SETTING}, a whole number ` +
          "from 10 to 1,000. Check it, in Settings or in settings.json, then Retry.",
        `If it is set right, this is a bug in the viewer. ${report}`,
      ],
      detail,
      actions: [RETRY, PAGE_SIZE_SETTINGS, SHOW_LOGS],
    });
  }
  // No setting gives these, so a retry would fail the same way
  return failure("option", {
    title: "A setting or option isn't valid",
    summary: option
      ? `The QVD reader can't use the value the viewer gave for its option ${option}.`
      : "The QVD reader can't use an option the viewer gave it.",
    advice: [`This is a bug in the viewer. ${report}`],
    detail,
    actions: [SHOW_LOGS],
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
 * @param {boolean} headerRead - Whether its header has been read since: then it is a
 *   QVD, and only its rows are damaged
 * @returns {ReadFailure} The failure
 */
function damagedFailure(name, detail, headerRead) {
  const causes =
    "That happens when a reload stopped before it had stored the file, when another program " +
    "changed it, or when a copy or download of it was cut short";
  return failure("damaged", {
    title: "This QVD file appears to be corrupted or damaged",
    summary: headerRead
      ? `The QVD reader could read the header of ${name}, but its data is damaged.`
      : `The QVD reader found ${name} damaged, or not a QVD at all.`,
    advice: [
      headerRead
        ? `${causes}.`
        : `${causes}, or when it isn't a QVD: a CSV or Parquet file renamed .qvd, say.`,
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
    // Windows says EPERM for a file it won't let this account read, too, so the
    // page says both
    advice.push("If it stays this way after that, check that your Windows account may read the file.");
    return failure("locked", {
      title: "Windows won't let VS Code read this file",
      summary:
        `Windows refused to let VS Code read ${name} (${code}). Most often another program ` +
        "holds it. It can also mean that your account may not read it.",
      advice,
      detail,
    });
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
