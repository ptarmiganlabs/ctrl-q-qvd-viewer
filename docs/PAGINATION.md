# Paging the Data tab

The Data tab reads a QVD one page at a time, wherever that page is in the file. A file of 30 million rows opens as fast as a small one, and its last page is one click away.

## What happens when a QVD opens

1. **The header first.** `QvdEditorProvider.updateWebview()` reads the file's header with `QvdReader.readHeader()`. That takes milliseconds whatever the file's size, and none at all when the file hasn't changed since it was last read. The page is built from the header alone. The Schema, File Metadata and Lineage tabs and the structure chart are complete at once.
2. **The grid asks for a page.** The Data tab's grid (`src/webview/client/dataGrid.js`) is a Tabulator table with remote pagination. Its columns come from the file's field list, in file order. Each column is keyed by the field's position (`c0`, `c1`, …), never by its name: Tabulator would read a name with a dot in it as a path, and an object puts a name that is a number before the others. The page's Content Security Policy allows no `fetch`, so Tabulator's `ajaxRequestFunc` posts `{command: "page", requestId, offset, limit}` to the extension.
3. **The extension answers from an open copy of the file.** `src/webview/pageServer.mjs` holds one pager per editor (`src/qvdPager.mjs`). The pager opens the file with qvdjs's `QvdDataFrame.open()`, which reads the header only, and reads each page with `rows({offset, limit})`. A page decodes only the values its rows use.
4. **The rows go back as arrays,** one value per field in file order, in `{command: "pageRows", requestId, offset, rows, totalRows}`. A page holds at most 1,000 rows, so no message comes near the longest string VS Code can send.

## What a page costs

The first page to touch a column walks that column's symbols once. On a file of a few gigabytes that takes seconds. While it runs, the grid shows "Reading field 3 of 21…" with a Cancel button, from qvdjs's `symbol-census` progress. Later pages take milliseconds.

qvdjs keeps the values a page decodes, for later pages, until the file is closed. The pager:

- **Prices each page first.** It calls qvdjs's `check()` before each page, which counts what the open copy holds already. It compares that with the heap left in the memory guard (`src/memoryGuard.mjs`), less what exports, profiling and other tabs have booked. A page that doesn't fit is refused with a message that says how much it needs and how much is left. It doesn't crash the extension host.
- **Books what the open copy holds,** so that other reads are priced against it.
- **Opens the file afresh** once the open copy holds more than 128 MiB, which lets go of those values.
- **Runs in the read queue's small lane,** one page at a time in the extension host, beside at most one large read, which leaves 128 MiB for it.

## Answers other than rows

| Message | When |
| --- | --- |
| `pageProgress {requestId, current, total}` | While a page walks columns: columns walked, of those it walks |
| `pageFailed {requestId, failure, html}` | The page couldn't be read. `failure` is `describeReadFailure()`'s account, `html` the notice that says so. The grid shows it above the table, and its Retry asks for the page again |
| `pageCancelled {requestId}` | The user cancelled the page with `{command: "cancelPage", requestId}` |

A request supersedes the one before it, which is given up without an answer. The grid ignores an answer to a request it no longer waits for.

If the file changes on disk while it is open, as a reload storing it again would, the next page finds out. Its header may no longer describe it, so the editor is shown afresh from the new header.

When the editor closes, its page server gives up what runs and closes the file.

## Settings

- `ctrl-q-qvd-viewer.pageSize`: rows a page shows when a file opens (default 100, from 10 to 1,000). The grid also offers 25, 50, 100, 250, 500 and 1,000 below the table.
- `ctrl-q-qvd-viewer.maxPreviewRows` is no longer used. It is kept, marked deprecated, so that settings.json files that set it don't show it as unknown.

## Search and sort

For now, search filters the rows of the page shown, and the grid's columns don't sort: a sort of one page would look like a sort of the file. Whole-file search and sort, on the extension host, come next.
