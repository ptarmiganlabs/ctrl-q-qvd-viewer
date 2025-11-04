const assert = require("assert");

// Import temporal analysis functions
let qvdTemporalAnalysis;

suite("Temporal Analysis Test Suite", () => {
  // Load the module before running tests
  suiteSetup(async () => {
    // Import the ESM module
    qvdTemporalAnalysis = await import("../src/qvdTemporalAnalysis.mjs");
  });

  suite("Date Field Detection", () => {
    test("Detect ISO 8601 date field", () => {
      const data = [
        { date: "2024-01-01" },
        { date: "2024-01-02" },
        { date: "2024-01-03" },
        { date: "2024-01-04" },
        { date: "2024-01-05" },
      ];

      const isDate = qvdTemporalAnalysis.isDateField(data, "date");
      assert.strictEqual(isDate, true, "Should detect ISO date field");
    });

    test("Detect ISO 8601 datetime field", () => {
      const data = [
        { timestamp: "2024-01-01T10:30:00Z" },
        { timestamp: "2024-01-02T11:45:00Z" },
        { timestamp: "2024-01-03T14:20:00Z" },
        { timestamp: "2024-01-04T09:15:00Z" },
        { timestamp: "2024-01-05T16:00:00Z" },
      ];

      const isDate = qvdTemporalAnalysis.isDateField(data, "timestamp");
      assert.strictEqual(isDate, true, "Should detect ISO datetime field");
    });

    test("Detect Unix timestamp (milliseconds) field", () => {
      const data = [
        { timestamp: "1704067200000" }, // 2024-01-01
        { timestamp: "1704153600000" }, // 2024-01-02
        { timestamp: "1704240000000" }, // 2024-01-03
        { timestamp: "1704326400000" }, // 2024-01-04
        { timestamp: "1704412800000" }, // 2024-01-05
      ];

      const isDate = qvdTemporalAnalysis.isDateField(data, "timestamp");
      assert.strictEqual(isDate, true, "Should detect timestamp field");
    });

    test("Detect US date format", () => {
      const data = [
        { date: "1/1/2024" },
        { date: "1/2/2024" },
        { date: "1/3/2024" },
        { date: "1/4/2024" },
        { date: "1/5/2024" },
      ];

      const isDate = qvdTemporalAnalysis.isDateField(data, "date");
      assert.strictEqual(isDate, true, "Should detect US date format");
    });

    test("Detect EU date format", () => {
      const data = [
        { date: "1.1.2024" },
        { date: "2.1.2024" },
        { date: "3.1.2024" },
        { date: "4.1.2024" },
        { date: "5.1.2024" },
      ];

      const isDate = qvdTemporalAnalysis.isDateField(data, "date");
      assert.strictEqual(isDate, true, "Should detect EU date format");
    });

    test("Detect YYYYMMDD format", () => {
      const data = [
        { date: "20240101" },
        { date: "20240102" },
        { date: "20240103" },
        { date: "20240104" },
        { date: "20240105" },
      ];

      const isDate = qvdTemporalAnalysis.isDateField(data, "date");
      assert.strictEqual(isDate, true, "Should detect YYYYMMDD format");
    });

    test("Not detect non-date field", () => {
      const data = [
        { value: "abc" },
        { value: "def" },
        { value: "ghi" },
        { value: "jkl" },
        { value: "mno" },
      ];

      const isDate = qvdTemporalAnalysis.isDateField(data, "value");
      assert.strictEqual(isDate, false, "Should not detect non-date field");
    });

    test("Detect field with nulls", () => {
      const data = [
        { date: "2024-01-01" },
        { date: null },
        { date: "2024-01-03" },
        { date: "2024-01-04" },
        { date: "2024-01-05" },
      ];

      const isDate = qvdTemporalAnalysis.isDateField(data, "date");
      assert.strictEqual(
        isDate,
        true,
        "Should detect date field with some nulls"
      );
    });

    test("Not detect mixed field", () => {
      const data = [
        { value: "2024-01-01" },
        { value: "2024-01-02" },
        { value: "not a date" },
        { value: "2024-01-04" },
        { value: "also not a date" },
      ];

      const isDate = qvdTemporalAnalysis.isDateField(data, "value");
      assert.strictEqual(
        isDate,
        false,
        "Should not detect field with <80% dates"
      );
    });
  });

  suite("Date Range Analysis", () => {
    test("Calculate date range for simple sequence", () => {
      const data = [
        { date: "2024-01-01" },
        { date: "2024-01-02" },
        { date: "2024-01-03" },
        { date: "2024-01-04" },
        { date: "2024-01-05" },
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.strictEqual(
        qvdTemporalAnalysis.formatDate(analysis.range.earliest),
        "2024-01-01"
      );
      assert.strictEqual(
        qvdTemporalAnalysis.formatDate(analysis.range.latest),
        "2024-01-05"
      );
      assert.strictEqual(analysis.range.spanDays, 4);
    });

    test("Calculate date range for longer period", () => {
      const data = [
        { date: "2024-01-01" },
        { date: "2024-06-15" },
        { date: "2024-12-31" },
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.strictEqual(
        qvdTemporalAnalysis.formatDate(analysis.range.earliest),
        "2024-01-01"
      );
      assert.strictEqual(
        qvdTemporalAnalysis.formatDate(analysis.range.latest),
        "2024-12-31"
      );
      assert.strictEqual(analysis.range.spanDays, 365);
    });

    test("Detect date format", () => {
      const data = [
        { date: "2024-01-01" },
        { date: "2024-01-02" },
        { date: "2024-01-03" },
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.strictEqual(analysis.range.format.dominantFormat, "ISO_DATE");
      assert.ok(analysis.range.format.confidence > 90);
    });
  });

  suite("Temporal Distribution", () => {
    test("Calculate yearly distribution", () => {
      const data = [
        { date: "2022-01-01" },
        { date: "2022-06-01" },
        { date: "2023-01-01" },
        { date: "2023-06-01" },
        { date: "2024-01-01" },
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.ok(analysis.distribution.byYear.length > 0);
      
      // Check that we have data for different years
      const years = analysis.distribution.byYear.map(item => item.period);
      assert.ok(years.includes("2022"));
      assert.ok(years.includes("2023"));
      assert.ok(years.includes("2024"));
    });

    test("Calculate monthly distribution", () => {
      const data = [
        { date: "2024-01-15" },
        { date: "2024-01-20" },
        { date: "2024-02-10" },
        { date: "2024-03-05" },
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.ok(analysis.distribution.byMonth.length > 0);
      
      // Check for specific months
      const months = analysis.distribution.byMonth.map(item => item.period);
      assert.ok(months.includes("January"));
      assert.ok(months.includes("February"));
      assert.ok(months.includes("March"));
    });

    test("Calculate day of week distribution", () => {
      const data = [
        { date: "2024-01-01" }, // Monday
        { date: "2024-01-02" }, // Tuesday
        { date: "2024-01-03" }, // Wednesday
        { date: "2024-01-08" }, // Monday
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.ok(analysis.distribution.byDayOfWeek.length > 0);
      
      // Find Monday count
      const mondayData = analysis.distribution.byDayOfWeek.find(
        item => item.period === "Monday"
      );
      assert.ok(mondayData);
      assert.strictEqual(mondayData.count, 2);
    });

    test("Calculate quarterly distribution", () => {
      const data = [
        { date: "2024-01-15" }, // Q1
        { date: "2024-04-10" }, // Q2
        { date: "2024-07-20" }, // Q3
        { date: "2024-10-05" }, // Q4
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.ok(analysis.distribution.byQuarter.length > 0);
      
      // Check for quarters
      const quarters = analysis.distribution.byQuarter.map(item => item.period);
      assert.ok(quarters.includes("Q1 2024"));
      assert.ok(quarters.includes("Q2 2024"));
      assert.ok(quarters.includes("Q3 2024"));
      assert.ok(quarters.includes("Q4 2024"));
    });
  });

  suite("Gap Detection", () => {
    test("Detect no gaps in consecutive sequence", () => {
      const data = [
        { date: "2024-01-01" },
        { date: "2024-01-02" },
        { date: "2024-01-03" },
        { date: "2024-01-04" },
        { date: "2024-01-05" },
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.strictEqual(analysis.gaps.hasGaps, false);
      assert.strictEqual(analysis.gaps.gapCount, 0);
    });

    test("Detect gaps in sequence", () => {
      const data = [
        { date: "2024-01-01" },
        { date: "2024-01-02" },
        { date: "2024-01-10" }, // Gap of 8 days
        { date: "2024-01-11" },
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.strictEqual(analysis.gaps.hasGaps, true);
      assert.ok(analysis.gaps.gapCount > 0);
      assert.ok(analysis.gaps.largestGap !== null);
      assert.ok(analysis.gaps.largestGap.days >= 8);
    });

    test("Calculate coverage metric", () => {
      const data = [
        { date: "2024-01-01" },
        { date: "2024-01-03" }, // Missing day 2
        { date: "2024-01-05" }, // Missing day 4
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      // Coverage should be less than 100% due to missing dates
      assert.ok(analysis.gaps.coverage < 100);
      assert.ok(analysis.gaps.coverage > 0);
    });

    test("Handle single date (no gaps possible)", () => {
      const data = [{ date: "2024-01-01" }];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.strictEqual(analysis.gaps.hasGaps, false);
    });
  });

  suite("Trend Analysis", () => {
    test("Detect growth trend", () => {
      const data = [];
      // Create data with increasing frequency over time
      for (let month = 1; month <= 6; month++) {
        for (let i = 0; i < month * 2; i++) {
          data.push({ date: `2024-${String(month).padStart(2, "0")}-01` });
        }
      }

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.ok(
        analysis.trends.trendType === "moderate_growth" ||
          analysis.trends.trendType === "strong_growth"
      );
    });

    test("Detect constant trend", () => {
      const data = [];
      // Create data with constant frequency
      for (let month = 1; month <= 6; month++) {
        for (let i = 0; i < 5; i++) {
          data.push({ date: `2024-${String(month).padStart(2, "0")}-01` });
        }
      }

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.strictEqual(analysis.trends.trendType, "constant");
    });

    test("Handle insufficient data for trend", () => {
      const data = [{ date: "2024-01-01" }, { date: "2024-01-02" }];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.ok(
        analysis.trends.trendType === "insufficient_data" ||
          analysis.trends.trendType === "constant"
      );
    });
  });

  suite("Data Quality", () => {
    test("Track null and invalid dates", () => {
      const data = [
        { date: "2024-01-01" },
        { date: null },
        { date: "2024-01-03" },
        { date: "invalid" },
        { date: "2024-01-05" },
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.strictEqual(analysis.quality.nullCount, 1);
      assert.strictEqual(analysis.quality.invalidDateCount, 1);
      assert.strictEqual(analysis.quality.validDateCount, 3);
      assert.strictEqual(analysis.quality.totalRows, 5);
    });

    test("Calculate valid percentage", () => {
      const data = [
        { date: "2024-01-01" },
        { date: "2024-01-02" },
        { date: "2024-01-03" },
        { date: "2024-01-04" },
        { date: null },
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.strictEqual(analysis.quality.validPercentage, 80);
    });
  });

  suite("Date Formatting", () => {
    test("Format date correctly", () => {
      const date = new Date("2024-01-15T10:30:00Z");
      const formatted = qvdTemporalAnalysis.formatDate(date);
      assert.strictEqual(formatted, "2024-01-15");
    });

    test("Format datetime correctly", () => {
      const date = new Date("2024-01-15T10:30:00.000Z");
      const formatted = qvdTemporalAnalysis.formatDateTime(date);
      assert.ok(formatted.startsWith("2024-01-15T10:30:00"));
    });

    test("Handle null dates", () => {
      const formatted = qvdTemporalAnalysis.formatDate(null);
      assert.strictEqual(formatted, "N/A");
    });

    test("Handle invalid dates", () => {
      const formatted = qvdTemporalAnalysis.formatDate(new Date("invalid"));
      assert.strictEqual(formatted, "N/A");
    });
  });

  suite("Edge Cases", () => {
    test("Handle empty dataset", () => {
      const data = [];
      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, false);
      assert.strictEqual(analysis.error, "No data available");
    });

    test("Handle all null values", () => {
      const data = [{ date: null }, { date: null }, { date: null }];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, false);
      assert.strictEqual(analysis.nullCount, 3);
    });

    test("Handle same date multiple times", () => {
      const data = [
        { date: "2024-01-01" },
        { date: "2024-01-01" },
        { date: "2024-01-01" },
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.strictEqual(analysis.range.spanDays, 0);
      assert.strictEqual(analysis.range.spanDescription, "Single day");
    });

    test("Handle dates in reverse order", () => {
      const data = [
        { date: "2024-01-05" },
        { date: "2024-01-03" },
        { date: "2024-01-01" },
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.strictEqual(
        qvdTemporalAnalysis.formatDate(analysis.range.earliest),
        "2024-01-01"
      );
      assert.strictEqual(
        qvdTemporalAnalysis.formatDate(analysis.range.latest),
        "2024-01-05"
      );
    });
  });

  suite("Integration with Profiler", () => {
    test("Non-date field returns isDate: false", () => {
      const data = [
        { value: "text1" },
        { value: "text2" },
        { value: "text3" },
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "value"
      );

      assert.strictEqual(analysis.isDate, false);
    });

    test("Date field provides complete analysis", () => {
      const data = [
        { date: "2024-01-01" },
        { date: "2024-02-01" },
        { date: "2024-03-01" },
      ];

      const analysis = qvdTemporalAnalysis.calculateTemporalAnalysis(
        data,
        "date"
      );

      assert.strictEqual(analysis.isDate, true);
      assert.ok(analysis.range);
      assert.ok(analysis.distribution);
      assert.ok(analysis.gaps);
      assert.ok(analysis.trends);
      assert.ok(analysis.quality);
    });
  });
});
