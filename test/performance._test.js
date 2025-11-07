const assert = require("assert");
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

// QvdReader is async because it's a CJS wrapper around ESM
let QvdReader;

// IMPORTANT: To properly test custom editor performance, we use vscode.commands.executeCommand('vscode.openWith')
// instead of vscode.workspace.openTextDocument(). The latter opens files as text documents (showing raw XML),
// while the former respects the custom editor registration and opens QVD files with the custom editor.

// Global array to collect performance results from all tests
const allPerformanceResults = [];

suite("Performance Test Suite - Large QVD Files", () => {
  vscode.window.showInformationMessage(
    "Starting performance tests for large QVD files"
  );

  suiteSetup(async () => {
    QvdReader = await require("../src/qvdReader.cjs");

    // Ensure extension is activated
    const ext = vscode.extensions.getExtension(
      "ptarmiganlabs.ctrl-q-qvd-viewer"
    );
    if (ext && !ext.isActive) {
      await ext.activate();
    }

    // Wait for complete activation
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  suiteTeardown(() => {
    // Display comprehensive summary after all tests complete
    if (allPerformanceResults.length > 0) {
      console.log(`\n\n`);
      console.log(`${"█".repeat(70)}`);
      console.log(`█${"".repeat(68)}█`);
      console.log(
        `█  COMPREHENSIVE PERFORMANCE SUMMARY - ALL QVD FILES TESTED  ${"".repeat(
          4
        )}█`
      );
      console.log(`█${"".repeat(68)}█`);
      console.log(`${"█".repeat(70)}`);
      console.log(``);

      // Sort by file size
      const sortedResults = [...allPerformanceResults].sort(
        (a, b) => a.fileSizeBytes - b.fileSizeBytes
      );

      // Table header
      console.log(
        `File Name                          Size       Rows        Cols  Read(ms)  Open(ms)  Reopen(ms)`
      );
      console.log(`${"─".repeat(100)}`);

      // Table rows
      sortedResults.forEach((r) => {
        const name = (
          r.fileName.length > 30
            ? r.fileName.substring(0, 27) + "..."
            : r.fileName
        ).padEnd(30);
        const size = r.fileSizeDisplay.padStart(10);
        const rows = (
          r.totalRecords ? r.totalRecords.toLocaleString() : "N/A"
        ).padStart(11);
        const cols = (r.columns ? r.columns.toString() : "N/A").padStart(5);
        const read = r.readTime.toString().padStart(9);
        const open = r.firstOpenTime.toString().padStart(9);
        const reopen = r.avgReopenTime.toString().padStart(10);
        console.log(
          `${name} ${size} ${rows} ${cols} ${read} ${open} ${reopen}`
        );
      });

      console.log(`\n`);

      // Statistics
      const avgReadTime = Math.round(
        sortedResults.reduce((sum, r) => sum + r.readTime, 0) /
          sortedResults.length
      );
      const avgOpenTime = Math.round(
        sortedResults.reduce((sum, r) => sum + r.firstOpenTime, 0) /
          sortedResults.length
      );
      const avgReopenTime = Math.round(
        sortedResults.reduce((sum, r) => sum + r.avgReopenTime, 0) /
          sortedResults.length
      );

      console.log(`📊 Statistics:`);
      console.log(`   Files tested: ${sortedResults.length}`);
      console.log(`   Average read time (5000 rows): ${avgReadTime}ms`);
      console.log(`   Average first open time: ${avgOpenTime}ms`);
      console.log(`   Average reopen time: ${avgReopenTime}ms`);

      // Find extremes
      const fastest = sortedResults.reduce((min, r) =>
        r.firstOpenTime < min.firstOpenTime ? r : min
      );
      const slowest = sortedResults.reduce((max, r) =>
        r.firstOpenTime > max.firstOpenTime ? r : max
      );

      console.log(
        `\n🏆 Fastest to open: ${fastest.fileName} (${fastest.firstOpenTime}ms)`
      );
      console.log(
        `🐌 Slowest to open: ${slowest.fileName} (${slowest.firstOpenTime}ms)`
      );

      // Analysis
      console.log(`\n🔍 Analysis:`);

      // Check if open time correlates with file size
      const smallestFile = sortedResults[0];
      const largestFile = sortedResults[sortedResults.length - 1];
      const sizeRatio = largestFile.fileSizeBytes / smallestFile.fileSizeBytes;
      const openTimeRatio =
        largestFile.firstOpenTime / smallestFile.firstOpenTime;

      if (openTimeRatio > sizeRatio * 1.5) {
        console.log(
          `   ⚠️  Open time slowdown (${openTimeRatio.toFixed(
            1
          )}x) is disproportionate to file size increase (${sizeRatio.toFixed(
            1
          )}x)`
        );
        console.log(
          `   💡 Bottleneck: Likely webview initialization, not data processing`
        );
      } else {
        console.log(`   ✅ Open time scales proportionally with file size`);
        console.log(
          `   💡 Size ratio: ${sizeRatio.toFixed(
            1
          )}x, Open time ratio: ${openTimeRatio.toFixed(1)}x`
        );
      }

      // Recommendations
      console.log(`\n💡 Recommendations:`);
      if (avgOpenTime > 3000) {
        console.log(
          `   • Consider lazy loading assets for faster webview initialization`
        );
        console.log(`   • Implement progressive rendering for large files`);
      }
      if (sortedResults.some((r) => r.fileSizeBytes > 1024 * 1024 * 500)) {
        console.log(
          `   • For files > 500MB, consider loading fewer initial rows`
        );
        console.log(`   • Implement virtual scrolling for very large datasets`);
      }
      console.log(
        `   • See docs/PERFORMANCE_INVESTIGATION.md for detailed optimization strategies`
      );

      console.log(`\n${"█".repeat(70)}`);
      console.log(``);
    }
  });

  test("Performance: Compare Small vs Large QVD Opening", async function () {
    // Increase timeout for this test
    this.timeout(40000);

    const smallFilePath = path.join(
      __dirname,
      "..",
      "test-data",
      "lego",
      "colors.qvd"
    );

    const largeFilePath = path.join(
      __dirname,
      "..",
      "..",
      "qvdjs",
      "__tests__",
      "data",
      "chicago_taxi_rides",
      "chicago_taxi_rides_2016_01.qvd"
    );

    // Check if small file exists
    if (!fs.existsSync(smallFilePath)) {
      console.log(`⚠️  Small test file not found at: ${smallFilePath}`);
      console.log("   Skipping performance test.");
      this.skip();
      return;
    }

    // Check if large file exists
    if (!fs.existsSync(largeFilePath)) {
      console.log(`⚠️  Large test file not found at: ${largeFilePath}`);
      console.log("   Skipping performance test.");
      this.skip();
      return;
    }

    console.log(`\n📊 Performance Comparison: Small vs Large QVD Files`);
    console.log(`\n📁 Test Files:`);
    console.log(`   Small: ${path.basename(smallFilePath)}`);
    console.log(
      `   Size:  ${(fs.statSync(smallFilePath).size / 1024).toFixed(2)} KB`
    );
    console.log(`   Large: ${path.basename(largeFilePath)}`);
    console.log(
      `   Size:  ${(fs.statSync(largeFilePath).size / 1024 / 1024).toFixed(
        2
      )} MB`
    );

    const reader = new QvdReader();

    // ========================================
    // SMALL FILE TESTS
    // ========================================
    console.log(`\n\n🔬 SMALL FILE TESTS (${path.basename(smallFilePath)})`);
    console.log(`${"=".repeat(60)}`);

    // Small File: QvdReader performance
    console.log(`\n1️⃣  QvdReader Performance:`);
    const smallReadStart = Date.now();
    const smallReadResult = await reader.read(smallFilePath, 5000);
    const smallReadTime = Date.now() - smallReadStart;

    assert.strictEqual(
      smallReadResult.error,
      null,
      "Should read small file without errors"
    );

    console.log(`   ✓ Read time: ${smallReadTime}ms`);
    console.log(`   ℹ️  Rows loaded: ${smallReadResult.data.length}`);
    console.log(
      `   ℹ️  Total records: ${smallReadResult.metadata.noOfRecords.toLocaleString()}`
    );

    // Small File: VS Code Custom Editor
    console.log(`\n2️⃣  VS Code Custom Editor (First Open):`);
    const smallFileUri = vscode.Uri.file(smallFilePath);

    const smallOpenStart = Date.now();
    // Use vscode.openWith to explicitly open with the custom editor
    await vscode.commands.executeCommand(
      "vscode.openWith",
      smallFileUri,
      "ctrl-q-qvd-viewer.qvdEditor"
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const smallOpenTime = Date.now() - smallOpenStart;

    console.log(`   ✓ Open time: ${smallOpenTime}ms`);

    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Small File: Repeated opens
    console.log(`\n3️⃣  VS Code Custom Editor (Repeated Opens):`);
    const smallReopenTimes = [];
    for (let i = 0; i < 3; i++) {
      const reopenStart = Date.now();
      await vscode.commands.executeCommand(
        "vscode.openWith",
        smallFileUri,
        "ctrl-q-qvd-viewer.qvdEditor"
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const reopenTime = Date.now() - reopenStart;
      smallReopenTimes.push(reopenTime);

      console.log(`   ✓ Open #${i + 1}: ${reopenTime}ms`);

      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const smallAvgReopen = (
      smallReopenTimes.reduce((a, b) => a + b, 0) / smallReopenTimes.length
    ).toFixed(0);
    console.log(`   📊 Average: ${smallAvgReopen}ms`);

    // ========================================
    // LARGE FILE TESTS
    // ========================================
    console.log(`\n\n🔬 LARGE FILE TESTS (${path.basename(largeFilePath)})`);
    console.log(`${"=".repeat(60)}`);

    // Large File: QvdReader performance
    console.log(`\n1️⃣  QvdReader Performance:`);
    const largeReadStart = Date.now();
    const largeReadResult = await reader.read(largeFilePath, 5000);
    const largeReadTime = Date.now() - largeReadStart;

    assert.strictEqual(
      largeReadResult.error,
      null,
      "Should read large file without errors"
    );

    console.log(`   ✓ Read time: ${largeReadTime}ms`);
    console.log(`   ℹ️  Rows loaded: ${largeReadResult.data.length}`);
    console.log(
      `   ℹ️  Total records: ${largeReadResult.metadata.noOfRecords.toLocaleString()}`
    );

    // Large File: VS Code Custom Editor
    console.log(`\n2️⃣  VS Code Custom Editor (First Open):`);
    const largeFileUri = vscode.Uri.file(largeFilePath);

    const largeOpenStart = Date.now();
    await vscode.commands.executeCommand(
      "vscode.openWith",
      largeFileUri,
      "ctrl-q-qvd-viewer.qvdEditor"
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const largeOpenTime = Date.now() - largeOpenStart;

    console.log(`   ✓ Open time: ${largeOpenTime}ms`);

    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Large File: Repeated opens
    console.log(`\n3️⃣  VS Code Custom Editor (Repeated Opens):`);
    const largeReopenTimes = [];
    for (let i = 0; i < 3; i++) {
      const reopenStart = Date.now();
      await vscode.commands.executeCommand(
        "vscode.openWith",
        largeFileUri,
        "ctrl-q-qvd-viewer.qvdEditor"
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const reopenTime = Date.now() - reopenStart;
      largeReopenTimes.push(reopenTime);

      console.log(`   ✓ Open #${i + 1}: ${reopenTime}ms`);

      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const largeAvgReopen = (
      largeReopenTimes.reduce((a, b) => a + b, 0) / largeReopenTimes.length
    ).toFixed(0);
    console.log(`   📊 Average: ${largeAvgReopen}ms`);

    // ========================================
    // COMPARISON SUMMARY
    // ========================================
    console.log(`\n\n📊 PERFORMANCE COMPARISON SUMMARY`);
    console.log(`${"=".repeat(60)}`);

    console.log(`\n📖 QvdReader Performance:`);
    console.log(`   Small file:  ${smallReadTime}ms`);
    console.log(`   Large file:  ${largeReadTime}ms`);
    console.log(
      `   Difference:  ${largeReadTime - smallReadTime}ms (${(
        largeReadTime / smallReadTime
      ).toFixed(1)}x slower)`
    );

    console.log(`\n🖥️  VS Code First Open:`);
    console.log(`   Small file:  ${smallOpenTime}ms`);
    console.log(`   Large file:  ${largeOpenTime}ms`);
    console.log(
      `   Difference:  ${largeOpenTime - smallOpenTime}ms (${(
        largeOpenTime / smallOpenTime
      ).toFixed(1)}x slower)`
    );

    console.log(`\n🔄 VS Code Average Reopen:`);
    console.log(`   Small file:  ${smallAvgReopen}ms`);
    console.log(`   Large file:  ${largeAvgReopen}ms`);
    console.log(
      `   Difference:  ${largeAvgReopen - smallAvgReopen}ms (${(
        largeAvgReopen / smallAvgReopen
      ).toFixed(1)}x slower)`
    );

    console.log(`\n🔍 Analysis:`);
    const readRatio = largeReadTime / smallReadTime;
    const openRatio = largeOpenTime / smallOpenTime;

    if (openRatio > readRatio * 2) {
      console.log(
        `   ⚠️  VS Code open slowdown (${openRatio.toFixed(
          1
        )}x) is disproportionate to file size`
      );
      console.log(
        `   ⚠️  QvdReader scales well (${readRatio.toFixed(
          1
        )}x), but webview does not`
      );
      console.log(
        `   💡 Bottleneck: Webview initialization/rendering, not data reading`
      );
    } else {
      console.log(`   ✅ Performance scales proportionally with file size`);
    }

    // Performance assertions
    assert.ok(
      smallReadTime < 100,
      `Small file read should be under 100ms (was ${smallReadTime}ms)`
    );
    assert.ok(
      largeReadTime < 1000,
      `Large file read (5000 rows) should be under 1000ms (was ${largeReadTime}ms)`
    );
    assert.ok(
      smallOpenTime < 3000,
      `Small file VS Code open should be under 3 seconds (was ${smallOpenTime}ms)`
    );
    assert.ok(
      largeOpenTime < 5000,
      `Large file VS Code open should be under 5 seconds (was ${largeOpenTime}ms)`
    );

    console.log(`\n✅ All performance thresholds met!`);

    // Store results for comprehensive summary
    const smallFileSize = fs.statSync(smallFilePath).size;
    const largeFileSize = fs.statSync(largeFilePath).size;

    allPerformanceResults.push({
      fileName: path.basename(smallFilePath),
      fileSizeBytes: smallFileSize,
      fileSizeDisplay: `${(smallFileSize / 1024).toFixed(1)} KB`,
      totalRecords: smallReadResult.metadata.noOfRecords,
      columns: smallReadResult.metadata.fields.length,
      readTime: smallReadTime,
      firstOpenTime: smallOpenTime,
      avgReopenTime: parseInt(smallAvgReopen),
    });

    allPerformanceResults.push({
      fileName: path.basename(largeFilePath),
      fileSizeBytes: largeFileSize,
      fileSizeDisplay: `${(largeFileSize / 1024 / 1024).toFixed(1)} MB`,
      totalRecords: largeReadResult.metadata.noOfRecords,
      columns: largeReadResult.metadata.fields.length,
      readTime: largeReadTime,
      firstOpenTime: largeOpenTime,
      avgReopenTime: parseInt(largeAvgReopen),
    });
  });

  test("Performance: Open Large QVD (Chicago Taxi) in VS Code", async function () {
    // Increase timeout for this test
    this.timeout(30000);

    const largeFilePath = path.join(
      __dirname,
      "..",
      "..",
      "qvdjs",
      "__tests__",
      "data",
      "chicago_taxi_rides",
      "chicago_taxi_rides_2016_01.qvd"
    );

    // Check if file exists
    if (!fs.existsSync(largeFilePath)) {
      console.log(`⚠️  Large test file not found at: ${largeFilePath}`);
      console.log("   Skipping performance test.");
      this.skip();
      return;
    }

    console.log(`\n📊 Testing large QVD file performance:`);
    console.log(`   File: ${path.basename(largeFilePath)}`);
    console.log(
      `   Size: ${(fs.statSync(largeFilePath).size / 1024 / 1024).toFixed(
        2
      )} MB`
    );

    // Test 1: QvdReader performance with different maxRows
    console.log(`\n🔬 Test 1: QvdReader Performance`);
    const reader = new QvdReader();

    // Test with 25 rows (minimal preview)
    const start1 = Date.now();
    const result1 = await reader.read(largeFilePath, 25);
    const time1 = Date.now() - start1;

    assert.strictEqual(result1.error, null, "Should read file without errors");
    assert.strictEqual(result1.data.length, 25, "Should load exactly 25 rows");

    console.log(
      `   ✓ maxRows=25:    ${time1}ms (loaded ${result1.data.length} rows)`
    );

    // Test with 5000 rows (extension default)
    const start2 = Date.now();
    const result2 = await reader.read(largeFilePath, 5000);
    const time2 = Date.now() - start2;

    assert.strictEqual(result2.error, null, "Should read file without errors");
    assert.strictEqual(
      result2.data.length,
      5000,
      "Should load exactly 5000 rows"
    );

    console.log(
      `   ✓ maxRows=5000:  ${time2}ms (loaded ${result2.data.length} rows)`
    );
    console.log(
      `   ℹ️  Total records: ${result2.metadata.noOfRecords.toLocaleString()}`
    );

    // Test 2: Opening in VS Code Custom Editor
    console.log(`\n🔬 Test 2: VS Code Custom Editor Performance`);

    const fileUri = vscode.Uri.file(largeFilePath);

    // Measure time to open the document
    const startOpen = Date.now();

    // Open the file with the custom editor
    await vscode.commands.executeCommand(
      "vscode.openWith",
      fileUri,
      "ctrl-q-qvd-viewer.qvdEditor"
    );

    // Wait for the custom editor to be fully rendered
    // The custom editor provider's resolveCustomTextEditor will be called
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const timeOpen = Date.now() - startOpen;

    console.log(`   ✓ File opened in VS Code: ${timeOpen}ms`);

    // Close the editor
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Test 3: Multiple opens to check for caching effects
    console.log(`\n🔬 Test 3: Repeated Opens (Testing Cache)`);

    const openTimes = [];
    for (let i = 0; i < 3; i++) {
      const startReopen = Date.now();

      await vscode.commands.executeCommand(
        "vscode.openWith",
        fileUri,
        "ctrl-q-qvd-viewer.qvdEditor"
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const timeReopen = Date.now() - startReopen;
      openTimes.push(timeReopen);

      console.log(`   ✓ Open #${i + 1}: ${timeReopen}ms`);

      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const avgTime = (
      openTimes.reduce((a, b) => a + b, 0) / openTimes.length
    ).toFixed(0);
    console.log(`   📊 Average: ${avgTime}ms`);

    // Performance assertions
    console.log(`\n✅ Performance Test Summary:`);
    console.log(`   QvdReader (25 rows):     ${time1}ms`);
    console.log(`   QvdReader (5000 rows):   ${time2}ms`);
    console.log(`   VS Code first open:      ${timeOpen}ms`);
    console.log(`   VS Code avg reopen:      ${avgTime}ms`);

    // Assert reasonable performance (these are generous thresholds)
    assert.ok(
      time1 < 500,
      `Reading 25 rows should be under 500ms (was ${time1}ms)`
    );
    assert.ok(
      time2 < 1000,
      `Reading 5000 rows should be under 1000ms (was ${time2}ms)`
    );
    assert.ok(
      timeOpen < 5000,
      `Opening in VS Code should be under 5 seconds (was ${timeOpen}ms)`
    );

    console.log(`\n✅ All performance thresholds met!`);
  });

  test("Performance: Measure Component Breakdown", async function () {
    this.timeout(20000);

    const largeFilePath = path.join(
      __dirname,
      "..",
      "..",
      "qvdjs",
      "__tests__",
      "data",
      "chicago_taxi_rides",
      "chicago_taxi_rides_2016_01.qvd"
    );

    if (!fs.existsSync(largeFilePath)) {
      console.log("⚠️  Large test file not found. Skipping.");
      this.skip();
      return;
    }

    console.log(`\n📊 Detailed Component Performance Breakdown:`);

    // Import the actual modules to test them directly
    const { QvdDataFrame } = await import("qvdjs");
    const { dirname } = require("path");

    const maxRows = 5000;

    // Step 1: qvdjs loading
    console.log(`\n1️⃣  qvdjs loading (maxRows=${maxRows}):`);
    const step1Start = Date.now();
    const df = await QvdDataFrame.fromQvd(largeFilePath, {
      maxRows,
      allowedDir: dirname(largeFilePath),
    });
    const step1Time = Date.now() - step1Start;
    console.log(`   ✓ Time: ${step1Time}ms`);
    console.log(
      `   ℹ️  Loaded ${df.shape[0]} of ${df.fileMetadata.noOfRecords} total rows`
    );

    // Step 2: Metadata extraction
    console.log(`\n2️⃣  Metadata extraction:`);
    const step2Start = Date.now();
    const columns = df.columns || [];
    const allFieldMetadata = df.getAllFieldMetadata();
    const step2Time = Date.now() - step2Start;
    console.log(`   ✓ Time: ${step2Time}ms`);
    console.log(
      `   ℹ️  Extracted ${columns.length} columns, ${allFieldMetadata.length} field metadata`
    );

    // Step 3: Data transformation (array of arrays -> array of objects)
    console.log(
      `\n3️⃣  Data transformation (array of arrays → array of objects):`
    );
    const step3Start = Date.now();
    const data = df.data.map((row) =>
      Object.fromEntries(columns.map((col, idx) => [col, row[idx]]))
    );
    const step3Time = Date.now() - step3Start;
    console.log(`   ✓ Time: ${step3Time}ms`);
    console.log(
      `   ℹ️  Transformed ${data.length} rows with ${columns.length} columns`
    );

    // Step 4: JSON serialization (what happens in webview template)
    console.log(`\n4️⃣  JSON serialization:`);
    const step4Start = Date.now();
    const jsonString = JSON.stringify(data);
    const step4Time = Date.now() - step4Start;
    const jsonSizeMB = (jsonString.length / 1024 / 1024).toFixed(2);
    console.log(`   ✓ Time: ${step4Time}ms`);
    console.log(`   ℹ️  JSON size: ${jsonSizeMB} MB`);

    const totalTime = step1Time + step2Time + step3Time + step4Time;

    console.log(`\n📊 Total Processing Time: ${totalTime}ms`);
    console.log(`\n📈 Breakdown:`);
    console.log(
      `   qvdjs loading:       ${step1Time}ms (${(
        (step1Time / totalTime) *
        100
      ).toFixed(1)}%)`
    );
    console.log(
      `   Metadata extraction: ${step2Time}ms (${(
        (step2Time / totalTime) *
        100
      ).toFixed(1)}%)`
    );
    console.log(
      `   Data transformation: ${step3Time}ms (${(
        (step3Time / totalTime) *
        100
      ).toFixed(1)}%)`
    );
    console.log(
      `   JSON serialization:  ${step4Time}ms (${(
        (step4Time / totalTime) *
        100
      ).toFixed(1)}%)`
    );

    // Identify the bottleneck
    const steps = [
      { name: "qvdjs loading", time: step1Time },
      { name: "Metadata extraction", time: step2Time },
      { name: "Data transformation", time: step3Time },
      { name: "JSON serialization", time: step4Time },
    ];
    const bottleneck = steps.reduce(
      (max, step) => (step.time > max.time ? step : max),
      steps[0]
    );

    console.log(`\n🔍 Bottleneck: ${bottleneck.name} (${bottleneck.time}ms)`);

    // Assert overall performance is acceptable
    assert.ok(
      totalTime < 2000,
      `Total processing should be under 2 seconds (was ${totalTime}ms)`
    );
  });

  test("Performance: Test All Large QVD Files", async function () {
    // Very long timeout for multiple large files
    this.timeout(300000); // 5 minutes

    const largeQvdDir = path.join(
      __dirname,
      "..",
      "test-data",
      "fake_data",
      "large_qvd"
    );

    // Check if directory exists
    if (!fs.existsSync(largeQvdDir)) {
      console.log(`⚠️  Large QVD directory not found at: ${largeQvdDir}`);
      console.log("   Skipping test.");
      this.skip();
      return;
    }

    // Find all QVD files in the directory
    const qvdFiles = fs
      .readdirSync(largeQvdDir)
      .filter((file) => file.toLowerCase().endsWith(".qvd"))
      .map((file) => path.join(largeQvdDir, file));

    if (qvdFiles.length === 0) {
      console.log(`⚠️  No QVD files found in: ${largeQvdDir}`);
      console.log("   Create QVD files from CSV using Qlik Sense or QlikView");
      console.log("   CSV generators available in the same directory");
      this.skip();
      return;
    }

    console.log(`\n📊 Testing ${qvdFiles.length} Large QVD File(s)`);
    console.log(`${"=".repeat(60)}`);

    const reader = new QvdReader();
    const results = [];

    // Test each QVD file
    for (let i = 0; i < qvdFiles.length; i++) {
      const filePath = qvdFiles[i];
      const fileName = path.basename(filePath);
      const fileSize = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);

      console.log(`\n\n🔬 Test ${i + 1}/${qvdFiles.length}: ${fileName}`);
      console.log(`   File size: ${fileSize} MB`);
      console.log(`${"=".repeat(60)}`);

      // Step 1: QvdReader Performance (5000 rows)
      console.log(`\n1️⃣  QvdReader Performance (5000 rows):`);
      const readStart = Date.now();
      const readResult = await reader.read(filePath, 5000);
      const readTime = Date.now() - readStart;

      if (readResult.error) {
        console.log(`   ❌ Error reading file: ${readResult.error}`);
        continue;
      }

      console.log(`   ✓ Read time: ${readTime}ms`);
      console.log(
        `   ℹ️  Rows loaded: ${readResult.data.length.toLocaleString()}`
      );
      console.log(
        `   ℹ️  Total records: ${readResult.metadata.noOfRecords.toLocaleString()}`
      );
      console.log(`   ℹ️  Columns: ${readResult.metadata.fields.length}`);

      // Step 2: VS Code Custom Editor (First Open)
      console.log(`\n2️⃣  VS Code Custom Editor (First Open):`);
      const fileUri = vscode.Uri.file(filePath);

      const openStart = Date.now();
      await vscode.commands.executeCommand(
        "vscode.openWith",
        fileUri,
        "ctrl-q-qvd-viewer.qvdEditor"
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const openTime = Date.now() - openStart;

      console.log(
        `   ✓ Open time: ${openTime}ms (${(openTime / 1000).toFixed(1)}s)`
      );

      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 3: Repeated Opens
      console.log(`\n3️⃣  VS Code Custom Editor (Repeated Opens):`);
      const reopenTimes = [];
      const numReopens = 3;

      for (let j = 0; j < numReopens; j++) {
        const reopenStart = Date.now();
        await vscode.commands.executeCommand(
          "vscode.openWith",
          fileUri,
          "ctrl-q-qvd-viewer.qvdEditor"
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const reopenTime = Date.now() - reopenStart;
        reopenTimes.push(reopenTime);

        console.log(`   ✓ Open #${j + 1}: ${reopenTime}ms`);

        await vscode.commands.executeCommand(
          "workbench.action.closeActiveEditor"
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const avgReopen = Math.round(
        reopenTimes.reduce((a, b) => a + b, 0) / reopenTimes.length
      );
      console.log(`   📊 Average: ${avgReopen}ms`);

      // Store results (local array for this test)
      results.push({
        fileName,
        fileSize: parseFloat(fileSize),
        totalRecords: readResult.metadata.noOfRecords,
        columns: readResult.metadata.fields.length,
        readTime,
        firstOpenTime: openTime,
        avgReopenTime: avgReopen,
      });

      // Also store in global array for comprehensive summary
      allPerformanceResults.push({
        fileName,
        fileSizeBytes: fs.statSync(filePath).size,
        fileSizeDisplay: `${fileSize} MB`,
        totalRecords: readResult.metadata.noOfRecords,
        columns: readResult.metadata.fields.length,
        readTime,
        firstOpenTime: openTime,
        avgReopenTime: avgReopen,
      });
    }

    // Summary comparison
    console.log(`\n\n📊 PERFORMANCE COMPARISON SUMMARY`);
    console.log(`${"=".repeat(60)}`);
    console.log(`\nTested ${results.length} file(s):\n`);

    // Table header
    console.log(
      `File Name                              | Size (MB) | Rows      | Cols | Read (ms) | Open (ms) | Reopen (ms)`
    );
    console.log(`${"─".repeat(110)}`);

    // Table rows
    results.forEach((r) => {
      const name = r.fileName.padEnd(38);
      const size = r.fileSize.toFixed(0).padStart(9);
      const rows = r.totalRecords.toLocaleString().padStart(9);
      const cols = r.columns.toString().padStart(4);
      const read = r.readTime.toString().padStart(9);
      const open = r.firstOpenTime.toString().padStart(9);
      const reopen = r.avgReopenTime.toString().padStart(10);
      console.log(
        `${name} | ${size} | ${rows} | ${cols} | ${read} | ${open} | ${reopen}`
      );
    });

    console.log(`\n`);

    // Analysis
    if (results.length > 1) {
      console.log(`🔍 Analysis:`);

      // Find slowest file
      const slowest = results.reduce(
        (max, r) => (r.firstOpenTime > max.firstOpenTime ? r : max),
        results[0]
      );

      console.log(
        `   Slowest to open: ${slowest.fileName} (${slowest.firstOpenTime}ms)`
      );
      console.log(
        `   File characteristics: ${
          slowest.fileSize
        }MB, ${slowest.totalRecords.toLocaleString()} rows, ${
          slowest.columns
        } columns`
      );

      // Calculate correlation between size and open time
      const avgSizeMB =
        results.reduce((sum, r) => sum + r.fileSize, 0) / results.length;
      const avgOpenTime =
        results.reduce((sum, r) => sum + r.firstOpenTime, 0) / results.length;

      console.log(`   Average file size: ${avgSizeMB.toFixed(0)}MB`);
      console.log(`   Average open time: ${avgOpenTime.toFixed(0)}ms`);

      console.log(`\n💡 Recommendations:`);
      console.log(
        `   • See docs/PERFORMANCE_INVESTIGATION.md for optimization strategies`
      );
      console.log(`   • Consider lazy loading for files > 500MB`);
      console.log(`   • Profile webview initialization for files > 1GB`);
    }

    console.log(`\n✅ Large QVD file testing complete!`);

    // Performance assertions - be generous for large files
    results.forEach((r) => {
      assert.ok(
        r.readTime < 5000,
        `Reading ${r.fileName} should be under 5 seconds (was ${r.readTime}ms)`
      );
      assert.ok(
        r.firstOpenTime < 10000,
        `Opening ${r.fileName} should be under 10 seconds (was ${r.firstOpenTime}ms)`
      );
    });
  });
});
