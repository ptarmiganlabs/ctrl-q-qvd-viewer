/**
 * Help text content for quality metrics
 * Each metric has explanatory text and a Wikipedia link for further reading
 */

export const metricHelpContent = {
  nonNullPercentage: {
    text: 'Percentage of values that are not null or undefined. High percentages indicate better data completeness.',
    link: 'https://en.wikipedia.org/wiki/Data_quality#Completeness'
  },
  fillRate: {
    text: 'Percentage of values that are populated (excluding empty strings). Differs from non-null % as it counts empty strings as missing.',
    link: 'https://en.wikipedia.org/wiki/Data_quality#Completeness'
  },
  missingValues: {
    text: 'Count and percentage of null or undefined values in the field.',
    link: 'https://en.wikipedia.org/wiki/Missing_data'
  },
  emptyStrings: {
    text: 'Count and percentage of empty string values. These are non-null but contain no data.',
    link: 'https://en.wikipedia.org/wiki/Empty_string'
  },
  cardinalityRatio: {
    text: 'Ratio of unique values to total rows. Indicates how selective the field is for indexing and querying.',
    link: 'https://en.wikipedia.org/wiki/Cardinality_(data_modeling)'
  },
  classification: {
    text: 'Automatic classification based on cardinality ratio: High (>80%) for identifiers, Medium (5-80%) for filters, Low (<5%) for dimensions.',
    link: 'https://en.wikipedia.org/wiki/Cardinality_(data_modeling)'
  },
  uniqueValues: {
    text: 'Percentage of values that appear only once in the field. High uniqueness indicates potential key fields.',
    link: 'https://en.wikipedia.org/wiki/Unique_key'
  },
  duplicateCount: {
    text: 'Total number of duplicate value occurrences in the field. Helps identify data redundancy.',
    link: 'https://en.wikipedia.org/wiki/Data_redundancy'
  },
  duplicatedDistinctValues: {
    text: 'Number of distinct values that appear more than once. Indicates variety in duplicated data.',
    link: 'https://en.wikipedia.org/wiki/Data_redundancy'
  },
  evennessScore: {
    text: "Measure of distribution evenness using Pielou's evenness index (0-100%). Higher scores indicate more uniform distribution.",
    link: 'https://en.wikipedia.org/wiki/Species_evenness'
  },
  distributionType: {
    text: 'Classification of distribution pattern from Very Even to Highly Skewed based on evenness score.',
    link: 'https://en.wikipedia.org/wiki/Skewness'
  },
  shannonEntropy: {
    text: 'Shannon entropy measures information diversity. Higher values indicate more diverse value distributions.',
    link: 'https://en.wikipedia.org/wiki/Entropy_(information_theory)'
  }
};

/**
 * Create help icon HTML with tooltip
 * @param {string} metricKey - The metric key to look up help content
 * @returns {string} HTML string for the help icon and tooltip
 */
export function createHelpIconHtml(metricKey) {
  const help = metricHelpContent[metricKey];
  if (!help) return '';
  
  // Escape HTML special characters in the text
  const escapedText = help.text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  
  return `<span class="quality-metric-help">?
      <span class="quality-metric-tooltip">
          ${escapedText}
          <br/><br/>
          <a href="${help.link}" target="_blank" rel="noopener noreferrer">Learn more →</a>
      </span>
  </span>`;
}
