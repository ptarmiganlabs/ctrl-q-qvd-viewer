/**
 * Gap Detection Analysis
 * Detects missing dates in sequences and calculates coverage
 */

/**
 * Detect gaps in date sequences
 * Rows that share a date are no gap, so only the distinct dates are looked at.
 * @param {Float64Array} times - Each distinct date's time, as milliseconds since 1970, in ascending order
 * @param {number} dateCount - Rows with a date, the distinct ones' repeats included
 * @param {number} expectedGapDays - Expected gap between consecutive dates (default: 1)
 * @returns {Object} Gap detection analysis
 */
export function detectDateGaps(times, dateCount, expectedGapDays = 1) {
  if (dateCount < 2) {
    return {
      hasGaps: false,
      gapCount: 0,
      largestGap: null,
      gaps: [],
      coverage: 100,
    };
  }

  const gaps = [];
  let gapCount = 0;
  const expectedGapMs = expectedGapDays * 24 * 60 * 60 * 1000;
  let largestGap = null;

  for (let i = 1; i < times.length; i++) {
    const gapMs = times[i] - times[i - 1];
    const gapDays = gapMs / (24 * 60 * 60 * 1000);

    // Consider it a gap if it's significantly larger than expected
    // Using 1.5x multiplier to allow for minor variations (e.g., weekends in daily data)
    if (gapMs > expectedGapMs * 1.5) {
      const gap = {
        from: new Date(times[i - 1]),
        to: new Date(times[i]),
        days: Math.floor(gapDays),
      };
      gapCount++;
      // The first 10 are listed
      if (gaps.length < 10) {
        gaps.push(gap);
      }

      if (largestGap === null || gapDays > largestGap.days) {
        largestGap = gap;
      }
    }
  }

  // Calculate coverage (actual unique dates vs. expected dates in range)
  const totalSpanDays = Math.floor((times[times.length - 1] - times[0]) / (24 * 60 * 60 * 1000));
  const expectedDates = Math.floor(totalSpanDays / expectedGapDays) + 1;
  const actualUniqueDates = times.length;
  const coverage = expectedDates > 0 ? (actualUniqueDates / expectedDates) * 100 : 100;

  return {
    hasGaps: gapCount > 0,
    gapCount,
    largestGap,
    gaps,
    coverage: Math.min(100, coverage),
    expectedDates,
    actualDates: actualUniqueDates,
  };
}
