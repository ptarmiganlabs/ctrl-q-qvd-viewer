# Qlik Cloud Integration - Implementation Guide

**Step-by-step guide for implementing Qlik Sense Cloud support**

## Prerequisites

- Existing Ctrl-Q QVD Viewer extension codebase
- Node.js and npm installed
- Access to a Qlik Cloud tenant for testing
- Basic understanding of VS Code extension APIs

---

## Phase 1: Foundation (API Key Authentication)

### Step 1: Install Dependencies

```bash
npm install @qlik/api
```

Update `package.json`:
```json
{
  "dependencies": {
    "@qlik/api": "^1.0.0",
    "apache-arrow": "^21.1.0",
    // ... existing dependencies
  }
}
```

### Step 2: Create Cloud Directory Structure

```bash
mkdir -p src/cloud
touch src/cloud/qlikAuthProvider.mjs
touch src/cloud/cloudConnectionManager.mjs
touch src/cloud/downloadManager.mjs
touch src/cloud/cloudQvdReader.mjs
```

### Step 3: Implement Authentication Provider

**File:** `src/cloud/qlikAuthProvider.mjs`

```javascript
import * as vscode from 'vscode';

/**
 * Manages authentication with Qlik Sense Cloud
 */
export class QlikAuthProvider {
  /**
   * @param {vscode.ExtensionContext} context - Extension context for secret storage
   */
  constructor(context) {
    this.context = context;
    this.secretKey = 'qlik-cloud-api-key';
  }

  /**
   * Store API key securely
   * @param {string} apiKey - Qlik Cloud API key
   * @returns {Promise<void>}
   */
  async setApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('Invalid API key');
    }
    await this.context.secrets.store(this.secretKey, apiKey);
  }

  /**
   * Retrieve stored API key
   * @returns {Promise<string|undefined>} API key or undefined if not set
   */
  async getApiKey() {
    return await this.context.secrets.get(this.secretKey);
  }

  /**
   * Check if API key is configured
   * @returns {Promise<boolean>}
   */
  async hasApiKey() {
    const key = await this.getApiKey();
    return !!key;
  }

  /**
   * Clear stored API key
   * @returns {Promise<void>}
   */
  async clearApiKey() {
    await this.context.secrets.delete(this.secretKey);
  }

  /**
   * Validate tenant URL format
   * @param {string} tenantUrl - Tenant URL to validate
   * @returns {boolean} True if valid format
   */
  validateTenantUrl(tenantUrl) {
    if (!tenantUrl) return false;
    // Accept formats: tenant.region.qlikcloud.com or https://tenant.region.qlikcloud.com
    const pattern = /^(https:\/\/)?[a-zA-Z0-9.-]+\.qlikcloud\.com\/?$/;
    return pattern.test(tenantUrl);
  }

  /**
   * Normalize tenant URL (remove protocol and trailing slash)
   * @param {string} tenantUrl - Raw tenant URL
   * @returns {string} Normalized tenant URL
   */
  normalizeTenantUrl(tenantUrl) {
    return tenantUrl
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
  }
}

export default QlikAuthProvider;
```

### Step 4: Implement Connection Manager

**File:** `src/cloud/cloudConnectionManager.mjs`

```javascript
import qlikApi from '@qlik/api';
import QlikAuthProvider from './qlikAuthProvider.mjs';

/**
 * Manages connections to Qlik Sense Cloud tenants
 */
export class CloudConnectionManager {
  /**
   * @param {import('vscode').ExtensionContext} context - Extension context
   */
  constructor(context) {
    this.context = context;
    this.authProvider = new QlikAuthProvider(context);
    this.connection = null;
  }

  /**
   * Get tenant URL from configuration
   * @returns {string|undefined}
   */
  getTenantUrl() {
    const config = vscode.workspace.getConfiguration('ctrl-q-qvd-viewer.cloud');
    return config.get('tenantUrl');
  }

  /**
   * Connect to Qlik Cloud
   * @returns {Promise<Object>} Connected API instance
   * @throws {Error} If connection fails
   */
  async connect() {
    const tenantUrl = this.getTenantUrl();
    if (!tenantUrl) {
      throw new Error('Tenant URL not configured. Please set ctrl-q-qvd-viewer.cloud.tenantUrl in settings.');
    }

    if (!this.authProvider.validateTenantUrl(tenantUrl)) {
      throw new Error(`Invalid tenant URL format: ${tenantUrl}. Expected format: tenant.region.qlikcloud.com`);
    }

    const apiKey = await this.authProvider.getApiKey();
    if (!apiKey) {
      throw new Error('API key not configured. Please run "Connect to Qlik Cloud" command.');
    }

    const normalizedUrl = this.authProvider.normalizeTenantUrl(tenantUrl);

    const config = {
      host: normalizedUrl,
      apiKey: apiKey
    };

    this.connection = {
      dataFiles: qlikApi.rest.dataFiles(config),
      spaces: qlikApi.rest.spaces(config),
      config: config
    };

    return this.connection;
  }

  /**
   * Test connection to Qlik Cloud
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    try {
      const connection = await this.connect();
      // Try to list data files as a connection test
      await connection.dataFiles.getDataFiles({ limit: 1 });
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  /**
   * Get active connection (connect if not connected)
   * @returns {Promise<Object>} Active connection
   */
  async getConnection() {
    if (!this.connection) {
      return await this.connect();
    }
    return this.connection;
  }

  /**
   * Disconnect from Qlik Cloud
   */
  disconnect() {
    this.connection = null;
  }

  /**
   * Check if currently connected
   * @returns {boolean}
   */
  isConnected() {
    return this.connection !== null;
  }
}

export default CloudConnectionManager;
```

### Step 5: Implement Download Manager

**File:** `src/cloud/downloadManager.mjs`

```javascript
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as vscode from 'vscode';

/**
 * Manages downloading and caching of QVD files from Qlik Cloud
 */
export class DownloadManager {
  /**
   * @param {import('vscode').ExtensionContext} context - Extension context
   */
  constructor(context) {
    this.context = context;
    this.cacheDir = path.join(context.globalStorageUri.fsPath, 'qlik-cloud-cache');
  }

  /**
   * Initialize cache directory
   * @returns {Promise<void>}
   */
  async initCache() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create cache directory:', error);
    }
  }

  /**
   * Get cache file path for a cloud file ID
   * @param {string} fileId - Cloud file ID
   * @returns {string} Path to cached file
   */
  getCachePath(fileId) {
    return path.join(this.cacheDir, `${fileId}.qvd`);
  }

  /**
   * Check if file is cached
   * @param {string} fileId - Cloud file ID
   * @returns {Promise<boolean>}
   */
  async isCached(fileId) {
    try {
      const cachePath = this.getCachePath(fileId);
      await fs.access(cachePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Download file from Qlik Cloud
   * @param {Object} connection - Active Qlik Cloud connection
   * @param {string} fileId - File ID to download
   * @param {Object} options - Download options
   * @param {boolean} options.useCache - Use cached file if available (default: true)
   * @param {boolean} options.showProgress - Show progress notification (default: true)
   * @returns {Promise<string>} Path to downloaded file
   */
  async downloadFile(connection, fileId, options = {}) {
    const { useCache = true, showProgress = true } = options;

    await this.initCache();

    const cachePath = this.getCachePath(fileId);

    // Check cache first
    if (useCache && await this.isCached(fileId)) {
      console.log(`Using cached file for ${fileId}`);
      return cachePath;
    }

    // Download file with progress
    if (showProgress) {
      return await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Downloading QVD file...`,
          cancellable: false
        },
        async (progress) => {
          progress.report({ message: 'Connecting to Qlik Cloud...' });
          
          const content = await connection.dataFiles.getDataFile(fileId);
          
          progress.report({ message: 'Saving file...' });
          await fs.writeFile(cachePath, content);
          
          return cachePath;
        }
      );
    } else {
      const content = await connection.dataFiles.getDataFile(fileId);
      await fs.writeFile(cachePath, content);
      return cachePath;
    }
  }

  /**
   * Clear entire cache
   * @returns {Promise<void>}
   */
  async clearCache() {
    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        await fs.unlink(path.join(this.cacheDir, file));
      }
      vscode.window.showInformationMessage('Cloud file cache cleared successfully');
    } catch (error) {
      console.error('Failed to clear cache:', error);
      vscode.window.showErrorMessage('Failed to clear cache');
    }
  }

  /**
   * Get cache size in bytes
   * @returns {Promise<number>}
   */
  async getCacheSize() {
    try {
      const files = await fs.readdir(this.cacheDir);
      let totalSize = 0;
      for (const file of files) {
        const stats = await fs.stat(path.join(this.cacheDir, file));
        totalSize += stats.size;
      }
      return totalSize;
    } catch {
      return 0;
    }
  }

  /**
   * Get human-readable cache size
   * @returns {Promise<string>}
   */
  async getCacheSizeFormatted() {
    const bytes = await this.getCacheSize();
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }
}

export default DownloadManager;
```

### Step 6: Implement Cloud QVD Reader

**File:** `src/cloud/cloudQvdReader.mjs`

```javascript
import QvdReader from '../qvdReader.mjs';
import DownloadManager from './downloadManager.mjs';

/**
 * Adapter for reading QVD files from Qlik Cloud
 * Extends the existing QvdReader to support cloud files
 */
export class CloudQvdReader {
  /**
   * @param {import('vscode').ExtensionContext} context - Extension context
   * @param {Object} connectionManager - Cloud connection manager
   */
  constructor(context, connectionManager) {
    this.context = context;
    this.connectionManager = connectionManager;
    this.downloadManager = new DownloadManager(context);
    this.localReader = new QvdReader();
  }

  /**
   * Read QVD file from Qlik Cloud
   * @param {string} fileId - Cloud file ID
   * @param {number} maxRows - Maximum number of rows to read
   * @returns {Promise<Object>} QVD data and metadata
   */
  async readFromCloud(fileId, maxRows = 25) {
    try {
      // Get connection
      const connection = await this.connectionManager.getConnection();

      // Download file (will use cache if available)
      const localPath = await this.downloadManager.downloadFile(connection, fileId);

      // Use existing QvdReader to parse the file
      const result = await this.localReader.read(localPath, maxRows);

      // Add cloud metadata
      return {
        ...result,
        cloudMetadata: {
          fileId: fileId,
          source: 'qlik-cloud',
          cached: await this.downloadManager.isCached(fileId)
        }
      };
    } catch (error) {
      console.error('Failed to read cloud QVD file:', error);
      return {
        metadata: null,
        data: [],
        columns: [],
        totalRows: 0,
        dataError: null,
        error: error.message || 'Failed to read cloud file'
      };
    }
  }
}

export default CloudQvdReader;
```

### Step 7: Add Configuration to package.json

Update `package.json` to add new configuration properties and commands:

```json
{
  "contributes": {
    "commands": [
      {
        "command": "ctrl-q-qvd-viewer.connectCloud",
        "title": "Connect to Qlik Cloud",
        "category": "QVD"
      },
      {
        "command": "ctrl-q-qvd-viewer.disconnectCloud",
        "title": "Disconnect from Qlik Cloud",
        "category": "QVD"
      },
      {
        "command": "ctrl-q-qvd-viewer.clearCloudCache",
        "title": "Clear Cloud File Cache",
        "category": "QVD"
      }
    ],
    "configuration": {
      "title": "Ctrl-Q QVD Viewer",
      "properties": {
        "ctrl-q-qvd-viewer.cloud.enabled": {
          "type": "boolean",
          "default": false,
          "description": "Enable Qlik Sense Cloud integration"
        },
        "ctrl-q-qvd-viewer.cloud.tenantUrl": {
          "type": "string",
          "default": "",
          "description": "Qlik Cloud tenant URL (e.g., mycompany.us.qlikcloud.com)",
          "pattern": "^[a-zA-Z0-9.-]+\\.qlikcloud\\.com$"
        },
        "ctrl-q-qvd-viewer.cloud.cacheEnabled": {
          "type": "boolean",
          "default": true,
          "description": "Cache downloaded QVD files locally"
        }
      }
    }
  }
}
```

### Step 8: Register Commands in extension.mjs

Update `src/extension.mjs`:

```javascript
import * as vscode from "vscode";
import QvdEditorProvider from "./qvdEditorProvider.mjs";
import AboutPanel from "./aboutPanel.mjs";
import CloudConnectionManager from "./cloud/cloudConnectionManager.mjs";
import QlikAuthProvider from "./cloud/qlikAuthProvider.mjs";
import DownloadManager from "./cloud/downloadManager.mjs";

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @returns {Promise<void>}
 */
export async function activate(context) {
  console.log("Ctrl-Q QVD Viewer extension is now active");

  // Initialize cloud services
  const cloudConnectionManager = new CloudConnectionManager(context);
  const authProvider = new QlikAuthProvider(context);
  const downloadManager = new DownloadManager(context);

  // Register the custom editor provider for QVD files
  const qvdEditorProvider = new QvdEditorProvider(context, cloudConnectionManager);

  const editorRegistration = vscode.window.registerCustomEditorProvider(
    QvdEditorProvider.viewType,
    qvdEditorProvider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: false,
    }
  );

  context.subscriptions.push(editorRegistration);

  // Register existing commands
  const openQvdCommand = vscode.commands.registerCommand(
    "ctrl-q-qvd-viewer.openQvd",
    async () => {
      const uri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          "QVD Files": ["qvd", "QVD"],
        },
      });

      if (uri && uri[0]) {
        await vscode.commands.executeCommand(
          "vscode.openWith",
          uri[0],
          QvdEditorProvider.viewType
        );
      }
    }
  );

  context.subscriptions.push(openQvdCommand);

  const aboutCommand = vscode.commands.registerCommand(
    "ctrl-q-qvd-viewer.about",
    () => {
      AboutPanel.show(context);
    }
  );

  context.subscriptions.push(aboutCommand);

  // Register new cloud commands
  const connectCloudCommand = vscode.commands.registerCommand(
    "ctrl-q-qvd-viewer.connectCloud",
    async () => {
      try {
        // Get tenant URL
        const config = vscode.workspace.getConfiguration('ctrl-q-qvd-viewer.cloud');
        let tenantUrl = config.get('tenantUrl');

        if (!tenantUrl) {
          tenantUrl = await vscode.window.showInputBox({
            prompt: 'Enter your Qlik Cloud tenant URL',
            placeHolder: 'mycompany.us.qlikcloud.com',
            validateInput: (value) => {
              return authProvider.validateTenantUrl(value) 
                ? null 
                : 'Invalid tenant URL format. Expected: tenant.region.qlikcloud.com';
            }
          });

          if (!tenantUrl) return;

          await config.update('tenantUrl', tenantUrl, vscode.ConfigurationTarget.Global);
        }

        // Get API key
        const apiKey = await vscode.window.showInputBox({
          prompt: 'Enter your Qlik Cloud API key',
          password: true,
          placeHolder: 'Paste your API key here',
          validateInput: (value) => {
            return value && value.length > 0 
              ? null 
              : 'API key is required';
          }
        });

        if (!apiKey) return;

        await authProvider.setApiKey(apiKey);

        // Test connection
        vscode.window.showInformationMessage('Testing connection to Qlik Cloud...');
        const isConnected = await cloudConnectionManager.testConnection();

        if (isConnected) {
          vscode.window.showInformationMessage(
            `Successfully connected to Qlik Cloud (${tenantUrl})`
          );
        } else {
          vscode.window.showErrorMessage(
            'Failed to connect to Qlik Cloud. Please check your credentials and try again.'
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to connect to Qlik Cloud: ${error.message}`
        );
      }
    }
  );

  context.subscriptions.push(connectCloudCommand);

  const disconnectCloudCommand = vscode.commands.registerCommand(
    "ctrl-q-qvd-viewer.disconnectCloud",
    async () => {
      await authProvider.clearApiKey();
      cloudConnectionManager.disconnect();
      vscode.window.showInformationMessage('Disconnected from Qlik Cloud');
    }
  );

  context.subscriptions.push(disconnectCloudCommand);

  const clearCacheCommand = vscode.commands.registerCommand(
    "ctrl-q-qvd-viewer.clearCloudCache",
    async () => {
      const size = await downloadManager.getCacheSizeFormatted();
      const answer = await vscode.window.showWarningMessage(
        `Clear cloud file cache (${size})?`,
        'Clear Cache',
        'Cancel'
      );

      if (answer === 'Clear Cache') {
        await downloadManager.clearCache();
      }
    }
  );

  context.subscriptions.push(clearCacheCommand);
}

/**
 * Deactivate the extension
 * @returns {void}
 */
export function deactivate() {}
```

### Step 9: Testing

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run linter:**
   ```bash
   npm run lint
   ```

3. **Build extension:**
   ```bash
   npm run compile
   ```

4. **Test in development:**
   - Press F5 to start debugging
   - In the new window, run command: "QVD: Connect to Qlik Cloud"
   - Enter tenant URL and API key
   - Test connection should succeed

5. **Verify functionality:**
   - Connection command works
   - API key stored securely (check no plaintext in settings.json)
   - Cache directory created
   - Download manager initializes correctly

---

## Phase 2: File Browser UI

### Step 1: Create Tree View Provider

**File:** `src/cloud/cloudFileTreeProvider.mjs`

```javascript
import * as vscode from 'vscode';

/**
 * Tree data provider for Qlik Cloud files
 */
export class CloudFileTreeProvider {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  /**
   * Refresh the tree view
   */
  refresh() {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item
   * @param {Object} element - Tree element
   * @returns {vscode.TreeItem}
   */
  getTreeItem(element) {
    return element;
  }

  /**
   * Get children of tree element
   * @param {Object} element - Parent element
   * @returns {Promise<Array>}
   */
  async getChildren(element) {
    if (!this.connectionManager.isConnected()) {
      return [];
    }

    try {
      if (!element) {
        // Root level - show spaces or files
        return await this.getRootItems();
      } else {
        // Get files in space
        return await this.getFilesInSpace(element);
      }
    } catch (error) {
      console.error('Error getting tree children:', error);
      return [];
    }
  }

  /**
   * Get root level items
   * @returns {Promise<Array>}
   */
  async getRootItems() {
    // TODO: Implement space listing
    // For now, just list all QVD files
    const connection = await this.connectionManager.getConnection();
    const files = await connection.dataFiles.getDataFiles({
      baseNameWildcard: '*.qvd',
      limit: 100
    });

    return (files.data || []).map(file => this.createFileItem(file));
  }

  /**
   * Create tree item for a file
   * @param {Object} file - File metadata
   * @returns {vscode.TreeItem}
   */
  createFileItem(file) {
    const item = new vscode.TreeItem(file.name);
    item.id = file.id;
    item.contextValue = 'qlikCloudFile';
    item.iconPath = new vscode.ThemeIcon('file');
    item.description = this.formatFileSize(file.size);
    item.command = {
      command: 'ctrl-q-qvd-viewer.openCloudFile',
      title: 'Open QVD File',
      arguments: [file.id]
    };
    return item;
  }

  /**
   * Format file size for display
   * @param {number} bytes - Size in bytes
   * @returns {string}
   */
  formatFileSize(bytes) {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
      const kb = bytes / 1024;
      return `${kb.toFixed(1)} KB`;
    }
    return `${mb.toFixed(1)} MB`;
  }
}

export default CloudFileTreeProvider;
```

### Step 2: Register Tree View in extension.mjs

Add to `activate()` function:

```javascript
// Register cloud file tree view
const cloudTreeProvider = new CloudFileTreeProvider(cloudConnectionManager);
const treeView = vscode.window.createTreeView('qlikCloudFiles', {
  treeDataProvider: cloudTreeProvider,
  showCollapseAll: true
});

context.subscriptions.push(treeView);

// Register open cloud file command
const openCloudFileCommand = vscode.commands.registerCommand(
  'ctrl-q-qvd-viewer.openCloudFile',
  async (fileId) => {
    // TODO: Open cloud file in editor
    vscode.window.showInformationMessage(`Opening cloud file: ${fileId}`);
  }
);

context.subscriptions.push(openCloudFileCommand);

// Register refresh command
const refreshCloudCommand = vscode.commands.registerCommand(
  'ctrl-q-qvd-viewer.refreshCloudFiles',
  () => {
    cloudTreeProvider.refresh();
  }
);

context.subscriptions.push(refreshCloudCommand);
```

### Step 3: Add Tree View to package.json

```json
{
  "contributes": {
    "views": {
      "explorer": [
        {
          "id": "qlikCloudFiles",
          "name": "Qlik Cloud Files",
          "when": "config.ctrl-q-qvd-viewer.cloud.enabled"
        }
      ]
    },
    "viewsWelcome": [
      {
        "view": "qlikCloudFiles",
        "contents": "Connect to Qlik Cloud to browse QVD files.\n[Connect to Qlik Cloud](command:ctrl-q-qvd-viewer.connectCloud)"
      }
    ],
    "menus": {
      "view/title": [
        {
          "command": "ctrl-q-qvd-viewer.refreshCloudFiles",
          "when": "view == qlikCloudFiles",
          "group": "navigation"
        }
      ]
    }
  }
}
```

---

## Testing Checklist

- [ ] Extension activates without errors
- [ ] Connect command prompts for tenant URL and API key
- [ ] API key stored in SecretStorage (not in settings.json)
- [ ] Test connection validates credentials
- [ ] Disconnect clears credentials
- [ ] Cache directory created successfully
- [ ] Cloud file tree view appears when enabled
- [ ] Files listed in tree view
- [ ] Refresh command works
- [ ] Cache clear command works

---

## Troubleshooting

### Common Issues

**Issue:** "Module not found: @qlik/api"
```bash
# Solution: Install dependencies
npm install
```

**Issue:** "Invalid tenant URL"
```
# Solution: Use format without protocol
✅ Correct: mycompany.us.qlikcloud.com
❌ Incorrect: https://mycompany.us.qlikcloud.com
```

**Issue:** "Authentication failed"
```
# Solution: Verify API key
1. Check key hasn't expired in Qlik Cloud admin console
2. Ensure user has "Developer" role
3. Try regenerating API key
```

**Issue:** "Cache directory not created"
```javascript
// Solution: Ensure globalStorageUri is available
console.log(context.globalStorageUri.fsPath);
// If undefined, check VS Code version compatibility
```

---

## Next Steps

1. Complete Phase 2 (File Browser UI)
2. Add file metadata display
3. Implement search and filter
4. Add context menu actions
5. Consider OAuth2 implementation (Phase 4)

---

**For Full Research:** See [QLIK_CLOUD_RESEARCH.md](./QLIK_CLOUD_RESEARCH.md)  
**For Quick Overview:** See [QLIK_CLOUD_SUMMARY.md](./QLIK_CLOUD_SUMMARY.md)
