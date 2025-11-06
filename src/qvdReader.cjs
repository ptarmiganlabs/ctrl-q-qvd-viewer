// CommonJS wrapper for QvdReader
// This allows the module to be used with require() in tests while the implementation is ESM

/**
 * Export QvdReader class using dynamic import
 */
module.exports = (async () => {
  const { default: QvdReader } = await import("./qvdReader.mjs");
  return QvdReader;
})();
