/**
 * Characters of JSON to aim for in each message of rows to the webview. VS Code
 * turns each message into one JSON string, and Node's strings stop at about
 * 537 million characters: every row of a QVD with 1.7 million rows of 20
 * fields would need about 733 million.
 */
export const BATCH_JSON_CHARS = 16 * 1024 * 1024;

/**
 * Split rows into batches of about batchJsonChars characters of JSON, to send
 * to the webview one message at a time
 * @param {Array<Object>} rows - Rows to send
 * @param {number} [batchJsonChars] - Characters of JSON to aim for in each batch
 * @returns {Array<Array<Object>>} The rows in order, in at least one batch
 */
export function splitRowsIntoBatches(rows, batchJsonChars = BATCH_JSON_CHARS) {
  // Estimate the size of a row from up to 1,000 spread through the rows, rather than serialise them all
  const step = Math.max(1, Math.floor(rows.length / 1000));
  let sampledChars = 0;
  let sampledRows = 0;
  for (let i = 0; i < rows.length; i += step) {
    sampledChars += JSON.stringify(rows[i]).length + 1;
    sampledRows++;
  }
  const charsPerRow = sampledRows > 0 ? sampledChars / sampledRows : 1;
  const rowsPerBatch = Math.max(1, Math.floor(batchJsonChars / charsPerRow));

  const batches = [];
  for (let start = 0; start < rows.length; start += rowsPerBatch) {
    batches.push(rows.slice(start, start + rowsPerBatch));
  }
  return batches.length > 0 ? batches : [[]];
}
