/**
 * Temporal Distribution Analysis
 * Calculates distribution of dates across various time periods
 */

/**
 * Calculate temporal distribution
 * @param {Array<Date>} dates - Array of parsed dates
 * @returns {Object} Temporal distribution analysis
 */
export function calculateTemporalDistribution(dates) {
  if (dates.length === 0) {
    return {
      byYear: {},
      byMonth: {},
      byDayOfWeek: {},
      byQuarter: {},
    };
  }

  const byYear = {};
  const byMonth = {};
  const byDayOfWeek = {};
  const byQuarter = {};

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  for (const date of dates) {
    // By year
    const year = date.getFullYear();
    byYear[year] = (byYear[year] || 0) + 1;

    // By month
    const month = monthNames[date.getMonth()];
    byMonth[month] = (byMonth[month] || 0) + 1;

    // By day of week
    const dayOfWeek = dayNames[date.getDay()];
    byDayOfWeek[dayOfWeek] = (byDayOfWeek[dayOfWeek] || 0) + 1;

    // By quarter
    const quarter = `Q${Math.floor(date.getMonth() / 3) + 1} ${year}`;
    byQuarter[quarter] = (byQuarter[quarter] || 0) + 1;
  }

  // Sort and format results
  const sortedYears = Object.entries(byYear)
    .sort((a, b) => a[0] - b[0])
    .map(([year, count]) => ({ period: year, count }));

  const sortedMonths = monthNames
    .map(month => ({ period: month, count: byMonth[month] || 0 }))
    .filter(item => item.count > 0);

  const sortedDaysOfWeek = dayNames
    .map(day => ({ period: day, count: byDayOfWeek[day] || 0 }))
    .filter(item => item.count > 0);

  const sortedQuarters = Object.entries(byQuarter)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([quarter, count]) => ({ period: quarter, count }));

  return {
    byYear: sortedYears,
    byMonth: sortedMonths,
    byDayOfWeek: sortedDaysOfWeek,
    byQuarter: sortedQuarters,
  };
}
