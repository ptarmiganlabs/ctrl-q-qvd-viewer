# Standalone QVD Viewer Application - Feasibility Investigation

**Date:** October 29, 2025  
**Extension Version:** 0.0.3  
**Investigation Status:** Complete

## Executive Summary

**Verdict: YES - It is feasible to build a standalone, cross-platform QVD viewer application from the existing codebase.**

The current VS Code extension provides an excellent foundation for a standalone application. The core business logic (QVD reading, data display, exports) is already well-separated from VS Code-specific APIs, making conversion straightforward. Multiple proven frameworks are available for building cross-platform desktop applications from the existing JavaScript/Node.js codebase.

### Key Findings

- **Core Logic Reusability:** ~80-85% of the codebase can be reused with minimal changes
- **Recommended Framework:** Electron (most compatible with existing codebase)
- **Development Effort:** Estimated 2-4 weeks for initial implementation
- **Maintenance Impact:** Moderate - shared core logic can be maintained in both applications

---

## Current Architecture Analysis

### Technology Stack

The extension is built with:
- **Runtime:** Node.js 22.x
- **Framework:** VS Code Extension API
- **UI:** Custom HTML/CSS/JavaScript webview with Tabulator.js for data tables
- **Core Dependencies:**
  - `qvdjs` (v0.6.2) - QVD file parsing
  - `exceljs` (v4.4.0) - Excel export
  - `papaparse` (v5.5.3) - CSV parsing
  - `apache-arrow` (v21.1.0) - Arrow format support
  - `parquetjs` (v0.11.2) - Parquet format support
  - `avsc` (v5.7.9) - Avro format support
  - `sql.js` (v1.13.0) - SQLite database creation
  - `xml-js` (v1.6.11) - XML parsing
  - `js-yaml` (v4.1.0) - YAML parsing

### Component Structure

```
src/
├── extension.js              # VS Code extension entry point (VS Code specific)
├── qvdEditorProvider.js      # Custom editor provider (VS Code specific)
├── qvdReader.js              # QVD file reader (reusable)
├── aboutPanel.js             # About page webview (mostly reusable)
├── exporters/
│   ├── index.js              # Export coordinator (reusable)
│   ├── csvExporter.js        # CSV export (reusable)
│   ├── jsonExporter.js       # JSON export (reusable)
│   ├── excelExporter.js      # Excel export (reusable)
│   ├── parquetExporter.js    # Parquet export (reusable)
│   ├── yamlExporter.js       # YAML export (reusable)
│   ├── avroExporter.js       # Avro export (reusable)
│   ├── arrowExporter.js      # Arrow export (reusable)
│   ├── sqliteExporter.js     # SQLite export (reusable)
│   ├── xmlExporter.js        # XML export (reusable)
│   ├── qlikInlineExporter.js # Qlik script export (reusable)
│   └── postgresExporter.js   # PostgreSQL export (reusable)
└── webview/
    └── pagination.js         # Pagination logic (reusable)
```

### Reusability Assessment

| Component Type | Reusable % | Notes |
|---------------|-----------|-------|
| Core QVD reading logic | 100% | No VS Code dependencies |
| Export functionality | 100% | All exporters are pure Node.js |
| UI rendering (HTML/CSS/JS) | 95% | Minimal changes needed for non-VS Code webview |
| Application shell | 0% | Must be rebuilt for standalone |
| File dialogs | 0% | VS Code API calls need replacement |
| Settings/configuration | 30% | Concept reusable, implementation different |

---

## Feasibility Analysis

### Option 1: Electron (Recommended)

**What is Electron?**
Electron is a framework for building cross-platform desktop applications using web technologies (HTML, CSS, JavaScript). It combines Chromium rendering engine with Node.js runtime.

**Pros:**
- ✅ **Highest code reuse:** Can use existing HTML/CSS/JS webview code almost as-is
- ✅ **Native Node.js support:** All existing dependencies work without modification
- ✅ **Mature ecosystem:** Extensive tooling, documentation, and community support
- ✅ **Built-in file dialogs:** Native OS file pickers available via Electron APIs
- ✅ **Auto-updates:** Built-in support for application updates
- ✅ **Similar to VS Code:** VS Code itself is built on Electron, so architecture is familiar
- ✅ **Menu/toolbar support:** Easy to add native menus and toolbars

**Cons:**
- ⚠️ **App size:** ~150-200MB for basic app (includes Chromium + Node.js)
- ⚠️ **Memory usage:** Higher than native apps (~100-150MB base)
- ⚠️ **Startup time:** Slightly slower than native apps (1-2 seconds)

**Development Effort:** 2-3 weeks

**Example Applications Using Electron:**
- VS Code, Slack, Discord, Atom, GitHub Desktop, Postman

**Architecture Changes Required:**
1. Replace `vscode` API calls with Electron IPC (inter-process communication)
2. Create main process (app shell) and renderer process (UI)
3. Implement native file open/save dialogs using Electron's dialog API
4. Create application menus and toolbars
5. Add window management (minimize, maximize, close)
6. Package application for Windows, macOS, and Linux

### Option 2: Tauri

**What is Tauri?**
Tauri is a newer framework for building desktop applications using web technologies for the frontend and Rust for the backend. Uses system webview instead of bundling Chromium.

**Pros:**
- ✅ **Smaller app size:** ~10-20MB (uses system webview)
- ✅ **Lower memory usage:** ~50-80MB base
- ✅ **Faster startup:** Uses native system webview
- ✅ **Better security:** Rust backend provides memory safety
- ✅ **Modern architecture:** Clean separation of concerns

**Cons:**
- ⚠️ **Higher migration effort:** Need to wrap Node.js logic in Rust or use separate backend
- ⚠️ **Node.js integration challenges:** Not all Node.js dependencies work seamlessly
- ⚠️ **Less mature:** Smaller ecosystem than Electron
- ⚠️ **Learning curve:** Team needs Rust knowledge for advanced features
- ⚠️ **Webview inconsistencies:** Different rendering engines on different platforms

**Development Effort:** 4-6 weeks

**Example Applications Using Tauri:**
- Clash Verge (network tool), GitButler (Git client)

### Option 3: NW.js

**What is NW.js?**
Similar to Electron, combines Node.js with Chromium, but with a different architecture where Node.js and DOM share the same JavaScript context.

**Pros:**
- ✅ **Similar to Electron:** Easy migration from VS Code extension
- ✅ **Direct Node.js access:** Can call Node.js APIs directly from browser context

**Cons:**
- ⚠️ **Less popular:** Smaller community than Electron
- ⚠️ **Fewer tools:** Limited packaging and development tools
- ⚠️ **Similar resource usage to Electron**

**Development Effort:** 2-3 weeks

### Option 4: Web Application (PWA)

**What is a PWA?**
Progressive Web App - a web application that can be installed and run like a desktop app.

**Pros:**
- ✅ **Cross-platform:** Truly universal (Windows, macOS, Linux, mobile)
- ✅ **No installation:** Can run in browser
- ✅ **Automatic updates:** Server-controlled updates

**Cons:**
- ❌ **No Node.js:** Cannot use existing Node.js dependencies
- ❌ **Complete rewrite:** Would need to rewrite QVD parsing in browser-compatible JavaScript
- ❌ **File system limitations:** Browser file access is restricted
- ❌ **Performance:** QVD parsing would be slower in browser
- ❌ **Large file handling:** Browser memory limits make large QVD files problematic

**Development Effort:** 8-12 weeks (essentially starting from scratch)

**Verdict:** Not recommended for this use case

---

## Recommended Approach: Electron

### Architecture Proposal

```
standalone-qvd-viewer/
├── main.js                    # Electron main process (app shell)
├── preload.js                 # Secure bridge between main and renderer
├── renderer/
│   ├── index.html             # Main window HTML
│   ├── viewer.html            # QVD viewer (adapted from current webview)
│   ├── about.html             # About page (adapted from aboutPanel)
│   ├── css/
│   │   └── app.css            # Application styles
│   └── js/
│       ├── viewer.js          # Viewer UI logic
│       └── tabulator.min.js   # Tabulator library
├── src/                       # Shared with VS Code extension
│   ├── qvdReader.js           # Reused as-is
│   └── exporters/             # Reused as-is
├── package.json
└── build/                     # Build configuration for electron-builder
```

### Code Changes Required

#### 1. Main Process (New - ~300-400 lines)

Create `main.js` to handle:
- Application lifecycle (startup, shutdown)
- Window management
- Native menus (File, Edit, View, Help)
- File dialogs (open QVD, save exports)
- IPC communication with renderer process

```javascript
// Example structure
const { app, BrowserWindow, dialog, Menu, ipcMain } = require('electron');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  mainWindow.loadFile('renderer/index.html');
  setupMenu(mainWindow);
}

app.whenReady().then(createWindow);
```

#### 2. Preload Script (New - ~100-150 lines)

Create `preload.js` for secure IPC:
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (data) => ipcRenderer.invoke('dialog:saveFile', data),
  readQvd: (filePath, maxRows) => ipcRenderer.invoke('qvd:read', filePath, maxRows),
  exportData: (format, data) => ipcRenderer.invoke('export:data', format, data)
});
```

#### 3. Renderer Updates (Modify existing - ~50-100 lines)

Replace VS Code API calls in the webview HTML:
```javascript
// Before (VS Code)
vscode.postMessage({ command: 'openFile' });

// After (Electron)
const filePath = await window.electronAPI.openFile();
```

#### 4. QVD Reader Integration (Minimal changes - ~10-20 lines)

Add IPC handlers in main process:
```javascript
ipcMain.handle('qvd:read', async (event, filePath, maxRows) => {
  const reader = new QvdReader();
  return await reader.read(filePath, maxRows);
});
```

#### 5. Export Integration (Minimal changes - ~20-30 lines)

Add IPC handlers for exports:
```javascript
ipcMain.handle('export:data', async (event, format, data, fileName) => {
  const savePath = await dialog.showSaveDialog({ /* options */ });
  if (savePath.canceled) return null;
  
  await DataExporter.exportData(data, format, fileName, savePath.filePath);
  return savePath.filePath;
});
```

### Build and Distribution

**Tools:**
- `electron-builder` - Package and distribute application
- `electron-notarize` - macOS code signing and notarization
- `electron-installer-windows` - Windows installer creation

**Distribution Formats:**
- **Windows:** `.exe` installer, portable `.exe`, Microsoft Store
- **macOS:** `.dmg` disk image, `.app` bundle, Mac App Store
- **Linux:** `.AppImage`, `.deb`, `.rpm`, Snap, Flatpak

**Auto-Update:**
- Use `electron-updater` for automatic updates
- Host releases on GitHub Releases or custom server

### Resource Requirements

**Development Time Estimate:**
- Initial Electron setup: 2-3 days
- Migrate core UI: 3-4 days
- Implement file operations: 2-3 days
- Add menus and preferences: 2-3 days
- Testing and polish: 3-5 days
- Build/packaging setup: 1-2 days
- Documentation: 1-2 days
- **Total:** 2-3 weeks for MVP

**Binary Sizes (estimated):**
- Windows: ~180-200 MB
- macOS: ~190-210 MB  
- Linux: ~180-200 MB

**Runtime Requirements:**
- Memory: 150-250 MB (typical), up to 500 MB for large QVD files
- Disk: 300-400 MB installed
- CPU: Minimal (single-threaded data parsing)

---

## Alternative: Shared Core Library Approach

Instead of two separate applications, consider creating three packages:

```
1. @ctrl-q/qvd-core (npm package)
   - QVD reading logic
   - Export functionality
   - Pure Node.js, no UI

2. @ctrl-q/qvd-viewer-vscode (VS Code extension)
   - Current extension
   - Uses @ctrl-q/qvd-core

3. @ctrl-q/qvd-viewer-desktop (Electron app)
   - Standalone application
   - Uses @ctrl-q/qvd-core
```

**Benefits:**
- ✅ Single source of truth for core logic
- ✅ Easier maintenance (fix bugs once)
- ✅ Can publish core library for community use
- ✅ Enables CLI tool creation in future

**Structure:**
```
ctrl-q-qvd-viewer/
├── packages/
│   ├── core/                  # Shared core library
│   │   ├── src/
│   │   │   ├── qvdReader.js
│   │   │   └── exporters/
│   │   └── package.json
│   ├── vscode/                # VS Code extension
│   │   ├── src/
│   │   └── package.json
│   └── desktop/               # Electron app
│       ├── main.js
│       ├── renderer/
│       └── package.json
└── package.json               # Monorepo root
```

---

## Technical Challenges and Solutions

### Challenge 1: File System Access

**Issue:** VS Code provides abstracted file system APIs; Electron uses Node.js fs directly.

**Solution:** Create a file system abstraction layer that both can use:
```javascript
// fs-adapter.js
class FileSystemAdapter {
  async readFile(path) {
    if (isVSCode()) {
      return vscode.workspace.fs.readFile(vscode.Uri.file(path));
    } else {
      return fs.promises.readFile(path);
    }
  }
}
```

### Challenge 2: Configuration/Settings

**Issue:** VS Code uses workspace settings; Electron needs its own config.

**Solution:** Use `electron-store` for persistent settings with same structure:
```javascript
const Store = require('electron-store');
const store = new Store({
  defaults: {
    maxPreviewRows: 5000,
    qlikInlineDelimiter: 'tab'
  }
});
```

### Challenge 3: Dialog Inconsistencies

**Issue:** Different dialog APIs between VS Code and Electron.

**Solution:** Create dialog wrapper:
```javascript
class DialogService {
  async showOpenDialog(options) {
    if (isVSCode()) {
      return vscode.window.showOpenDialog(options);
    } else {
      return electron.dialog.showOpenDialog(options);
    }
  }
}
```

### Challenge 4: Cross-Platform Testing

**Issue:** Need to test on Windows, macOS, and Linux.

**Solution:**
- Use GitHub Actions for automated builds
- Set up VMs or use cloud testing services
- Focus testing on file operations and native integrations

---

## Maintenance Considerations

### Two-Application Strategy

**Pros:**
- Independent release cycles
- Different feature sets possible
- No risk of breaking one when updating the other

**Cons:**
- Duplicate bug fixes
- Diverging feature sets over time
- More maintenance overhead

**Mitigation:** Use shared core library approach (see above)

### Version Compatibility

**Strategy:**
- Keep VS Code extension version: `0.x.x`
- Start standalone app at version: `1.0.0`
- Use same core library version in both

### Feature Parity

**Initial Release (Standalone App):**
- ✅ Open QVD files
- ✅ View metadata and data
- ✅ Export to all formats
- ✅ Search and filter
- ✅ Pagination
- ✅ Settings/preferences

**Future Enhancements (Standalone Only):**
- File associations (.qvd opens in app)
- Recent files list
- Batch export multiple QVD files
- Compare two QVD files
- QVD file statistics/profiling
- Command-line interface

---

## Cost-Benefit Analysis

### Development Costs

| Phase | Time | Notes |
|-------|------|-------|
| Initial implementation | 2-3 weeks | Core functionality |
| Testing & polish | 1 week | Cross-platform testing |
| Documentation | 2-3 days | User guide, README |
| Build pipeline setup | 2-3 days | CI/CD configuration |
| **Total** | **3-4 weeks** | One developer |

### Ongoing Costs

| Task | Time | Frequency |
|------|------|-----------|
| Bug fixes | 1-2 days | As needed |
| Feature updates | 3-5 days | Quarterly |
| Dependency updates | 1 day | Monthly |
| Platform updates | 2-3 days | As OS versions release |

### Benefits

**For Users:**
- ✅ No VS Code installation required
- ✅ Faster startup (no extension host overhead)
- ✅ Better integration with OS (file associations, dock/taskbar)
- ✅ Simpler workflow for QVD-only use case
- ✅ Can run on systems where VS Code isn't allowed/desired

**For Project:**
- ✅ Broader user base (beyond VS Code users)
- ✅ Increased visibility and adoption
- ✅ Potential for monetization (if desired)
- ✅ Community contribution opportunities
- ✅ Portfolio/showcase piece for Ptarmigan Labs

**Market Demand:**
- QVD files are proprietary format with limited tool support
- Current alternatives require Qlik Sense/QlikView (expensive, heavy)
- Lightweight, free viewer fills market gap
- Useful for data analysts, QA testers, support teams

---

## Recommendations

### Short Term (MVP - 4 weeks)

1. ✅ **Build Electron-based standalone app** with core features:
   - Open QVD files
   - View data and metadata
   - Export functionality
   - Basic settings

2. ✅ **Use monorepo structure** to share code between extension and app

3. ✅ **Set up automated builds** for Windows, macOS, Linux

4. ✅ **Publish to GitHub Releases** for easy distribution

### Medium Term (3-6 months)

1. Add standalone-specific features:
   - File associations
   - Recent files
   - Drag-and-drop file opening
   - Command-line arguments

2. Improve packaging:
   - Code signing for Windows and macOS
   - Microsoft Store / Mac App Store submission
   - Linux app store distributions (Snap, Flatpak)

3. Add auto-update functionality

### Long Term (6-12 months)

1. Consider additional tools:
   - Command-line QVD tool
   - Web-based QVD viewer (limited functionality)
   - QVD comparison tool

2. Explore monetization options:
   - Professional features (batch processing, scripting)
   - Enterprise licensing
   - Premium support

3. Build community:
   - Open source contributions
   - Plugin system for custom exporters
   - Integration with other tools

---

## Example User Workflows

### Workflow 1: Data Analyst

**Current (VS Code Extension):**
1. Open VS Code
2. Install extension (first time)
3. Open QVD file
4. View and analyze data
5. Export to Excel

**With Standalone App:**
1. Double-click QVD file (opens in app)
2. View and analyze data
3. Export to Excel

**Benefit:** Faster, more intuitive workflow

### Workflow 2: QA Tester

**Current:**
1. Use Qlik Sense Desktop to open QVD
2. Manually inspect data
3. Cannot easily export or compare

**With Standalone App:**
1. Open QVD in viewer
2. Search and filter data
3. Export subset for validation
4. Compare with expected results

**Benefit:** No Qlik license needed, faster validation

### Workflow 3: Support Engineer

**Current:**
1. Customer sends QVD file
2. Need Qlik Sense to open it
3. Load into app to view

**With Standalone App:**
1. Customer sends QVD file
2. Open directly in viewer
3. Immediately see data and metadata
4. Export sample for analysis

**Benefit:** No Qlik infrastructure needed

---

## Conclusion

**Building a standalone QVD viewer application is highly feasible and recommended.**

The existing codebase is well-structured for conversion to a standalone application. Using Electron provides the optimal balance of:
- Minimal code changes (80%+ reuse)
- Native OS integration
- Cross-platform support
- Mature tooling and ecosystem

With an estimated 3-4 weeks of development effort, a fully-functional standalone application can be delivered that provides significant value to users who don't use VS Code or need a dedicated QVD viewing tool.

The recommended approach is to use a monorepo structure with a shared core library, allowing both the VS Code extension and standalone app to evolve independently while maintaining consistent core functionality.

---

## Next Steps

If proceeding with development, the recommended sequence is:

1. **Week 1:** Set up monorepo structure and Electron boilerplate
2. **Week 2:** Migrate core UI and QVD reading functionality
3. **Week 3:** Implement file operations, menus, and settings
4. **Week 4:** Testing, documentation, and build pipeline

After initial release, gather user feedback and prioritize features based on actual usage patterns.

---

## Appendix: Framework Comparison Matrix

| Criterion | Electron | Tauri | NW.js | PWA |
|-----------|----------|-------|-------|-----|
| Code Reuse | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ |
| App Size | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Performance | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Development Speed | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| Ecosystem | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| Node.js Support | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ❌ |
| Native Feel | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Auto-Update | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Total** | **34/40** | **30/40** | **28/40** | **19/40** |

**Winner: Electron** - Best overall fit for this project

---

## Appendix: Reference Links

### Electron Resources
- Official Site: https://www.electronjs.org/
- Documentation: https://www.electronjs.org/docs/latest
- electron-builder: https://www.electron.build/
- electron-updater: https://www.electron.build/auto-update

### Tauri Resources
- Official Site: https://tauri.app/
- Documentation: https://tauri.app/v1/guides/

### Example Projects
- Electron Apps Showcase: https://www.electronjs.org/apps
- VS Code Source: https://github.com/microsoft/vscode

### Related Tools
- Tabulator.js: http://tabulator.info/
- qvdjs: https://github.com/rquitales/qvdjs

---

**Report Prepared By:** GitHub Copilot  
**For:** Ptarmigan Labs - Ctrl-Q QVD Viewer Project  
**Date:** October 29, 2025
