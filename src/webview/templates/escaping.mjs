/**
 * Putting text from a QVD into the viewer's pages
 *
 * Field names, comments, lineage statements and cell values are whatever the file
 * says, and none of them may become part of a page. In a page's HTML they are
 * escaped, by escapeHtml() or the html tag: both come from
 * src/webview/client/html.js, which the editor page's own script inlines too. As
 * data in a page's script they are written by scriptJson(), so that the HTML
 * parser can't end the script early.
 */

import htmlEscaping from "../client/html.js";

export const { escapeHtml, html, trustedHtml } = htmlEscaping;

/**
 * A value as a JavaScript literal, for a page's script element. JSON.stringify()
 * leaves < as it is, and the HTML parser ends a script element at the first
 * </script, even one inside a string, and after a <!-- may not end it where the
 * script does. So each < is written as the escape \u003c, which the script
 * reads as <. U+2028 and U+2029 are written escaped too: JSON allows them in a
 * string, and JavaScript before ES2019 doesn't. A value JSON has no literal for,
 * such as undefined, is written undefined.
 * @param {*} value - The value
 * @returns {string} The literal
 */
export function scriptJson(value) {
  return (JSON.stringify(value) ?? "undefined")
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
