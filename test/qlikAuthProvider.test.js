/**
 * Unit tests for QlikAuthProvider
 */

const assert = require("assert");

// QlikAuthProvider is async because it's an ES module
let QlikAuthProvider;

/**
 * Mock VS Code Extension Context for testing
 */
class MockExtensionContext {
  constructor() {
    this.secrets = new MockSecretStorage();
    this.globalState = new MockGlobalState();
  }
}

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

suite("QlikAuthProvider Test Suite", () => {
  let context;
  let authProvider;

  // Load QlikAuthProvider before running tests
  suiteSetup(async () => {
    const module = await import("../src/cloud/qlikAuthProvider.mjs");
    QlikAuthProvider = module.QlikAuthProvider;
  });

  setup(() => {
    context = new MockExtensionContext();
    authProvider = new QlikAuthProvider(context);
  });

  suite("API Key Management", () => {
    test("setApiKey stores valid API key", async () => {
      const apiKey = "test-api-key-12345";
      await authProvider.setApiKey(apiKey);

      const stored = await authProvider.getApiKey();
      assert.strictEqual(stored, apiKey);
    });

    test("setApiKey trims whitespace", async () => {
      const apiKey = "  test-api-key-12345  ";
      await authProvider.setApiKey(apiKey);

      const stored = await authProvider.getApiKey();
      assert.strictEqual(stored, "test-api-key-12345");
    });

    test("setApiKey throws error for null/undefined", async () => {
      await assert.rejects(
        async () => await authProvider.setApiKey(null),
        /Invalid API key/
      );

      await assert.rejects(
        async () => await authProvider.setApiKey(undefined),
        /Invalid API key/
      );
    });

    test("setApiKey throws error for empty string", async () => {
      await assert.rejects(
        async () => await authProvider.setApiKey(""),
        /Invalid API key/
      );

      await assert.rejects(
        async () => await authProvider.setApiKey("   "),
        /Invalid API key/
      );
    });

    test("setApiKey throws error for non-string", async () => {
      await assert.rejects(
        async () => await authProvider.setApiKey(12345),
        /Invalid API key/
      );

      await assert.rejects(
        async () => await authProvider.setApiKey({}),
        /Invalid API key/
      );
    });

    test("getApiKey returns undefined when not set", async () => {
      const apiKey = await authProvider.getApiKey();
      assert.strictEqual(apiKey, undefined);
    });

    test("hasApiKey returns false when not set", async () => {
      const hasKey = await authProvider.hasApiKey();
      assert.strictEqual(hasKey, false);
    });

    test("hasApiKey returns true when set", async () => {
      await authProvider.setApiKey("test-api-key");
      const hasKey = await authProvider.hasApiKey();
      assert.strictEqual(hasKey, true);
    });

    test("clearApiKey removes stored key", async () => {
      await authProvider.setApiKey("test-api-key");
      assert.strictEqual(await authProvider.hasApiKey(), true);

      await authProvider.clearApiKey();
      assert.strictEqual(await authProvider.hasApiKey(), false);
    });
  });

  suite("Tenant URL Validation", () => {
    test("validateTenantUrl accepts valid URLs", () => {
      const validUrls = [
        "tenant.us.qlikcloud.com",
        "mytenant.eu.qlikcloud.com",
        "test-tenant.ap.qlikcloud.com",
        "https://tenant.us.qlikcloud.com",
        "https://mytenant.eu.qlikcloud.com/",
        "tenant.us.qlikcloud.com/",
        "a.b.qlikcloud.com",
        "tenant-123.region-456.qlikcloud.com",
      ];

      for (const url of validUrls) {
        assert.strictEqual(
          authProvider.validateTenantUrl(url),
          true,
          `Should accept: ${url}`
        );
      }
    });

    test("validateTenantUrl rejects invalid URLs", () => {
      const invalidUrls = [
        "",
        "   ",
        null,
        undefined,
        "invalid",
        "http://google.com",
        "tenant.qlikcloud.com.evil.com",
        "qlikcloud.com",
        "-tenant.us.qlikcloud.com",
        "tenant-.us.qlikcloud.com",
        "tenant..us.qlikcloud.com",
        "tenant.us.qlikcloud.com/path",
        "tenant.us.qlikcloud.com/path/to/resource",
        "https://tenant.us.qlikcloud.com/path",
        "ftp://tenant.us.qlikcloud.com",
      ];

      for (const url of invalidUrls) {
        assert.strictEqual(
          authProvider.validateTenantUrl(url),
          false,
          `Should reject: ${url}`
        );
      }
    });

    test("validateTenantUrl handles whitespace", () => {
      assert.strictEqual(
        authProvider.validateTenantUrl("  tenant.us.qlikcloud.com  "),
        true
      );
    });
  });

  suite("Tenant URL Normalization", () => {
    test("normalizeTenantUrl removes protocol", () => {
      assert.strictEqual(
        authProvider.normalizeTenantUrl("https://tenant.us.qlikcloud.com"),
        "tenant.us.qlikcloud.com"
      );
    });

    test("normalizeTenantUrl removes trailing slash", () => {
      assert.strictEqual(
        authProvider.normalizeTenantUrl("tenant.us.qlikcloud.com/"),
        "tenant.us.qlikcloud.com"
      );

      assert.strictEqual(
        authProvider.normalizeTenantUrl("https://tenant.us.qlikcloud.com/"),
        "tenant.us.qlikcloud.com"
      );
    });

    test("normalizeTenantUrl preserves valid URLs", () => {
      assert.strictEqual(
        authProvider.normalizeTenantUrl("tenant.us.qlikcloud.com"),
        "tenant.us.qlikcloud.com"
      );
    });

    test("normalizeTenantUrl throws error for invalid URLs", () => {
      assert.throws(
        () => authProvider.normalizeTenantUrl(""),
        /Invalid tenant URL/
      );

      assert.throws(
        () => authProvider.normalizeTenantUrl("invalid-url"),
        /Invalid tenant URL format/
      );

      assert.throws(
        () => authProvider.normalizeTenantUrl("https://google.com"),
        /Invalid tenant URL format/
      );
    });

    test("normalizeTenantUrl throws error for null/undefined", () => {
      assert.throws(
        () => authProvider.normalizeTenantUrl(null),
        /Invalid tenant URL/
      );

      assert.throws(
        () => authProvider.normalizeTenantUrl(undefined),
        /Invalid tenant URL/
      );
    });

    test("normalizeTenantUrl trims whitespace", () => {
      assert.strictEqual(
        authProvider.normalizeTenantUrl("  tenant.us.qlikcloud.com  "),
        "tenant.us.qlikcloud.com"
      );
    });
  });

  suite("Tenant URL Management", () => {
    test("setTenantUrl stores valid URL", async () => {
      const url = "tenant.us.qlikcloud.com";
      await authProvider.setTenantUrl(url);

      const stored = await authProvider.getTenantUrl();
      assert.strictEqual(stored, url);
    });

    test("setTenantUrl normalizes URL before storing", async () => {
      await authProvider.setTenantUrl("https://tenant.us.qlikcloud.com/");

      const stored = await authProvider.getTenantUrl();
      assert.strictEqual(stored, "tenant.us.qlikcloud.com");
    });

    test("setTenantUrl throws error for invalid URL", async () => {
      await assert.rejects(
        async () => await authProvider.setTenantUrl("invalid-url"),
        /Invalid tenant URL format/
      );
    });

    test("getTenantUrl returns undefined when not set", async () => {
      const url = await authProvider.getTenantUrl();
      assert.strictEqual(url, undefined);
    });

    test("hasTenantUrl returns false when not set", async () => {
      const hasUrl = await authProvider.hasTenantUrl();
      assert.strictEqual(hasUrl, false);
    });

    test("hasTenantUrl returns true when set", async () => {
      await authProvider.setTenantUrl("tenant.us.qlikcloud.com");
      const hasUrl = await authProvider.hasTenantUrl();
      assert.strictEqual(hasUrl, true);
    });

    test("clearTenantUrl removes stored URL", async () => {
      await authProvider.setTenantUrl("tenant.us.qlikcloud.com");
      assert.strictEqual(await authProvider.hasTenantUrl(), true);

      await authProvider.clearTenantUrl();
      assert.strictEqual(await authProvider.hasTenantUrl(), false);
    });
  });

  suite("Complete Configuration", () => {
    test("isConfigured returns false when nothing is set", async () => {
      const configured = await authProvider.isConfigured();
      assert.strictEqual(configured, false);
    });

    test("isConfigured returns false when only API key is set", async () => {
      await authProvider.setApiKey("test-api-key");
      const configured = await authProvider.isConfigured();
      assert.strictEqual(configured, false);
    });

    test("isConfigured returns false when only tenant URL is set", async () => {
      await authProvider.setTenantUrl("tenant.us.qlikcloud.com");
      const configured = await authProvider.isConfigured();
      assert.strictEqual(configured, false);
    });

    test("isConfigured returns true when both are set", async () => {
      await authProvider.setApiKey("test-api-key");
      await authProvider.setTenantUrl("tenant.us.qlikcloud.com");
      const configured = await authProvider.isConfigured();
      assert.strictEqual(configured, true);
    });

    test("clearAll removes both API key and tenant URL", async () => {
      await authProvider.setApiKey("test-api-key");
      await authProvider.setTenantUrl("tenant.us.qlikcloud.com");
      assert.strictEqual(await authProvider.isConfigured(), true);

      await authProvider.clearAll();
      assert.strictEqual(await authProvider.isConfigured(), false);
      assert.strictEqual(await authProvider.hasApiKey(), false);
      assert.strictEqual(await authProvider.hasTenantUrl(), false);
    });
  });
});
