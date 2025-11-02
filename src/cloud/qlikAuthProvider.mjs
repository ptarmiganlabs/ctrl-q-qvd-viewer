/**
 * @fileoverview Authentication provider for Qlik Sense Cloud
 * Manages secure storage and retrieval of API keys using VS Code's SecretStorage API.
 *
 * @module cloud/qlikAuthProvider
 */

import * as vscode from "vscode";

/**
 * Manages authentication with Qlik Sense Cloud
 * Provides secure storage for API keys and tenant URL validation
 *
 * @class QlikAuthProvider
 */
export class QlikAuthProvider {
  /**
   * Creates an instance of QlikAuthProvider
   *
   * @param {vscode.ExtensionContext} context - Extension context for secret storage
   */
  constructor(context) {
    this.context = context;
    this.secretKey = "qlik-cloud-api-key";
    this.tenantUrlKey = "qlik-cloud-tenant-url";
  }

  /**
   * Store API key securely in OS keychain
   *
   * @param {string} apiKey - Qlik Cloud API key
   * @returns {Promise<void>}
   * @throws {Error} If API key is invalid
   */
  async setApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== "string") {
      throw new Error("Invalid API key: must be a non-empty string");
    }

    // Trim whitespace to prevent accidental input errors
    const trimmedKey = apiKey.trim();
    if (trimmedKey.length === 0) {
      throw new Error("Invalid API key: cannot be empty or whitespace only");
    }

    await this.context.secrets.store(this.secretKey, trimmedKey);
  }

  /**
   * Retrieve stored API key from secure storage
   *
   * @returns {Promise<string|undefined>} API key or undefined if not set
   */
  async getApiKey() {
    return await this.context.secrets.get(this.secretKey);
  }

  /**
   * Check if API key is configured
   *
   * @returns {Promise<boolean>} True if API key exists, false otherwise
   */
  async hasApiKey() {
    const key = await this.getApiKey();
    return !!key;
  }

  /**
   * Clear stored API key from secure storage
   *
   * @returns {Promise<void>}
   */
  async clearApiKey() {
    await this.context.secrets.delete(this.secretKey);
  }

  /**
   * Validate tenant URL format
   * Ensures URL matches expected Qlik Cloud tenant pattern
   *
   * @param {string} url - Tenant URL to validate
   * @returns {boolean} True if URL is valid, false otherwise
   */
  validateTenantUrl(url) {
    if (!url || typeof url !== "string") {
      return false;
    }

    // Accept formats:
    // - tenant.region.qlikcloud.com
    // - https://tenant.region.qlikcloud.com
    // - tenant.region.qlikcloud.com/
    // - https://tenant.region.qlikcloud.com/
    const pattern =
      /^(https:\/\/)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.qlikcloud\.com\/?$/;
    return pattern.test(url.trim());
  }

  /**
   * Normalize tenant URL to standard format
   * Removes trailing slashes, ensures HTTPS, etc.
   *
   * @param {string} url - Tenant URL to normalize
   * @returns {string} Normalized tenant URL
   * @throws {Error} If URL cannot be normalized
   */
  normalizeTenantUrl(url) {
    if (!url || typeof url !== "string") {
      throw new Error("Invalid tenant URL: must be a non-empty string");
    }

    const trimmedUrl = url.trim();
    if (trimmedUrl.length === 0) {
      throw new Error("Invalid tenant URL: cannot be empty or whitespace only");
    }

    if (!this.validateTenantUrl(trimmedUrl)) {
      throw new Error(
        `Invalid tenant URL format: ${trimmedUrl}. Expected format: tenant.region.qlikcloud.com`
      );
    }

    // Remove protocol and trailing slash to get normalized format
    return trimmedUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  /**
   * Store tenant URL in workspace configuration
   *
   * @param {string} url - Tenant URL to store
   * @returns {Promise<void>}
   * @throws {Error} If URL is invalid
   */
  async setTenantUrl(url) {
    // Normalize the URL first (this also validates it)
    const normalizedUrl = this.normalizeTenantUrl(url);

    // Store in global state (not workspace-specific, so it persists across workspaces)
    await this.context.globalState.update(this.tenantUrlKey, normalizedUrl);
  }

  /**
   * Retrieve stored tenant URL
   *
   * @returns {Promise<string|undefined>} Tenant URL or undefined if not set
   */
  async getTenantUrl() {
    return this.context.globalState.get(this.tenantUrlKey);
  }

  /**
   * Check if tenant URL is configured
   *
   * @returns {Promise<boolean>} True if tenant URL exists, false otherwise
   */
  async hasTenantUrl() {
    const url = await this.getTenantUrl();
    return !!url;
  }

  /**
   * Clear stored tenant URL
   *
   * @returns {Promise<void>}
   */
  async clearTenantUrl() {
    await this.context.globalState.update(this.tenantUrlKey, undefined);
  }

  /**
   * Check if fully configured (both API key and tenant URL)
   *
   * @returns {Promise<boolean>} True if both API key and tenant URL are set
   */
  async isConfigured() {
    const [hasKey, hasUrl] = await Promise.all([
      this.hasApiKey(),
      this.hasTenantUrl(),
    ]);
    return hasKey && hasUrl;
  }

  /**
   * Clear all stored credentials and configuration
   *
   * @returns {Promise<void>}
   */
  async clearAll() {
    await Promise.all([this.clearApiKey(), this.clearTenantUrl()]);
  }
}
