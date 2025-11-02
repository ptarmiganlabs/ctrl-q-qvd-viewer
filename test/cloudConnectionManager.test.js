/**
 * Unit tests for CloudConnectionManager
 *
 * Note: These tests verify the core logic of CloudConnectionManager.
 * Full integration tests with @qlik/api would require additional test infrastructure.
 */

const assert = require("assert");

// Modules will be loaded asynchronously
let CloudConnectionManager;
let QlikAuthProvider;

/**
 * Mock VS Code Extension Context
 */
class MockExtensionContext {
  constructor() {
    this.secrets = new MockSecretStorage();
    this.globalState = new MockGlobalState();
  }
}

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

suite("CloudConnectionManager Test Suite", () => {
  let context;
  let authProvider;
  let connectionManager;

  suiteSetup(async () => {
    // Load modules
    const authModule = await import("../src/cloud/qlikAuthProvider.mjs");
    const connModule = await import("../src/cloud/cloudConnectionManager.mjs");
    QlikAuthProvider = authModule.QlikAuthProvider;
    CloudConnectionManager = connModule.CloudConnectionManager;
  });

  setup(async () => {
    context = new MockExtensionContext();
    authProvider = new QlikAuthProvider(context);
    connectionManager = new CloudConnectionManager(authProvider);
  });

  suite("Initialization", () => {
    test("constructor creates instance with correct properties", () => {
      assert.strictEqual(connectionManager.connected, false);
      assert.strictEqual(connectionManager.connection, null);
      assert.strictEqual(connectionManager.authProvider, authProvider);
      assert.strictEqual(connectionManager.hostConfig, null);
    });

    test("isConnected returns false initially", () => {
      assert.strictEqual(connectionManager.isConnected(), false);
    });

    test("getConnection returns null initially", () => {
      assert.strictEqual(connectionManager.getConnection(), null);
    });

    test("getHostConfig returns null initially", () => {
      assert.strictEqual(connectionManager.getHostConfig(), null);
    });
  });

  suite("Connection Prerequisites", () => {
    test("connect requires both credentials", async () => {
      await assert.rejects(
        async () => await connectionManager.connect(),
        /credentials not configured/
      );
    });

    test("connect checks for missing API key", async () => {
      await authProvider.setTenantUrl("tenant.us.qlikcloud.com");

      await assert.rejects(
        async () => await connectionManager.connect(),
        /credentials not configured/
      );
    });

    test("connect checks for missing tenant URL", async () => {
      await authProvider.setApiKey("test-api-key");

      await assert.rejects(
        async () => await connectionManager.connect(),
        /credentials not configured/
      );
    });
  });

  suite("Tenant URL Management", () => {
    test("getTenantUrl returns undefined initially", async () => {
      const url = await connectionManager.getTenantUrl();
      assert.strictEqual(url, undefined);
    });

    test("getTenantUrl returns configured URL", async () => {
      const expectedUrl = "tenant.us.qlikcloud.com";
      await authProvider.setTenantUrl(expectedUrl);

      const url = await connectionManager.getTenantUrl();
      assert.strictEqual(url, expectedUrl);
    });
  });

  suite("Disconnect Functionality", () => {
    test("disconnect clears all state", async () => {
      // Manually set some state to verify disconnect clears it
      connectionManager.connection = { test: "data" };
      connectionManager.connected = true;
      connectionManager.hostConfig = { test: "config" };

      await connectionManager.disconnect();

      assert.strictEqual(connectionManager.isConnected(), false);
      assert.strictEqual(connectionManager.getConnection(), null);
      assert.strictEqual(connectionManager.getHostConfig(), null);
    });

    test("disconnect can be called when not connected", async () => {
      assert.strictEqual(connectionManager.isConnected(), false);

      // Should not throw
      await connectionManager.disconnect();

      assert.strictEqual(connectionManager.isConnected(), false);
    });
  });

  suite("ensureConnected Helper", () => {
    test("ensureConnected throws error if credentials not configured", async () => {
      await assert.rejects(
        async () => await connectionManager.ensureConnected(),
        /credentials not configured/
      );
    });

    test("ensureConnected uses existing connection if already connected", async () => {
      // Manually set connection state
      const mockConnection = { test: "connection" };
      connectionManager.connection = mockConnection;
      connectionManager.connected = true;

      const result = await connectionManager.ensureConnected();

      // Should return the existing connection without trying to reconnect
      assert.strictEqual(result, mockConnection);
    });
  });

  suite("Error Handler", () => {
    test("handleConnectionError clears connection state", () => {
      // Set some state
      connectionManager.connection = { test: "data" };
      connectionManager.connected = true;
      connectionManager.hostConfig = { test: "config" };

      const error = new Error("Test error");
      connectionManager.handleConnectionError(error);

      assert.strictEqual(connectionManager.connected, false);
      assert.strictEqual(connectionManager.connection, null);
      assert.strictEqual(connectionManager.hostConfig, null);
    });

    test("handleConnectionError handles various error types", () => {
      const errors = [
        new Error("API key expired"),
        new Error("Invalid tenant URL"),
        new Error("Network connection failed"),
        new Error("401 Unauthorized"),
        new Error("403 Forbidden"),
        new Error("Generic error"),
      ];

      // All should handle without throwing
      for (const error of errors) {
        connectionManager.handleConnectionError(error);
        assert.strictEqual(connectionManager.connected, false);
      }
    });
  });
});
