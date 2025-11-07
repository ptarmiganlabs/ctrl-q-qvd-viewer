# Large QVD Test Files

This directory contains large QVD files for performance testing the VS Code extension.

## Current Test Files

### orders_20m.qvd

- **Size:** ~514 MB
- **Rows:** 20 million
- **Columns:** 11
- **Type:** Low entropy (compresses well)
- **Generated from:** `generate-csv-20m-rows-11-cols.js`

### orders_30m_21col_low_entropy.qvd

- **Size:** ~1.7 GB
- **Rows:** 30 million
- **Columns:** 21
- **Type:** Low entropy (compresses well)
- **Generated from:** `generate-csv-30m-rows-21-cols.js`

### orders_30m_20col_high_entropy.qvd (Coming Soon)

- **Expected Size:** ~2.5-3 GB (high entropy data doesn't compress well)
- **Rows:** 30 million
- **Columns:** 20
- **Type:** High entropy with GUIDs, hashes, unique values
- **Generate from:** `generate-csv-30m-rows-20-cols-high-entropy.js`

## CSV Generators

The directory contains Node.js scripts to generate CSV files:

1. **generate-csv-20m-rows-11-cols.js**

   - Creates 20M rows with 11 columns
   - E-commerce order data
   - Low entropy (repeating values)
   - Run time: ~2-3 minutes

2. **generate-csv-30m-rows-21-cols.js**

   - Creates 30M rows with 21 columns
   - Extended e-commerce order data
   - Low entropy (repeating values)
   - Run time: ~3-5 minutes

3. **generate-csv-30m-rows-20-cols-high-entropy.js**
   - Creates 30M rows with 20 columns
   - High entropy data (GUIDs, hashes, unique emails, IPs)
   - **Worst case scenario** for QVD compression
   - Run time: ~5-8 minutes (slower due to crypto operations)
   - Expected CSV size: ~3-4 GB

## Usage

### Generate CSV Files

```bash
cd test-data/fake_data/large_qvd

# Generate 20M row CSV
node generate-csv-20m-rows-11-cols.js

# Generate 30M row, 21 column CSV
node generate-csv-30m-rows-21-cols.js

# Generate 30M row high entropy CSV
node generate-csv-30m-rows-20-cols-high-entropy.js
```

### Convert CSV to QVD

Use Qlik Sense or QlikView to load the CSV and save as QVD:

```qlik
// Example Qlik script
LOAD *
FROM [lib://path/to/orders_20m.csv]
(txt, utf8, embedded labels, delimiter is ',', msq);

STORE TableName INTO [lib://path/to/orders_20m.qvd] (qvd);
```

### Run Performance Tests

```bash
# From project root
./test-performance.sh

# Or run specific test
npm test -- --grep "Performance: Test All Large QVD Files"
```

## Test Expectations

### Performance Targets

| File Size  | Expected Read Time (5000 rows) | Expected First Open | Expected Reopen |
| ---------- | ------------------------------ | ------------------- | --------------- |
| < 100 MB   | < 100ms                        | < 3s                | < 1s            |
| 100-500 MB | < 200ms                        | < 5s                | < 1.5s          |
| 500MB-1GB  | < 500ms                        | < 10s               | < 2s            |
| > 1 GB     | < 1000ms                       | < 30s               | < 3s            |

### What We're Testing

1. **QvdReader Performance** - How fast can we read the first 5000 rows?
2. **VS Code First Open** - How long to initialize webview and render?
3. **VS Code Reopen** - How much does caching help?
4. **Scalability** - Does performance scale linearly with file size?

## Known Issues

- **First open slowness** - Webview initialization takes 4-5 seconds regardless of file size
- **Asset loading** - Tabulator.js and Chart.js are embedded inline
- **JSON serialization** - Large data structures embedded in HTML

See `docs/PERFORMANCE_INVESTIGATION.md` for detailed analysis and optimization recommendations.

## Future Tests

- [ ] Test with 50M+ row QVD
- [ ] Test with very wide tables (100+ columns)
- [ ] Test with binary-heavy QVD files
- [ ] Test on network drives (Windows scenario)
- [ ] Test with corrupted/malformed QVD files
