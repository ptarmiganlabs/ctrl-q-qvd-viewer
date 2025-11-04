# QVD Data Profiling

The data profiling feature in Ctrl-Q QVD Viewer helps you understand the distribution and frequency of values within your QVD fields. This is especially valuable when working with dimensional data in star-schema models.

## Overview

Data profiling analyzes value distributions in QVD fields, providing:

- **Visual analysis** with interactive bar charts showing top values
- **Detailed tables** with complete frequency distributions
- **Statistical summaries** including total rows, unique values, and NULL counts
- **Data quality assessment** with color-coded indicators and actionable recommendations
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

### Statistical Analysis for Numeric Fields

For fields with predominantly numeric values (≥90% numeric), the profiling includes comprehensive statistical analysis:

#### Descriptive Statistics
- **Min/Max**: Minimum and maximum values
- **Mean**: Average value
- **Median**: Middle value (50th percentile)
- **Mode**: Most frequently occurring value(s)
- **Sum**: Total of all values
- **Count**: Number of non-null numeric values

#### Spread Measures
- **Range**: Difference between max and min
- **Standard Deviation**: Measure of data spread
- **Variance**: Square of standard deviation
- **Interquartile Range (IQR)**: Q3 - Q1, representing the middle 50% of data

#### Distribution Metrics
- **Quartiles**: Q1 (25th percentile), Q2 (median), Q3 (75th percentile)
- **Percentiles**: 10th, 25th, 50th, 75th, and 90th percentiles
- **Skewness**: Measure of distribution asymmetry
  - Negative: Left-skewed (tail extends left)
  - Zero: Symmetric distribution
  - Positive: Right-skewed (tail extends right)
- **Kurtosis**: Measure of tail heaviness (excess kurtosis)
  - Negative: Lighter tails than normal distribution
  - Zero: Similar to normal distribution
  - Positive: Heavier tails than normal distribution

#### Outlier Detection
Using the 1.5 × IQR method:
- **Outlier Count**: Number of values outside [Q1 - 1.5×IQR, Q3 + 1.5×IQR]
- **Outlier Percentage**: Proportion of outliers in the dataset
- **Lower/Upper Bounds**: Boundaries for outlier detection
- **Sample Outliers**: List of the first 10 outlier values (if any)

### Data Quality Assessment

Every profiled field includes a comprehensive data quality assessment with actionable insights:

#### Quality Score
- **Overall Score**: 0-100 quality score with color-coded indicator
  - 🟢 **Green (80-100)**: Good quality data
  - 🟡 **Yellow (50-79)**: Fair quality with warnings
  - 🔴 **Red (0-49)**: Poor quality requiring attention
- **Quality Level**: Good, Fair, or Poor classification
- **Issues & Warnings**: Specific problems and recommendations

#### Completeness Metrics
- **Non-Null Percentage**: Percentage of values that are not null or undefined
- **Fill Rate**: Percentage of values that are populated (excluding empty strings)
- **Missing Values**: Count and percentage of null/undefined values
- **Empty Strings**: Count and percentage of empty string values (if present)

**Example:**
- Non-Null %: 95.2% (19,040 out of 20,000 values)
- Fill Rate: 92.8% (some non-null values are empty strings)
- Missing Values: 960 (4.8%)

#### Cardinality Analysis
- **Cardinality Ratio**: Unique values / Total rows
- **Classification** with automatic categorization:
  - **High Cardinality (>80%)**: Potential identifier or key field
    - *Recommendation*: Consider using as primary key or unique identifier
  - **Medium Cardinality (5-80%)**: Good for filtering and grouping
    - *Recommendation*: Balanced selectivity for analysis operations
  - **Low Cardinality (<5%)**: Dimension candidate
    - *Recommendation*: Suitable for filtering, grouping, and categorical analysis

**Example:**
- Cardinality Ratio: 87.3% (17,460 unique values out of 20,000 rows)
- Classification: High Cardinality
- Recommendation: Potential identifier/key field. Consider using as a primary key.

#### Uniqueness Score
- **Unique Percentage**: Percentage of values that appear only once
- **Duplicate Count**: Total number of duplicate value occurrences
- **Duplicated Distinct Values**: Number of unique values that have duplicates
- **Top Duplicated Values**: List of most frequently duplicated values with counts

**Example:**
- Unique Values: 65.2% (13,040 unique out of 20,000)
- Duplicate Count: 6,960 (34.8% are duplicates)
- Duplicated Distinct Values: 420
- Top Duplicates: "Unknown" appears 1,200 times (6.0%)

#### Distribution Quality
- **Evenness Score**: 0-100% measure using Pielou's evenness index
  - Higher scores indicate more even distribution across values
  - Lower scores indicate skewed/concentrated distributions
- **Shannon Entropy**: Information entropy measure (higher = more diverse)
- **Distribution Type**: Classification of distribution pattern
  - Very Even (≥80%)
  - Moderately Even (60-79%)
  - Slightly Skewed (40-59%)
  - Moderately Skewed (20-39%)
  - Highly Skewed (<20%)

**Example:**
- Evenness Score: 42.3%
- Distribution Type: Slightly Skewed
- Shannon Entropy: 4.126 (indicates moderate diversity)

#### Actionable Recommendations

The quality assessment provides context-specific recommendations based on the field's characteristics:

- **High Cardinality Fields**: Suggests using as identifiers or keys
- **Low Cardinality Fields**: Recommends as dimensions for filtering
- **Poor Completeness**: Highlights data quality issues requiring attention
- **Highly Skewed Distributions**: Identifies concentrated value patterns

### Visualizations

#### Interactive Bar Chart (Categorical Fields)
- Displays the **top 20 most frequent values**
- Uses VS Code theme colors for consistency
- Responsive design adapts to window size
- Interactive tooltips on hover

#### Histogram (Numeric Fields)
- Displays **value distribution across bins**
- Bins calculated dynamically (up to 20 bins using square root rule)
- Shows frequency distribution visually
- X-axis shows value ranges, Y-axis shows frequency

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

**Quality Insights:**
- Cardinality: 2 unique values (0.002%) - Low Cardinality
- Recommendation: Perfect dimension candidate for filtering
- Distribution: Moderately Skewed (70/30 split)
- Completeness: 100% (no missing values)

### 2. Data Quality Checks

Identify data issues through profiling:

- Unexpected NULL values
- Unusual value frequencies
- Data entry errors
- Outliers or anomalies

**Example:** Discover that a `country` field has 15 variations of "United States" due to inconsistent data entry.

**Quality Insights:**
- Quality Score: 65/100 (Fair)
- Warning: 12% of values are null
- Cardinality: Medium (127 unique values for 195 countries)
- Top Duplicates: Multiple variants of same country names
- Recommendation: Standardize country names to improve quality

**Numeric Field Example:** Profile a `temperature` field and find:
- Mean: 22.5°C, Median: 21.8°C (slightly right-skewed)
- 15 outliers (0.3%) detected above 45°C
- Standard deviation: 8.2°C indicates moderate variability
- Quality Score: 88/100 (Good)
- Completeness: 97.5% (2.5% missing)

### 3. Performance Optimization

Understand field characteristics for optimization:

- High-cardinality fields (many unique values)
- Low-cardinality fields (few unique values)
- Null percentages
- Distribution patterns

**Example:** Identify that an `order_id` field has 1 million unique values (100% cardinality) while `order_status` has only 5 unique values.

**Quality Insights:**
- `order_id`: High Cardinality (99.8%) - Excellent primary key candidate
- `order_status`: Low Cardinality (0.025%) - Perfect dimension for filtering
- Distribution Quality: `order_status` is highly skewed (80% "completed")
- Both fields have 100% completeness

### 4. Quantitative Analysis

Use statistical metrics for numeric fields:

- **Sales Analysis**: Analyze revenue distribution, identify high-value outliers
- **Inventory Management**: Monitor stock levels, detect unusual quantities
- **Performance Metrics**: Understand response times, identify bottlenecks
- **Sensor Data**: Analyze temperature, pressure, or other measurements

**Example:** Profile an `order_amount` field:
- Mean: $125, Median: $89 (distribution skewed by high-value orders)
- Q1: $45, Q3: $178 (IQR: $133)
- 87 outliers (2.1%) above $423 requiring review

### 5. Documentation and Analysis

Export profiling results for:

- Creating data dictionaries
- Documenting field characteristics
- Sharing insights with team members
- Building data quality reports
- Statistical analysis reports

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

## Interpreting Data Quality Metrics

### Understanding Quality Scores

The quality score (0-100) is calculated based on multiple factors:

**High Quality (80-100)** 🟢
- ≥90% completeness (non-null values)
- ≥80% fill rate (populated values)
- Reasonably even distribution
- No critical data issues

**Fair Quality (50-79)** 🟡
- 70-90% completeness
- Some missing or empty values
- May have distribution concerns
- Requires monitoring

**Poor Quality (0-49)** 🔴
- <70% completeness
- Significant missing data
- Critical data issues
- Immediate attention needed

### Cardinality Classification Guide

**High Cardinality (>80% unique)**
- Each row has a mostly unique value
- Examples: IDs, timestamps, transaction numbers
- **Use for**: Primary keys, unique identifiers
- **Avoid for**: Grouping operations (too many groups)

**Medium Cardinality (5-80% unique)**
- Balanced between uniqueness and repetition
- Examples: customer names, product SKUs, zip codes
- **Use for**: Filtering, joins, moderate grouping
- **Ideal for**: Most analytical operations

**Low Cardinality (<5% unique)**
- Few distinct values with high repetition
- Examples: status codes, categories, yes/no flags
- **Use for**: Dimensions, filters, grouping
- **Ideal for**: Aggregation and segmentation

### Distribution Quality Interpretation

**Very Even Distribution (≥80%)**
- Values are distributed uniformly
- Each value appears with similar frequency
- Indicates well-balanced data

**Moderately Even (60-79%)**
- Mostly balanced with some variation
- Acceptable for most use cases

**Skewed (<60%)**
- Some values dominate the distribution
- Common in real-world data
- Consider implications for analysis:
  - May need stratified sampling
  - Dominant values will drive aggregates
  - Consider filtering out extremes for certain analyses

## Tips and Tricks

1. **Compare Field Distributions**: Select 2-3 related fields to compare their distributions visually

2. **Identify Key Dimensions**: Profile dimension tables to understand which fields have good cardinality for filtering

3. **Find Data Quality Issues**: Look for unexpected values, NULL counts, or unusual distributions

4. **Use Quality Scores for Prioritization**: Focus on fields with lower quality scores for data cleansing efforts

5. **Leverage Cardinality Recommendations**: Follow the cardinality-based recommendations for optimal field usage

6. **Monitor Distribution Skewness**: Highly skewed distributions may require special handling in analysis

7. **Track Completeness Over Time**: Compare completeness metrics across different data loads to identify data quality trends

8. **Export for Documentation**: Use the Markdown option to create data dictionaries with quality metrics

9. **Build Analysis Apps**: Export to QVS and load into Qlik Sense for deeper analysis

10. **Check Before Loading**: Profile QVDs before deciding whether to load them into Qlik apps

11. **Identify Duplicate Patterns**: Review top duplicated values to understand data repetition patterns

12. **Use Evenness Score**: Low evenness scores indicate opportunities for data normalization or segmentation

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
