/**
 * Histogram binning for the profiling webviews. Both webview templates inline
 * computeHistogram's source text with toString(), so it must not use anything
 * from outside its own body: no imports, constants or helper functions.
 */

/**
 * Sort a numeric field's distinct values into up to 20 bins of equal width
 * @param {Array<{value: *, count: number}>} distributions - Each distinct value and how many rows hold it
 * @param {number} totalCount - Rows with a value, which sets the number of bins and the percentages
 * @returns {{labels: string[], counts: number[], rows: Array<{from: string, to: string, count: number, percentage: string}>}|null}
 *   The chart's labels and bar heights, and the histogram table's rows; null when no value is numeric
 */
export function computeHistogram(distributions, totalCount) {
  // Distinct values only, weighted by their counts: expanding them could mean millions of numbers
  const numericValues = [];
  distributions.forEach((dist) => {
    const value = parseFloat(dist.value);
    if (!isNaN(value)) {
      numericValues.push({ value, count: dist.count });
    }
  });

  if (numericValues.length === 0) {
    return null;
  }

  const min = Math.min(...numericValues.map((v) => v.value));
  const max = Math.max(...numericValues.map((v) => v.value));
  const binCount = Math.max(1, Math.min(20, Math.ceil(Math.sqrt(totalCount))));
  const binWidth = (max - min) / binCount;
  // Enough decimals to tell neighbouring bin edges apart: one past binWidth's first significant digit
  const decimals =
    binWidth > 0 && isFinite(binWidth)
      ? Math.min(20, Math.max(1, 1 - Math.floor(Math.log10(binWidth))))
      : 1;

  const counts = Array(binCount).fill(0);
  numericValues.forEach(({ value, count }) => {
    let binIndex = binWidth === 0 ? 0 : Math.floor((value - min) / binWidth);
    // The maximum falls on the last bin's upper edge
    if (binIndex >= binCount) binIndex = binCount - 1;
    counts[binIndex] += count;
  });

  const rows = counts.map((count, i) => ({
    from: (min + i * binWidth).toFixed(decimals),
    to: (min + (i + 1) * binWidth).toFixed(decimals),
    count,
    percentage:
      totalCount > 0 ? ((count / totalCount) * 100).toFixed(2) : "0.00",
  }));

  return {
    labels: rows.map((row) => `${row.from} – ${row.to}`),
    counts,
    rows,
  };
}
