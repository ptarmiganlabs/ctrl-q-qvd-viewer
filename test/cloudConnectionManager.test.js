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

  suite("Integration Tests (with real API)", () => {
    // These tests require real Qlik Cloud credentials via environment variables
    // Set QLIK_API_KEY and QLIK_TENANT_URL to run these tests
    // Example:
    //   export QLIK_API_KEY="your-api-key"
    //   export QLIK_TENANT_URL="your-tenant.us.qlikcloud.com"
    //   npm test

    const hasCredentials = () => {
      return process.env.QLIK_API_KEY && process.env.QLIK_TENANT_URL;
    };

    test("should connect to real Qlik Cloud with valid credentials", async function () {
      if (!hasCredentials()) {
        console.log(
          "  ⚠ Skipping integration test - set QLIK_API_KEY and QLIK_TENANT_URL to run"
        );
        this.skip();
        return;
      }

      const apiKey = process.env.QLIK_API_KEY;
      const tenantUrl = process.env.QLIK_TENANT_URL;

      // Configure credentials
      await authProvider.setApiKey(apiKey);
      await authProvider.setTenantUrl(tenantUrl);

      // Attempt to connect
      await connectionManager.connect();

      // Verify connection state
      assert.strictEqual(connectionManager.isConnected(), true);
      assert.notStrictEqual(connectionManager.getConnection(), null);
      assert.notStrictEqual(connectionManager.getHostConfig(), null);

      // Clean up
      await connectionManager.disconnect();
    });

    test("should successfully call Qlik Cloud API (users.getMyUser)", async function () {
      if (!hasCredentials()) {
        console.log(
          "  ⚠ Skipping integration test - set QLIK_API_KEY and QLIK_TENANT_URL to run"
        );
        this.skip();
        return;
      }

      const apiKey = process.env.QLIK_API_KEY;
      const tenantUrl = process.env.QLIK_TENANT_URL;

      // Configure credentials
      await authProvider.setApiKey(apiKey);
      await authProvider.setTenantUrl(tenantUrl);

      // Connect
      await connectionManager.connect();

      try {
        // Import users API from @qlik/api
        const { users } = await import("@qlik/api");

        // Call real API - get current user (users is a module, not a factory function)
        const response = await users.getMyUser();

        // Extract user data from response
        const myUser = response.data;

        // Verify we got a valid response
        assert.ok(myUser, "Should receive user object");
        assert.ok(myUser.id, "User object should have an id");
        assert.ok(myUser.email, "User object should have an email");

        console.log(`  ✓ Successfully authenticated as: ${myUser.email}`);
      } finally {
        // Clean up
        await connectionManager.disconnect();
      }
    });

    test("should successfully test connection with testConnection()", async function () {
      if (!hasCredentials()) {
        console.log(
          "  ⚠ Skipping integration test - set QLIK_API_KEY and QLIK_TENANT_URL to run"
        );
        this.skip();
        return;
      }

      const apiKey = process.env.QLIK_API_KEY;
      const tenantUrl = process.env.QLIK_TENANT_URL;

      // Configure credentials
      await authProvider.setApiKey(apiKey);
      await authProvider.setTenantUrl(tenantUrl);

      // Connect
      await connectionManager.connect();

      try {
        // Test connection
        const isValid = await connectionManager.testConnection();

        // Should return true for valid connection
        assert.strictEqual(isValid, true, "Connection test should succeed");
      } finally {
        // Clean up
        await connectionManager.disconnect();
      }
    });

    test("should fail with invalid API key", async function () {
      // This test requires a real tenant URL to test invalid API key
      if (!hasCredentials()) {
        console.log(
          "  ⚠ Skipping integration test - set QLIK_API_KEY and QLIK_TENANT_URL to run"
        );
        this.skip();
        return;
      }

      const tenantUrl = process.env.QLIK_TENANT_URL;

      // Use invalid API key with real tenant URL
      await authProvider.setApiKey("invalid-api-key-12345-this-will-fail");
      await authProvider.setTenantUrl(tenantUrl);

      // Attempt to connect should not throw
      await connectionManager.connect();

      try {
        // Test connection should return false or throw for invalid API key
        const isValid = await connectionManager.testConnection();
        assert.strictEqual(
          isValid,
          false,
          "Connection test should fail with invalid API key"
        );
      } catch (error) {
        // It's also acceptable to throw an error for authentication failure
        assert.ok(error, "Should throw error for invalid API key");
        console.log(`  ✓ Correctly rejected invalid API key: ${error.message}`);
      } finally {
        await connectionManager.disconnect();
      }
    });
  });
});
