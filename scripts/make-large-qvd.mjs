// Writes a synthetic QVD of any size, a chunk at a time, for measuring how exports
// and profiling cope with files larger than the extension host's heap.
// qvdjs's own writer holds every row in memory, so it can't write one.
//
//   node scripts/make-large-qvd.mjs <file.qvd> --rows 50000000 [--seed 1]
//   node scripts/make-large-qvd.mjs <file.qvd> --rows 20000 --verify
//
// --verify also writes the same rows with qvdjs's writer, beside the file, reads both
// back with qvdjs, and fails unless every row is the same. The symbol tables hold every
// symbol a field may pick, so a small file holds some no row uses, which qvdjs's leaves out.
//
// The table is orders: an id per row, dates and timestamps as duals, customers,
// countries, amounts, quantities, a status with nulls, e-mail addresses and long
// comments with nulls. The rows are drawn from a seeded generator, so the same
// arguments give the same file. Rows and distinct values grow together: the
// timestamps have a distinct value for every 4 rows, the comments for every 8.

import { closeSync, openSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    rows: { type: "string", default: "1000000" },
    seed: { type: "string", default: "1" },
    verify: { type: "boolean", default: false },
  },
});
if (positionals.length !== 1) {
  console.error("Usage: node scripts/make-large-qvd.mjs <file.qvd> --rows <n> [--seed <n>] [--verify]");
  process.exit(2);
}
const outPath = positionals[0];
const rowCount = Number(options.rows);
const seed = Number(options.seed) >>> 0;
if (!Number.isSafeInteger(rowCount) || rowCount < 1) {
  throw new Error(`--rows must be a positive whole number, not ${options.rows}`);
}

// Symbol types, as the QVD format numbers them
const INT = 1;
const DOUBLE = 2;
const TEXT = 4;
const DUAL_INT = 5;
const DUAL_DOUBLE = 6;

// Days from 1899-12-30, Qlik's day 0, to 2015-01-01
const FIRST_DAY = 42005;
const DAYS = 3653;
const DAY_MS = 86400000;
const QLIK_EPOCH = Date.UTC(1899, 11, 30);

/**
 * A date's text, as Qlik shows it by default
 * @param {number} serial - Days since 1899-12-30, with the time of day as a fraction
 * @param {boolean} withTime - Whether to show the time of day too
 * @returns {string} The text
 */
function serialText(serial, withTime) {
  const iso = new Date(QLIK_EPOCH + Math.round(serial * DAY_MS)).toISOString();
  return withTime ? `${iso.slice(0, 10)} ${iso.slice(11, 19)}` : iso.slice(0, 10);
}

const COUNTRIES = [
  "Sverige", "Norge", "Danmark", "Suomi", "Ísland", "Deutschland", "Österreich", "Schweiz", "France", "España",
  "Italia", "Portugal", "Nederland", "België", "Polska", "Česko", "Magyarország", "România", "Ελλάδα", "Türkiye",
  "United Kingdom", "Ireland", "United States", "Canada", "México", "Brasil", "Argentina", "Chile", "Japan", "中国",
  "대한민국", "India", "Australia", "New Zealand", "South Africa", "Egypt", "Kenya", "Nigeria", "Morocco", "Israel",
];
const STATUSES = ["New", "Paid", "Shipped", "Delivered", "Returned"];
const WORDS = ["prompt", "delivery", "please", "call", "before", "noon", "gate", "code", "fragile", "leave", "at",
  "door", "invoice", "attached", "rush", "order", "gift", "wrap", "back", "entrance", "ring", "twice"];

/**
 * The fields, each with its symbols and how a row picks one
 * @param {number} rows - Rows in the table
 * @returns {Array<object>} The fields
 */
function fieldsFor(rows) {
  const times = Math.max(2, Math.ceil(rows / 4));
  const customers = Math.max(2, Math.min(1000000, Math.ceil(rows / 10)));
  const emails = Math.max(2, Math.min(2500000, Math.ceil(rows / 20)));
  const comments = Math.max(2, Math.ceil(rows / 8));
  return [
    {
      name: "OrderID",
      symbols: rows,
      symbol: (i) => ({ type: INT, number: i + 1 }),
      pick: (row) => row,
      tags: ["$numeric", "$integer"],
    },
    {
      name: "OrderDate",
      symbols: DAYS,
      symbol: (i) => ({ type: DUAL_INT, number: FIRST_DAY + i, text: serialText(FIRST_DAY + i, false) }),
      pick: (row, random) => random() % DAYS,
      tags: ["$numeric", "$integer", "$timestamp", "$date"],
    },
    {
      name: "OrderTime",
      symbols: times,
      symbol: (i) => {
        // Spread over the ten years, to the second
        const serial = FIRST_DAY + Math.round(((i * DAYS) / times) * 86400) / 86400;
        return { type: DUAL_DOUBLE, number: serial, text: serialText(serial, true) };
      },
      pick: (row, random) => random() % times,
      tags: ["$numeric", "$timestamp"],
    },
    {
      name: "Customer",
      symbols: customers,
      symbol: (i) => ({ type: TEXT, text: `Customer ${String(i).padStart(7, "0")}` }),
      // Some customers order far more than others
      pick: (row, random) => Math.floor(((random() % 65536) / 65536) ** 2 * customers),
      tags: ["$ascii", "$text"],
    },
    {
      name: "Country",
      symbols: COUNTRIES.length,
      symbol: (i) => ({ type: TEXT, text: COUNTRIES[i] }),
      pick: (row, random) => Math.min(random() % 64, COUNTRIES.length - 1),
      tags: ["$text"],
    },
    {
      name: "Amount",
      symbols: 200000,
      symbol: (i) => ({ type: DOUBLE, number: (i + 1) / 100 }),
      pick: (row, random) => random() % 200000,
      tags: ["$numeric"],
    },
    {
      name: "Quantity",
      symbols: 100,
      symbol: (i) => ({ type: INT, number: i + 1 }),
      pick: (row, random) => random() % 100,
      tags: ["$numeric", "$integer"],
    },
    {
      name: "Status",
      symbols: STATUSES.length,
      symbol: (i) => ({ type: TEXT, text: STATUSES[i] }),
      // One row in 50 has none
      pick: (row, random) => (random() % 50 === 0 ? -1 : random() % STATUSES.length),
      nulls: true,
      tags: ["$ascii", "$text"],
    },
    {
      name: "Email",
      symbols: emails,
      symbol: (i) => ({ type: TEXT, text: `user${i}@example.${["com", "org", "se"][i % 3]}` }),
      pick: (row, random) => random() % emails,
      tags: ["$ascii", "$text"],
    },
    {
      name: "Comment",
      symbols: comments,
      symbol: (i) => {
        const words = [];
        for (let w = 0, x = i * 2654435761; w < 9; w++, x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0) {
          words.push(WORDS[x % WORDS.length]);
        }
        return { type: TEXT, text: `#${i}: ${words.join(" ")}` };
      },
      // Three rows in ten have none
      pick: (row, random) => (random() % 10 < 3 ? -1 : random() % comments),
      nulls: true,
      tags: ["$text"],
    },
  ];
}

/**
 * A seeded generator of 32-bit unsigned numbers: xorshift32
 * @param {number} state - The seed, not 0
 * @returns {function(): number} The generator
 */
function xorshift32(state) {
  let x = state || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
}

/**
 * The bytes a symbol takes in the file
 * @param {object} symbol - The symbol
 * @returns {number} Bytes
 */
function symbolBytes(symbol) {
  const text = symbol.text === undefined ? 0 : Buffer.byteLength(symbol.text) + 1;
  switch (symbol.type) {
    case INT:
      return 5;
    case DOUBLE:
      return 9;
    case TEXT:
      return 1 + text;
    case DUAL_INT:
      return 5 + text;
    default:
      return 9 + text;
  }
}

/**
 * Write a symbol into a buffer
 * @param {Buffer} buffer - The buffer
 * @param {number} at - Where
 * @param {object} symbol - The symbol
 * @returns {number} Where the next symbol goes
 */
function putSymbol(buffer, at, symbol) {
  buffer[at++] = symbol.type;
  if (symbol.type === INT || symbol.type === DUAL_INT) {
    buffer.writeInt32LE(symbol.number, at);
    at += 4;
  } else if (symbol.type === DOUBLE || symbol.type === DUAL_DOUBLE) {
    buffer.writeDoubleLE(symbol.number, at);
    at += 8;
  }
  if (symbol.text !== undefined) {
    at += buffer.write(symbol.text, at, "utf8");
    buffer[at++] = 0;
  }
  return at;
}

/**
 * Bits needed for a number
 * @param {number} n - The number
 * @returns {number} Bits
 */
function bitsFor(n) {
  return n <= 0 ? 0 : Math.floor(Math.log2(n)) + 1;
}

/**
 * Escape text for the XML header
 * @param {string} text - The text
 * @returns {string} The text, escaped
 */
function xml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The file's XML header, as qvdjs's writer lays it out
 * @param {Array<object>} fields - The fields, with their layout
 * @param {number} rows - Rows
 * @param {number} recordBytes - Bytes a row takes in the index table
 * @param {number} symbolsLength - Bytes the symbol tables take
 * @returns {string} The header
 */
function headerXml(fields, rows, recordBytes, symbolsLength) {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const fieldXml = fields
    .map(
      (field) => `    <QvdFieldHeader>
      <FieldName>${xml(field.name)}</FieldName>
      <BitOffset>${field.bitOffset}</BitOffset>
      <BitWidth>${field.bitWidth}</BitWidth>
      <Bias>${field.bias}</Bias>
      <NoOfSymbols>${field.symbols}</NoOfSymbols>
      <Offset>${field.offset}</Offset>
      <Length>${field.length}</Length>
      <Comment/>
      <NumberFormat>
        <Type>UNKNOWN</Type>
        <nDec>0</nDec>
        <UseThou>0</UseThou>
        <Fmt/>
        <Dec/>
        <Thou/>
      </NumberFormat>
      <Tags>
${field.tags.map((tag) => `        <String>${xml(tag)}</String>`).join("\n")}
      </Tags>
    </QvdFieldHeader>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<QvdTableHeader>
  <QvBuildNo>50667</QvBuildNo>
  <CreatorDoc>synthetic</CreatorDoc>
  <CreateUtcTime>${now}</CreateUtcTime>
  <SourceCreateUtcTime/>
  <SourceFileUtcTime/>
  <SourceFileSize>-1</SourceFileSize>
  <StaleUtcTime/>
  <TableName>${xml(basename(outPath).replace(/\.qvd$/i, ""))}</TableName>
  <Compression/>
  <Comment/>
  <EncryptionInfo/>
  <TableTags/>
  <ProfilingData/>
  <Lineage>
    <LineageInfo>
      <Discriminator>INLINE;</Discriminator>
      <Statement/>
    </LineageInfo>
  </Lineage>
  <Fields>
${fieldXml}
  </Fields>
  <NoOfRecords>${rows}</NoOfRecords>
  <RecordByteSize>${recordBytes}</RecordByteSize>
  <Offset>${symbolsLength}</Offset>
  <Length>${rows * recordBytes}</Length>
</QvdTableHeader>
`;
}

/**
 * Write the QVD, a chunk at a time
 * @param {string} path - Where
 * @param {number} rows - Rows
 * @returns {{fields: Array<object>, recordBytes: number, bytes: number}} What was written
 */
function writeQvd(path, rows) {
  const fields = fieldsFor(rows);

  // The symbol tables' sizes first, which the header gives
  let offset = 0;
  let bitOffset = 0;
  for (const field of fields) {
    let length = 0;
    for (let i = 0; i < field.symbols; i++) {
      length += symbolBytes(field.symbol(i));
    }
    field.offset = offset;
    field.length = length;
    offset += length;
    // With nulls, a stored 0 is null and symbol i is stored as i + 2
    field.bias = field.nulls ? -2 : 0;
    field.bitWidth = bitsFor(field.nulls ? field.symbols + 1 : field.symbols - 1);
    field.bitOffset = bitOffset;
    bitOffset += field.bitWidth;
  }
  const recordBytes = Math.ceil(bitOffset / 8);

  const fd = openSync(path, "w");
  try {
    let written = writeSync(fd, Buffer.from(headerXml(fields, rows, recordBytes, offset) + "\r\n\0", "utf8"));

    // The symbols, field after field, through one buffer
    const buffer = Buffer.alloc(16 * 1024 * 1024);
    let used = 0;
    for (const field of fields) {
      for (let i = 0; i < field.symbols; i++) {
        const symbol = field.symbol(i);
        if (used + symbolBytes(symbol) > buffer.length) {
          written += writeSync(fd, buffer, 0, used);
          used = 0;
        }
        used = putSymbol(buffer, used, symbol);
      }
    }
    written += writeSync(fd, buffer, 0, used);

    // The rows, bit-packed, a million at a time
    const random = xorshift32(seed);
    const chunkRows = 1000000;
    const chunk = Buffer.alloc(chunkRows * recordBytes);
    for (let first = 0; first < rows; first += chunkRows) {
      const count = Math.min(chunkRows, rows - first);
      chunk.fill(0, 0, count * recordBytes);
      for (let r = 0; r < count; r++) {
        const base = r * recordBytes;
        for (const field of fields) {
          const index = field.pick(first + r, random);
          let value = index < 0 ? 0 : index - field.bias;
          let bit = field.bitOffset;
          let left = field.bitWidth;
          while (left > 0) {
            const shift = bit & 7;
            const take = Math.min(8 - shift, left);
            chunk[base + (bit >>> 3)] |= (value & ((1 << take) - 1)) << shift;
            value = Math.floor(value / (1 << take));
            bit += take;
            left -= take;
          }
        }
      }
      written += writeSync(fd, chunk, 0, count * recordBytes);
      if (first % 10000000 === 0) {
        console.error(`${(first + count).toLocaleString()} of ${rows.toLocaleString()} rows`);
      }
    }
    return { fields, recordBytes, bytes: written };
  } finally {
    closeSync(fd);
  }
}

const started = performance.now();
const { fields, recordBytes, bytes } = writeQvd(outPath, rowCount);
console.log(
  `Wrote ${outPath}: ${rowCount.toLocaleString()} rows, ${fields.length} fields, ${recordBytes} bytes a row, ` +
    `${(bytes / 2 ** 30).toFixed(2)} GiB, in ${((performance.now() - started) / 1000).toFixed(1)} s`
);
for (const field of fields) {
  console.log(`  ${field.name}: ${field.symbols.toLocaleString()} distinct values`);
}

if (options.verify) {
  // The same rows, written by qvdjs: both files must read back the same
  const { QvdDataFrame, QvdDual } = await import("qvdjs");
  const { deepStrictEqual } = await import("node:assert");
  const random = xorshift32(seed);
  const rows = [];
  for (let row = 0; row < rowCount; row++) {
    rows.push(
      fields.map((field) => {
        const index = field.pick(row, random);
        if (index < 0) {
          return null;
        }
        const symbol = field.symbol(index);
        if (symbol.type === DUAL_INT || symbol.type === DUAL_DOUBLE) {
          return new QvdDual(symbol.number, symbol.text);
        }
        return symbol.type === TEXT ? symbol.text : symbol.number;
      })
    );
  }
  const reference = join(dirname(outPath), `${basename(outPath, ".qvd")}.qvdjs.qvd`);
  const allowedDir = dirname(outPath);
  await new QvdDataFrame(rows, fields.map((field) => field.name)).toQvd(reference, { allowedDir });
  const mine = await QvdDataFrame.fromQvd(outPath, { allowedDir, duals: "both" });
  const theirs = await QvdDataFrame.fromQvd(reference, { allowedDir, duals: "both" });
  const plain = (frame) => frame.data.map((row) => row.map((v) => (v instanceof QvdDual ? [v.number, v.text] : v)));
  deepStrictEqual(mine.columns, theirs.columns);
  deepStrictEqual(plain(mine), plain(theirs));
  console.log(`Verified: ${rowCount.toLocaleString()} rows read back as qvdjs's own file of them does`);
}
