import { defineConfig } from "@vscode/test-cli";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Get the minimum supported VS Code version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "package.json"), "utf-8")
);
const minVersion = packageJson.engines.vscode.replace(/^\^/, "");

// VS Code creates its IPC socket in the user data directory, and macOS limits a
// socket path to 103 characters. The default, .vscode-test/user-data in this
// checkout, goes past that in a deep checkout such as a Claude Code worktree,
// and VS Code 1.101 and later then fail to start. Use a short directory per
// checkout in the system temp directory instead.
const userDataDir = join(
  tmpdir(),
  `vscode-test-${createHash("sha256").update(__dirname).digest("hex").slice(0, 8)}`
);
const launchArgs = [
  "--disable-gpu",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  `--user-data-dir=${userDataDir}`,
];

export default defineConfig([
  // Test against minimum supported version
  {
    label: "minimum",
    version: minVersion,
    files: "test/**/*.test.js",
    launchArgs,
    mocha: {
      timeout: 20000,
    },
  },
  // Test against latest stable version
  {
    label: "stable",
    version: "stable",
    files: "test/**/*.test.js",
    launchArgs,
    mocha: {
      timeout: 20000,
    },
  },
]);
