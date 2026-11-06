const assert = require("assert");

// Import the message handler and the exporters
let setupMessageHandler;
let DataExporter;

suite("Export Read Test Suite", () => {
  // Load the modules before running tests
  suiteSetup(async () => {
    // Import the ESM modules
    ({ setupMessageHandler } = await import("../src/webview/messageHandler.mjs"));
    ({ default: DataExporter } = await import("../src/exporters/index.mjs"));
  });

  test("An export reads dates as dates for a format with date types, and as text for the others", async () => {
    let onMessage;
    const panel = { webview: { onDidReceiveMessage: (listener) => (onMessage = listener) } };
    // A reader that notes how an export asks it to read, then gives the read up, as
    // a closed editor does, so that no dialog opens
    const asked = {};
    let format;
    const reader = {
      read: async (filePath, maxRows, options) => {
        asked[format] = options.dates;
        return { errorReason: "aborted", release: () => {} };
      },
    };
    setupMessageHandler(panel, "dates.qvd", reader, {}, async () => {}, 25);

    // PostgreSQL and Qlik inline ask for a row count before they read
    const formats = DataExporter.getExportFormats()
      .map(({ name }) => name)
      .filter((name) => name !== "postgres" && name !== "qlik");
    for (format of formats) {
      await onMessage({ command: "exportData", format });
    }

    assert.deepStrictEqual(asked, {
      arrow: true,
      avro: true,
      csv: false,
      excel: true,
      json: false,
      parquet: true,
      sqlite: true,
      xml: false,
      yaml: false,
    });
  });
});
