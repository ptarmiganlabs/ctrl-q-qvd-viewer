/**
 * Putting text from a QVD into the viewer's pages
 *
 * Field names, comments, lineage statements and cell values are whatever the file
 * says, and none of them may become part of a page. In a page's HTML they are
 * escaped; as data in a page's script they are written so that the HTML parser
 * can't end the script early; and a page's own script escapes them before it
 * writes them into the page.
 */

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
};

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML string
 */
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (m) => HTML_ESCAPES[m]);
}

/**
 * A value as a JavaScript literal, for a page's script element. JSON.stringify()
 * leaves < as it is, and the HTML parser ends a script element at the first
 * </script, even one inside a string, and after a <!-- may not end it where the
 * script does. So < is written <, which the script reads as <. U+2028 and
 * U+2029 are written escaped too: JSON allows them in a string, and JavaScript
 * before ES2019 doesn't.
 * @param {*} value - A value JSON can hold
 * @returns {string} The literal
 */
export function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * escapeHtml() for a page's own script, which writes text from the file into the
 * page as HTML: the same escapes as the extension's
 */
export const ESCAPE_HTML_JS = `
        const HTML_ESCAPES = ${scriptJson(HTML_ESCAPES)};
        function escapeHtml(text) {
            return String(text).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
        }
`;
