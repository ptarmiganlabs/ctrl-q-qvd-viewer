#!/usr/bin/env node

/**
 * Check the actual JSON serialization size for different QVDs
 * This helps understand why large QVDs fail to open
 */

const path = require("path");

// We'll need to use the QvdReader
async function checkJsonSize() {
  const QvdReader = await require("../../../src/qvdReader.cjs");
  const reader = new QvdReader();

  const qvdFiles = [
    {
      name: "colors.qvd (small)",
      path: path.join(__dirname, "../../lego/colors.qvd"),
    },
    {
      name: "orders_20m.qvd",
      path: path.join(__dirname, "orders_20m.qvd"),
    },
    {
      name: "orders_30m_21col_low_entropy.qvd",
      path: path.join(__dirname, "orders_30m_21col_low_entropy.qvd"),
    },
  ];

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  JSON Serialization Size Analysis");
  console.log("═══════════════════════════════════════════════════════════\n");

  for (const file of qvdFiles) {
    console.log(`\n📄 ${file.name}`);
    console.log("─".repeat(60));

    try {
      const result = await reader.read(file.path, 5000);

      if (result.error) {
        console.log(`   ❌ Error: ${result.error}`);
        continue;
      }

      // Measure what gets serialized in the HTML
      const tableDataJson = JSON.stringify(result.data);
      const schemaDataJson = JSON.stringify(
        result.metadata.fields.map((field) => ({
          name: field.name,
          type: field.type || "",
          extent: field.extent || "",
          noOfSymbols: field.noOfSymbols || 0,
        }))
      );

      const tableDataSize = Buffer.byteLength(tableDataJson, "utf8");
      const schemaDataSize = Buffer.byteLength(schemaDataJson, "utf8");
      const totalSize = tableDataSize + schemaDataSize;

      console.log(
        `   Total records in file: ${result.metadata.noOfRecords.toLocaleString()}`
      );
      console.log(`   Rows loaded: ${result.data.length.toLocaleString()}`);
      console.log(`   Columns: ${result.metadata.fields.length}`);
      console.log(
        `   Data points: ${(
          result.data.length * result.metadata.fields.length
        ).toLocaleString()}`
      );
      console.log("");
      console.log(`   📊 Serialized Sizes:`);
      console.log(
        `      Table data:  ${(tableDataSize / 1024 / 1024).toFixed(2)} MB`
      );
      console.log(
        `      Schema data: ${(schemaDataSize / 1024).toFixed(2)} KB`
      );
      console.log(
        `      Total:       ${(totalSize / 1024 / 1024).toFixed(2)} MB`
      );

      // Sample the first row to see data structure
      if (result.data.length > 0) {
        const firstRow = result.data[0];
        const columnNames = Object.keys(firstRow);
        const avgColumnNameLength =
          columnNames.reduce((sum, name) => sum + name.length, 0) /
          columnNames.length;

        // Sample a few values to get average length
        const sampleValues = columnNames
          .slice(0, 5)
          .map((col) => String(firstRow[col]));
        const avgValueLength =
          sampleValues.reduce((sum, val) => sum + val.length, 0) /
          sampleValues.length;

        console.log("");
        console.log(`   📐 Data Characteristics:`);
        console.log(
          `      Avg column name length: ${avgColumnNameLength.toFixed(
            1
          )} chars`
        );
        console.log(
          `      Avg value length (sample): ${avgValueLength.toFixed(1)} chars`
        );
        console.log(
          `      Sample columns: ${columnNames.slice(0, 3).join(", ")}...`
        );
      }

      // Estimate if this would exceed typical limits
      const vscodeLimit = 50; // Estimated VS Code HTML content limit in MB
      if (totalSize / 1024 / 1024 > vscodeLimit) {
        console.log("");
        console.log(
          `   ⚠️  EXCEEDS TYPICAL VS CODE LIMITS (~${vscodeLimit}MB)`
        );
        console.log(`   ❌ This file will likely FAIL to open`);
      } else if (totalSize / 1024 / 1024 > vscodeLimit * 0.5) {
        console.log("");
        console.log(`   ⚠️  APPROACHING VS CODE LIMITS`);
        console.log(
          `   ⚠️  May fail on slower systems or with other tabs open`
        );
      } else {
        console.log("");
        console.log(`   ✅ Within safe limits`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  console.log("\n");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("💡 Recommendation:");
  console.log("   Files with > 10MB serialized data should use postMessage");
  console.log("   instead of embedding data in HTML");
  console.log("═══════════════════════════════════════════════════════════\n");
}

checkJsonSize().catch(console.error);
