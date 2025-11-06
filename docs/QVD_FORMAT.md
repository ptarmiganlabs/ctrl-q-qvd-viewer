# QVD File Format Documentation

## Overview

QVD (Qlik View Data) is a proprietary file format used by Qlik Sense and QlikView to store data tables. A QVD file consists of two main parts:

1. **XML Header**: Contains metadata about the file and its fields
2. **Binary Data Section**: Contains the actual compressed data

This document describes the structure and metadata available in QVD files.

## File Structure

```
+------------------+
| XML Header       |  - File metadata
|                  |  - Field definitions
|                  |  - Lineage information
+------------------+
| Binary Data      |  - Compressed data rows
|                  |  - Symbol tables
+------------------+
```

## File-Level Metadata

The QVD file header contains the following file-level metadata:

### Core File Information

| Field | Type | Description |
|-------|------|-------------|
| `qvBuildNo` | String | QlikView/Qlik Sense build number that created the file |
| `creatorDoc` | String | Name of the document/app that created the QVD |
| `createUtcTime` | String | UTC timestamp when the QVD was created |
| `tableName` | String | Name of the table stored in the QVD |
| `tableCreator` | String | Creator/owner of the table |

### Source Information

Information about the source data:

| Field | Type | Description |
|-------|------|-------------|
| `sourceCreateUtcTime` | String | UTC timestamp when source was created |
| `sourceFileUtcTime` | String | UTC timestamp of source file |
| `sourceFileSize` | String | Size of the source file in bytes |

### Technical Information

| Field | Type | Description |
|-------|------|-------------|
| `compression` | String | Compression method used (typically empty for default) |
| `recordByteSize` | String | Size of each record in bytes |
| `noOfRecords` | Number | Total number of records/rows in the file |
| `offset` | Number | Offset to the binary data section |
| `length` | Number | Length of the binary data section |

### Optional Metadata

| Field | Type | Description |
|-------|------|-------------|
| `comment` | String | User-defined comment about the QVD |
| `encryptionInfo` | String | Encryption information (if encrypted) |
| `tableTags` | String | Tags associated with the table |
| `profilingData` | String | Data profiling information |
| `staleUtcTime` | String | UTC timestamp when data becomes stale |

### Lineage Information

The `lineage` field contains information about the data transformation that created the QVD:

```javascript
{
  lineage: {
    LineageInfo: [
      {
        Discriminator: "LoadStatement",
        Statement: "LOAD * FROM source;"
      }
    ]
  }
}
```

This helps track data provenance and understand how the QVD was generated.

## Field-Level Metadata

Each field/column in the QVD has detailed metadata:

### Basic Field Information

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Field name (column name) |
| `type` | String | Data type: `INTEGER`, `FLOAT`, `FIX`, `MONEY`, `DATE`, `TIME`, `TIMESTAMP`, `TEXT`, `UNKNOWN` |
| `extent` | String | Value extent/range information |
| `comment` | String | User-defined comment about the field |

### Cardinality and Distribution

| Field | Type | Description |
|-------|------|-------------|
| `noOfSymbols` | Number | Number of distinct values in the field (cardinality) |

### Storage Information

Technical details about how the field is stored:

| Field | Type | Description |
|-------|------|-------------|
| `offset` | Number | Offset in the binary section |
| `length` | Number | Length of the field data |
| `bitOffset` | Number | Bit offset for compressed storage |
| `bitWidth` | Number | Number of bits used to store each value |
| `bias` | Number | Bias value for numeric compression |

### Number Formatting

For numeric fields, formatting information may be available:

```javascript
{
  numberFormat: {
    type: "FIXED",      // Number format type
    nDec: "2",          // Number of decimals
    useThou: "1",       // Use thousands separator
    fmt: "#,##0.00",    // Format string
    dec: ".",           // Decimal separator
    thou: ","           // Thousands separator
  }
}
```

### Field Tags

Tags provide semantic information about the field's data type:

```javascript
{
  tags: ["$ascii", "$text", "$key"]
}
```

Common tag values:
- `$numeric` - Numeric data
- `$integer` - Integer values
- `$text` - Text/string data
- `$ascii` - ASCII text
- `$date` - Date values
- `$timestamp` - Timestamp values
- `$key` - Key field
- `$hidden` - Hidden field

## Data Types

QVD files support the following data types:

### Numeric Types

- **INTEGER**: Whole numbers without decimal places
- **FLOAT**: Floating-point numbers
- **FIX**: Fixed-point numbers with specified decimal places
- **MONEY**: Monetary values with currency formatting

### Temporal Types

- **DATE**: Date values
- **TIME**: Time values
- **TIMESTAMP**: Combined date and time

### Text Types

- **TEXT**: String/text data
- **UNKNOWN**: Type not determined or mixed types

## Compression

QVD files use efficient compression techniques:

1. **Symbol Tables**: Distinct values are stored once and referenced by index
2. **Bit Packing**: Values are stored using minimal bit width based on cardinality
3. **Dictionary Encoding**: Repeated values use dictionary compression

The `noOfSymbols` field indicates the cardinality, which directly impacts compression efficiency. Fields with low cardinality (few distinct values) compress very well.

## Use Cases for Metadata Comparison

When comparing two QVD files, metadata can reveal:

### Schema Changes
- **Field additions/removals**: Compare field names
- **Type changes**: Compare field types and tags
- **Cardinality changes**: Compare `noOfSymbols` to detect data distribution changes

### Data Quality
- **Record count differences**: Compare `noOfRecords`
- **Field characteristics**: Compare `extent`, `type`, and `tags`

### Temporal Changes
- **Creation time**: Compare `createUtcTime` to understand data freshness
- **Source changes**: Compare source metadata to track data lineage

### Structural Changes
- **Compression differences**: Compare storage-related fields
- **Format changes**: Compare `numberFormat` for numeric fields

## Accessing Metadata

In the Ctrl-Q QVD Viewer extension, metadata is accessed via the `QvdReader` class:

```javascript
import QvdReader from './qvdReader.mjs';

const reader = new QvdReader();
const result = await reader.read(filePath, 0); // 0 = load only metadata, no data

const { metadata } = result;
console.log(metadata.noOfRecords);  // File-level metadata
console.log(metadata.fields);        // Array of field metadata
```

## References

- [qvdjs Library](https://github.com/NodeJsDevelopment/qvdjs) - JavaScript library for reading QVD files
- Qlik Sense Documentation - QVD file format specifications
- [Ctrl-Q QVD Viewer Extension](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer) - This VS Code extension
