import { open } from "fs/promises";
import parquetUtil from "parquetjs/lib/util.js";
import parquetThrift from "parquetjs/gen-nodejs/parquet_types.js";

/**
 * Parquet timestamps with no time zone, which parquetjs can't write itself
 *
 * A QVD's timestamps are wall clocks. Parquet marks one as such with the logical type
 * TIMESTAMP(isAdjustedToUTC=false), but parquetjs's Thrift definitions predate logical
 * types: the only timestamp it can write, the older TIMESTAMP_MILLIS annotation, means
 * an instant in UTC, and pyarrow reads it so. A naive timestamp column is written as
 * INT64 milliseconds instead, and its logical type added to the footer afterwards.
 */

// The Thrift compact protocol's type ids
const BOOL = 2;
const STRUCT = 12;

/**
 * Write a SchemaElement's logicalType, its field 10, as
 * TIMESTAMP(isAdjustedToUTC=false, unit=MILLIS)
 * @param {Object} output - The Thrift protocol being written
 * @returns {void}
 */
function writeNaiveTimestampType(output) {
  output.writeFieldBegin("logicalType", STRUCT, 10);
  output.writeStructBegin("LogicalType");
  output.writeFieldBegin("TIMESTAMP", STRUCT, 8);
  output.writeStructBegin("TimestampType");
  output.writeFieldBegin("isAdjustedToUTC", BOOL, 1);
  output.writeBool(false);
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

// A schema element that ends with that logical type, after the fields parquetjs knows
class NaiveTimestampElement extends parquetThrift.SchemaElement {
  write(output) {
    const writeFieldStop = output.writeFieldStop;
    output.writeFieldStop = () => {
      output.writeFieldStop = writeFieldStop;
      writeNaiveTimestampType(output);
      writeFieldStop.call(output);
    };
    super.write(output);
  }
}

/**
 * Mark INT64 columns of a Parquet file parquetjs has written as timestamps of
 * milliseconds with no time zone, by rewriting the file's footer
 * @param {string} filePath - The Parquet file
 * @param {Array<string>} columnNames - The columns to mark
 * @returns {Promise<void>}
 */
export async function markNaiveTimestamps(filePath, columnNames) {
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
    // The first element is the schema's root
    metadata.schema = metadata.schema.map((element, index) =>
      index > 0 && names.has(element.name) ? new NaiveTimestampElement(element) : element
    );
    const encoded = parquetUtil.serializeThrift(metadata);

    tail.writeUInt32LE(encoded.length, 0);
    await file.truncate(footerStart);
    await file.write(Buffer.concat([encoded, tail]), 0, encoded.length + tail.length, footerStart);
  } finally {
    await file.close();
  }
}
