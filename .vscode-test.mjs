import { defineConfig } from "@vscode/test-cli";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Get the minimum supported VS Code version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "package.json"), "utf-8")
);
const minVersion = packageJson.engines.vscode.replace(/^\^/, "");

export default defineConfig([
  // Test against minimum supported version
  {
    label: "minimum",
    version: minVersion,
    files: "test/**/*.test.js",
    launchArgs: ["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
    mocha: {
      timeout: 20000,
    },
  },
  // Test against latest stable version
  {
    label: "stable",
    version: "stable",
    files: "test/**/*.test.js",
    launchArgs: ["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
    mocha: {
      timeout: 20000,
    },
  },
]);
