/**
 * Temporal Distribution Analysis
 * Calculates distribution of dates across various time periods
 */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The distribution of a field's dates, taken a distinct date at a time with its rows
 * The counts are sums, so the order the dates come in doesn't matter.
 */
export class DateDistribution {
  #byYear = {};
  #byMonth = {};
  #byDayOfWeek = {};
  #byQuarter = {};
  #empty = true;

  /**
   * Take a date
   * @param {number} time - Its time, as milliseconds since 1970
   * @param {number} count - Rows holding it
   */
  add(time, count) {
    const date = new Date(time);
    this.#empty = false;

    // By year
    const year = date.getFullYear();
    this.#byYear[year] = (this.#byYear[year] || 0) + count;

    // By month
    const month = MONTH_NAMES[date.getMonth()];
    this.#byMonth[month] = (this.#byMonth[month] || 0) + count;

    // By day of week
    const dayOfWeek = DAY_NAMES[date.getDay()];
    this.#byDayOfWeek[dayOfWeek] = (this.#byDayOfWeek[dayOfWeek] || 0) + count;

    // By quarter
    const quarter = `Q${Math.floor(date.getMonth() / 3) + 1} ${year}`;
    this.#byQuarter[quarter] = (this.#byQuarter[quarter] || 0) + count;
  }

  /**
   * The distribution
   * @returns {Object} Temporal distribution analysis
   */
  result() {
    if (this.#empty) {
      return {
        byYear: {},
        byMonth: {},
        byDayOfWeek: {},
        byQuarter: {},
      };
    }

    // Sort and format results
    const sortedYears = Object.entries(this.#byYear)
      .sort((a, b) => a[0] - b[0])
      .map(([year, count]) => ({ period: year, count }));

    const sortedMonths = MONTH_NAMES
      .map(month => ({ period: month, count: this.#byMonth[month] || 0 }))
      .filter(item => item.count > 0);

    const sortedDaysOfWeek = DAY_NAMES
      .map(day => ({ period: day, count: this.#byDayOfWeek[day] || 0 }))
      .filter(item => item.count > 0);

    const sortedQuarters = Object.entries(this.#byQuarter)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([quarter, count]) => ({ period: quarter, count }));

    return {
      byYear: sortedYears,
      byMonth: sortedMonths,
      byDayOfWeek: sortedDaysOfWeek,
      byQuarter: sortedQuarters,
    };
  }
}
