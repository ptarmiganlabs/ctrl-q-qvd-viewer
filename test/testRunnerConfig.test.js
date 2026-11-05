const assert = require("assert");
const path = require("path");

// VS Code fails to start when its IPC socket path, <user data dir>/<version>-main.sock,
// is longer than macOS allows. .vscode-test.mjs sets a short user data directory for that.
const MAX_SOCKET_PATH_BYTES = 103;

suite("Test Runner Configuration", () => {
  test("User data directory keeps the IPC socket path within macOS's limit", async () => {
    const { default: configs } = await import("../.vscode-test.mjs");

    for (const config of configs) {
      const arg = config.launchArgs.find((a) => a.startsWith("--user-data-dir="));
      assert.ok(arg, `${config.label}: launchArgs should set --user-data-dir`);

      // VS Code names the socket after the first four characters of its version
      const socketPath = path.join(arg.slice("--user-data-dir=".length), "1.14-main.sock");
      assert.ok(
        Buffer.byteLength(socketPath) <= MAX_SOCKET_PATH_BYTES,
        `${config.label}: ${socketPath} is ${Buffer.byteLength(socketPath)} bytes`
      );
    }
  });
});
