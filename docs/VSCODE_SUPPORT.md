# Which VS Code versions the extension supports

## The policy

The extension supports the VS Code releases of at least the last 12 months. Its minimum,
`engines.vscode` in `package.json`, is the newest VS Code release that was at least 12 months
old when the minimum last moved. The minimum moves once a quarter, so the oldest supported
release is between 12 and 15 months old.

- **Why 12 months.** VS Code on a machine that an IT department manages is often updated months
  late, and 12 months leaves room for that. A minimum that moves at all lets the extension use
  newer VS Code APIs and a newer Node.js, and keeps the tests from working around old ones.
- **Earlier, when a fix needs it.** The minimum can move up between quarters. It did in #203,
  to 1.103, because older VS Code couldn't open QVD files on Windows 11 24H2. The next quarterly
  move then waits until the window passes it.
- **Never down.** The script refuses to lower the minimum.
- **Users of an older VS Code.** The Marketplace offers each VS Code the newest version of the
  extension whose `engines.vscode` it meets. So an older VS Code keeps the last version that
  supports it, without the fixes that come after.

## What follows the minimum

| What | Where | Moved by |
| --- | --- | --- |
| The minimum | `engines.vscode` in `package.json` | the script |
| Types of the VS Code API, at exactly the minimum: vsce refuses to package with newer ones | `@types/vscode` in `package.json` and the lockfile | the script |
| Types of the Node.js the minimum runs extensions on | `@types/node`, as `~x.y.0`, and the Dependabot rule that holds it below x.y+1 | the script |
| The version the README names | Requirements in `README.md` | the script |
| The VS Code the tests run in, besides stable | `.vscode-test.mjs` reads `engines.vscode` | itself |
| The CI cache of that VS Code | `pr-validation.yaml` reads `engines.vscode` | itself |
| Anything else that names a version | `git grep` | by hand |

## The quarterly move

`.github/workflows/vscode-minimum.yaml` runs at 06:00 UTC on 1 January, April, July and
October. It runs `node scripts/vscode-minimum.mjs`, which takes the stable releases and their
dates from VS Code's update service. When the window has passed the minimum, the workflow opens
an issue, "Raise the minimum VS Code version to x.y", or updates the one still open. The issue
gives the versions, their dates and their Node.js, and the steps:

```bash
node scripts/vscode-minimum.mjs --apply
npm test
```

Then `git grep` for the old version, commit as `chore: require VS Code x.y or later`, and open
a pull request, whose Windows and Linux runs test the new minimum.

The workflow opens an issue, not the pull request. A pull request opened with a workflow's own
token starts no other workflow, so its tests wouldn't run. And moving the minimum leaves the
users of older VS Code behind, which someone should see before it happens.

To check without waiting for the quarter, run the script locally, or start the workflow:

```bash
gh workflow run vscode-minimum.yaml --repo ptarmiganlabs/ctrl-q-qvd-viewer
```

`--apply 1.107.0` moves the minimum to a release of your choosing, for an early move.

## Where the script's facts come from

- The stable releases and their dates: `update.code.visualstudio.com/api/releases/stable` and
  `/api/versions/<version>/linux-x64/stable`.
- The Electron a release is built on: `target` in the `.npmrc` of `microsoft/vscode` at the
  release's tag.
- The Node.js and libuv in that Electron: `releases.electronjs.org/releases.json`.

## Changing the policy

The window is `SUPPORT_MONTHS` in `scripts/vscode-minimum.mjs`. Change it there, in the README's
Requirements and on this page together. The schedule is the `cron` in the workflow.
