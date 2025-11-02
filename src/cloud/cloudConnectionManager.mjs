/**
 * @fileoverview Connection manager for Qlik Sense Cloud
 * Handles establishing and managing connections to Qlik Cloud tenants using @qlik/api toolkit.
 *
 * @module cloud/cloudConnectionManager
 */

import * as vscode from "vscode";
import { auth, dataFiles, spaces, items } from "@qlik/api";

/**
 * Manages connections to Qlik Sense Cloud tenants
 * Handles connection lifecycle, state tracking, and error handling
 *
 * @class CloudConnectionManager
 */
export class CloudConnectionManager {
  /**
   * Creates an instance of CloudConnectionManager
   *
   * @param {import('./qlikAuthProvider.mjs').QlikAuthProvider} authProvider - Authentication provider instance
   */
  constructor(authProvider) {
    this.authProvider = authProvider;
    this.connection = null;
    this.connected = false;
    this.hostConfig = null;
  }

  /**
   * Establish connection to Qlik Cloud
   * Initializes @qlik/api with stored credentials
   *
   * @returns {Promise<void>}
   * @throws {Error} If connection fails or credentials are missing
   */
  async connect() {
    // Check if credentials are configured
    const isConfigured = await this.authProvider.isConfigured();
    if (!isConfigured) {
      throw new Error(
        "Qlik Cloud credentials not configured. Please set both API key and tenant URL."
      );
    }

    // Get credentials
    const apiKey = await this.authProvider.getApiKey();
    const tenantUrl = await this.authProvider.getTenantUrl();

    if (!apiKey) {
      throw new Error(
        "API key not configured. Please configure your Qlik Cloud API key."
      );
    }

    if (!tenantUrl) {
      throw new Error(
        "Tenant URL not configured. Please configure your Qlik Cloud tenant URL."
      );
    }

    try {
      // Create host configuration for @qlik/api
      this.hostConfig = {
        host: `https://${tenantUrl}`,
        authType: "apikey",
        apiKey: apiKey,
      };

      // Set the authentication configuration
      auth.setDefaultHostConfig(this.hostConfig);

      // Initialize connection object with API endpoints
      this.connection = {
        dataFiles: dataFiles(this.hostConfig),
        spaces: spaces(this.hostConfig),
        items: items(this.hostConfig),
        config: this.hostConfig,
      };

      this.connected = true;

      vscode.window.showInformationMessage(
        `Successfully connected to Qlik Cloud tenant: ${tenantUrl}`
      );
    } catch (error) {
      this.handleConnectionError(error);
      throw error;
    }
  }

  /**
   * Disconnect from Qlik Cloud
   * Cleans up active connection and resets state
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    this.connection = null;
    this.connected = false;
    this.hostConfig = null;

    // Clear the default host config in @qlik/api
    auth.setDefaultHostConfig(null);

    vscode.window.showInformationMessage("Disconnected from Qlik Cloud");
  }

  /**
   * Test if connection to Qlik Cloud is valid
   * Performs a lightweight API call to verify connectivity
   *
   * @returns {Promise<boolean>} True if connection is valid, false otherwise
   */
  async testConnection() {
    try {
      // If not connected, try to connect first
      if (!this.connected) {
        await this.connect();
      }

      // Verify connection by making a lightweight API call
      // We'll try to list spaces with a limit of 1 to minimize data transfer
      const spacesResult = await this.connection.spaces.getSpaces({
        limit: 1,
      });

      // If we get here without error, connection is valid
      return true;
    } catch (error) {
      console.error("Connection test failed:", error);
      this.connected = false;
      return false;
    }
  }

  /**
   * Get active connection instance
   *
   * @returns {Object|null} Active connection or null if not connected
   */
  getConnection() {
    return this.connection;
  }

  /**
   * Check if currently connected to Qlik Cloud
   *
   * @returns {boolean} True if connected, false otherwise
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get configured tenant URL
   *
   * @returns {Promise<string|undefined>} Tenant URL or undefined if not configured
   */
  async getTenantUrl() {
    return await this.authProvider.getTenantUrl();
  }

  /**
   * Handle connection errors and provide user feedback
   *
   * @private
   * @param {Error} error - Connection error
   * @throws {Error} Re-throws the error after handling
   */
  handleConnectionError(error) {
    this.connected = false;
    this.connection = null;
    this.hostConfig = null;

    let userMessage = "Failed to connect to Qlik Cloud";
    let errorDetails = error.message;

    // Provide specific error messages based on error type
    if (error.message.includes("API key")) {
      userMessage = "Invalid or expired API key";
      errorDetails =
        "Please check your Qlik Cloud API key and ensure it has not expired.";
    } else if (
      error.message.includes("tenant") ||
      error.message.includes("host")
    ) {
      userMessage = "Invalid tenant URL";
      errorDetails =
        "Please check your Qlik Cloud tenant URL and ensure it is correct.";
    } else if (
      error.message.includes("network") ||
      error.message.includes("ENOTFOUND")
    ) {
      userMessage = "Network connection error";
      errorDetails =
        "Unable to reach Qlik Cloud. Please check your internet connection.";
    } else if (
      error.message.includes("401") ||
      error.message.includes("unauthorized")
    ) {
      userMessage = "Authentication failed";
      errorDetails =
        "Your API key may be invalid or expired. Please generate a new API key.";
    } else if (
      error.message.includes("403") ||
      error.message.includes("forbidden")
    ) {
      userMessage = "Access denied";
      errorDetails =
        "Your API key does not have sufficient permissions. Please check your Qlik Cloud role.";
    }

    // Show error to user
    vscode.window.showErrorMessage(`${userMessage}: ${errorDetails}`);

    // Log detailed error for debugging
    console.error("Qlik Cloud connection error:", {
      message: error.message,
      stack: error.stack,
      userMessage,
      errorDetails,
    });
  }

  /**
   * Ensure connection is established
   * Connects if not already connected
   *
   * @returns {Promise<Object>} Active connection
   * @throws {Error} If connection cannot be established
   */
  async ensureConnected() {
    if (!this.connected) {
      await this.connect();
    }
    return this.connection;
  }

  /**
   * Get host configuration
   *
   * @returns {Object|null} Host configuration or null if not connected
   */
  getHostConfig() {
    return this.hostConfig;
  }
}
