/**
 * Help text content for quality metrics
 * Each metric has explanatory text and a Wikipedia link for further reading
 */

export const metricHelpContent = {
  nonNullPercentage: {
    text: "Percentage of values that are not null or undefined. High percentages indicate better data completeness.",
    link: "https://en.wikipedia.org/wiki/Data_quality#Completeness",
  },
  fillRate: {
    text: "Percentage of values that are populated (excluding empty strings). Differs from non-null % as it counts empty strings as missing.",
    link: "https://en.wikipedia.org/wiki/Data_quality#Completeness",
  },
  missingValues: {
    text: "Count and percentage of null or undefined values in the field.",
    link: "https://en.wikipedia.org/wiki/Missing_data",
  },
  emptyStrings: {
    text: "Count and percentage of empty string values. These are non-null but contain no data.",
    link: "https://en.wikipedia.org/wiki/Empty_string",
  },
  cardinalityRatio: {
    text: "Ratio of unique values to total rows (0-100%).\n\nHigh ratios (>80%) indicate many unique values with few duplicates.\n\nLow ratios (<5%) indicate few unique values with many duplicates.",
    link: "https://en.wikipedia.org/wiki/Cardinality_(data_modeling)",
  },
  classification: {
    text: "Automatic classification based on cardinality ratio:\n\n- High Cardinality (>80%) for identifiers/keys\n- Medium Cardinality (5-80%) for filters\n- Low Cardinality (<5%) for dimensions.",
    link: "https://en.wikipedia.org/wiki/Cardinality_(data_modeling)",
  },
  uniqueValues: {
    text: "Percentage of values that appear only once in the field. High uniqueness indicates potential key fields.",
    link: "https://en.wikipedia.org/wiki/Unique_key",
  },
  duplicateCount: {
    text: "Total number of duplicate value occurrences in the field. Helps identify data redundancy.",
    link: "https://en.wikipedia.org/wiki/Data_redundancy",
  },
  duplicatedDistinctValues: {
    text: "Number of distinct values that appear more than once. Indicates variety in duplicated data.",
    link: "https://en.wikipedia.org/wiki/Data_redundancy",
  },
  evennessScore: {
    text: "Measure of distribution evenness using Pielou's evenness index (0-100%). Higher scores indicate more uniform distribution.",
    link: "https://en.wikipedia.org/wiki/Species_evenness",
  },
  distributionType: {
    text: "Classification of distribution pattern from Very Even to Highly Skewed based on evenness score.",
    link: "https://en.wikipedia.org/wiki/Skewness",
  },
  shannonEntropy: {
    text: "Shannon entropy measures information diversity. Higher values indicate more diverse value distributions.",
    link: "https://en.wikipedia.org/wiki/Entropy_(information_theory)",
  },
  totalRowsProfiling: {
    text: "Total number of rows used for this profiling analysis. This reflects the data loaded into memory from the QVD file.\n\nFor performance, only the first 100,000 rows are loaded by default. This limit is configurable in VS Code settings (search for 'QVD Viewer: Max Preview Rows').\n\nTo profile all rows in a QVD file for maximum accuracy, you can temporarily increase this setting or use the 'Load All Data' option before running profiling.",
    link: "https://en.wikipedia.org/wiki/Data_profiling",
  },
  truncatedDistribution: {
    text: "All loaded rows are analyzed, but the distribution display is limited to the most frequent unique values for performance. For example, if you have 98,543 rows with 5,234 unique values, all 98,543 rows are analyzed, but only the top 1,000 most frequent unique values are displayed in the distribution table.",
    link: "https://en.wikipedia.org/wiki/Data_profiling",
  },
  dataQualityAssessment: {
    text: "The Data Quality Assessment provides an overall score (0-100) calculated from multiple metrics:\n\n• Completeness: Percentage of non-null, non-empty values\n• Cardinality: Distribution of unique values (too few or too many can indicate issues)\n• Uniqueness: Ratio of unique values to total values\n• Distribution Quality: Evenness of value distribution (Shannon entropy)\n\nScore Interpretation:\n• 0-60 (Poor): Significant data quality issues detected - review warnings\n• 61-80 (Fair): Some quality concerns - check issues list\n• 81-100 (Good): High quality data with minimal issues\n\nThe Issues and Warnings sections provide specific actionable insights for improving data quality.",
    link: "https://en.wikipedia.org/wiki/Data_quality",
  },

  // Temporal Analysis Metrics
  temporalEarliest: {
    text: "The oldest date found in the field. Helps identify the beginning of your time series data.",
    link: "https://en.wikipedia.org/wiki/Time_series",
  },
  temporalLatest: {
    text: "The most recent date found in the field. Helps identify the end of your time series data.",
    link: "https://en.wikipedia.org/wiki/Time_series",
  },
  temporalTimeSpan: {
    text: "The total time period covered by the data, displayed in human-readable format (e.g., '2 years, 3 months'). Uses approximate values for readability.",
    link: "https://en.wikipedia.org/wiki/Time_series",
  },
  temporalFormat: {
    text: "The detected date format used in the field. Supports ISO 8601, Unix timestamps, US/EU formats, and more. Higher confidence indicates more consistent formatting.",
    link: "https://en.wikipedia.org/wiki/ISO_8601",
  },
  temporalHasGaps: {
    text: "Indicates whether there are missing dates in the expected sequence. 'Yes' suggests data collection gaps or business closures.",
    link: "https://en.wikipedia.org/wiki/Missing_data",
  },
  temporalGapCount: {
    text: "Number of gaps detected in the date sequence. A gap is a period longer than expected between consecutive dates (using 1.5x multiplier for weekends/holidays).",
    link: "https://en.wikipedia.org/wiki/Missing_data",
  },
  temporalCoverage: {
    text: "Percentage of expected dates that are present in the dataset (based on unique dates). 100% means no dates are missing in the sequence. Lower values indicate gaps.",
    link: "https://en.wikipedia.org/wiki/Data_quality#Completeness",
  },
  temporalLargestGap: {
    text: "The longest period (in days) without any data. Helps identify major data collection issues or business closure periods.",
    link: "https://en.wikipedia.org/wiki/Missing_data",
  },
  temporalTrendType: {
    text: "Classification of the overall pattern in your time series data:\n\n- Strong/Moderate Growth: Increasing over time\n- Constant: Stable over time\n- Strong/Moderate Decline: Decreasing over time\n\nBased on linear regression analysis.",
    link: "https://en.wikipedia.org/wiki/Trend_analysis",
  },
  temporalTrendDescription: {
    text: "Human-readable explanation of the detected trend pattern. Helps understand if your data is growing, declining, or remaining stable over time.",
    link: "https://en.wikipedia.org/wiki/Trend_analysis",
  },
  temporalYearlyDistribution: {
    text: "Count of records per year. Helps identify yearly patterns, growth trends, and data collection consistency across years.",
    link: "https://en.wikipedia.org/wiki/Time_series",
  },
  temporalMonthlyDistribution: {
    text: "Count of records per month (January through December). Useful for identifying seasonal patterns and monthly trends in your data.",
    link: "https://en.wikipedia.org/wiki/Seasonality",
  },
  temporalDayOfWeekDistribution: {
    text: "Count of records per day of week (Sunday through Saturday). Helps identify business patterns, such as weekday vs. weekend activity.",
    link: "https://en.wikipedia.org/wiki/Time_series",
  },
  temporalQuarterlyDistribution: {
    text: "Count of records per quarter (Q1-Q4 by year). Useful for business analysis and identifying quarterly patterns.",
    link: "https://en.wikipedia.org/wiki/Fiscal_quarter",
  },
  temporalValidDates: {
    text: "Number of values that were successfully parsed as valid dates. Higher counts indicate better data quality.",
    link: "https://en.wikipedia.org/wiki/Data_quality",
  },
  temporalInvalidDates: {
    text: "Number of values that could not be parsed as dates. High counts may indicate formatting issues or data quality problems.",
    link: "https://en.wikipedia.org/wiki/Data_quality",
  },
  temporalValidPercentage: {
    text: "Percentage of total values that are valid dates. Higher percentages indicate better data quality. Values below 80% may need investigation.",
    link: "https://en.wikipedia.org/wiki/Data_quality",
  },
};

/**
 * Create help icon HTML with tooltip
 * @param {string} metricKey - The metric key to look up help content
 * @returns {string} HTML string for the help icon and tooltip
 */
export function createHelpIconHtml(metricKey) {
  const help = metricHelpContent[metricKey];
  if (!help) return "";

  // Escape HTML special characters in the text
  const escapedText = help.text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  return `<span class="quality-metric-help">?
      <span class="quality-metric-tooltip">
          ${escapedText}
          <br/><br/>
          <a href="${help.link}" target="_blank" rel="noopener noreferrer">Learn more →</a>
      </span>
  </span>`;
}
