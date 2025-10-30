import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "test/**/*.test.js",
  launchArgs: [
    "--disable-extensions",
    "--disable-gpu",
    "--disable-chromium-sandbox",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-setuid-sandbox",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=TranslateUI",
    "--disable-ipc-flooding-protection",
  ],
  mocha: {
    timeout: 20000,
  },
});
