/**
 * Gap Detection Analysis
 * Detects missing dates in sequences and calculates coverage
 */

/**
 * Detect gaps in date sequences
 * @param {Array<Date>} dates - Array of parsed dates (should be sorted)
 * @param {number} expectedGapDays - Expected gap between consecutive dates (default: 1)
 * @returns {Object} Gap detection analysis
 */
export function detectDateGaps(dates, expectedGapDays = 1) {
  if (dates.length < 2) {
    return {
      hasGaps: false,
      gapCount: 0,
      largestGap: null,
      gaps: [],
      coverage: 100,
    };
  }

  const sortedDates = dates.slice().sort((a, b) => a - b);
  const gaps = [];
  const expectedGapMs = expectedGapDays * 24 * 60 * 60 * 1000;
  let largestGap = null;

  for (let i = 1; i < sortedDates.length; i++) {
    const gapMs = sortedDates[i] - sortedDates[i - 1];
    const gapDays = gapMs / (24 * 60 * 60 * 1000);

    // Consider it a gap if it's significantly larger than expected
    // Using 1.5x multiplier to allow for minor variations (e.g., weekends in daily data)
    if (gapMs > expectedGapMs * 1.5) {
      const gap = {
        from: sortedDates[i - 1],
        to: sortedDates[i],
        days: Math.floor(gapDays),
      };
      gaps.push(gap);

      if (largestGap === null || gapDays > largestGap.days) {
        largestGap = gap;
      }
    }
  }

  // Calculate coverage (actual unique dates vs. expected dates in range)
  // Note: Uses unique date count to handle duplicates correctly
  const uniqueDates = new Set(sortedDates.map(d => d.getTime()));
  const totalSpanDays = Math.floor((sortedDates[sortedDates.length - 1] - sortedDates[0]) / (24 * 60 * 60 * 1000));
  const expectedDates = Math.floor(totalSpanDays / expectedGapDays) + 1;
  const actualUniqueDates = uniqueDates.size;
  const coverage = expectedDates > 0 ? (actualUniqueDates / expectedDates) * 100 : 100;

  return {
    hasGaps: gaps.length > 0,
    gapCount: gaps.length,
    largestGap,
    gaps: gaps.slice(0, 10), // Return top 10 gaps
    coverage: Math.min(100, coverage),
    expectedDates,
    actualDates: actualUniqueDates,
  };
}
