const assert = require("assert");

// Import data quality functions
let qvdDataQuality;

suite("Data Quality Metrics Test Suite", () => {
  // Load the module before running tests
  suiteSetup(async () => {
    // Import the ESM module
    qvdDataQuality = await import("../src/qvdDataQuality.mjs");
  });

  suite("Completeness Metrics", () => {
    test("Perfect completeness - no nulls or empty strings", () => {
      const data = [
        { field: "value1" },
        { field: "value2" },
        { field: "value3" },
        { field: "value4" },
        { field: "value5" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        5,
        0
      );

      assert.strictEqual(metrics.completeness.nonNullPercentage, 100);
      assert.strictEqual(metrics.completeness.fillRate, 100);
      assert.strictEqual(metrics.completeness.missingCount, 0);
    });

    test("Completeness with null values", () => {
      const data = [
        { field: "value1" },
        { field: null },
        { field: "value3" },
        { field: null },
        { field: "value5" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        3,
        2
      );

      assert.strictEqual(metrics.completeness.nonNullPercentage, 60);
      assert.strictEqual(metrics.completeness.fillRate, 60);
      assert.strictEqual(metrics.completeness.missingCount, 2);
      assert.strictEqual(metrics.completeness.missingPercentage, 40);
    });

    test("Completeness with empty strings", () => {
      const data = [
        { field: "value1" },
        { field: "" },
        { field: "value3" },
        { field: "" },
        { field: "value5" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        3,
        0
      );

      // Non-null percentage should be 100% (empty strings are not null)
      assert.strictEqual(metrics.completeness.nonNullPercentage, 100);
      // Fill rate should be 60% (empty strings are not filled)
      assert.strictEqual(metrics.completeness.fillRate, 60);
      assert.strictEqual(metrics.completeness.emptyStringCount, 2);
    });

    test("Completeness with both nulls and empty strings", () => {
      const data = [
        { field: "value1" },
        { field: null },
        { field: "" },
        { field: "value4" },
        { field: "value5" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        3,
        1
      );

      assert.strictEqual(metrics.completeness.nonNullPercentage, 80);
      assert.strictEqual(metrics.completeness.fillRate, 60);
      assert.strictEqual(metrics.completeness.emptyStringCount, 1);
    });
  });

  suite("Cardinality Analysis", () => {
    test("High cardinality - unique identifier", () => {
      const data = Array.from({ length: 100 }, (_, i) => ({ id: i }));

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "id",
        100,
        0
      );

      assert.strictEqual(metrics.cardinality.level, "High");
      assert.strictEqual(metrics.cardinality.ratio, 1.0);
      assert.ok(
        metrics.cardinality.recommendation.includes("identifier"),
        "Should recommend as identifier"
      );
    });

    test("Medium cardinality - good for filtering", () => {
      const data = [
        { category: "A" },
        { category: "B" },
        { category: "C" },
        { category: "A" },
        { category: "B" },
        { category: "C" },
        { category: "A" },
        { category: "B" },
        { category: "C" },
        { category: "D" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "category",
        4,
        0
      );

      assert.strictEqual(metrics.cardinality.level, "Medium");
      assert.strictEqual(metrics.cardinality.ratio, 0.4);
      assert.ok(
        metrics.cardinality.recommendation.includes("filtering"),
        "Should recommend for filtering"
      );
    });

    test("Low cardinality - dimension candidate", () => {
      const data = Array.from({ length: 100 }, (_, i) => ({
        status: i % 3 === 0 ? "Active" : i % 3 === 1 ? "Inactive" : "Pending",
      }));

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "status",
        3,
        0
      );

      assert.strictEqual(metrics.cardinality.level, "Low");
      assert.ok(metrics.cardinality.ratio < 0.05);
      assert.ok(
        metrics.cardinality.recommendation.includes("dimension"),
        "Should recommend as dimension"
      );
    });
  });

  suite("Uniqueness Metrics", () => {
    test("All unique values", () => {
      const data = [
        { field: "A" },
        { field: "B" },
        { field: "C" },
        { field: "D" },
        { field: "E" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        5,
        0
      );

      assert.strictEqual(metrics.uniqueness.uniquePercentage, 100);
      assert.strictEqual(metrics.uniqueness.duplicateCount, 0);
      assert.strictEqual(metrics.uniqueness.topDuplicates.length, 0);
    });

    test("Some duplicates", () => {
      const data = [
        { field: "A" },
        { field: "B" },
        { field: "A" },
        { field: "C" },
        { field: "A" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        3,
        0
      );

      assert.strictEqual(metrics.uniqueness.uniquePercentage, 60);
      assert.strictEqual(metrics.uniqueness.duplicateCount, 3); // 3 occurrences of "A"
      assert.ok(metrics.uniqueness.topDuplicates.length > 0);
      assert.strictEqual(metrics.uniqueness.topDuplicates[0].value, "A");
      assert.strictEqual(metrics.uniqueness.topDuplicates[0].count, 3);
    });

    test("Multiple duplicated values", () => {
      const data = [
        { field: "A" },
        { field: "B" },
        { field: "A" },
        { field: "B" },
        { field: "C" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        3,
        0
      );

      assert.strictEqual(metrics.uniqueness.uniquePercentage, 60);
      assert.strictEqual(metrics.uniqueness.duplicateCount, 4); // 2 A's + 2 B's
      assert.strictEqual(metrics.uniqueness.duplicatedDistinctValues, 2); // A and B
    });
  });

  suite("Distribution Quality", () => {
    test("Perfectly even distribution", () => {
      const data = [
        { field: "A" },
        { field: "B" },
        { field: "C" },
        { field: "D" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        4,
        0
      );

      // Perfect distribution should have evenness score close to 1
      assert.ok(
        metrics.distribution.evennessScore > 0.99,
        "Evenness score should be close to 1"
      );
      assert.strictEqual(metrics.distribution.isSkewed, false);
      assert.strictEqual(metrics.distribution.skewness, "Very Even");
    });

    test("Highly skewed distribution", () => {
      const data = [
        { field: "A" },
        { field: "A" },
        { field: "A" },
        { field: "A" },
        { field: "A" },
        { field: "A" },
        { field: "A" },
        { field: "A" },
        { field: "A" },
        { field: "B" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        2,
        0
      );

      // Highly skewed distribution should have low evenness score
      assert.ok(
        metrics.distribution.evennessScore < 0.5,
        "Evenness score should be low"
      );
      assert.strictEqual(metrics.distribution.isSkewed, true);
      assert.ok(
        metrics.distribution.skewness.includes("Skewed"),
        "Should indicate skewed distribution"
      );
    });

    test("Moderately even distribution", () => {
      const data = [
        { field: "A" },
        { field: "A" },
        { field: "A" },
        { field: "B" },
        { field: "B" },
        { field: "C" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        3,
        0
      );

      assert.ok(
        metrics.distribution.evennessScore > 0.5 &&
          metrics.distribution.evennessScore < 0.9,
        "Evenness score should be moderate"
      );
    });
  });

  suite("Overall Quality Assessment", () => {
    test("Good quality data", () => {
      const data = [
        { field: "A" },
        { field: "B" },
        { field: "C" },
        { field: "D" },
        { field: "E" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        5,
        0
      );

      assert.strictEqual(metrics.assessment.color, "green");
      assert.ok(
        metrics.assessment.qualityScore >= 80,
        "Quality score should be high"
      );
      assert.strictEqual(metrics.assessment.qualityLevel, "Good");
      assert.strictEqual(metrics.assessment.issues.length, 0);
    });

    test("Fair quality - some missing values", () => {
      const data = [
        { field: "A" },
        { field: "B" },
        { field: null },
        { field: "D" },
        { field: "E" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        4,
        1
      );

      assert.strictEqual(metrics.assessment.color, "yellow");
      assert.ok(metrics.assessment.warnings.length > 0);
    });

    test("Poor quality - many missing values", () => {
      const data = [
        { field: "A" },
        { field: null },
        { field: null },
        { field: null },
        { field: "E" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        2,
        3
      );

      assert.strictEqual(metrics.assessment.color, "red");
      assert.ok(metrics.assessment.issues.length > 0);
      assert.ok(
        metrics.assessment.qualityScore < 80,
        "Quality score should be low"
      );
    });

    test("Poor quality - low fill rate with empty strings", () => {
      const data = [
        { field: "A" },
        { field: "" },
        { field: "" },
        { field: "" },
        { field: "" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        1,
        0
      );

      assert.ok(
        metrics.assessment.color === "red" || metrics.assessment.color === "yellow"
      );
      assert.ok(
        metrics.assessment.issues.length > 0 ||
          metrics.assessment.warnings.length > 0
      );
    });
  });

  suite("Format Quality Metrics", () => {
    test("Formats metrics correctly", () => {
      const data = [
        { field: "A" },
        { field: "B" },
        { field: "A" },
        { field: null },
        { field: "C" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        3,
        1
      );

      const formatted = qvdDataQuality.formatQualityMetrics(metrics);

      // Check that percentages are formatted as strings with decimals
      assert.strictEqual(typeof formatted.completeness.nonNullPercentage, "string");
      assert.ok(formatted.completeness.nonNullPercentage.includes("."));
      
      assert.strictEqual(typeof formatted.cardinality.ratio, "string");
      assert.strictEqual(typeof formatted.cardinality.ratioPercentage, "string");
      
      assert.strictEqual(typeof formatted.distribution.evennessScore, "string");
    });
  });

  suite("Edge Cases", () => {
    test("Empty dataset", () => {
      const data = [];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        0,
        0
      );

      assert.ok(metrics.error, "Should return error for empty dataset");
    });

    test("Single value", () => {
      const data = [{ field: "A" }];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        1,
        0
      );

      assert.strictEqual(metrics.completeness.nonNullPercentage, 100);
      assert.strictEqual(metrics.cardinality.ratio, 1.0);
      assert.strictEqual(metrics.uniqueness.uniquePercentage, 100);
    });

    test("All null values", () => {
      const data = [
        { field: null },
        { field: null },
        { field: null },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        0,
        3
      );

      assert.strictEqual(metrics.completeness.nonNullPercentage, 0);
      assert.strictEqual(metrics.completeness.missingPercentage, 100);
      assert.strictEqual(metrics.assessment.color, "red");
    });

    test("All duplicate values", () => {
      const data = [
        { field: "A" },
        { field: "A" },
        { field: "A" },
        { field: "A" },
        { field: "A" },
      ];

      const metrics = qvdDataQuality.calculateDataQualityMetrics(
        data,
        "field",
        1,
        0
      );

      assert.strictEqual(metrics.uniqueness.uniquePercentage, 20);
      assert.strictEqual(metrics.uniqueness.duplicateCount, 5);
      assert.strictEqual(metrics.cardinality.level, "Low");
    });
  });
});
