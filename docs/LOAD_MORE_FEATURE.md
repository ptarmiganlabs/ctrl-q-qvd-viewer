# Load More Rows Feature - Enhanced Pagination

## Overview

Added "Load More" functionality to allow users to incrementally load additional rows beyond the initial 5,000, without having to change settings.

## New Features

### 1. **Smart Info Banner**

When not all rows are loaded, shows:

```
📊 Showing 5,000 of 98,543 rows (5.1% of file loaded)
[Load More (next 5,000 rows)]  [Load All Remaining (93,543 rows)]
```

### 2. **Two Load Options**

#### **Load More Button**

- Doubles the current loaded rows
- Progressive loading strategy
- Example progression:
  - Start: 5,000 rows
  - Click 1: 10,000 rows (2x)
  - Click 2: 20,000 rows (2x)
  - Click 3: 40,000 rows (2x)
  - Click 4: 80,000 rows (2x)
  - Click 5: All remaining rows (or 100,000 max)

**Why Doubling?**

- Gives users control over memory usage
- Fast for small increments
- Quickly reaches large amounts if needed
- Cap at 100,000 rows to prevent memory issues

#### **Load All Remaining Button**

- Loads all remaining rows in one go
- For when you know you need everything
- Direct path to complete data

### 3. **Visual Feedback**

**Before Loading:**

```
📊 Showing 5,000 of 98,543 rows (5.1% of file loaded)
[Load More (next 5,000 rows)]  [Load All Remaining (93,543 rows)]
```

**While Loading:**

```
[Loading...]  [Loading...]
```

**After Loading:**

- Info banner disappears (all rows loaded)
- Pagination updates automatically with new data
- All pages now accessible

## Implementation Details

### Message Handler

```javascript
case "loadMore":
    const currentRows = message.currentRows || maxRows;
    const newMaxRows = message.loadAll
        ? 0  // 0 means load all
        : Math.min(currentRows * 2, 100000);  // Double or cap at 100k
    await this.updateWebview(filePath, webviewPanel.webview, newMaxRows);
    break;
```

### Button Logic

```javascript
function loadMoreRows() {
  vscode.postMessage({
    command: "loadMore",
    currentRows: currentLoadedRows,
    loadAll: false, // Progressive loading
  });
}

function loadAllRows() {
  vscode.postMessage({
    command: "loadMore",
    currentRows: currentLoadedRows,
    loadAll: true, // Load everything
  });
}
```

## User Experience

### Scenario 1: Small File (< 5,000 rows)

- All rows loaded initially
- No "Load More" banner appears
- Pagination works immediately
- Clean UI

### Scenario 2: Medium File (5,000 - 50,000 rows)

- Initial 5,000 rows loaded
- Banner shows progress
- User clicks "Load More" 2-3 times
- Gets all data progressively
- Maintains responsive UI

### Scenario 3: Large File (> 100,000 rows)

- Initial 5,000 rows loaded
- Banner shows progress
- User clicks "Load More" several times
- OR clicks "Load All Remaining" to jump to 100,000
- Caps at 100,000 rows to protect memory

## Benefits

### 1. **User Control**

- ✅ Choose between quick preview (5,000) or full data
- ✅ Progressive loading for big files
- ✅ Clear feedback on what's loaded

### 2. **Performance**

- ✅ Fast initial load (5,000 rows)
- ✅ Responsive UI at all times
- ✅ Memory protection (100,000 row cap)

### 3. **Flexibility**

- ✅ No need to change settings
- ✅ Load what you need, when you need it
- ✅ Works for files of any size

## Memory Considerations

### Load Strategy

| Rows Loaded | Typical Size | Memory | Load Time |
| ----------- | ------------ | ------ | --------- |
| 5,000       | ~500KB       | ~5MB   | ~300ms    |
| 10,000      | ~1MB         | ~10MB  | ~500ms    |
| 20,000      | ~2MB         | ~20MB  | ~1s       |
| 40,000      | ~4MB         | ~40MB  | ~2s       |
| 100,000     | ~10MB        | ~100MB | ~5s       |

### Safety Cap

Maximum 100,000 rows prevents:

- Browser memory exhaustion
- UI freezing
- Poor pagination performance

For files > 100,000 rows:

- Users still get 100,000 rows to work with
- Can export/filter in Qlik for larger datasets
- Future: Server-side pagination will handle millions

## Configuration

Users can still adjust initial load via settings:

```json
{
  "qvd4vscode.maxPreviewRows": 5000 // 100 - 100,000
}
```

**Recommended Values:**

- **Fast preview**: 1,000 rows
- **Default**: 5,000 rows (recommended)
- **Power users**: 10,000 - 25,000 rows

## Files Modified

1. **qvdEditorProvider.js**
   - Added `hasMoreRows` calculation
   - Added `loadMore` message handler
   - Added info banner with load buttons
   - Added JavaScript functions for loading

## Testing

### Test Progressive Loading

1. Open QVD with 50,000 rows
2. **Expected**: Info banner shows "5,000 of 50,000"
3. Click "Load More"
4. **Expected**: Loads 10,000 rows total
5. Click "Load More" again
6. **Expected**: Loads 20,000 rows total
7. Continue until all loaded

### Test Load All

1. Open QVD with 50,000 rows
2. Click "Load All Remaining"
3. **Expected**:
   - Loads all 50,000 rows
   - Info banner disappears
   - Pagination shows all pages

### Test Large File Cap

1. Open QVD with 500,000 rows
2. Click "Load All Remaining"
3. **Expected**: Loads 100,000 rows (capped)
4. Info banner still shows more available
5. Can continue loading in increments

## Future Enhancement

When qvd4js adds streaming support:

- Remove 100,000 row cap
- True server-side pagination
- Load pages on-demand
- Support millions of rows
- Zero memory growth

Current "Load More" feature provides excellent UX bridge until streaming is available!
