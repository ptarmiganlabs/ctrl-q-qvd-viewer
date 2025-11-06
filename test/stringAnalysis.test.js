const assert = require("assert");

// Import string analysis functions
let qvdStringAnalysis;

suite("String Analysis Test Suite", () => {
  // Load the module before running tests
  suiteSetup(async () => {
    // Import the ESM module
    qvdStringAnalysis = await import("../src/qvdStringAnalysis.mjs");
  });

  suite("String Field Detection", () => {
    test("Should detect pure string field", () => {
      const data = [
        { name: "Alice" },
        { name: "Bob" },
        { name: "Charlie" },
        { name: "David" },
        { name: "Eve" },
      ];

      const isString = qvdStringAnalysis.isStringField(data, "name");
      assert.strictEqual(isString, true, "Should detect string field");
    });

    test("Should detect string field with mixed content", () => {
      const data = [
        { value: "ABC123" },
        { value: "DEF456" },
        { value: "GHI789" },
        { value: "JKL012" },
        { value: "MNO345" },
      ];

      const isString = qvdStringAnalysis.isStringField(data, "value");
      assert.strictEqual(isString, true, "Should detect string field");
    });

    test("Should not detect numeric field as string", () => {
      const data = [
        { value: "10" },
        { value: "20" },
        { value: "30" },
        { value: "40" },
        { value: "50" },
      ];

      const isString = qvdStringAnalysis.isStringField(data, "value");
      assert.strictEqual(
        isString,
        false,
        "Should not detect numeric field as string"
      );
    });

    test("Should handle nulls in string field detection", () => {
      const data = [
        { name: "Alice" },
        { name: null },
        { name: "Charlie" },
        { name: "David" },
        { name: "Eve" },
      ];

      const isString = qvdStringAnalysis.isStringField(data, "name");
      assert.strictEqual(
        isString,
        true,
        "Should detect string field ignoring nulls"
      );
    });
  });

  suite("Length Statistics", () => {
    test("Should calculate basic length statistics", () => {
      const data = [
        { text: "a" },
        { text: "ab" },
        { text: "abc" },
        { text: "abcd" },
        { text: "abcde" },
      ];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "text");

      assert.strictEqual(analysis.isString, true);
      assert.strictEqual(analysis.lengthStats.min, 1);
      assert.strictEqual(analysis.lengthStats.max, 5);
      assert.strictEqual(analysis.lengthStats.average, 3);
    });

    test("Should detect most common length", () => {
      const data = [
        { text: "aa" },
        { text: "bb" },
        { text: "cc" },
        { text: "ddd" },
        { text: "e" },
      ];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "text");

      assert.strictEqual(analysis.lengthStats.mostCommon, 2);
      assert.strictEqual(analysis.lengthStats.mostCommonCount, 3);
    });

    test("Should handle empty strings", () => {
      const data = [{ text: "" }, { text: "abc" }, { text: "" }];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "text");

      // Empty strings are filtered out
      assert.strictEqual(analysis.valueCount, 1);
      assert.strictEqual(analysis.nullCount, 2); // Empty strings counted as null
    });
  });

  suite("Pattern Detection", () => {
    test("Should detect common prefixes", () => {
      const data = [
        { code: "ABC123" },
        { code: "ABC456" },
        { code: "ABC789" },
        { code: "XYZ001" },
        { code: "XYZ002" },
      ];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "code");

      assert.strictEqual(analysis.isString, true);
      assert.ok(analysis.patterns.prefixes.length > 0);

      // Check if 'ABC' or 'AB' is detected as a prefix
      const hasABCPrefix = analysis.patterns.prefixes.some((p) =>
        p.prefix.startsWith("AB")
      );
      assert.ok(hasABCPrefix, "Should detect ABC-related prefix");
    });

    test("Should detect common suffixes", () => {
      const data = [
        { email: "alice@example.com" },
        { email: "bob@example.com" },
        { email: "charlie@example.com" },
        { email: "david@test.com" },
        { email: "eve@test.com" },
      ];

      const analysis =
        qvdStringAnalysis.calculateStringAnalysis(data, "email");

      assert.strictEqual(analysis.isString, true);
      assert.ok(analysis.patterns.suffixes.length > 0);

      // Check if '.com' is detected as a suffix
      const hasComSuffix = analysis.patterns.suffixes.some((s) =>
        s.suffix.includes("com")
      );
      assert.ok(hasComSuffix, "Should detect .com suffix");
    });
  });

  suite("Character Composition", () => {
    test("Should analyze alphanumeric percentage", () => {
      const data = [
        { value: "abc123" },
        { value: "def456" },
        { value: "ghi789" },
      ];

      const analysis =
        qvdStringAnalysis.calculateStringAnalysis(data, "value");

      assert.strictEqual(analysis.isString, true);
      assert.strictEqual(
        analysis.characterComposition.alphanumericPercentage,
        100
      );
    });

    test("Should detect special characters", () => {
      const data = [
        { value: "hello!" },
        { value: "world?" },
        { value: "test@#" },
      ];

      const analysis =
        qvdStringAnalysis.calculateStringAnalysis(data, "value");

      assert.strictEqual(analysis.isString, true);
      assert.ok(
        analysis.characterComposition.specialCharPercentage > 0,
        "Should detect special characters"
      );
    });

    test("Should detect leading/trailing whitespace", () => {
      const data = [
        { text: " leading" },
        { text: "trailing " },
        { text: " both " },
        { text: "none" },
      ];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "text");

      assert.strictEqual(analysis.isString, true);
      assert.strictEqual(
        analysis.characterComposition.leadingWhitespaceCount,
        2
      );
      assert.strictEqual(
        analysis.characterComposition.trailingWhitespaceCount,
        2
      );
    });

    test("Should detect non-ASCII characters", () => {
      const data = [
        { text: "hello" },
        { text: "café" },
        { text: "naïve" },
        { text: "世界" },
      ];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "text");

      assert.strictEqual(analysis.isString, true);
      assert.ok(
        analysis.characterComposition.nonAsciiCount > 0,
        "Should detect non-ASCII characters"
      );
    });
  });

  suite("Case Analysis", () => {
    test("Should detect uppercase strings", () => {
      const data = [
        { text: "HELLO" },
        { text: "WORLD" },
        { text: "TEST" },
      ];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "text");

      assert.strictEqual(analysis.isString, true);
      assert.strictEqual(analysis.caseAnalysis.uppercaseCount, 3);
      assert.strictEqual(analysis.caseAnalysis.lowercaseCount, 0);
    });

    test("Should detect lowercase strings", () => {
      const data = [
        { text: "hello" },
        { text: "world" },
        { text: "test" },
      ];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "text");

      assert.strictEqual(analysis.isString, true);
      assert.strictEqual(analysis.caseAnalysis.lowercaseCount, 3);
      assert.strictEqual(analysis.caseAnalysis.uppercaseCount, 0);
    });

    test("Should detect mixed case strings", () => {
      const data = [
        { text: "Hello" },
        { text: "WoRLd" },
        { text: "TeSt" },
      ];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "text");

      assert.strictEqual(analysis.isString, true);
      assert.strictEqual(analysis.caseAnalysis.mixedCaseCount, 3);
    });

    test("Should detect title case strings", () => {
      const data = [
        { text: "Hello World" },
        { text: "The Quick Brown" },
        { text: "Title Case Example" },
      ];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "text");

      assert.strictEqual(analysis.isString, true);
      assert.strictEqual(analysis.caseAnalysis.titleCaseCount, 3);
    });
  });

  suite("Format Detection - Email", () => {
    test("Should detect email addresses", () => {
      const data = [
        { email: "alice@example.com" },
        { email: "bob@test.org" },
        { email: "charlie@company.co.uk" },
      ];

      const analysis =
        qvdStringAnalysis.calculateStringAnalysis(data, "email");

      assert.strictEqual(analysis.isString, true);
      assert.strictEqual(analysis.formatDetection.email.count, 3);
      assert.strictEqual(analysis.formatDetection.email.percentage, 100);
      assert.strictEqual(analysis.formatDetection.email.samples.length, 3);
    });

    test("Should not detect invalid email formats", () => {
      const data = [
        { value: "notanemail" },
        { value: "@example.com" },
        { value: "test@" },
      ];

      const analysis =
        qvdStringAnalysis.calculateStringAnalysis(data, "value");

      assert.strictEqual(analysis.formatDetection.email.count, 0);
    });
  });

  suite("Format Detection - URL", () => {
    test("Should detect URLs", () => {
      const data = [
        { url: "https://example.com" },
        { url: "http://test.org" },
        { url: "www.google.com" },
      ];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "url");

      assert.strictEqual(analysis.isString, true);
      assert.ok(analysis.formatDetection.url.count >= 2); // At least https and http
      assert.ok(analysis.formatDetection.url.samples.length > 0);
    });
  });

  suite("Format Detection - Phone", () => {
    test("Should detect US phone numbers", () => {
      const data = [
        { phone: "555-123-4567" },
        { phone: "(555) 123-4567" },
        { phone: "5551234567" },
      ];

      const analysis =
        qvdStringAnalysis.calculateStringAnalysis(data, "phone");

      assert.strictEqual(analysis.isString, true);
      assert.ok(analysis.formatDetection.phone.count >= 2);
    });

    test("Should detect international phone numbers", () => {
      const data = [
        { phone: "+44 20 1234 5678" },
        { phone: "+49 30 12345678" },
        { phone: "+33 1 23 45 67 89" },
      ];

      const analysis =
        qvdStringAnalysis.calculateStringAnalysis(data, "phone");

      assert.strictEqual(analysis.isString, true);
      assert.ok(analysis.formatDetection.phone.count > 0);
    });
  });

  suite("Format Detection - SSN", () => {
    test("Should detect US SSN", () => {
      const data = [
        { ssn: "123-45-6789" },
        { ssn: "987-65-4321" },
        { ssn: "111223333" },
      ];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "ssn");

      assert.strictEqual(analysis.isString, true);
      assert.ok(analysis.formatDetection.ssn.count >= 2);
    });
  });

  suite("Format Detection - Date String", () => {
    test("Should detect ISO 8601 date strings", () => {
      const data = [
        { date: "2023-01-15" },
        { date: "2023-02-20" },
        { date: "2023-03-25T10:30:00Z" },
      ];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "date");

      assert.strictEqual(analysis.isString, true);
      assert.ok(analysis.formatDetection.dateString.count >= 2);
    });

    test("Should detect US date format", () => {
      const data = [
        { date: "01/15/2023" },
        { date: "2/20/2023" },
        { date: "3/25/23" },
      ];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "date");

      assert.strictEqual(analysis.isString, true);
      assert.ok(analysis.formatDetection.dateString.count >= 2);
    });
  });

  suite("Edge Cases", () => {
    test("Should handle empty data", () => {
      const data = [];
      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "text");

      assert.strictEqual(analysis.isString, false);
      assert.strictEqual(analysis.error, "No data available");
    });

    test("Should handle all null values", () => {
      const data = [{ text: null }, { text: null }, { text: undefined }];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "text");

      assert.strictEqual(analysis.isString, false);
      assert.strictEqual(analysis.error, "No non-null values available");
    });

    test("Should handle single value", () => {
      const data = [{ text: "hello" }];

      const analysis = qvdStringAnalysis.calculateStringAnalysis(data, "text");

      assert.strictEqual(analysis.isString, true);
      assert.strictEqual(analysis.valueCount, 1);
    });
  });
});
