import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "test/**/*.test.js",
  launchArgs: [
    "--disable-extensions",
    "--disable-gpu",
    "--disable-chromium-sandbox",
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ],
});
