import * as vscode from "vscode";

/**
 * Centralized logging system for the QVD Viewer extension
 * Uses VS Code Output Channel for consistent logging that can be accessed during tests
 */
class Logger {
  constructor() {
    this.outputChannel = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the logger with an output channel
   * Should be called during extension activation
   */
  initialize() {
    if (!this.isInitialized) {
      this.outputChannel =
        vscode.window.createOutputChannel("Ctrl-Q QVD Viewer");
      this.isInitialized = true;
      this.log("Logger initialized");
    }
  }

  /**
   * Get the output channel (useful for tests)
   * @returns {vscode.OutputChannel|null}
   */
  getOutputChannel() {
    return this.outputChannel;
  }

  /**
   * Log an informational message
   * @param {string} message - Message to log
   * @param {any} data - Optional data to log
   */
  log(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [INFO] ${message}`;

    if (this.outputChannel) {
      this.outputChannel.appendLine(logMessage);
      if (data !== null) {
        this.outputChannel.appendLine(
          `  Data: ${JSON.stringify(data, null, 2)}`
        );
      }
    }

    // Also log to console for development
    console.log(logMessage, data !== null ? data : "");
  }

  /**
   * Log an informational message (alias for log)
   * @param {string} message - Message to log
   * @param {any} data - Optional data to log
   */
  info(message, data = null) {
    this.log(message, data);
  }

  /**
   * Log a warning message
   * @param {string} message - Warning message
   * @param {any} data - Optional data to log
   */
  warn(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [WARN] ${message}`;

    if (this.outputChannel) {
      this.outputChannel.appendLine(logMessage);
      if (data !== null) {
        this.outputChannel.appendLine(
          `  Data: ${JSON.stringify(data, null, 2)}`
        );
      }
    }

    console.warn(logMessage, data !== null ? data : "");
  }

  /**
   * Log an error message
   * @param {string} message - Error message
   * @param {Error|any} error - Error object or additional data
   */
  error(message, error = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [ERROR] ${message}`;

    if (this.outputChannel) {
      this.outputChannel.appendLine(logMessage);

      if (error) {
        if (error instanceof Error) {
          this.outputChannel.appendLine(`  Error: ${error.message}`);
          if (error.stack) {
            this.outputChannel.appendLine(`  Stack: ${error.stack}`);
          }
        } else {
          this.outputChannel.appendLine(
            `  Details: ${JSON.stringify(error, null, 2)}`
          );
        }
      }
    }

    console.error(logMessage, error || "");
  }

  /**
   * Show the output channel to the user
   */
  show() {
    if (this.outputChannel) {
      this.outputChannel.show();
    }
  }

  /**
   * Clear all logged messages
   */
  clear() {
    if (this.outputChannel) {
      this.outputChannel.clear();
    }
  }

  /**
   * Dispose the logger and clean up resources
   */
  dispose() {
    if (this.outputChannel) {
      this.outputChannel.dispose();
      this.outputChannel = null;
      this.isInitialized = false;
    }
  }
}

// Create a singleton instance
const logger = new Logger();

export default logger;
