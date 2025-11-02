/**
 * Unit tests for DownloadManager
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs/promises");
const os = require("os");

// DownloadManager is async because it's an ES module
let DownloadManager;

/**
 * Mock SecretStorage for testing
 */
class MockSecretStorage {
  constructor() {
    this.storage = new Map();
  }

  async store(key, value) {
    this.storage.set(key, value);
  }

  async get(key) {
    return this.storage.get(key);
  }

  async delete(key) {
    this.storage.delete(key);
  }
}

/**
 * Mock GlobalState for testing
 */
class MockGlobalState {
  constructor() {
    this.storage = new Map();
  }

  async update(key, value) {
    if (value === undefined) {
      this.storage.delete(key);
    } else {
      this.storage.set(key, value);
    }
  }

  get(key) {
    return this.storage.get(key);
  }
}

suite("DownloadManager Test Suite", () => {
  let downloadManager;
  let mockConnectionManager;
  let mockContext;
  let tempCacheDir;

  suiteSetup(async () => {
    // Import the DownloadManager class
    const module = await import("../src/cloud/downloadManager.mjs");
    DownloadManager = module.DownloadManager;
  });

  setup(async () => {
    // Create temporary cache directory for testing
    tempCacheDir = path.join(os.tmpdir(), `qlik-cache-test-${Date.now()}`);

    // Mock context with temporary cache directory
    mockContext = {
      globalStorageUri: {
        fsPath: tempCacheDir,
      },
    };

    // Mock connection manager
    mockConnectionManager = {
      isConnected: () => true,
      ensureConnected: async () => ({
        dataFiles: {
          getDataFile: async (fileId) => {
            // Return mock file data
            return Buffer.from(`Mock QVD data for ${fileId}`);
          },
        },
      }),
    };

    // Create download manager instance
    downloadManager = new DownloadManager(mockConnectionManager, mockContext);
  });

  teardown(async () => {
    // Clean up temporary cache directory
    try {
      await fs.rm(tempCacheDir, { recursive: true, force: true });
    } catch {
      // Ignore errors during cleanup
    }
  });

  suite("Constructor", () => {
    test("should create instance with correct properties", () => {
      assert.strictEqual(
        downloadManager.connectionManager,
        mockConnectionManager
      );
      assert.strictEqual(downloadManager.context, mockContext);
      assert.ok(downloadManager.cacheDir.includes(".qlik-cloud-cache"));
      assert.ok(downloadManager.activeDownloads instanceof Map);
    });

    test("should set cache directory under global storage path", () => {
      const expectedPath = path.join(tempCacheDir, ".qlik-cloud-cache");
      assert.strictEqual(downloadManager.cacheDir, expectedPath);
    });
  });

  suite("initializeCache()", () => {
    test("should create cache directory if it doesn't exist", async () => {
      await downloadManager.initializeCache();

      const stats = await fs.stat(downloadManager.cacheDir);
      assert.ok(stats.isDirectory());
    });

    test("should not fail if cache directory already exists", async () => {
      await downloadManager.initializeCache();
      await downloadManager.initializeCache(); // Call again

      const stats = await fs.stat(downloadManager.cacheDir);
      assert.ok(stats.isDirectory());
    });
  });

  suite("getCachedFilePath()", () => {
    test("should return path with .qvd extension", () => {
      const fileId = "test-file-123";
      const cachePath = downloadManager.getCachedFilePath(fileId);

      assert.ok(cachePath.endsWith(".qvd"));
      assert.ok(cachePath.includes(fileId.replace(/[^a-zA-Z0-9_-]/g, "_")));
    });

    test("should sanitize file IDs with special characters", () => {
      const fileId = "test/file:123*?";
      const cachePath = downloadManager.getCachedFilePath(fileId);

      // Extract just the filename from the path
      const fileName = path.basename(cachePath);

      // The filename should not contain the original special characters
      // They should be replaced with underscores
      assert.ok(!fileName.includes(":"));
      assert.ok(!fileName.includes("*"));
      assert.ok(!fileName.includes("?"));
      assert.ok(fileName.includes("_")); // Should have underscores instead
    });

    test("should return consistent path for same file ID", () => {
      const fileId = "test-file-456";
      const path1 = downloadManager.getCachedFilePath(fileId);
      const path2 = downloadManager.getCachedFilePath(fileId);

      assert.strictEqual(path1, path2);
    });
  });

  suite("isCached()", () => {
    test("should return false for non-existent file", async () => {
      const result = await downloadManager.isCached("non-existent-file");
      assert.strictEqual(result, false);
    });

    test("should return true for cached file", async () => {
      const fileId = "cached-file-789";
      await downloadManager.initializeCache();

      // Create a cached file
      const cachePath = downloadManager.getCachedFilePath(fileId);
      await fs.writeFile(cachePath, "test data");

      const result = await downloadManager.isCached(fileId);
      assert.strictEqual(result, true);
    });
  });

  suite("downloadFile()", () => {
    test("should download file and save to cache", async () => {
      const fileId = "download-test-1";

      const cachePath = await downloadManager.downloadFile(fileId, {
        showProgress: false,
      });

      assert.ok(cachePath.endsWith(".qvd"));

      // Verify file exists
      const content = await fs.readFile(cachePath, "utf-8");
      assert.ok(content.includes(fileId));
    });

    test("should use cached file when available", async () => {
      const fileId = "download-test-2";

      // First download
      const path1 = await downloadManager.downloadFile(fileId, {
        showProgress: false,
      });

      // Write custom content to cached file
      await fs.writeFile(path1, "custom cached content");

      // Second download should use cache
      const path2 = await downloadManager.downloadFile(fileId, {
        showProgress: false,
      });

      const content = await fs.readFile(path2, "utf-8");
      assert.strictEqual(content, "custom cached content");
    });

    test("should force refresh when forceRefresh is true", async () => {
      const fileId = "download-test-3";

      // First download
      const path1 = await downloadManager.downloadFile(fileId, {
        showProgress: false,
      });

      // Write custom content to cached file
      await fs.writeFile(path1, "old cached content");

      // Force refresh should download again
      const path2 = await downloadManager.downloadFile(fileId, {
        showProgress: false,
        forceRefresh: true,
      });

      const content = await fs.readFile(path2, "utf-8");
      assert.ok(content.includes(fileId)); // Should have new content
      assert.ok(!content.includes("old cached content"));
    });

    test("should handle download with progress notification", async () => {
      const fileId = "download-test-4";

      const cachePath = await downloadManager.downloadFile(fileId, {
        showProgress: true,
        fileName: "test-file.qvd",
      });

      assert.ok(cachePath.endsWith(".qvd"));

      // Verify file exists
      const exists = await downloadManager.isCached(fileId);
      assert.strictEqual(exists, true);
    });

    test("should use custom file name in progress message", async () => {
      const fileId = "download-test-5";
      const customFileName = "my-custom-file.qvd";

      const cachePath = await downloadManager.downloadFile(fileId, {
        showProgress: true,
        fileName: customFileName,
      });

      assert.ok(cachePath.endsWith(".qvd"));
    });
  });

  suite("clearCacheForFile()", () => {
    test("should remove specific file from cache", async () => {
      const fileId = "clear-test-1";

      // Download file first
      await downloadManager.downloadFile(fileId, { showProgress: false });

      // Verify it's cached
      let isCached = await downloadManager.isCached(fileId);
      assert.strictEqual(isCached, true);

      // Clear the file
      await downloadManager.clearCacheForFile(fileId);

      // Verify it's no longer cached
      isCached = await downloadManager.isCached(fileId);
      assert.strictEqual(isCached, false);
    });

    test("should not fail when clearing non-existent file", async () => {
      // Should not throw
      await downloadManager.clearCacheForFile("non-existent-file");
    });
  });

  suite("clearAllCache()", () => {
    test("should remove all cached files", async () => {
      // Download multiple files
      await downloadManager.downloadFile("file-1", { showProgress: false });
      await downloadManager.downloadFile("file-2", { showProgress: false });
      await downloadManager.downloadFile("file-3", { showProgress: false });

      // Verify they're cached
      let stats = await downloadManager.getCacheStats();
      assert.strictEqual(stats.fileCount, 3);

      // Clear all cache
      await downloadManager.clearAllCache();

      // Verify cache is empty
      stats = await downloadManager.getCacheStats();
      assert.strictEqual(stats.fileCount, 0);
    });

    test("should not fail if cache directory doesn't exist", async () => {
      // Create new manager with non-existent directory
      const newContext = {
        globalStorageUri: {
          fsPath: path.join(os.tmpdir(), `non-existent-${Date.now()}`),
        },
      };
      const newManager = new DownloadManager(mockConnectionManager, newContext);

      // Should not throw
      await newManager.clearAllCache();
    });
  });

  suite("getCacheStats()", () => {
    test("should return zero stats for empty cache", async () => {
      const stats = await downloadManager.getCacheStats();

      assert.strictEqual(stats.fileCount, 0);
      assert.strictEqual(stats.totalSize, 0);
      assert.strictEqual(stats.totalSizeFormatted, "0 B");
    });

    test("should return correct file count", async () => {
      // Download multiple files
      await downloadManager.downloadFile("stats-file-1", {
        showProgress: false,
      });
      await downloadManager.downloadFile("stats-file-2", {
        showProgress: false,
      });

      const stats = await downloadManager.getCacheStats();
      assert.strictEqual(stats.fileCount, 2);
    });

    test("should calculate total size correctly", async () => {
      await downloadManager.downloadFile("stats-file-3", {
        showProgress: false,
      });

      const stats = await downloadManager.getCacheStats();
      assert.ok(stats.totalSize > 0);
      assert.ok(stats.totalSizeFormatted.includes("B")); // Should have byte unit
    });

    test("should format size as human-readable string", async () => {
      await downloadManager.downloadFile("stats-file-4", {
        showProgress: false,
      });

      const stats = await downloadManager.getCacheStats();
      assert.ok(typeof stats.totalSizeFormatted === "string");
      assert.ok(/\d+(\.\d+)?\s[KMGT]?B/.test(stats.totalSizeFormatted)); // Match pattern like "1.5 KB"
    });
  });

  suite("formatBytes()", () => {
    test("should format 0 bytes", () => {
      const result = downloadManager.formatBytes(0);
      assert.strictEqual(result, "0 B");
    });

    test("should format bytes", () => {
      const result = downloadManager.formatBytes(500);
      assert.strictEqual(result, "500 B");
    });

    test("should format kilobytes", () => {
      const result = downloadManager.formatBytes(1024);
      assert.strictEqual(result, "1 KB");
    });

    test("should format megabytes", () => {
      const result = downloadManager.formatBytes(1024 * 1024);
      assert.strictEqual(result, "1 MB");
    });

    test("should format gigabytes", () => {
      const result = downloadManager.formatBytes(1024 * 1024 * 1024);
      assert.strictEqual(result, "1 GB");
    });

    test("should format with decimals", () => {
      const result = downloadManager.formatBytes(1536, 2);
      assert.strictEqual(result, "1.5 KB");
    });

    test("should handle custom decimal places", () => {
      const result = downloadManager.formatBytes(1234567, 1);
      assert.strictEqual(result, "1.2 MB");
    });
  });

  suite("Error Handling", () => {
    test("should throw error if connection manager fails", async () => {
      const failingConnectionManager = {
        ensureConnected: async () => {
          throw new Error("Connection failed");
        },
      };

      const failingManager = new DownloadManager(
        failingConnectionManager,
        mockContext
      );

      await assert.rejects(
        async () => {
          await failingManager.downloadFile("test-file", {
            showProgress: false,
          });
        },
        {
          message: /Connection failed/,
        }
      );
    });

    test("should throw error if file write fails", async () => {
      // Create manager with read-only directory to cause write failure
      const readOnlyContext = {
        globalStorageUri: {
          fsPath: "/root/readonly", // This will fail on most systems
        },
      };

      const failingManager = new DownloadManager(
        mockConnectionManager,
        readOnlyContext
      );

      await assert.rejects(
        async () => {
          await failingManager.downloadFile("test-file", {
            showProgress: false,
          });
        },
        {
          message: /Failed to initialize cache directory/,
        }
      );
    });
  });

  suite("Active Downloads Tracking", () => {
    test("should track active downloads", async () => {
      assert.strictEqual(downloadManager.activeDownloads.size, 0);

      // Start download (don't wait for completion)
      const downloadPromise = downloadManager.downloadFile("track-test-1", {
        showProgress: true,
      });

      // Wait for download to complete
      await downloadPromise;

      // After completion, should be removed from tracking
      assert.strictEqual(downloadManager.activeDownloads.size, 0);
    });
  });

  suite("Integration Tests (with real API)", () => {
    // These tests require real Qlik Cloud credentials and a test file
    // Set these environment variables to run integration tests:
    //   export QLIK_API_KEY="your-api-key"
    //   export QLIK_TENANT_URL="your-tenant.us.qlikcloud.com"
    //   export QLIK_TEST_FILE_ID="file-id-to-test-download" (optional)
    //   npm test

    let realConnectionManager;
    let realAuthProvider;
    let realDownloadManager;
    let QlikAuthProvider;
    let CloudConnectionManager;

    const hasCredentials = () => {
      return process.env.QLIK_API_KEY && process.env.QLIK_TENANT_URL;
    };

    suiteSetup(async () => {
      // Load real modules for integration tests
      const authModule = await import("../src/cloud/qlikAuthProvider.mjs");
      const connModule = await import(
        "../src/cloud/cloudConnectionManager.mjs"
      );
      QlikAuthProvider = authModule.QlikAuthProvider;
      CloudConnectionManager = connModule.CloudConnectionManager;
    });

    setup(async () => {
      if (hasCredentials()) {
        // Create real instances for integration tests
        const realContext = new (class {
          constructor() {
            this.secrets = new MockSecretStorage();
            this.globalState = new MockGlobalState();
            this.globalStorageUri = {
              fsPath: path.join(
                os.tmpdir(),
                `qlik-integration-test-${Date.now()}`
              ),
            };
          }
        })();

        realAuthProvider = new QlikAuthProvider(realContext);
        realConnectionManager = new CloudConnectionManager(realAuthProvider);
        realDownloadManager = new DownloadManager(
          realConnectionManager,
          realContext
        );

        // Configure credentials
        await realAuthProvider.setApiKey(process.env.QLIK_API_KEY);
        await realAuthProvider.setTenantUrl(process.env.QLIK_TENANT_URL);
      }
    });

    teardown(async () => {
      if (hasCredentials() && realDownloadManager) {
        // Clean up cache after integration tests
        try {
          await realDownloadManager.clearAllCache();
          const cacheDir = realDownloadManager.cacheDir;
          await fs.rm(path.dirname(cacheDir), {
            recursive: true,
            force: true,
          });
        } catch {
          // Ignore cleanup errors
        }

        if (realConnectionManager) {
          await realConnectionManager.disconnect();
        }
      }
    });

    test("should download real file from Qlik Cloud", async function () {
      if (!hasCredentials()) {
        console.log(
          "  ⚠ Skipping integration test - set QLIK_API_KEY and QLIK_TENANT_URL to run"
        );
        this.skip();
        return;
      }

      // Check if we have a test file ID
      const testFileId = process.env.QLIK_TEST_FILE_ID;
      if (!testFileId) {
        console.log(
          "  ⚠ Skipping download test - set QLIK_TEST_FILE_ID to test file download"
        );
        this.skip();
        return;
      }

      // Connect to Qlik Cloud
      await realConnectionManager.connect();

      try {
        // Get file metadata first
        const { dataFiles } = await import("@qlik/api");
        const metadata = await dataFiles.getDataFile(testFileId);

        console.log("\n  📋 File Metadata:");
        console.log(`     ID: ${metadata.data.id}`);
        console.log(`     Name: ${metadata.data.name}`);
        console.log(`     Size: ${metadata.data.size} bytes`);
        console.log(
          `     Modified: ${new Date(
            metadata.data.modifiedDate
          ).toLocaleString()}`
        );

        // Download the file
        const filePath = await realDownloadManager.downloadFile(testFileId, {
          showProgress: false,
          fileName: "test-file.qvd",
        });

        // Verify file was downloaded
        assert.ok(filePath, "Should return a file path");
        assert.ok(filePath.endsWith(".qvd"), "Should have .qvd extension");

        // Verify file exists and get stats
        const stats = await fs.stat(filePath);
        assert.ok(stats.size > 0, "Downloaded file should have content");

        // Copy file to test-output directory for inspection
        const outputDir = path.join(process.cwd(), "test-output");
        await fs.mkdir(outputDir, { recursive: true });
        const outputPath = path.join(
          outputDir,
          `downloaded-${path.basename(metadata.data.name)}`
        );
        await fs.copyFile(filePath, outputPath);

        console.log("\n  ✓ Download Summary:");
        console.log(`     Cache location: ${filePath}`);
        console.log(`     Copied to: ${outputPath}`);
        console.log(`     Downloaded size: ${stats.size} bytes`);
        console.log(
          `     Size matches metadata: ${
            stats.size === metadata.data.size ? "✓ YES" : "✗ NO"
          }`
        );
        console.log(`     File created: ${stats.birthtime.toLocaleString()}`);

        // Verify file size matches metadata
        assert.strictEqual(
          stats.size,
          metadata.data.size,
          "Downloaded file size should match metadata"
        );

        // Verify it's cached
        const isCached = await realDownloadManager.isCached(testFileId);
        assert.strictEqual(isCached, true, "File should be cached");
      } finally {
        await realConnectionManager.disconnect();
      }
    });

    test("should use cache for subsequent downloads", async function () {
      if (!hasCredentials()) {
        console.log(
          "  ⚠ Skipping integration test - set QLIK_API_KEY and QLIK_TENANT_URL to run"
        );
        this.skip();
        return;
      }

      const testFileId = process.env.QLIK_TEST_FILE_ID;
      if (!testFileId) {
        console.log(
          "  ⚠ Skipping cache test - set QLIK_TEST_FILE_ID to test caching"
        );
        this.skip();
        return;
      }

      await realConnectionManager.connect();

      try {
        // First download
        console.log("\n  📥 First download (from Qlik Cloud)...");
        const startTime1 = Date.now();
        const filePath1 = await realDownloadManager.downloadFile(testFileId, {
          showProgress: false,
        });
        const downloadTime1 = Date.now() - startTime1;
        const stats1 = await fs.stat(filePath1);

        // Wait a moment
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Second download (should use cache)
        console.log("  💾 Second download (from cache)...");
        const startTime2 = Date.now();
        const filePath2 = await realDownloadManager.downloadFile(testFileId, {
          showProgress: false,
        });
        const downloadTime2 = Date.now() - startTime2;
        const stats2 = await fs.stat(filePath2);

        // Verify it's the same file
        assert.strictEqual(filePath1, filePath2, "Should return same path");
        assert.strictEqual(stats1.size, stats2.size, "Should have same size");

        // File modification time should not have changed (proves cache was used)
        assert.strictEqual(
          stats1.mtimeMs,
          stats2.mtimeMs,
          "File should not have been modified (cache used)"
        );

        console.log("\n  ✓ Cache Performance:");
        console.log(`     First download: ${downloadTime1}ms`);
        console.log(`     Second download (cached): ${downloadTime2}ms`);
        console.log(
          `     Speed improvement: ${
            Math.round((downloadTime1 / downloadTime2) * 100) / 100
          }x faster`
        );
        console.log(`     Cache file: ${filePath1}`);
      } finally {
        await realConnectionManager.disconnect();
      }
    });

    test("should get accurate cache statistics", async function () {
      if (!hasCredentials()) {
        console.log(
          "  ⚠ Skipping integration test - set QLIK_API_KEY and QLIK_TENANT_URL to run"
        );
        this.skip();
        return;
      }

      const testFileId = process.env.QLIK_TEST_FILE_ID;
      if (!testFileId) {
        console.log(
          "  ⚠ Skipping stats test - set QLIK_TEST_FILE_ID to test statistics"
        );
        this.skip();
        return;
      }

      await realConnectionManager.connect();

      try {
        // Download a file
        await realDownloadManager.downloadFile(testFileId, {
          showProgress: false,
        });

        // Get cache stats
        const stats = await realDownloadManager.getCacheStats();

        assert.ok(stats.fileCount > 0, "Should have at least 1 cached file");
        assert.ok(stats.totalSize > 0, "Total size should be greater than 0");
        assert.ok(
          stats.totalSizeFormatted.includes("B"),
          "Should have formatted size"
        );

        console.log("\n  📊 Cache Statistics:");
        console.log(`     Files in cache: ${stats.fileCount}`);
        console.log(
          `     Total size: ${stats.totalSizeFormatted} (${stats.totalSize} bytes)`
        );
        console.log(`     Cache directory: ${realDownloadManager.cacheDir}`);
      } finally {
        await realConnectionManager.disconnect();
      }
    });

    test("should clear cache successfully", async function () {
      if (!hasCredentials()) {
        console.log(
          "  ⚠ Skipping integration test - set QLIK_API_KEY and QLIK_TENANT_URL to run"
        );
        this.skip();
        return;
      }

      const testFileId = process.env.QLIK_TEST_FILE_ID;
      if (!testFileId) {
        console.log(
          "  ⚠ Skipping clear test - set QLIK_TEST_FILE_ID to test cache clearing"
        );
        this.skip();
        return;
      }

      await realConnectionManager.connect();

      try {
        // Download a file
        await realDownloadManager.downloadFile(testFileId, {
          showProgress: false,
        });

        // Verify it's cached
        let isCached = await realDownloadManager.isCached(testFileId);
        assert.strictEqual(isCached, true);

        // Clear cache
        await realDownloadManager.clearAllCache();

        // Verify it's no longer cached
        isCached = await realDownloadManager.isCached(testFileId);
        assert.strictEqual(isCached, false);

        // Verify stats show empty cache
        const stats = await realDownloadManager.getCacheStats();
        assert.strictEqual(stats.fileCount, 0);

        console.log("  ✓ Successfully cleared cache");
      } finally {
        await realConnectionManager.disconnect();
      }
    });
  });
});
