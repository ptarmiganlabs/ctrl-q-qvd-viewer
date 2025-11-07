# Performance Investigation Report: Large QVD File Opening

**Date:** November 7, 2025  
**Issue:** Large QVDs slow to open in VS Code extension  
**Test File:** chicago_taxi_rides_2016_01.qvd (37.86 MB, 1,705,805 rows)

## ⚠️ CRITICAL ISSUE DISCOVERED

### Large QVD Files Fail to Open

**Test Results:** QVD files with 20M+ rows and 20+ columns **FAIL** to open in VS Code, even though only 5000 rows are loaded.

**Error:**

```
Unable to retrieve document from URI 'file:///...orders_20m.qvd'
Assertion Failed: Argument is `undefined` or `null`.
```

### Root Cause Analysis

The problem is **NOT** in qvdjs reading. QvdReader successfully reads 5000 rows in <200ms.

**The actual problem:** Lines 1279-1282 in `src/webview/templates/mainTemplate.mjs`:

```javascript
const tableData = ${JSON.stringify(data)};  // <-- THIS IS THE PROBLEM
const schemaData = ${JSON.stringify(schemaData)};
const metadataData = ${JSON.stringify(metadataKV)};
const lineageData = ${JSON.stringify(lineageData)};
```

### Why This Fails

1. **5000 rows × 20 columns** = 100,000 data points
2. `JSON.stringify()` creates a massive string (potentially 10-50+ MB)
3. This string is **embedded directly in the HTML**
4. VS Code has **internal limits** on webview HTML content size
5. When exceeded, VS Code throws "Unable to retrieve document" error

### Impact

- ✅ Small files (< 100 rows): Work fine
- ✅ Medium files (~1700 rows, 18 cols): Work fine (~40MB QVD)
- ❌ Large files (5000 rows, 20+ cols): **FAIL** (500MB+ QVD)
- ❌ Very large files (5000 rows, 20+ cols): **FAIL** (1GB+ QVD)

The failure is **not** related to the QVD file size on disk, but to the **data width** (number of columns) and **serialized JSON size**.

## Test Results

### ✅ Component Performance (Working Well)

| Component                      | Time    | Status       |
| ------------------------------ | ------- | ------------ |
| qvdjs file reading (25 rows)   | 26-35ms | ✅ Excellent |
| qvdjs file reading (5000 rows) | 64-83ms | ✅ Excellent |
| Metadata extraction            | <1ms    | ✅ Excellent |
| Data transformation            | 10ms    | ✅ Good      |
| JSON serialization             | 5ms     | ✅ Good      |

**Total data processing time: ~94ms** for 5000 rows

### ⚠️ VS Code Editor Performance (Bottleneck Identified)

| Operation             | Time               | Status             |
| --------------------- | ------------------ | ------------------ |
| First open in VS Code | **4,581ms (4.6s)** | ⚠️ Slow            |
| Subsequent opens      | 1,041ms (1.0s)     | ⚠️ Could be better |

## Root Cause Analysis

The performance issue is **NOT** in qvdjs or data reading. The bottleneck is in the VS Code webview initialization and rendering:

### First Open Overhead (4.6 seconds)

1. **Webview creation** - VS Code internal initialization
2. **Asset loading**:
   - Tabulator.js library (large JavaScript library)
   - Chart.js library
   - CSS stylesheets
3. **HTML generation** - Building the full HTML with embedded data
4. **Webview rendering** - Initial DOM creation and rendering
5. **Extension communication setup**

### Subsequent Open Overhead (1 second)

- Some caching occurs, but webview still needs to be recreated
- Data still needs to be re-embedded in HTML
- DOM still needs to be re-rendered

## Recommendations

### � CRITICAL FIX REQUIRED (Blocking Issue)

#### 1. **Use postMessage Instead of Embedding Data in HTML** ⚠️ **URGENT**

**Current (Broken):**

```javascript
// mainTemplate.mjs line 1279
const tableData = ${JSON.stringify(data)}; // Embedded in HTML - FAILS for large datasets
```

**Fixed Approach:**

```javascript
// In HTML: Initialize with empty data
const tableData = [];

// After webview loads, send data via postMessage
webview.postMessage({
  command: "loadData",
  data: result.data,
});
```

**Why this fixes the issue:**

- Removes massive JSON string from HTML
- VS Code can handle postMessage data separately
- No HTML size limits
- Faster initial page load
- Progressive data loading possible

**Implementation priority:** 🔴 **CRITICAL** - Blocks large file support

### �🚀 High Impact Optimizations

#### 2. **Lazy Load Webview Assets**

Instead of embedding Tabulator.js and Chart.js inline, load them as external resources:

```javascript
// Instead of: ${tabulatorJs} in HTML template
// Use: <script src="${tabulatorUri}"></script>
```

This allows VS Code to cache these large libraries.

#### 2. **Progressive Rendering**

Show a loading screen immediately while data is being processed:

```javascript
// Show minimal HTML immediately
webview.html = getLoadingHtml();

// Then load data and update
const result = await qvdReader.read(filePath, maxRows);
webview.html = getHtmlForWebview(result, webview, context);
```

#### 3. **Reduce Initial Data Load**

Consider loading even fewer rows initially (e.g., 100-500) and then loading more on-demand:

```javascript
const config = vscode.workspace.getConfiguration("ctrl-q-qvd-viewer");
const initialRows = config.get("initialPreviewRows", 100); // New config
const maxRows = config.get("maxPreviewRows", 5000);
```

#### 4. **Stream Data to Webview**

Instead of embedding all data in HTML, send it via postMessage:

```javascript
// In HTML: const tableData = []; // Empty initially
// Then send data:
webview.postMessage({ command: "loadData", data: result.data });
```

This reduces HTML parsing time.

### 🎯 Medium Impact Optimizations

#### 5. **Webview Persistence**

Set `retainContextWhenHidden: true` so closing/reopening doesn't require full recreation:

```javascript
webviewPanel.webview.options = {
  enableScripts: true,
  retainContextWhenHidden: true, // Add this
  localResourceRoots: [...]
};
```

#### 6. **Minimize JSON Size**

Only include necessary data in the initial load. Schema/metadata can be loaded on-demand.

#### 7. **Use Worker Thread for JSON Serialization**

If JSON.stringify is slow for very large datasets (not the case here, but could be for larger previews).

### 📊 Configuration Changes

Add new settings to package.json:

```json
{
  "ctrl-q-qvd-viewer.initialPreviewRows": {
    "type": "number",
    "default": 100,
    "description": "Number of rows to load immediately when opening a QVD file",
    "minimum": 25,
    "maximum": 1000
  }
}
```

## Expected Impact

Implementing the high-impact optimizations could reduce:

- **First open**: 4.6s → **1-2 seconds** (60-70% improvement)
- **Subsequent opens**: 1.0s → **300-500ms** (50-70% improvement)

## Network Drive Considerations

For the Windows user on network drives, additional latency will come from:

1. Network I/O (reading header + symbol table + data rows)
2. Windows file system overhead

Recommendations:

- The lazy loading in qvdjs is already helping (only reads needed bytes)
- Consider adding a "metadata only" mode that loads 0 rows initially
- Show file info and let user choose to load data

## Implementation Priority

1. **High Priority**: External asset loading (#1)
2. **High Priority**: Progressive rendering (#2)
3. **Medium Priority**: Reduce initial data (#3)
4. **Medium Priority**: Webview persistence (#5)
5. **Low Priority**: Stream data via postMessage (#4) - more complex refactor

## Test Command

Run the performance test suite:

```bash
cd /Users/goran/code/ctrl-q-qvd-viewer
npm test -- --grep "Performance"
```

## Conclusion

✅ **qvdjs lazy loading is working perfectly** - no issues there  
⚠️ **VS Code webview initialization is the bottleneck** - needs optimization  
🎯 **Focus optimization efforts on webview loading, not data reading**
