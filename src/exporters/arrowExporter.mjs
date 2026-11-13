import * as arrow from 'apache-arrow';
import { writeFileAtomically } from './atomicWrite.mjs';
import { isMissing, scanColumnTypes } from './columnTypes.mjs';
import { rowsPerChunk } from '../memoryGuard.mjs';
import { naiveDateText } from './naiveDates.mjs';
import { zonedTimestampsFor } from './zonedTimestamps.mjs';

// Rows in each record batch, written to the file before the next is made
export const CHUNK_ROWS = 10000;

// Cells in each record batch at most: a QVD with many fields gets fewer rows in a batch
export const CHUNK_CELLS = CHUNK_ROWS * 20;

// Text cells the dictionaries look at, and distinct values their vectors take, between
// yields to the event loop. A value new to a dictionary takes it up to half a
// microsecond, so this is a few tens of milliseconds at most
export const DICTIONARY_CELLS_PER_YIELD = 100000;

/**
 * Heap an Arrow export builds from the rows, for the memory guard. It writes a
 * record batch at a time, of CHUNK_ROWS rows or CHUNK_CELLS cells, whichever is
 * fewer rows, so only its largest batch is priced per cell and per character: a
 * million rows of 20 fields in one batch needed nothing measurable beyond reading
 * them, under 0.4 bytes a cell. But each text column's distinct values are held
 * from before the first batch to the end, for its dictionary, so they are priced
 * for the whole export: 33 bytes a value for short text already in the rows, and
 * 55 for numbers that a column of text turns into text. Measured by the smallest
 * heap that let a million rows of five such columns export, every value distinct,
 * against reading them alone. 50,000 rows of four unique 400-character values
 * needed 47 a value, to the 8 MiB the measurement resolves, and nothing a
 * character. Its buffers and dictionaries' text, outside the V8 heap, aren't
 * counted. See DataExporter.memoryCost() for the margins.
 */
export const memoryCost = {
  bytesPerCell: 1,
  bytesPerTextChar: 1,
  bytesPerDistinctText: 84,
  chunkRows: CHUNK_ROWS,
  chunkCells: CHUNK_CELLS,
  writesAsItGoes: true,
};

/**
 * Where a file writer puts what it writes, until it is taken to the file
 * The writer's own streams take every batch at once, however slowly the file takes
 * them: with this, each batch is on disk before the next is made.
 */
class WrittenBytes extends arrow.AsyncByteQueue {
  pieces = [];

  write(piece) {
    this.pieces.push(piece);
  }

  /**
   * What was written since last taken
   * @returns {Buffer} The bytes
   */
  take() {
    const pieces = this.pieces;
    this.pieces = [];
    return Buffer.concat(pieces);
  }
}

/**
 * Give the event loop a turn
 * @returns {Promise<void>} Resolves on the next turn
 */
function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * A value of a column of text, or of mixed types, as text
 * @param {*} value - A value that isn't missing
 * @returns {string} The text
 */
function textOf(value) {
  if (value instanceof Date) {
    return naiveDateText(value, false);
  } else if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * A dictionary's vector of its distinct values, in one piece, as the writer writes it once
 * Their UTF-8 is written into one buffer: Arrow's own builder holds each value as a
 * Uint8Array of its own until it is done, about 50 bytes a value more of the heap.
 * Every value is looked at twice, so this yields to the event loop as it goes.
 * @param {Map<string, number>} indices - The distinct values, in the order of their indices
 * @returns {Promise<arrow.Vector>} The vector
 * @throws {RangeError} For more text than Arrow's 32-bit offsets reach
 */
async function textVectorOf(indices) {
  let byteLength = 0;
  let seen = 0;
  for (const value of indices.keys()) {
    byteLength += Buffer.byteLength(value, "utf8");
    if (++seen % DICTIONARY_CELLS_PER_YIELD === 0) {
      await nextTurn();
    }
  }
  if (byteLength > 2 ** 31 - 1) {
    throw new RangeError(`a text column's distinct values take ${byteLength} bytes, more than Arrow's text holds`);
  }
  const bytes = Buffer.alloc(byteLength);
  const valueOffsets = new Int32Array(indices.size + 1);
  let offset = 0;
  let index = 0;
  for (const value of indices.keys()) {
    offset += bytes.write(value, offset, "utf8");
    valueOffsets[++index] = offset;
    if (index % DICTIONARY_CELLS_PER_YIELD === 0) {
      await nextTurn();
    }
  }
  const data = new Uint8Array(bytes.buffer, bytes.byteOffset, byteLength);
  return arrow.makeVector(
    arrow.makeData({ type: new arrow.Utf8(), length: indices.size, nullCount: 0, valueOffsets, data })
  );
}

/**
 * Export data to Apache Arrow format
 * @param {Array<Object>} data - Array of row objects
 * @param {string} filePath - Destination file path
 * @param {object} [options]
 * @param {string|null} [options.timeZone] - The time zone the timestamps were read in,
 *   to write each as the instant it was; without one they are wall clocks with no time zone
 * @param {number} [options.chunkRows] - Rows in each record batch
 * @returns {Promise<import('./zonedTimestamps.mjs').TimeShifts|undefined>} With a time
 *   zone and rows, what reading their timestamps in it did
 */
export async function exportToArrow(data, filePath, options = {}) {
  // Before anything is written, so that a time zone Intl doesn't know leaves the file alone
  const zoned = zonedTimestampsFor(options);
  try {
    const columnNames = data.length > 0 ? Object.keys(data[0]) : [];
    const chunkRows = rowsPerChunk(memoryCost, columnNames.length, options.chunkRows);
    const textType = () => new arrow.Dictionary(new arrow.Utf8(), new arrow.Int32());

    if (data.length === 0) {
      // No rows, and so no columns to type: a column of text named empty, with no
      // rows, as Parquet and Avro write
      const schema = new arrow.Schema([new arrow.Field("empty", textType(), true)]);
      await writeFileAtomically(filePath, async (file) => {
        const written = new WrittenBytes();
        const writer = new arrow.RecordBatchFileWriter();
        writer.reset(written, schema);
        writer.close();
        await file.writeFile(written.take());
      });
      return;
    }

    // Determine the most compatible type for each column, from all rows
    const columnTypes = await scanColumnTypes(data, columnNames);
    const isTextColumn = (typeInfo) =>
      typeInfo.hasString || typeInfo.hasObject || (typeInfo.hasNumber && typeInfo.hasBoolean);

    // Each column's type, as Arrow inferred it from every value when it built the whole
    // table at once. A column of timestamps read in a time zone holds their instants,
    // its type naming the zone. One of dates holds dates, or timestamps with no time
    // zone, as a QVD's are. One of text, or of mixed types, holds text, one of numbers
    // doubles, one of booleans booleans, and one with nothing but missing values doubles
    const typeOf = (typeInfo) => {
      if (isTextColumn(typeInfo)) {
        return textType();
      } else if (typeInfo.hasDate) {
        if (typeInfo.calendarDates) {
          return new arrow.DateDay();
        }
        return zoned === null ? new arrow.TimestampMillisecond() : new arrow.TimestampMillisecond(zoned.timeZone);
      } else if (typeInfo.hasBoolean && !typeInfo.hasNumber) {
        return new arrow.Bool();
      }
      return new arrow.Float64();
    };
    // Every field nullable, as a table made of vectors makes them
    const schema = new arrow.Schema(columnNames.map((key) => new arrow.Field(key, typeOf(columnTypes[key]), true)));

    // Each column, and how its cells are written, worked out once. A text column holds
    // indices into a dictionary of its distinct values, in the order they first appear,
    // as Arrow's dictionary builder made it
    const columns = schema.fields.map((field) => {
      const typeInfo = columnTypes[field.name];
      const text = isTextColumn(typeInfo);
      return {
        key: field.name,
        field,
        typeInfo,
        text,
        instants: Boolean(field.type.timezone),
        indices: text ? new Map() : null,
        dictionary: null,
      };
    });
    const textColumns = columns.filter((column) => column.text);

    // A cell's value, normalized so that a column holds one type
    const cellOf = (value, column) => {
      if (isMissing(value, column.typeInfo)) {
        return null;
      } else if (column.text) {
        // If column has mixed types or strings, convert everything to string
        return textOf(value);
      } else if (column.instants) {
        return zoned.instant(value, column.key);
      }
      // Keep primitives (string, number, boolean) and dates as they are
      return value;
    };

    // The dictionaries are made whole before the first batch, so that the file holds
    // each once, as it did when the table was one batch: polars, for one, can't read a
    // dictionary that grows from batch to batch. Every text cell is looked at, so this
    // yields to the event loop as it goes. A column at a time: a map growing past a
    // million values takes 10 ms, and the columns' maps would grow at the same row
    let cells = 0;
    for (const column of textColumns) {
      for (let i = 0; i < data.length; i++) {
        const cell = cellOf(data[i][column.key], column);
        if (cell !== null && !column.indices.has(cell)) {
          column.indices.set(cell, column.indices.size);
        }
        if (++cells % DICTIONARY_CELLS_PER_YIELD === 0) {
          await nextTurn();
        }
      }
      column.dictionary = await textVectorOf(column.indices);
    }
    const batchType = new arrow.Struct(schema.fields);

    /**
     * A record batch of rows, from the first to before the last
     * @param {number} start - The first row
     * @param {number} end - The row after the last
     * @returns {arrow.RecordBatch} The batch
     */
    const batchOf = (start, end) => {
      const length = end - start;
      const built = columns.map((column) =>
        column.text
          ? { data: new Int32Array(length), valid: new Uint8Array((length + 7) >> 3), nulls: 0 }
          : { builder: arrow.makeBuilder({ type: column.field.type, nullValues: [null] }) }
      );
      for (let i = 0; i < length; i++) {
        const row = data[start + i];
        for (let c = 0; c < columns.length; c++) {
          const column = columns[c];
          const cell = cellOf(row[column.key], column);
          const values = built[c];
          if (!column.text) {
            values.builder.append(cell);
          } else if (cell === null) {
            values.nulls++;
          } else {
            values.data[i] = column.indices.get(cell);
            values.valid[i >> 3] |= 1 << (i & 7);
          }
        }
      }
      const children = columns.map((column, c) => {
        const values = built[c];
        if (!column.text) {
          return values.builder.finish().flush();
        }
        return arrow.makeData({
          type: column.field.type,
          length,
          nullCount: values.nulls,
          nullBitmap: values.nulls > 0 ? values.valid : undefined,
          data: values.data,
          dictionary: column.dictionary,
        });
      });
      return new arrow.RecordBatch(schema, arrow.makeData({ type: batchType, length, children }));
    };

    await writeFileAtomically(filePath, async (file) => {
      const written = new WrittenBytes();
      const writer = new arrow.RecordBatchFileWriter();
      writer.reset(written, schema);
      for (let start = 0; start < data.length; start += chunkRows) {
        writer.write(batchOf(start, Math.min(start + chunkRows, data.length)));
        await file.writeFile(written.take());
      }
      writer.close();
      await file.writeFile(written.take());
    });
    return zoned?.summary();
  } catch (error) {
    throw new Error(`Arrow export failed: ${error.message}`, { cause: error });
  }
}
