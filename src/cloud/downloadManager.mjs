/**
 * @fileoverview Download manager for Qlik Cloud QVD files
 * Handles downloading QVD files from Qlik Cloud with local caching support.
 *
 * @module cloud/downloadManager
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";

/**
 * Manages downloading and caching of QVD files from Qlik Cloud
 * Implements intelligent caching to minimize network calls
 *
 * @class DownloadManager
 */
export class DownloadManager {
  /**
   * Creates an instance of DownloadManager
   *
   * @param {import('./cloudConnectionManager.mjs').CloudConnectionManager} connectionManager - Connection manager instance
   * @param {vscode.ExtensionContext} context - Extension context for storage paths
   */
  constructor(connectionManager, context) {
    this.connectionManager = connectionManager;
    this.context = context;
    this.cacheDir = path.join(
      context.globalStorageUri.fsPath,
      ".qlik-cloud-cache"
    );
    this.activeDownloads = new Map(); // Track active downloads for cancellation
  }

  /**
   * Initialize cache directory
   * Creates cache directory if it doesn't exist
   *
   * @returns {Promise<void>}
   */
  async initializeCache() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      console.log(`Cache directory initialized at: ${this.cacheDir}`);
    } catch (error) {
      console.error("Failed to create cache directory:", error);
      throw new Error(`Failed to initialize cache directory: ${error.message}`);
    }
  }

  /**
   * Download QVD file from Qlik Cloud
   * Uses cache if available unless forceRefresh is true
   * Shows progress notification during download with cancellation support
   *
   * @param {string} fileId - Qlik Cloud file ID
   * @param {Object} options - Download options
   * @param {boolean} options.forceRefresh - Force re-download even if cached (default: false)
   * @param {boolean} options.showProgress - Show progress notification (default: true)
   * @param {string} options.fileName - Optional file name for display in progress
   * @returns {Promise<string>} Path to downloaded file
   * @throws {Error} If download fails or is cancelled
   */
  async downloadFile(fileId, options = {}) {
    const {
      forceRefresh = false,
      showProgress = true,
      fileName = fileId,
    } = options;

    // Ensure cache directory exists
    await this.initializeCache();

    const cachePath = this.getCachedFilePath(fileId);

    // Check cache first unless force refresh requested
    if (!forceRefresh && (await this.isCached(fileId))) {
      console.log(`Using cached file for ${fileId}`);
      return cachePath;
    }

    // Ensure we're connected
    const connection = await this.connectionManager.ensureConnected();

    // Download with progress notification
    if (showProgress) {
      return await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Downloading ${fileName}...`,
          cancellable: true,
        },
        async (progress, token) => {
          // Handle cancellation
          const cancellationPromise = new Promise((_, reject) => {
            token.onCancellationRequested(() => {
              this.activeDownloads.delete(fileId);
              reject(new Error("Download cancelled by user"));
            });
          });

          // Download promise
          const downloadPromise = (async () => {
            try {
              progress.report({
                message: "Connecting to Qlik Cloud...",
                increment: 10,
              });

              // Download file content from Qlik Cloud
              // Use the qix-datafiles endpoint to download the actual file content
              const downloadUrl = `${connection.config.host}/api/v1/qix-datafiles/${fileId}`;
              const downloadResponse = await fetch(downloadUrl, {
                headers: {
                  Authorization: `Bearer ${connection.config.apiKey}`,
                },
              });

              if (!downloadResponse.ok) {
                const errorBody = await downloadResponse.text();
                throw new Error(
                  `Failed to download file: ${downloadResponse.status} ${downloadResponse.statusText}. ${errorBody}`
                );
              }

              progress.report({
                message: "Downloading file...",
                increment: 80,
              });

              const fileBuffer = Buffer.from(
                await downloadResponse.arrayBuffer()
              );

              progress.report({
                message: "Saving file to cache...",
                increment: 10,
              });

              // Save to cache
              await fs.writeFile(cachePath, fileBuffer);

              progress.report({ message: "Complete", increment: 10 });

              this.activeDownloads.delete(fileId);
              return cachePath;
            } catch (error) {
              this.activeDownloads.delete(fileId);
              throw error;
            }
          })();

          this.activeDownloads.set(fileId, downloadPromise);

          // Race between download and cancellation
          return Promise.race([downloadPromise, cancellationPromise]);
        }
      );
    } else {
      // Download without progress notification
      try {
        // Download file content from Qlik Cloud
        // Use the qix-datafiles endpoint to download the actual file content
        const downloadUrl = `${connection.config.host}/api/v1/qix-datafiles/${fileId}`;
        const downloadResponse = await fetch(downloadUrl, {
          headers: {
            Authorization: `Bearer ${connection.config.apiKey}`,
          },
        });

        if (!downloadResponse.ok) {
          const errorBody = await downloadResponse.text();
          throw new Error(
            `Failed to download file: ${downloadResponse.status} ${downloadResponse.statusText}. ${errorBody}`
          );
        }

        const fileBuffer = Buffer.from(await downloadResponse.arrayBuffer());

        // Save to cache
        await fs.writeFile(cachePath, fileBuffer);
        return cachePath;
      } catch (error) {
        console.error(`Failed to download file ${fileId}:`, error);
        throw new Error(
          `Failed to download file from Qlik Cloud: ${error.message}`
        );
      }
    }
  }

  /**
   * Check if file exists in cache
   *
   * @param {string} fileId - Qlik Cloud file ID
   * @returns {Promise<boolean>} True if file is cached, false otherwise
   */
  async isCached(fileId) {
    try {
      const cachePath = this.getCachedFilePath(fileId);
      await fs.access(cachePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get cached file path
   *
   * @param {string} fileId - Qlik Cloud file ID
   * @returns {string} Path to cached file
   */
  getCachedFilePath(fileId) {
    // Sanitize fileId to create safe filename
    const safeFileName = fileId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.cacheDir, `${safeFileName}.qvd`);
  }

  /**
   * Clear cache for specific file
   *
   * @param {string} fileId - Qlik Cloud file ID
   * @returns {Promise<void>}
   */
  async clearCacheForFile(fileId) {
    try {
      const cachePath = this.getCachedFilePath(fileId);
      await fs.unlink(cachePath);
      console.log(`Cleared cache for file: ${fileId}`);
      vscode.window.showInformationMessage(`Cache cleared for file: ${fileId}`);
    } catch (error) {
      if (error.code === "ENOENT") {
        // File doesn't exist in cache, that's okay
        console.log(`File ${fileId} not found in cache`);
      } else {
        console.error(`Failed to clear cache for file ${fileId}:`, error);
        throw new Error(`Failed to clear cache for file: ${error.message}`);
      }
    }
  }

  /**
   * Clear entire cache
   * Removes all cached QVD files
   *
   * @returns {Promise<void>}
   */
  async clearAllCache() {
    try {
      const files = await fs.readdir(this.cacheDir);
      let clearedCount = 0;

      for (const file of files) {
        if (file.endsWith(".qvd")) {
          await fs.unlink(path.join(this.cacheDir, file));
          clearedCount++;
        }
      }

      console.log(`Cleared ${clearedCount} file(s) from cache`);
      vscode.window.showInformationMessage(
        `Cloud file cache cleared successfully (${clearedCount} file(s))`
      );
    } catch (error) {
      if (error.code === "ENOENT") {
        // Cache directory doesn't exist, that's okay
        console.log("Cache directory doesn't exist yet");
      } else {
        console.error("Failed to clear cache:", error);
        vscode.window.showErrorMessage(
          `Failed to clear cache: ${error.message}`
        );
        throw error;
      }
    }
  }

  /**
   * Get cache statistics
   * Returns information about cached files including count and total size
   *
   * @returns {Promise<{fileCount: number, totalSize: number, totalSizeFormatted: string}>} Cache statistics
   */
  async getCacheStats() {
    try {
      const files = await fs.readdir(this.cacheDir);
      let fileCount = 0;
      let totalSize = 0;

      for (const file of files) {
        if (file.endsWith(".qvd")) {
          const filePath = path.join(this.cacheDir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
          fileCount++;
        }
      }

      const totalSizeFormatted = this.formatBytes(totalSize);

      return {
        fileCount,
        totalSize,
        totalSizeFormatted,
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        // Cache directory doesn't exist yet
        return {
          fileCount: 0,
          totalSize: 0,
          totalSizeFormatted: "0 B",
        };
      }
      throw error;
    }
  }

  /**
   * Format bytes to human-readable string
   * Helper method for displaying file sizes
   *
   * @private
   * @param {number} bytes - Number of bytes
   * @param {number} decimals - Number of decimal places (default: 2)
   * @returns {string} Formatted string (e.g., "1.5 MB")
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["B", "KB", "MB", "GB", "TB"];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }
}
