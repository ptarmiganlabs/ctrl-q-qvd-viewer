import { open } from "fs/promises";
import parquetUtil from "parquetjs/lib/util.js";
import parquetThrift from "parquetjs/gen-nodejs/parquet_types.js";

/**
 * Parquet timestamps with their logical type, which parquetjs can't write itself
 *
 * A QVD's timestamps are wall clocks. Parquet marks one as such with the logical type
 * TIMESTAMP(isAdjustedToUTC=false), and an instant, a wall clock read in its time zone,
 * with TIMESTAMP(isAdjustedToUTC=true). parquetjs's Thrift definitions predate logical
 * types: the only timestamp it can write, the older TIMESTAMP_MILLIS annotation, means
 * an instant in UTC, as pyarrow reads it, and its writer refuses one before 1970. A
 * timestamp column is written as INT64 milliseconds instead, and its logical type added
 * to the footer afterwards. A column of instants gets the older annotation too, for
 * readers that predate logical types.
 */

// The Thrift compact protocol's type ids
const BOOL = 2;
const STRUCT = 12;

/**
 * Write a SchemaElement's logicalType, its field 10, as
 * TIMESTAMP(isAdjustedToUTC, unit=MILLIS)
 * @param {Object} output - The Thrift protocol being written
 * @param {boolean} adjustedToUTC - Whether the timestamps are instants rather than wall clocks
 * @returns {void}
 */
function writeTimestampType(output, adjustedToUTC) {
  output.writeFieldBegin("logicalType", STRUCT, 10);
  output.writeStructBegin("LogicalType");
  output.writeFieldBegin("TIMESTAMP", STRUCT, 8);
  output.writeStructBegin("TimestampType");
  output.writeFieldBegin("isAdjustedToUTC", BOOL, 1);
  output.writeBool(adjustedToUTC);
  output.writeFieldEnd();
  output.writeFieldBegin("unit", STRUCT, 2);
  output.writeStructBegin("TimeUnit");
  output.writeFieldBegin("MILLIS", STRUCT, 1);
  output.writeStructBegin("MilliSeconds");
  output.writeFieldStop();
  output.writeStructEnd();
  output.writeFieldEnd();
  output.writeFieldStop();
  output.writeStructEnd();
  output.writeFieldEnd();
  output.writeFieldStop();
  output.writeStructEnd();
  output.writeFieldEnd();
  output.writeFieldStop();
  output.writeStructEnd();
  output.writeFieldEnd();
}

// A schema element that ends with a timestamp's logical type, after the fields parquetjs knows
class TimestampElement extends parquetThrift.SchemaElement {
  constructor(element, adjustedToUTC) {
    super(element);
    this.adjustedToUTC = adjustedToUTC;
  }

  write(output) {
    const writeFieldStop = output.writeFieldStop;
    output.writeFieldStop = () => {
      output.writeFieldStop = writeFieldStop;
      writeTimestampType(output, this.adjustedToUTC);
      writeFieldStop.call(output);
    };
    super.write(output);
  }
}

/**
 * Mark INT64 columns of a Parquet file parquetjs has written as timestamps of
 * milliseconds, by rewriting the file's footer
 * @param {string} filePath - The Parquet file
 * @param {Array<string>} columnNames - The columns to mark
 * @param {object} [options]
 * @param {boolean} [options.adjustedToUTC] - Whether they are instants, read in their
 *   time zone, rather than wall clocks with no time zone
 * @returns {Promise<void>}
 */
export async function markTimestamps(filePath, columnNames, { adjustedToUTC = false } = {}) {
  if (columnNames.length === 0) {
    return;
  }
  const file = await open(filePath, "r+");
  try {
    // A file ends with its footer, the footer's length, and the magic number PAR1
    const { size } = await file.stat();
    const tail = Buffer.alloc(8);
    await file.read(tail, 0, 8, size - 8);
    const footerStart = size - 8 - tail.readUInt32LE(0);
    const footer = Buffer.alloc(size - 8 - footerStart);
    await file.read(footer, 0, footer.length, footerStart);

    const metadata = new parquetThrift.FileMetaData();
    parquetUtil.decodeThrift(metadata, footer);
    const names = new Set(columnNames);
    // The first element is the schema's root. The older annotation means an instant in
    // UTC, so only instants get it
    metadata.schema = metadata.schema.map((element, index) => {
      if (index === 0 || !names.has(element.name)) {
        return element;
      }
      const marked = adjustedToUTC
        ? { ...element, converted_type: parquetThrift.ConvertedType.TIMESTAMP_MILLIS }
        : element;
      return new TimestampElement(marked, adjustedToUTC);
    });
    const encoded = parquetUtil.serializeThrift(metadata);

    tail.writeUInt32LE(encoded.length, 0);
    await file.truncate(footerStart);
    await file.write(Buffer.concat([encoded, tail]), 0, encoded.length + tail.length, footerStart);
  } finally {
    await file.close();
  }
}
