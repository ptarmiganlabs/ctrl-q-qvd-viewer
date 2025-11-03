# QVD Data Profiling

The data profiling feature in Ctrl-Q QVD Viewer helps you understand the distribution and frequency of values within your QVD fields. This is especially valuable when working with dimensional data in star-schema models.

## Overview

Data profiling analyzes value distributions in QVD fields, providing:

- **Visual analysis** with interactive bar charts showing top values
- **Detailed tables** with complete frequency distributions
- **Statistical summaries** including total rows, unique values, and NULL counts
- **Export capabilities** to generate Qlik .qvs scripts for further analysis

## Accessing the Profiling Feature

1. Open a QVD file in VS Code
2. Click on the **📊 Profiling** tab (located to the right of the Lineage tab)
3. Select 1-3 fields to profile using the checkbox grid
4. Click **▶️ Run Profiling** to analyze the data

## Field Selection

The profiling tab presents all fields in the QVD as checkboxes with their unique value counts:

```
☐ customer_id (1,234 unique values)
☐ region (5 unique values)
☐ product_category (15 unique values)
```

**Selection Rules:**

- Select a minimum of 1 field
- Select a maximum of 3 fields (for comparison)
- Attempting to select more than 3 fields shows a warning and prevents selection

## Large File Warning

For QVD files with more than 100,000 rows, a warning banner appears before profiling:

> ⚠️ **Large File Warning:** This QVD contains 580,251 rows. Profiling will load all data into memory, which may take some time and use significant resources. Click "Run Profiling" below to proceed.

This ensures you're aware of potential performance impacts when profiling large datasets.

## Profiling Results

After clicking "Run Profiling", the extension loads all data from the QVD and computes value distributions. Results are displayed for each selected field:

### Statistics Card

Each field shows:

- **Total Rows**: Number of rows analyzed
- **Unique Values**: Count of distinct values in the field
- **NULL/Empty**: Count of null or empty values

### Interactive Bar Chart

- Displays the **top 20 most frequent values**
- Uses VS Code theme colors for consistency
- Responsive design adapts to window size
- Interactive tooltips on hover

### Distribution Table

- Shows **complete value distribution** with pagination
- Columns: Value, Count, Percentage
- Features:
  - Sortable columns
  - Search/filter capabilities
  - Pagination (25 items per page by default)
  - Configurable page sizes (10, 25, 50, 100 items)

### Truncation Notice

If a field has more than 1,000 unique values, the distribution is truncated for performance:

> Distribution truncated to top 1,000 values

## Opening Results in New Windows

Each profiled field has an **"Open in new Window"** dropdown button with two options:

### 📝 Markdown

Opens the profiling results as markdown in a new editor column:

- Text-based format
- Easy to save as a `.md` file
- Good for documentation and sharing
- Contains statistics and complete distribution table

**Example Markdown Output:**

```markdown
# Profiling: color_id

**Source:** inventory_parts.qvd

## Statistics

- **Total Rows:** 580,251
- **Unique Values:** 131
- **NULL/Empty:** 0

## Value Distribution

| Value | Count   | Percentage |
| ----- | ------- | ---------- |
| 0     | 115,176 | 19.85%     |
| 15    | 66,549  | 11.47%     |
| 71    | 55,317  | 9.53%      |

...
```

### 📊 Visual Analysis

Opens an interactive webview panel with visualizations:

- Statistics cards
- Interactive Chart.js bar chart (top 20 values)
- Tabulator table with complete distribution
- Full pagination and search capabilities
- VS Code theme integration

**When to use each option:**

- **Markdown**: For documentation, reports, or text-based analysis
- **Visual Analysis**: For interactive exploration and data visualization

## Exporting to QVS Scripts

Click the **💾 Export to QVS Script** button to create a Qlik Sense/QlikView load script containing the frequency data.

### Export Options

#### 1. Delimiter Selection

Choose the delimiter for the INLINE statement:

- **Tab** (\\t) - Good general purpose delimiter (default)
- **Pipe** (|) - Recommended when data contains commas
- **Comma** (,) - Standard CSV-style
- **Semicolon** (;) - Alternative to comma

#### 2. Row Limit Selection

Choose how many values to export per field:

- **Top 20 values**
- **Top 100 values**
- **Top 1,000 values**
- **Top 10,000 values**
- **All values (complete)**

### Generated QVS Script

The exported script includes:

- Header comments with generation date and source QVD
- Field statistics in comments
- INLINE LOAD statements with the chosen delimiter
- Proper delimiter specification in the statement

**Example with Pipe delimiter, top 100 values:**

```qlik
// QVD Profiling Data Export
// Generated: 2025-11-03T07:00:00.000Z
// Source QVD: inventory_parts.qvd
// Delimiter: Pipe (|)
// Max rows per field: 100

// Field: color_id
// Total Rows: 580,251
// Unique Values: 131
// NOTE: Exporting top 100 values out of 131 total

[color_id_Distribution]:
LOAD * INLINE [
Value|Count|Percentage
0|115176|19.85
15|66549|11.47
71|55317|9.53
4|50217|8.65
72|43913|7.57
...
] (Delimiter is '|');
```

### Using the QVS Script

1. Save the generated script with your preferred filename
2. Open it in Qlik Sense or QlikView
3. Run the script to load the frequency data into tables
4. Use the data for:
   - Building frequency analysis dashboards
   - Identifying data quality issues
   - Understanding value distributions
   - Comparing field characteristics

## Use Cases

### 1. Dimension Analysis in Star Schemas

Profile dimension fields to understand their distribution:

- Customer segments
- Product categories
- Geographic regions
- Time periods

**Example:** Profile a `customer_type` field to discover 70% are "Retail" customers and 30% are "Wholesale".

### 2. Data Quality Checks

Identify data issues through profiling:

- Unexpected NULL values
- Unusual value frequencies
- Data entry errors
- Outliers or anomalies

**Example:** Discover that a `country` field has 15 variations of "United States" due to inconsistent data entry.

### 3. Performance Optimization

Understand field characteristics for optimization:

- High-cardinality fields (many unique values)
- Low-cardinality fields (few unique values)
- Null percentages
- Distribution patterns

**Example:** Identify that an `order_id` field has 1 million unique values (100% cardinality) while `order_status` has only 5 unique values.

### 4. Documentation and Analysis

Export profiling results for:

- Creating data dictionaries
- Documenting field characteristics
- Sharing insights with team members
- Building data quality reports

## Performance Considerations

### Memory Usage

- Profiling loads **all data** from the QVD into memory
- The extension truncates at 1,000 unique values per field
- Large files (>100k rows) trigger a warning

### Best Practices

1. Profile smaller QVDs first to understand the feature
2. Heed large file warnings before profiling
3. Select only the fields you need (1-3 max)
4. Use row limits when exporting to QVS for performance
5. Consider the "Top 100" or "Top 1,000" options for large distributions

## Comparison with Qlik Sense

The profiling feature provides similar insights to Qlik Sense's field profiling, but:

**Advantages:**

- Available directly in VS Code (no need to load data into Qlik)
- Works on QVD files without a Qlik Sense app
- Quickly analyze multiple fields side-by-side
- Export frequency data for use in any application

**Limitations:**

- Maximum of 3 fields at once (Qlik Sense handles more)
- Truncated at 1,000 unique values per field
- All data must fit in memory
- No associative model or filtering capabilities

## Tips and Tricks

1. **Compare Field Distributions**: Select 2-3 related fields to compare their distributions visually

2. **Identify Key Dimensions**: Profile dimension tables to understand which fields have good cardinality for filtering

3. **Find Data Quality Issues**: Look for unexpected values, NULL counts, or unusual distributions

4. **Export for Documentation**: Use the Markdown option to create data dictionaries

5. **Build Analysis Apps**: Export to QVS and load into Qlik Sense for deeper analysis

6. **Check Before Loading**: Profile QVDs before deciding whether to load them into Qlik apps

## Troubleshooting

### Profiling Takes Too Long

- Check the file size (number of rows)
- Select fewer fields (1 instead of 3)
- Ensure you have enough available memory

### "Maximum of 3 fields" Warning

- Uncheck some fields before selecting more
- The limit prevents memory and performance issues

### Truncated Results

- This is normal for high-cardinality fields (>1,000 unique values)
- Use the "All values" export option if you need the complete distribution
- Consider if you really need all values for your analysis

### Memory Issues

- Close other applications to free up memory
- Profile smaller QVDs first
- Select fewer fields simultaneously

## Related Features

- **Data Tab**: View the actual data values in the QVD
- **Schema Tab**: See field definitions and technical details
- **Export Feature**: Export entire datasets to various formats
- **Lineage Tab**: Understand the data transformation history

## Feedback and Contributions

Found a bug or have a feature suggestion? Please:

- Open an issue on [GitHub](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer)
- Contribute improvements via pull requests
- Share your use cases and workflows

---

For more information about Ctrl-Q QVD Viewer, see the [main README](../README.md).
