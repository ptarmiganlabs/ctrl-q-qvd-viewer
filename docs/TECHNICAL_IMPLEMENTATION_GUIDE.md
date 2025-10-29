# Standalone QVD Viewer - Technical Implementation Guide

This document provides detailed technical guidance for implementing a standalone QVD viewer application based on the investigation findings.

## Table of Contents

1. [Project Setup](#project-setup)
2. [Architecture Details](#architecture-details)
3. [Code Migration Guide](#code-migration-guide)
4. [Implementation Checklist](#implementation-checklist)
5. [Testing Strategy](#testing-strategy)
6. [Build and Distribution](#build-and-distribution)

---

## Project Setup

### Recommended Monorepo Structure

```
ctrl-q-qvd-viewer/
├── packages/
│   ├── core/                           # Shared core library
│   │   ├── src/
│   │   │   ├── qvdReader.js           # From src/qvdReader.js
│   │   │   └── exporters/             # From src/exporters/
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── vscode/                         # VS Code extension (current code)
│   │   ├── src/
│   │   │   ├── extension.js
│   │   │   ├── qvdEditorProvider.js
│   │   │   └── aboutPanel.js
│   │   ├── media/
│   │   ├── test-data/
│   │   ├── package.json
│   │   └── README.md
│   │
│   └── desktop/                        # Electron standalone app
│       ├── main.js                    # Electron main process
│       ├── preload.js                 # Preload script for IPC
│       ├── renderer/
│       │   ├── index.html             # Main window
│       │   ├── viewer.html            # QVD viewer page
│       │   ├── about.html             # About page
│       │   ├── css/
│       │   │   └── app.css
│       │   └── js/
│       │       ├── viewer.js
│       │       ├── about.js
│       │       └── tabulator.min.js
│       ├── assets/
│       │   └── icons/                 # App icons for each platform
│       ├── build/                     # electron-builder config
│       ├── package.json
│       └── README.md
│
├── package.json                        # Monorepo root
├── lerna.json                          # Lerna configuration (optional)
└── README.md
```

### Initial Setup Commands

```bash
# 1. Initialize monorepo structure
mkdir -p packages/core/src
mkdir -p packages/desktop/renderer/{css,js}
mkdir -p packages/desktop/assets/icons

# 2. Move shared code to core package
cp -r src/qvdReader.js packages/core/src/
cp -r src/exporters packages/core/src/

# 3. Keep VS Code extension in packages/vscode
mv src packages/vscode/
mv media packages/vscode/
mv test-data packages/vscode/

# 4. Install monorepo tools (optional)
npm install -g lerna
lerna init

# 5. Set up core package
cd packages/core
npm init -y
# Update package.json with exports and dependencies

# 6. Set up desktop package  
cd ../desktop
npm init -y
npm install electron electron-builder electron-store
npm install --save-dev electron-notarize
```

### Core Package Configuration

**packages/core/package.json:**
```json
{
  "name": "@ctrl-q/qvd-core",
  "version": "1.0.0",
  "description": "Core QVD file reading and export functionality",
  "main": "src/index.js",
  "type": "commonjs",
  "exports": {
    ".": "./src/index.js",
    "./reader": "./src/qvdReader.js",
    "./exporters": "./src/exporters/index.js"
  },
  "dependencies": {
    "qvdjs": "^0.6.2",
    "exceljs": "^4.4.0",
    "papaparse": "^5.5.3",
    "apache-arrow": "^21.1.0",
    "parquetjs": "^0.11.2",
    "avsc": "^5.7.9",
    "sql.js": "^1.13.0",
    "xml-js": "^1.6.11",
    "js-yaml": "^4.1.0"
  }
}
```

**packages/core/src/index.js:**
```javascript
/**
 * Ctrl-Q QVD Core Library
 * Shared functionality for QVD file reading and exporting
 */

const QvdReader = require('./qvdReader');
const DataExporter = require('./exporters/index');

module.exports = {
  QvdReader,
  DataExporter
};
```

### Desktop Package Configuration

**packages/desktop/package.json:**
```json
{
  "name": "ctrl-q-qvd-viewer-desktop",
  "version": "1.0.0",
  "description": "Standalone QVD file viewer for Windows, macOS, and Linux",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev",
    "build": "electron-builder",
    "build:win": "electron-builder --win",
    "build:mac": "electron-builder --mac",
    "build:linux": "electron-builder --linux"
  },
  "dependencies": {
    "@ctrl-q/qvd-core": "^1.0.0",
    "electron-store": "^8.1.0"
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.9.1",
    "electron-notarize": "^1.2.2"
  },
  "build": {
    "appId": "com.ptarmiganlabs.qvdviewer",
    "productName": "Ctrl-Q QVD Viewer",
    "directories": {
      "output": "dist"
    },
    "files": [
      "main.js",
      "preload.js",
      "renderer/**/*",
      "node_modules/**/*"
    ],
    "mac": {
      "category": "public.app-category.developer-tools",
      "icon": "assets/icons/icon.icns",
      "target": ["dmg", "zip"]
    },
    "win": {
      "icon": "assets/icons/icon.ico",
      "target": ["nsis", "portable"]
    },
    "linux": {
      "icon": "assets/icons/",
      "target": ["AppImage", "deb", "rpm"],
      "category": "Development"
    }
  }
}
```

---

## Architecture Details

### Electron Process Model

```
┌─────────────────────────────────────────────┐
│           Main Process (Node.js)            │
│  - Application lifecycle                    │
│  - Window management                        │
│  - Native menus                             │
│  - File system operations                   │
│  - QVD reading (@ctrl-q/qvd-core)          │
│  - Export operations (@ctrl-q/qvd-core)    │
└──────────────────┬──────────────────────────┘
                   │
                   │ IPC (Inter-Process Communication)
                   │
┌──────────────────┴──────────────────────────┐
│         Renderer Process (Chromium)         │
│  - UI rendering (HTML/CSS/JS)               │
│  - Tabulator table display                  │
│  - User interactions                        │
│  - Send commands to main process            │
└─────────────────────────────────────────────┘
```

### IPC Communication Pattern

```javascript
// Renderer Process (viewer.js)
// Request to open file
const filePath = await window.electronAPI.openQvdFile();

// Main Process (main.js)  
// Handle request
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'QVD Files', extensions: ['qvd', 'QVD'] }]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Preload Script (preload.js)
// Expose API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  openQvdFile: () => ipcRenderer.invoke('dialog:openFile')
});
```

---

## Code Migration Guide

### Step 1: Create Main Process

**packages/desktop/main.js:**

```javascript
const { app, BrowserWindow, dialog, Menu, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { QvdReader, DataExporter } = require('@ctrl-q/qvd-core');

// Initialize settings store
const store = new Store({
  defaults: {
    maxPreviewRows: 5000,
    qlikInlineDelimiter: 'tab',
    windowBounds: { width: 1200, height: 800 }
  }
});

let mainWindow = null;

/**
 * Create the main application window
 */
function createWindow() {
  const bounds = store.get('windowBounds');
  
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    icon: path.join(__dirname, 'assets/icons/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('renderer/index.html');
  
  // Save window bounds on close
  mainWindow.on('close', () => {
    store.set('windowBounds', mainWindow.getBounds());
  });
  
  // Create application menu
  createMenu();
}

/**
 * Create application menu
 */
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open QVD File...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('menu:openFile')
        },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.webContents.send('menu:openSettings')
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => mainWindow.webContents.send('menu:openAbout')
        },
        { type: 'separator' },
        {
          label: 'Documentation',
          click: () => {
            require('electron').shell.openExternal('https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer');
          }
        }
      ]
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers

/**
 * Show file open dialog
 */
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'QVD Files', extensions: ['qvd', 'QVD'] }
    ]
  });
  
  if (result.canceled) {
    return null;
  }
  
  return result.filePaths[0];
});

/**
 * Show file save dialog
 */
ipcMain.handle('dialog:saveFile', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: options.defaultPath,
    filters: options.filters
  });
  
  if (result.canceled) {
    return null;
  }
  
  return result.filePath;
});

/**
 * Read QVD file
 */
ipcMain.handle('qvd:read', async (event, filePath, maxRows = 5000) => {
  try {
    const reader = new QvdReader();
    const result = await reader.read(filePath, maxRows);
    return result;
  } catch (error) {
    return { error: error.message };
  }
});

/**
 * Export data
 */
ipcMain.handle('export:data', async (event, data, format, fileName, maxRows) => {
  try {
    // Get save path from user
    const formatConfig = DataExporter.getExportFormats().find(f => f.name === format);
    const extension = getExtensionForFormat(format);
    
    const savePath = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${fileName}.${extension}`,
      filters: [{ name: formatConfig.label, extensions: [extension] }]
    });
    
    if (savePath.canceled) {
      return null;
    }
    
    // Perform export using core library
    // Note: This needs adaptation of DataExporter to work without vscode API
    await exportDataWithFormat(data, format, savePath.filePath, maxRows);
    
    return savePath.filePath;
  } catch (error) {
    throw new Error(`Export failed: ${error.message}`);
  }
});

/**
 * Get/Set configuration
 */
ipcMain.handle('config:get', (event, key) => {
  return store.get(key);
});

ipcMain.handle('config:set', (event, key, value) => {
  store.set(key, value);
});

/**
 * Helper to get file extension for export format
 */
function getExtensionForFormat(format) {
  const extensions = {
    csv: 'csv',
    json: 'json',
    excel: 'xlsx',
    parquet: 'parquet',
    yaml: 'yaml',
    avro: 'avro',
    arrow: 'arrow',
    sqlite: 'db',
    xml: 'xml',
    qlik: 'qvs',
    postgres: 'sql'
  };
  return extensions[format] || 'txt';
}

/**
 * Export data wrapper - adapts DataExporter for Electron
 */
async function exportDataWithFormat(data, format, filePath, maxRows) {
  const exporters = {
    csv: require('@ctrl-q/qvd-core/src/exporters/csvExporter'),
    json: require('@ctrl-q/qvd-core/src/exporters/jsonExporter'),
    excel: require('@ctrl-q/qvd-core/src/exporters/excelExporter'),
    // ... add other exporters
  };
  
  const exporter = exporters[format];
  if (!exporter) {
    throw new Error(`Unsupported format: ${format}`);
  }
  
  await exporter.exportTo[format.charAt(0).toUpperCase() + format.slice(1)](
    data, 
    filePath, 
    maxRows
  );
}
```

### Step 2: Create Preload Script

**packages/desktop/preload.js:**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose Electron APIs to renderer process securely
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  
  // QVD operations
  readQvd: (filePath, maxRows) => ipcRenderer.invoke('qvd:read', filePath, maxRows),
  
  // Export operations
  exportData: (data, format, fileName, maxRows) => 
    ipcRenderer.invoke('export:data', data, format, fileName, maxRows),
  
  // Configuration
  getConfig: (key) => ipcRenderer.invoke('config:get', key),
  setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
  
  // Menu event listeners
  onMenuOpenFile: (callback) => ipcRenderer.on('menu:openFile', callback),
  onMenuOpenSettings: (callback) => ipcRenderer.on('menu:openSettings', callback),
  onMenuOpenAbout: (callback) => ipcRenderer.on('menu:openAbout', callback),
  
  // Clipboard
  writeClipboard: (text) => {
    // Use Electron's clipboard API
    const { clipboard } = require('electron');
    clipboard.writeText(text);
  }
});
```

### Step 3: Adapt Renderer (UI)

**packages/desktop/renderer/viewer.html:**

This is mostly the same as the current webview HTML in qvdEditorProvider.js, but with:
1. Remove VS Code CSP (use Electron-friendly CSP)
2. Replace `vscode.postMessage()` with `window.electronAPI.*` calls
3. Add file loading UI

Key changes in **renderer/js/viewer.js**:

```javascript
// Before (VS Code)
vscode.postMessage({ command: 'exportData', format: 'csv' });

// After (Electron)
await window.electronAPI.exportData(tableData, 'csv', 'myfile', 0);

// Before (VS Code)
vscode.postMessage({ command: 'openSettings' });

// After (Electron)
window.location.href = 'settings.html';
```

---

## Implementation Checklist

### Phase 1: Setup (Day 1-2)

- [ ] Create monorepo structure
- [ ] Set up `packages/core` with shared code
- [ ] Set up `packages/desktop` with Electron
- [ ] Install all dependencies
- [ ] Verify build scripts work
- [ ] Set up Git workflow for monorepo

### Phase 2: Core Migration (Day 3-5)

- [ ] Create main.js with basic window
- [ ] Create preload.js with IPC bridges
- [ ] Implement file open dialog
- [ ] Implement QVD reading via IPC
- [ ] Test basic QVD file loading

### Phase 3: UI Migration (Day 6-9)

- [ ] Create index.html (landing page)
- [ ] Migrate viewer.html from webview
- [ ] Adapt viewer.js for Electron APIs
- [ ] Implement data table display
- [ ] Add search and filter functionality
- [ ] Add pagination controls

### Phase 4: Export Features (Day 10-12)

- [ ] Implement export dialog
- [ ] Wire up all export formats
- [ ] Add format-specific options (delimiter, etc.)
- [ ] Test each export format
- [ ] Add export progress indication

### Phase 5: Additional Features (Day 13-15)

- [ ] Create settings page
- [ ] Implement settings persistence
- [ ] Create about page
- [ ] Add application menu
- [ ] Implement recent files list
- [ ] Add drag-and-drop file opening

### Phase 6: Polish (Day 16-18)

- [ ] Add loading indicators
- [ ] Improve error messages
- [ ] Add keyboard shortcuts
- [ ] Improve responsiveness
- [ ] Add tooltips and help text

### Phase 7: Build & Package (Day 19-21)

- [ ] Create app icons for all platforms
- [ ] Configure electron-builder
- [ ] Test build on Windows
- [ ] Test build on macOS
- [ ] Test build on Linux
- [ ] Set up code signing (optional)

### Phase 8: Documentation (Day 22-23)

- [ ] Write user guide
- [ ] Create README with installation instructions
- [ ] Document keyboard shortcuts
- [ ] Add screenshots
- [ ] Create release notes

---

## Testing Strategy

### Unit Tests

Test core functionality in isolation:

```javascript
// packages/core/test/qvdReader.test.js
const { QvdReader } = require('../src');
const path = require('path');

describe('QvdReader', () => {
  it('should read QVD file metadata', async () => {
    const reader = new QvdReader();
    const testFile = path.join(__dirname, 'fixtures', 'sample.qvd');
    const result = await reader.read(testFile, 10);
    
    expect(result.error).toBeNull();
    expect(result.metadata).toBeDefined();
    expect(result.totalRows).toBeGreaterThan(0);
  });
  
  it('should limit rows when maxRows specified', async () => {
    const reader = new QvdReader();
    const result = await reader.read(testFile, 100);
    
    expect(result.data.length).toBeLessThanOrEqual(100);
  });
});
```

### Integration Tests

Test Electron IPC communication:

```javascript
// packages/desktop/test/integration/ipc.test.js
const { app, ipcMain } = require('electron');
const { QvdReader } = require('@ctrl-q/qvd-core');

describe('IPC Handlers', () => {
  it('should handle qvd:read request', async () => {
    const filePath = '/path/to/test.qvd';
    const result = await ipcMain.handleOnce('qvd:read', filePath, 100);
    
    expect(result.error).toBeUndefined();
    expect(result.data).toBeArray();
  });
});
```

### Manual Testing Checklist

- [ ] Open various QVD files (small, medium, large)
- [ ] Test all export formats
- [ ] Test search and filter
- [ ] Test pagination
- [ ] Test settings persistence
- [ ] Test menu shortcuts
- [ ] Test drag-and-drop
- [ ] Test on Windows 10/11
- [ ] Test on macOS (Intel and Apple Silicon)
- [ ] Test on Ubuntu Linux
- [ ] Test with corrupted QVD files
- [ ] Test with empty QVD files
- [ ] Test error handling

---

## Build and Distribution

### Icon Generation

Create icons for all platforms from a single source (1024x1024 PNG):

```bash
# macOS (requires iconutil on Mac)
mkdir icon.iconset
sips -z 16 16 source.png --out icon.iconset/icon_16x16.png
sips -z 32 32 source.png --out icon.iconset/icon_16x16@2x.png
# ... (repeat for all sizes)
iconutil -c icns icon.iconset

# Windows (requires png2ico or similar)
png2ico icon.ico source.png

# Linux (just use PNG)
cp source.png icon.png
```

### Build Commands

```bash
# Build for current platform
npm run build

# Build for specific platform
npm run build:win
npm run build:mac
npm run build:linux

# Build for all platforms (requires platform-specific tools)
npm run build:all
```

### Distribution Channels

1. **GitHub Releases** (Recommended)
   - Upload built binaries
   - Include release notes
   - Tag version (v1.0.0)

2. **Microsoft Store** (Optional)
   - Requires developer account ($19/year)
   - Additional testing required
   - Automated updates

3. **Mac App Store** (Optional)
   - Requires Apple Developer account ($99/year)
   - Code signing required
   - App review process

4. **Linux Package Managers**
   - Snapcraft (Snap Store)
   - Flatpak (Flathub)
   - AUR (Arch User Repository)

### Auto-Update Setup

**packages/desktop/main.js:**

```javascript
const { autoUpdater } = require('electron-updater');

autoUpdater.checkForUpdatesAndNotify();

autoUpdater.on('update-available', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: 'A new version is available. It will be downloaded in the background.'
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'Update downloaded. It will be installed on restart.',
    buttons: ['Restart', 'Later']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});
```

---

## Appendix: Migration Mapping

### VS Code API → Electron API

| VS Code API | Electron Equivalent |
|-------------|---------------------|
| `vscode.window.showOpenDialog()` | `dialog.showOpenDialog()` |
| `vscode.window.showSaveDialog()` | `dialog.showSaveDialog()` |
| `vscode.window.showInformationMessage()` | `dialog.showMessageBox()` |
| `vscode.window.showErrorMessage()` | `dialog.showErrorBox()` |
| `vscode.workspace.getConfiguration()` | `electron-store` |
| `vscode.env.clipboard.writeText()` | `clipboard.writeText()` |
| `vscode.Uri.file()` | Node.js `path` module |
| `vscode.workspace.fs.readFile()` | `fs.promises.readFile()` |

---

## Conclusion

This guide provides a roadmap for implementing the standalone QVD viewer. The modular architecture and clear separation of concerns make the migration straightforward while maintaining code quality and reusability.

**Next Step:** Begin with Phase 1 (Setup) and proceed sequentially through the implementation checklist.
