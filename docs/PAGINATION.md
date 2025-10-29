# Pagination Implementation

## Overview

This extension now includes **lightweight client-side pagination** for viewing QVD file data. The implementation uses pure vanilla JavaScript (~2-3KB) instead of heavy frameworks like React (~130KB).

## Features

### Current Implementation

- ✅ **Client-side pagination**: All loaded rows are paginated in the browser
- ✅ **Configurable page sizes**: 25, 50, 100, 250, 500 rows per page
- ✅ **Navigation controls**: First, Previous, Next, Last page buttons
- ✅ **Jump to page**: Direct page number input
- ✅ **Page info display**: Shows "Showing X - Y of Z rows"
- ✅ **VS Code theming**: Fully integrated with VS Code's color schemes
- ✅ **Keyboard support**: Enter key to jump to pages

### Bundle Size

- **Pagination code**: ~2-3KB (inline JavaScript)
- **No external dependencies**: Everything is self-contained
- **No build step required**: Pure vanilla JS in the webview

## How It Works

### Current Flow (Client-Side Pagination)

```
1. Extension loads data via qvdjs (currently loads entire file)
2. Data is sent to webview as JSON
3. Pagination class in webview handles:
   - Slicing data into pages
   - Rendering current page
   - Handling navigation events
```

### Architecture

```
┌─────────────────┐
│  qvdReader.js   │  ← Loads QVD data via qvdjs
└────────┬────────┘
         │
         ↓
┌─────────────────────┐
│ qvdEditorProvider.js│  ← Sends data to webview
└────────┬────────────┘
         │
         ↓
┌─────────────────────┐
│   Webview HTML      │
│                     │
│  [Pagination Class] │  ← Client-side paging
│  ├─ getCurrentPage()│
│  ├─ renderTable()   │
│  └─ renderControls()│
└─────────────────────┘
```

## Future: Server-Side Pagination

When `qvdjs` adds streaming/lazy loading support, the extension is architected to easily switch to server-side pagination:

### Future Flow (Server-Side Pagination)

```
1. Extension loads only requested page via qvdjs
2. Webview requests new page via postMessage
3. Extension responds with page data
4. Webview updates display
```

### Migration Steps (When Available)

1. **Update qvdReader.js**:

   ```javascript
   async readPage(filePath, page, pageSize) {
       const metadata = await this.extractMetadata(filePath);
       const startRow = page * pageSize;
       const endRow = Math.min(startRow + pageSize, metadata.noOfRecords);

       const reader = new QvdFileReader(filePath);
       const dataFrame = await reader.loadRange(startRow, endRow); // New API

       return {
           metadata,
           data: dataFrame.data,
           columns: dataFrame.columns,
           totalRows: metadata.noOfRecords,
           page,
           pageSize
       };
   }
   ```

2. **Update message handler** (already stubbed in code):

   ```javascript
   case 'loadPage':
       const pageData = await this.qvdReader.readPage(
           filePath,
           message.page,
           message.pageSize
       );
       webviewPanel.webview.postMessage({
           command: 'pageData',
           data: pageData
       });
       break;
   ```

3. **Update webview pagination** (minimal change):
   ```javascript
   goToPage(page) {
       this.currentPage = page;
       // Request new page from extension
       vscode.postMessage({
           command: 'loadPage',
           page: page,
           pageSize: this.pageSize
       });
   }
   ```

## Benefits of This Approach

### 1. **Lightweight**

- No React, no webpack, no babel
- Entire pagination logic is ~2-3KB
- Fast load times

### 2. **Future-Proof**

- Designed for easy migration to server-side pagination
- Message-passing architecture already in place
- Minimal code changes needed

### 3. **User-Friendly**

- Intuitive pagination controls
- Keyboard shortcuts
- Configurable page sizes
- VS Code-themed UI

### 4. **Performant**

- Efficient DOM updates
- No unnecessary re-renders
- Works well with large datasets (when paginated)

## Files Modified

- ✅ `qvdEditorProvider.js` - Added pagination HTML, CSS, and inline JS
- ✅ `qvdReader.js` - Added future `readPage()` method stub
- ✅ `src/webview/pagination.js` - Standalone pagination class (for reference)

## Testing

To test the pagination:

1. Open a QVD file with data
2. Verify pagination controls appear
3. Test navigation:
   - Click Next/Previous buttons
   - Click First/Last buttons
   - Type a page number and press Enter
   - Change rows per page dropdown
4. Verify data updates correctly on each page
5. Test with different QVD file sizes

## Performance Considerations

### Current Limitations

- Still loads entire QVD file into memory (qvdjs limitation)
- For very large files (>100K rows), initial load may be slow
- Memory usage proportional to file size

### Future Improvements

- When qvdjs supports streaming:
  - Only load requested pages
  - Dramatically reduce memory usage
  - Faster initial load times
  - Support for files with millions of rows

## Comparison: Why Not React?

| Aspect           | Vanilla JS (Current) | React + TanStack Table           |
| ---------------- | -------------------- | -------------------------------- |
| Bundle Size      | ~2-3KB               | ~130KB                           |
| Dependencies     | None                 | React, ReactDOM, @tanstack/table |
| Build Step       | Not needed           | Webpack/Babel required           |
| Load Time        | Instant              | ~100-200ms                       |
| Complexity       | Simple               | Medium                           |
| Future Migration | Easy                 | Easy                             |

**Decision**: For a simple file viewer extension, vanilla JS provides the best balance of simplicity, performance, and maintainability.
