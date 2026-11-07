// Keeps the minimum VS Code version, engines.vscode in package.json, at the support window:
// the newest VS Code release that is at least SUPPORT_MONTHS months old. Once a quarter,
// .github/workflows/vscode-minimum.yaml runs it to see whether the minimum is due to move.
// docs/VSCODE_SUPPORT.md describes the policy and the move.
//
//   node scripts/vscode-minimum.mjs                  Says what the minimum is and what the window asks for
//   node scripts/vscode-minimum.mjs --apply          Moves the minimum there, and what follows it
//   node scripts/vscode-minimum.mjs --apply 1.105.0  Moves it to that release instead
//
// Without --apply, it also writes what it found to $GITHUB_OUTPUT when that is set, and the
// body of an issue asking for the move to the file after --issue-body.

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// How old the oldest supported VS Code release may be, at least. Change it here, in the
// README's Requirements and in docs/VSCODE_SUPPORT.md together.
const SUPPORT_MONTHS = 12;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const updateApi = "https://update.code.visualstudio.com/api";

async function fetchOk(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status} ${response.statusText}`);
  }
  return response;
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) {
      return pa[i] - pb[i];
    }
  }
  return 0;
}

/** 1.105.0 as 1.105, the way the README names it */
function shortVersion(version) {
  return version.split(".").slice(0, 2).join(".");
}

function day(date) {
  return date.toISOString().slice(0, 10);
}

function monthOf(date) {
  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** When a stable VS Code release was published, from VS Code's update service */
async function releaseDate(version) {
  const release = await (await fetchOk(`${updateApi}/versions/${version}/linux-x64/stable`)).json();
  return new Date(release.timestamp);
}

/**
 * The Electron a VS Code release is built on, and the Node.js and libuv in it, which its
 * extensions run on
 */
async function runtimeOf(version) {
  const npmrc = await (await fetchOk(`https://raw.githubusercontent.com/microsoft/vscode/${version}/.npmrc`)).text();
  const electron = /^target="([^"]+)"/m.exec(npmrc)?.[1];
  if (!electron) {
    throw new Error(`VS Code ${version}'s .npmrc names no Electron version`);
  }
  const releases = await (await fetchOk("https://releases.electronjs.org/releases.json")).json();
  const release = releases.find((candidate) => candidate.version === electron);
  if (!release) {
    throw new Error(`releases.electronjs.org doesn't list Electron ${electron}, which VS Code ${version} uses`);
  }
  return { electron, node: release.node, uv: release.uv };
}

function readPackageJson() {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
}

function writePackageJson(pkg) {
  writeFileSync(join(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
}

function currentMinimum() {
  return readPackageJson().engines.vscode.replace(/^\^/, "");
}

/**
 * The newest VS Code release (x.y.0) that is at least SUPPORT_MONTHS old at `now`. Never one
 * below `current`: the minimum doesn't move down, and one raised early for a fix stays put
 * until the window passes it.
 */
async function windowMinimum(current, now) {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - SUPPORT_MONTHS);
  const versions = await (await fetchOk(`${updateApi}/releases/stable`)).json();
  const candidates = versions
    .filter((version) => /^\d+\.\d+\.0$/.test(version) && compareVersions(version, current) >= 0)
    .sort((a, b) => compareVersions(b, a));
  const dates = await Promise.all(candidates.map(releaseDate));
  const index = dates.findIndex((date) => date <= cutoff);
  if (index === -1) {
    return { version: current, date: await releaseDate(current), cutoff };
  }
  return { version: candidates[index], date: dates[index], cutoff };
}

/** Replaces each pattern in a file, and fails if one no longer matches, so nothing drifts silently */
function replaceIn(file, replacements) {
  const filePath = join(root, file);
  let text = readFileSync(filePath, "utf8");
  for (const [pattern, replacement] of replacements) {
    if (!pattern.test(text)) {
      throw new Error(`${file} no longer has ${pattern}, so it can't be updated. Update it by hand, and this script with it`);
    }
    text = text.replace(pattern, replacement);
  }
  writeFileSync(filePath, text);
}

function npm(...args) {
  // npm is npm.cmd on Windows, which runs only through a shell. No argument here holds a
  // character cmd.exe treats specially: the ranges with ^ are written to package.json directly.
  execFileSync("npm", args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
}

async function apply(requested) {
  const current = currentMinimum();
  const version = requested ?? (await windowMinimum(current, new Date())).version;
  if (!/^\d+\.\d+\.0$/.test(version)) {
    throw new Error(`The minimum has to be a VS Code release such as 1.105.0, not ${version}`);
  }
  if (version === current) {
    console.log(`The minimum is already VS Code ${current}. Nothing to change.`);
    return;
  }
  if (compareVersions(version, current) < 0) {
    throw new Error(`VS Code ${version} is older than the minimum, ${current}. The minimum doesn't move down`);
  }
  const [date, runtime] = await Promise.all([releaseDate(version), runtimeOf(version)]);
  const [nodeMajor, nodeMinor] = runtime.node.split(".").map(Number);
  const nodeRange = `~${nodeMajor}.${nodeMinor}.0`;

  const pkg = readPackageJson();
  pkg.engines.vscode = `^${version}`;
  writePackageJson(pkg);
  // Installed at exactly the minimum. With ^ alone npm takes the newest @types/vscode, and vsce
  // refuses to package an extension whose @types/vscode is newer than its engines.vscode.
  npm("install", "--save-dev", "--no-audit", "--no-fund", `@types/vscode@${version}`, `@types/node@${nodeRange}`);
  const installed = readPackageJson();
  installed.devDependencies["@types/vscode"] = `^${version}`;
  installed.devDependencies["@types/node"] = nodeRange;
  writePackageJson(installed);
  npm("install", "--no-audit", "--no-fund");

  replaceIn(".github/dependabot.yml", [
    [/(# )\d+\.\d+( for VS Code )\d+\.\d+/, `$1${nodeMajor}.${nodeMinor}$2${shortVersion(version)}`],
    [/(dependency-name: "@types\/node"\s+versions: \[">=)[\d.]+("\])/, `$1${nodeMajor}.${nodeMinor + 1}.0$2`],
  ]);
  replaceIn("README.md", [
    [
      /\*\*Visual Studio Code \d+\.\d+ or later\*\*, released in [A-Z][a-z]+ \d{4}\./,
      `**Visual Studio Code ${shortVersion(version)} or later**, released in ${monthOf(date)}.`,
    ],
  ]);

  console.log(`
Moved the minimum from VS Code ${current} to ${version}, released ${day(date)}.
It runs extensions on Electron ${runtime.electron}, Node.js ${runtime.node} and libuv ${runtime.uv}.

Changed: engines.vscode, @types/vscode and @types/node in package.json and the lockfile,
the Dependabot rule that holds @types/node, and the README's Requirements.

Still to do:
- npm test, which runs the tests in VS Code ${version} and in stable.
- git grep -n "${shortVersion(current).replace(".", "\\.")}", for anything else that names the old minimum.
- Commit as "chore: require VS Code ${shortVersion(version)} or later", and open a pull request.
  Its Windows and Linux runs test the new minimum too.`);
}

async function check(issueBodyFile) {
  const current = currentMinimum();
  const [currentDate, target] = await Promise.all([releaseDate(current), windowMinimum(current, new Date())]);
  const due = compareVersions(target.version, current) > 0;

  console.log(`The minimum is VS Code ${current}, released ${day(currentDate)}.`);
  console.log(
    `The window (${SUPPORT_MONTHS} months) asks for the newest release from ${day(target.cutoff)} or earlier: VS Code ${target.version}, released ${day(target.date)}.`
  );

  const outputs = { due: String(due), current, target: target.version, target_date: day(target.date) };
  if (due) {
    const runtime = await runtimeOf(target.version);
    console.log(`It runs extensions on Electron ${runtime.electron}, Node.js ${runtime.node} and libuv ${runtime.uv}.`);
    console.log(`The minimum is due to move: node scripts/vscode-minimum.mjs --apply`);
    if (issueBodyFile) {
      writeFileSync(issueBodyFile, issueBody(current, currentDate, target, runtime));
    }
  } else {
    console.log("The minimum is where the window wants it.");
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(outputs)
        .map(([key, value]) => `${key}=${value}\n`)
        .join("")
    );
  }
}

function issueBody(current, currentDate, target, runtime) {
  const old = shortVersion(current);
  const next = shortVersion(target.version);
  const repository = process.env.GITHUB_REPOSITORY ?? "ptarmiganlabs/ctrl-q-qvd-viewer";
  return `The extension supports the VS Code releases of at least the last ${SUPPORT_MONTHS} months. Once a quarter its minimum moves up to the newest release that is at least ${SUPPORT_MONTHS} months old. This quarter that is VS Code ${next}.

| | VS Code | Released | Electron | Node.js |
| --- | --- | --- | --- | --- |
| Minimum now (\`engines.vscode\`) | ${current} | ${day(currentDate)} | | |
| The window's minimum | ${target.version} | ${day(target.date)} | ${runtime.electron} | ${runtime.node} |

To move it, on a branch from main:

\`\`\`bash
node scripts/vscode-minimum.mjs --apply
npm test
\`\`\`

The script sets \`engines.vscode\`, \`@types/vscode\` and \`@types/node\`, the Dependabot rule that holds \`@types/node\` to the minimum's Node.js, and the README's Requirements. Then:

- Look for anything else that names VS Code ${old}: \`git grep -n "${old.replace(".", "\\.")}"\`.
- Commit as \`chore: require VS Code ${next} or later\`, and open a pull request. Its Windows and Linux runs test VS Code ${target.version} and stable.

Users of an older VS Code keep the last version of the extension that supports theirs. The Marketplace offers it to them on its own.

The policy and how to change it are in [docs/VSCODE_SUPPORT.md](https://github.com/${repository}/blob/main/docs/VSCODE_SUPPORT.md). This issue was opened by \`.github/workflows/vscode-minimum.yaml\`.
`;
}

const args = process.argv.slice(2);
try {
  if (args[0] === "--apply") {
    await apply(args[1]);
  } else if (args.length === 0 || (args[0] === "--issue-body" && args[1])) {
    await check(args[1]);
  } else {
    console.error("Usage: node scripts/vscode-minimum.mjs [--apply [x.y.0] | --issue-body <file>]");
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
