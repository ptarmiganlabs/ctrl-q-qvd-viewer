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

Search and sort cover every row of the file, not just the page shown. The grid sends them with each page: `search`, the text typed, and `sort`, `{fieldIndex, descending}` from the column header clicked. One column sorts at a time. A third click puts the rows back in file order.

The pager makes a *view* the first time a page asks for a new search or sort. The view holds the row numbers of the search's rows, in the sort's order, and is kept for the pages that follow, so that paging through it takes milliseconds. It is made in the read queue's large lane, one at a time in the extension host. While it is made, the grid shows what it is doing ("Searching OrderID (field 3 of 21)…", "Sorting by Amount…") with a progress bar and a Cancel button. A new search or sort supersedes one still running. A cancelled or refused one puts the search box and the sort back as they were, and shows the view from before again.

- **Scanning** (`src/columnScan.mjs`): a field is read a chunk of rows at a time, with qvdjs's columnar pages. Each row's value is a code, the field's own symbol index, so a search or sort works out what it needs once per distinct value rather than once per row. Where most rows hold a value of their own, a chunk holds fewer rows: at most about 250,000 values a chunk decodes are new, which bounds the heap. The scan's file is opened afresh once it holds more than 512 MiB of decoded values.
- **Search** (`src/viewSearch.mjs`): a row matches when one of its cells shows text that holds the search text, whatever its case. A cell is matched as the grid shows it: a dual by its text, a number as it is written. An empty cell holds nothing to find.
- **Sort** (`src/viewSort.mjs`): numbers and duals come first, by their number, so dates sort by time and not by how their text reads. Text comes next, compared as the language VS Code shows, with numbers in it compared as numbers: "Item 9" before "Item 10", and å, ä and ö after z for a Swedish VS Code. Nulls come last, either way. Rows that sort the same keep their order in the file. The field's distinct values are ranked, then the rows are counted into place: two passes over the rows, however many there are.
- **Memory:** a view is priced before it starts: what its scans hold at most, its row numbers, and for a sort each distinct value's key. One that doesn't fit is refused with what it needs and what is left. A sort of more than 5,000,000 different text values is refused too, because comparing them as the language does would take minutes. The view's row numbers stay booked with the memory guard until another view takes its place, or the editor closes.

On a 1.87 GB QVD of 46.9 million rows and 17 fields, sorting by a field of 6 values took 1.3 s, and a search took about two minutes. Most of that time went on the three fields with a value of their own in every row, each taking about 30 s for qvdjs to decode.
