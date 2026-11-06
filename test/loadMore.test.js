const assert = require("assert");

// Import the row-count helpers
let loadMore;

suite("Load More Test Suite", () => {
  // Load the module before running tests
  suiteSetup(async () => {
    // Import the ESM module
    loadMore = await import("../src/webview/loadMore.mjs");
  });

  test("Load More doubles the rows loaded, up to its cap", () => {
    assert.strictEqual(loadMore.getLoadMoreRowCount(5000), 10000);
    assert.strictEqual(loadMore.getLoadMoreRowCount(80000), loadMore.LOAD_MORE_MAX_ROWS);
  });

  test("maxPreviewRows is held to the range package.json gives it", () => {
    assert.strictEqual(loadMore.previewRowsFromSetting(5000), 5000);
    assert.strictEqual(loadMore.previewRowsFromSetting(250.4), 250);
    // 0 would read every row on open
    assert.strictEqual(loadMore.previewRowsFromSetting(0), 100);
    assert.strictEqual(loadMore.previewRowsFromSetting(-5), 100);
    assert.strictEqual(loadMore.previewRowsFromSetting(2000000), loadMore.LOAD_MORE_MAX_ROWS);
  });

  test("The rows to open with come from the setting as it is now", () => {
    // The VS Code API, with maxPreviewRows set to a value
    const withSetting = (value) => ({
      workspace: {
        getConfiguration: (section) => ({
          get: (key) => (section === "ctrl-q-qvd-viewer" && key === "maxPreviewRows" ? value : undefined),
        }),
      },
    });
    assert.strictEqual(loadMore.previewRows(withSetting(300)), 300);
    assert.strictEqual(loadMore.previewRows(withSetting(-5)), 100);
    assert.strictEqual(loadMore.previewRows(withSetting(undefined)), 5000);
    assert.strictEqual(loadMore.PREVIEW_ROWS_SETTING, "ctrl-q-qvd-viewer.maxPreviewRows");
  });

  test("A maxPreviewRows that isn't a number falls back to the default", () => {
    // null would reach qvdjs as "every row"
    for (const value of [null, undefined, "5000", NaN, Infinity, {}]) {
      assert.strictEqual(loadMore.previewRowsFromSetting(value), 5000, String(value));
    }
  });
});
