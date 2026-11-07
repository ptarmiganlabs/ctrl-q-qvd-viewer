/**
 * Writing text into the viewer's pages as HTML, for the extension and the pages'
 * own scripts alike: one table of escapes, escapeHtml(), and html, a tag for
 * template literals that escapes every value put into them.
 *
 * What a QVD says (field names, comments, lineage, values) and what the profiler
 * says about it are text, never HTML. So the pages write their HTML as html`...`:
 * each value in it is escaped, unless html made it, or trustedHtml() vouches for
 * it, and a value that is forgotten is still escaped.
 *
 * The extension imports this file: see src/webview/templates/escaping.mjs. The
 * QVD editor's page inlines it, from dist/webview, where copyWebviewLibsPlugin in
 * esbuild.js copies it as it is, unbundled.
 */

/* exported escapeHtml, html, trustedHtml */

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
};

// The characters HTML_ESCAPES escapes, and no others
const HTML_SPECIAL = new RegExp(`[${Object.keys(HTML_ESCAPES).join("")}]`, "g");

/**
 * Escape HTML special characters
 * @param {*} text - Text to escape; anything else is escaped as String() writes it
 * @returns {string} Escaped HTML string
 */
function escapeHtml(text) {
  return String(text).replace(HTML_SPECIAL, (c) => HTML_ESCAPES[c]);
}

/**
 * HTML that html made, or that trustedHtml() vouches for: put into a page as it is
 */
class HtmlMarkup {
  /**
   * @param {string} markup - The HTML
   */
  constructor(markup) {
    this.markup = markup;
  }

  toString() {
    return this.markup;
  }
}

/**
 * HTML for html to put in as it is, rather than escape: only for HTML that
 * holds nothing from the file, such as a help icon
 * @param {string|HtmlMarkup} markup - The HTML
 * @returns {HtmlMarkup} The HTML
 */
function trustedHtml(markup) {
  return markup instanceof HtmlMarkup ? markup : new HtmlMarkup(String(markup));
}

/**
 * A value as HTML: HTML as it is, a list as its items one after another, and
 * anything else escaped
 * @param {*} value - The value
 * @returns {string} HTML
 */
function htmlOf(value) {
  if (value instanceof HtmlMarkup) {
    return value.markup;
  }
  if (Array.isArray(value)) {
    return value.map(htmlOf).join("");
  }
  return escapeHtml(value);
}

/**
 * Tag for a template literal of HTML: html`<span>${text}</span>` escapes text,
 * but puts in as it is what html made, and lists of it
 * @param {TemplateStringsArray} strings - The literal's HTML
 * @param {...*} values - What goes between it
 * @returns {HtmlMarkup} The HTML
 */
function html(strings, ...values) {
  return new HtmlMarkup(
    strings.reduce((markup, string, index) => markup + htmlOf(values[index - 1]) + string)
  );
}

if (typeof module !== "undefined") {
  module.exports = { HTML_ESCAPES, HtmlMarkup, escapeHtml, html, trustedHtml };
}
