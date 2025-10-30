import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "test/**/*.test.js",
  launchArgs: ["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
  mocha: {
    timeout: 20000,
  },
});
