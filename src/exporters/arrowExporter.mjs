import * as arrow from 'apache-arrow';
import { writeFileAtomically } from './atomicWrite.mjs';
import { isMissing, scanColumnTypes } from './columnTypes.mjs';
import { naiveDateText } from './naiveDates.mjs';
import { zonedTimestampsFor } from './zonedTimestamps.mjs';

// Rows in each record batch, written to the file before the next is made
export const CHUNK_ROWS = 10000;

/**
 * Heap an Arrow export builds from the rows, for the memory guard. It writes a
 * record batch at a time, but holds each text column's distinct values from
 * before the first batch to the end, for its dictionary, so the whole export is
 * priced rather than a batch. In its own batches, a million rows of
 * chicago_taxi_rides_2016_03.qvd needed nothing measurable beyond reading them,
 * with timestamps read in America/Chicago too, and 0.42 bytes per cell in one
 * batch. 50,000 rows of four unique 400-character values needed 0.31 per
 * character of all their text. Measured by the smallest heap that let them
 * export, against reading them alone. Its buffers and dictionaries' text,
 * outside the V8 heap, aren't counted. See DataExporter.memoryCost() for the
 * margins.
 */
export const memoryCost = { bytesPerCell: 1, bytesPerTextChar: 1, writesAsItGoes: true };

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
  const { chunkRows = CHUNK_ROWS } = options;
  // Before anything is written, so that a time zone Intl doesn't know leaves the file alone
  const zoned = zonedTimestampsFor(options);
  try {
    if (data.length === 0) {
      // Create empty Arrow file
      const emptyTable = arrow.tableFromJSON([{ empty: "" }]);
      const writer = arrow.RecordBatchFileWriter.writeAll(emptyTable);
      const buffer = Buffer.from(await writer.toUint8Array());
      await writeFileAtomically(filePath, (file) => file.writeFile(buffer));
      return;
    }

    // First, analyze all columns to detect mixed types
    const firstRow = data[0];
    const columnNames = Object.keys(firstRow);

    // Determine the most compatible type for each column, from all rows
    const columnTypes = scanColumnTypes(data, columnNames);
    const isTextColumn = (typeInfo) =>
      typeInfo.hasString || typeInfo.hasObject || (typeInfo.hasNumber && typeInfo.hasBoolean);

    // Each column's type, as Arrow inferred it from every value when it built the whole
    // table at once. A column of timestamps read in a time zone holds their instants,
    // its type naming the zone. One of dates holds dates, or timestamps with no time
    // zone, as a QVD's are. One of text, or of mixed types, holds text, one of numbers
    // doubles, one of booleans booleans, and one with nothing but missing values doubles
    const typeOf = (typeInfo) => {
      if (isTextColumn(typeInfo)) {
        return new arrow.Dictionary(new arrow.Utf8(), new arrow.Int32());
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
    const instants = new Set(
      columnNames.filter((key) => schema.fields[columnNames.indexOf(key)].type.timezone)
    );

    // A cell's value, normalized so that a column holds one type
    const cellOf = (value, key) => {
      const typeInfo = columnTypes[key];
      if (isMissing(value, typeInfo)) {
        return null;
      } else if (isTextColumn(typeInfo)) {
        // If column has mixed types or strings, convert everything to string
        if (value instanceof Date) {
          return naiveDateText(value, false);
        } else if (typeof value === "object") {
          return JSON.stringify(value);
        }
        return String(value);
      } else if (instants.has(key)) {
        return zoned.instant(value, key);
      }
      // Keep primitives (string, number, boolean) and dates as they are
      return value;
    };

    // A text column holds indices into a dictionary of its distinct values, in the
    // order they first appear, as Arrow's dictionary builder made it. The dictionary is
    // made whole before the first batch, so that the file holds it once, as it did when
    // the table was one batch: polars, for one, can't read a dictionary that grows from
    // batch to batch
    const dictionaries = new Map(
      columnNames.filter((key) => isTextColumn(columnTypes[key])).map((key) => [key, new Map()])
    );
    if (dictionaries.size > 0) {
      for (const row of data) {
        for (const [key, indices] of dictionaries) {
          const cell = cellOf(row[key], key);
          if (cell !== null && !indices.has(cell)) {
            indices.set(cell, indices.size);
          }
        }
      }
    }
    const dictionaryValues = new Map(
      [...dictionaries].map(([key, indices]) => [key, arrow.vectorFromArray([...indices.keys()], new arrow.Utf8())])
    );
    const batchType = new arrow.Struct(schema.fields);

    /**
     * A record batch of rows, from the first to before the last
     * @param {number} start - The first row
     * @param {number} end - The row after the last
     * @returns {arrow.RecordBatch} The batch
     */
    const batchOf = (start, end) => {
      const length = end - start;
      const columns = schema.fields.map((field) => {
        const indices = dictionaries.get(field.name);
        if (indices) {
          return { indices, data: new Int32Array(length), valid: new Uint8Array((length + 7) >> 3), nulls: 0 };
        }
        return { builder: arrow.makeBuilder({ type: field.type, nullValues: [null] }) };
      });
      for (let i = 0; i < length; i++) {
        const row = data[start + i];
        columnNames.forEach((key, c) => {
          const cell = cellOf(row[key], key);
          const column = columns[c];
          if (!column.indices) {
            column.builder.append(cell);
          } else if (cell === null) {
            column.nulls++;
          } else {
            column.data[i] = column.indices.get(cell);
            column.valid[i >> 3] |= 1 << (i & 7);
          }
        });
      }
      const children = columns.map((column, c) => {
        if (!column.indices) {
          return column.builder.finish().flush();
        }
        return arrow.makeData({
          type: schema.fields[c].type,
          length,
          nullCount: column.nulls,
          nullBitmap: column.nulls > 0 ? column.valid : undefined,
          data: column.data,
          dictionary: dictionaryValues.get(columnNames[c]),
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
