/**
 * What string analysis counts in a text field, a distinct value at a time
 *
 * Each distinct value is taken once, the first time a row holds it, with how
 * many rows hold it, so that a field of millions of rows and few values costs
 * few values' work. Taking them in the order their first rows come in gives the
 * same counts, in the same order, as taking every row in turn: a length, prefix
 * or country is first counted where its first row is. The samples of each format
 * are its first matching rows, repeats included, and are taken row by row.
 */

// A high surrogate followed by a low one: one code point outside the Basic Multilingual Plane
const SURROGATE_PAIR = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;

/**
 * Count a string's characters as Qlik's Len() does: by Unicode code point.
 * JavaScript's length counts UTF-16 code units, so it counts an emoji twice.
 * @param {string} value - String to measure
 * @returns {number} Number of code points
 */
export function characterCount(value) {
  const pairs = value.match(SURROGATE_PAIR);
  return value.length - (pairs ? pairs.length : 0);
}

// Regex patterns for format detection. Each runs in time linear in the value's
// length: a field's values are whatever the QVD holds, and a pattern that
// backtracks can take seconds, or hours, over one long value.
const PATTERNS = {
  // A local part, @, and a domain with a dot that is neither its first nor its
  // last character. The domain's first character is any; then it runs up to its
  // first dot after that, so that there is one way to match and nothing to try again.
  email: /^[^\s@]+@[^\s@][^\s@.]*\.[^\s@]+$/,
  // An optional http(s)://, a host with a dot after its first character that is
  // followed by two letters or dots, and then letters, digits, _, /, space, . and -.
  // The host runs up to the first such dot: each other character is a digit, letter
  // or -, or a dot that isn't followed by two letters or dots. It matches what
  // /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i did, whose
  // nested * made it exponential: an address and 30 spaces took a minute.
  url: /^(?:https?:\/\/)?[\da-z.-](?:[\da-z-]|\.(?![a-z.]{2}))*\.[a-z.]{2}[/\w .-]*$/i,

  // Phone patterns for different countries
  phone: {
    US: /^(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/,
    UK: /^(\+44[-.\s]?)?(\d{4}[-.\s]?\d{6}|\d{5}[-.\s]?\d{5})$/,
    DE: /^(\+49[-.\s]?\d{2,4}[-.\s]?\d{5,8}|0\d{2,4}[-.\s]?\d{5,8})$/,
    FR: /^(\+33[-.\s]?\d{1}[-.\s]?\d{2}[-.\s]?\d{2}[-.\s]?\d{2}[-.\s]?\d{2}|0\d{1}[-.\s]?\d{2}[-.\s]?\d{2}[-.\s]?\d{2}[-.\s]?\d{2})$/,
    NL: /^(\+31[-.\s]?\d{1,2}[-.\s]?\d{8}|0\d{1}[-.\s]?\d{8})$/,
    BE: /^(\+32[-.\s]?\d{1,2}[-.\s]?\d{6,7}|0\d{1,2}[-.\s]?\d{6,7})$/,
    SE: /^(\+46[-.\s]?\d{2,3}[-.\s]?\d{6,7}|0\d{2,3}[-.\s]?\d{6,7})$/,
    DK: /^(\+45[-.\s]?)?\d{8}$/,
    FI: /^(\+358[-.\s]?\d{1,2}[-.\s]?\d{6,8}|0\d{1,2}[-.\s]?\d{6,8})$/,
    generic: /^\+\d{1,3}[-.\s]?\d{4,14}$/, // Generic country code format
  },

  // SSN patterns for different countries
  ssn: {
    US: /^\d{3}[-]?\d{2}[-]?\d{4}$/,
    UK: /^[A-Z]{2}\d{6}[A-Z]$/,
    DE: /^\d{2}\d{6}[A-Z]\d{3}$/,
    FR: /^[12]\d{2}(0[1-9]|1[0-2])\d{2}\d{3}\d{3}\d{2}$/,
    NL: /^\d{9}$/,
    BE: /^\d{2}\.\d{2}\.\d{2}-\d{3}\.\d{2}$/,
    SE: /^\d{6}[-]?\d{4}$/,
    DK: /^\d{6}[-]?\d{4}$/,
    FI: /^\d{6}[-+A]?\d{3}[0-9A-Z]$/,
  },

  // Date patterns
  dateString: {
    "ISO 8601": /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/,
    "US format": /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
    "EU format": /^\d{1,2}\.\d{1,2}\.\d{2,4}$/,
    "Long format": /^\w{3,9}\s+\d{1,2},?\s+\d{4}$/,
  },
};

const PHONE_PATTERNS = Object.entries(PATTERNS.phone);
const SSN_PATTERNS = Object.entries(PATTERNS.ssn);
const DATE_PATTERNS = Object.entries(PATTERNS.dateString);

/**
 * The formats whose samples are kept, as the bits of a value's flags, in the
 * order detectFormats() reports them
 */
const FORMATS = ["email", "phone", "ssn", "url", "dateString"];
const EMAIL = 1 << FORMATS.indexOf("email");
const PHONE = 1 << FORMATS.indexOf("phone");
const SSN = 1 << FORMATS.indexOf("ssn");
const URL = 1 << FORMATS.indexOf("url");
const DATE_STRING = 1 << FORMATS.indexOf("dateString");
const ALL_FORMATS = (1 << FORMATS.length) - 1;

// Samples kept per format
const SAMPLES = 5;

// Which UTF-16 code units /\s/ matches, as this JavaScript engine's own regular
// expressions say: a character's whitespace is looked up rather than tested. Made the
// first time a text is analyzed, not when the extension starts
let whitespace = null;

/**
 * The whitespace table, made the first time it is asked for
 * @returns {Uint8Array} 1 for each code unit /\s/ matches, by code unit
 */
function whitespaceTable() {
  if (!whitespace) {
    whitespace = new Uint8Array(65536);
    for (let unit = 0; unit < 65536; unit++) {
      whitespace[unit] = /\s/.test(String.fromCharCode(unit)) ? 1 : 0;
    }
  }
  return whitespace;
}

/**
 * Most distinct prefixes, or suffixes, counted at once. A field of millions of
 * distinct values has millions of prefixes, too many to count each. Past this,
 * the least frequent are let go, keeping PREFIXES_KEPT, and the counts are
 * estimates: a prefix let go and seen again starts again from that row.
 */
export const PREFIXES_COUNTED = 500000;
export const PREFIXES_KEPT = 250000;

/**
 * Add to a count of prefixes or suffixes, letting the least frequent go past PREFIXES_COUNTED
 * @param {Map<string, number>} counts - The counts, changed in place
 * @param {string} key - The prefix or suffix
 * @param {number} count - Rows to add
 * @returns {boolean} True if some were let go
 */
function addAffix(counts, key, count) {
  counts.set(key, (counts.get(key) || 0) + count);
  if (counts.size <= PREFIXES_COUNTED) {
    return false;
  }
  // The least frequent go, as few counts as let PREFIXES_KEPT stay: found from how
  // many have each count up to 64, which is where most of them are
  const excess = counts.size - PREFIXES_KEPT;
  const tally = new Float64Array(66);
  for (const seen of counts.values()) {
    tally[Math.min(seen, 65)]++;
  }
  let least = 0;
  let going = 0;
  while (least < 64 && going < excess) {
    least++;
    going += tally[least];
  }
  if (going >= excess) {
    for (const [affix, seen] of counts) {
      if (seen <= least) {
        counts.delete(affix);
      }
    }
    return true;
  }
  // So many are that frequent that their counts are sorted
  const sorted = Float64Array.from(counts.values()).sort();
  const kept = sorted[sorted.length - PREFIXES_KEPT];
  let gone = 0;
  for (const [affix, seen] of counts) {
    if (seen < kept) {
      counts.delete(affix);
      gone++;
    }
  }
  // Where most share the count kept, those go too, or this would run on each new one
  if (gone === 0) {
    for (const [affix, seen] of counts) {
      if (seen <= kept) {
        counts.delete(affix);
      }
    }
  }
  return true;
}

/**
 * The most frequent prefixes or suffixes seen at least twice, as detectPrefixes() and
 * detectSuffixes() report them
 * @param {Map<string, number>} counts - Each prefix's or suffix's rows
 * @param {string} key - "prefix" or "suffix"
 * @param {number} total - Rows with a value
 * @returns {Array<Object>} Up to 10, most frequent first
 */
function commonAffixes(counts, key, total) {
  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .map(([affix, count]) => ({
      [key]: affix,
      count,
      percentage: ((count / total) * 100).toFixed(1),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * A percentage to one decimal, as a number
 * @param {number} part - The part
 * @param {number} whole - The whole
 * @returns {number} The percentage
 */
function percent1(part, whole) {
  return parseFloat(((part / whole) * 100).toFixed(1));
}

/**
 * String analysis of a field, taken a distinct value at a time
 */
export class StringStats {
  #values = 0;
  // Length statistics
  #minLength = Infinity;
  #maxLength = 0;
  #lengthSum = 0;
  #lengthFreq = new Map();
  // Patterns
  #prefixes = new Map();
  #suffixes = new Map();
  #estimated = false;
  // Character composition
  #totalChars = 0;
  #alphanumeric = 0;
  #alphabetic = 0;
  #numeric = 0;
  #special = 0;
  #whitespace = 0;
  #leadingWhitespace = 0;
  #trailingWhitespace = 0;
  #nonAscii = 0;
  // Case
  #uppercase = 0;
  #lowercase = 0;
  #mixedCase = 0;
  #titleCase = 0;
  // Formats
  #email = 0;
  #url = 0;
  #phone = 0;
  #phoneCountries = new Map();
  #ssn = 0;
  #ssnCountries = new Map();
  #dateString = 0;
  #datePatterns = new Map();
  #samples = { email: [], phone: [], ssn: [], url: [], dateString: [] };
  // Formats still short of their samples
  #open = ALL_FORMATS;

  /**
   * Take a distinct value: its text, and the rows that hold it
   * @param {string} value - The value as text
   * @param {number} count - Rows holding it
   * @returns {number} The formats it matches, as bits, for its rows' samples
   */
  add(value, count) {
    this.#values += count;
    this.#addLength(value, count);
    this.#addAffixes(value, count);
    this.#addCharacters(value, count);
    this.#addCase(value, count);
    return this.#addFormats(value.trim(), count);
  }

  /**
   * Whether a row's value can still be a sample of a format
   * @param {number} formats - The formats the value matches, as add() returned them
   * @returns {boolean} True if a format it matches is still short of samples
   */
  wantsSample(formats) {
    return (formats & this.#open) !== 0;
  }

  /**
   * Take a row's value as a sample of each format it matches still short of samples
   * @param {number} formats - The formats it matches, as add() returned them
   * @param {string} trimmed - The value, trimmed
   */
  sample(formats, trimmed) {
    for (let bit = 0; bit < FORMATS.length; bit++) {
      const flag = 1 << bit;
      if (formats & flag & this.#open) {
        const samples = this.#samples[FORMATS[bit]];
        samples.push(trimmed);
        if (samples.length >= SAMPLES) {
          this.#open &= ~flag;
        }
      }
    }
  }

  /**
   * Whether any format is still short of samples
   * @returns {boolean} True if one is
   */
  get sampling() {
    return this.#open !== 0;
  }

  #addLength(value, count) {
    const len = characterCount(value);
    this.#minLength = Math.min(this.#minLength, len);
    this.#maxLength = Math.max(this.#maxLength, len);
    this.#lengthSum += len * count;
    this.#lengthFreq.set(len, (this.#lengthFreq.get(len) || 0) + count);
  }

  #addAffixes(value, count) {
    if (value.length < 2) {
      return;
    }
    // From two characters to ten, or the whole value
    const longest = Math.min(value.length, 10);
    for (let len = 2; len <= longest; len++) {
      if (addAffix(this.#prefixes, value.substring(0, len), count)) {
        this.#estimated = true;
      }
    }
    for (let len = 2; len <= longest; len++) {
      if (addAffix(this.#suffixes, value.substring(value.length - len), count)) {
        this.#estimated = true;
      }
    }
  }

  #addCharacters(value, count) {
    this.#totalChars += value.length * count;
    if (value.length > 0 && /^\s/.test(value)) {
      this.#leadingWhitespace += count;
    }
    if (value.length > 0 && /\s$/.test(value)) {
      this.#trailingWhitespace += count;
    }
    // Each character, as for...of takes them: a surrogate pair is one, a lone surrogate
    // one too. Only ASCII letters and digits are alphanumeric, and every character
    // outside the Basic Multilingual Plane is special, so a pair's first unit says it
    const space = whitespaceTable();
    for (let i = 0; i < value.length; i++) {
      const unit = value.charCodeAt(i);
      if (unit >= 48 && unit <= 57) {
        this.#alphanumeric += count;
        this.#numeric += count;
      } else if ((unit >= 65 && unit <= 90) || (unit >= 97 && unit <= 122)) {
        this.#alphanumeric += count;
        this.#alphabetic += count;
      } else if (space[unit] === 1) {
        this.#whitespace += count;
      } else {
        this.#special += count;
        if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < value.length) {
          const next = value.charCodeAt(i + 1);
          if (next >= 0xdc00 && next <= 0xdfff) {
            i++;
          }
        }
      }
      // Check for non-ASCII characters
      if (unit > 127) {
        this.#nonAscii += count;
      }
    }
  }

  #addCase(value, count) {
    // Skip values with no letters
    if (!/[a-zA-Z]/.test(value)) {
      return;
    }
    const hasUppercase = /[A-Z]/.test(value);
    const hasLowercase = /[a-z]/.test(value);
    if (hasUppercase && !hasLowercase) {
      this.#uppercase += count;
    } else if (hasLowercase && !hasUppercase) {
      this.#lowercase += count;
    } else if (hasUppercase && hasLowercase) {
      this.#mixedCase += count;
      // Title case: each word's first letter uppercase, the rest lowercase
      const words = value.split(/\s+/);
      const isTitleCase = words.every((word) => {
        if (word.length === 0) return true;
        return /[A-Z]/.test(word[0]) && !/[A-Z]/.test(word.substring(1));
      });
      if (isTitleCase) {
        this.#titleCase += count;
      }
    }
  }

  #addFormats(trimmed, count) {
    let formats = 0;
    if (PATTERNS.email.test(trimmed)) {
      this.#email += count;
      formats |= EMAIL;
    }
    if (PATTERNS.url.test(trimmed)) {
      this.#url += count;
      formats |= URL;
    }
    // The first country whose phone pattern matches; an SSN only if none does
    let phoneMatched = false;
    for (const [country, pattern] of PHONE_PATTERNS) {
      if (pattern.test(trimmed)) {
        phoneMatched = true;
        this.#phone += count;
        this.#phoneCountries.set(country, (this.#phoneCountries.get(country) || 0) + count);
        formats |= PHONE;
        break;
      }
    }
    if (!phoneMatched) {
      for (const [country, pattern] of SSN_PATTERNS) {
        if (pattern.test(trimmed)) {
          this.#ssn += count;
          this.#ssnCountries.set(country, (this.#ssnCountries.get(country) || 0) + count);
          formats |= SSN;
          break;
        }
      }
    }
    for (const [patternName, pattern] of DATE_PATTERNS) {
      if (pattern.test(trimmed)) {
        this.#dateString += count;
        this.#datePatterns.set(patternName, (this.#datePatterns.get(patternName) || 0) + count);
        formats |= DATE_STRING;
        break;
      }
    }
    return formats;
  }

  /**
   * The analysis, as calculateStringAnalysis() reports it
   * @param {number} nullCount - Rows without a value: null, missing or empty
   * @returns {Object} String analysis results
   */
  result(nullCount) {
    const n = this.#values;
    if (n === 0) {
      return {
        isString: false,
        error: "No non-null values available",
        nullCount,
      };
    }

    // The most common length is the first, in the order lengths first occur, of the most frequent
    let mostCommon = 0;
    let maxFreq = 0;
    for (const [len, freq] of this.#lengthFreq.entries()) {
      if (freq > maxFreq) {
        maxFreq = freq;
        mostCommon = len;
      }
    }
    const distribution = {};
    for (const [len, freq] of this.#lengthFreq.entries()) {
      distribution[len] = freq;
    }

    const totalChars = this.#totalChars;
    const ofChars = (count) => (totalChars > 0 ? percent1(count, totalChars) : 0);
    const patterns = {
      prefixes: commonAffixes(this.#prefixes, "prefix", n),
      suffixes: commonAffixes(this.#suffixes, "suffix", n),
    };
    if (this.#estimated) {
      // Too many distinct ones to count each: see PREFIXES_COUNTED
      patterns.estimated = true;
    }

    return {
      isString: true,
      valueCount: n,
      nullCount,

      lengthStats: {
        min: this.#minLength,
        max: this.#maxLength,
        average: parseFloat((this.#lengthSum / n).toFixed(2)),
        mostCommon,
        mostCommonCount: maxFreq,
        distribution,
      },

      patterns,

      characterComposition: {
        alphanumericPercentage: ofChars(this.#alphanumeric),
        alphabeticPercentage: ofChars(this.#alphabetic),
        numericPercentage: ofChars(this.#numeric),
        specialCharPercentage: ofChars(this.#special),
        whitespacePercentage: ofChars(this.#whitespace),
        leadingWhitespaceCount: this.#leadingWhitespace,
        trailingWhitespaceCount: this.#trailingWhitespace,
        nonAsciiCount: this.#nonAscii,
        nonAsciiPercentage: ofChars(this.#nonAscii),
      },

      caseAnalysis: {
        uppercaseCount: this.#uppercase,
        lowercaseCount: this.#lowercase,
        mixedCaseCount: this.#mixedCase,
        titleCaseCount: this.#titleCase,
        uppercasePercentage: percent1(this.#uppercase, n),
        lowercasePercentage: percent1(this.#lowercase, n),
        mixedCasePercentage: percent1(this.#mixedCase, n),
        titleCasePercentage: percent1(this.#titleCase, n),
      },

      formatDetection: {
        email: { count: this.#email, percentage: percent1(this.#email, n), samples: this.#samples.email },
        phone: {
          count: this.#phone,
          percentage: percent1(this.#phone, n),
          samples: this.#samples.phone,
          countryBreakdown: Object.fromEntries(this.#phoneCountries),
        },
        ssn: {
          count: this.#ssn,
          percentage: percent1(this.#ssn, n),
          samples: this.#samples.ssn,
          countryBreakdown: Object.fromEntries(this.#ssnCountries),
        },
        url: { count: this.#url, percentage: percent1(this.#url, n), samples: this.#samples.url },
        dateString: {
          count: this.#dateString,
          percentage: percent1(this.#dateString, n),
          samples: this.#samples.dateString,
          patternBreakdown: Object.fromEntries(this.#datePatterns),
        },
      },
    };
  }
}
