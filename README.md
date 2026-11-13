<h1 align="center">Ctrl-Q QVD Viewer</h1>

<p align="center"><strong>View and export Qlik Sense and QlikView QVD files in VS Code</strong></p>

<p align="center">
<a href="https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer"><img src="https://img.shields.io/badge/VS%20Code%20Marketplace-Ctrl--Q%20QVD%20Viewer-blue" alt="VS Code Marketplace"></a>
<a href="https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer"><img src="https://img.shields.io/badge/Source-GitHub-lightgrey" alt="Source"></a>
<a href="https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer"><img src="https://img.shields.io/badge/Project%20Status-Active-brightgreen" alt="Project Status: Active"></a>
<a href="https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green" alt="License: MIT"></a>
<a href="https://github.com/sponsors/ptarmiganlabs"><img src="https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?logo=githubsponsors" alt="Sponsor Ptarmigan Labs on GitHub"></a>
</p>

<p align="center">
<a href="https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer">VS Code Marketplace</a> ·
<a href="https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/discussions">Questions</a> ·
<a href="https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues">Report a bug</a> ·
<a href="https://github.com/sponsors/ptarmiganlabs">❤️ Sponsor</a>
</p>

A Visual Studio Code extension for viewing and exporting Qlik Sense and QlikView QVD files. View
data, metadata, schema, lineage and data profiles directly within VS Code. Designed for Qlik
developers, admins and data engineers.

## ❤️ Support the project

Ctrl-Q QVD Viewer is free and open source, under the MIT licence. If you use it, please consider sponsoring its development: sponsorships pay for maintenance, bug fixes and new features, and keep the project going.

**[❤️ Sponsor Ptarmigan Labs on GitHub](https://github.com/sponsors/ptarmiganlabs)**

Other ways to help:

- ⭐ **Star the repository**: it helps others find the project.
- 💬 **Share your feedback** in [Discussions](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/discussions): tell us how you use it.
- 🐛 **Report issues** in [Issues](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues).
- 🍴 **Contribute**: pull requests are welcome.

_Maintained by [Göran Sander](https://github.com/mountaindude) and supported by [Ptarmigan Labs](https://ptarmiganlabs.com)._

---

## Features

- **View QVD Files**: Open and view QVD files created by Qlik Sense or QlikView
- **Display Metadata**: View comprehensive metadata about QVD files including:
  - File creation information
  - Table creator details
  - Total number of records
  - Field definitions with types, symbols, and technical details
  - Lineage information (if available in the QVD file)
- **Data Browsing**: Page through every row of a QVD, however large, in a formatted table. The viewer reads one page at a time, wherever it is in the file, so a file of 30 million rows opens as quickly as a small one
- **Data Profiling**: Analyze value distributions in your QVD fields ([detailed documentation](docs/PROFILING.md))
  - Select 1-3 fields for comparison
  - View frequency distributions in interactive bar charts
  - **Statistical Analysis for Numeric Fields** (Beta):
    - Descriptive statistics (min, max, mean, median, mode, sum, count)
    - Spread measures (standard deviation, variance, range, IQR)
    - Distribution metrics (quartiles, percentiles, skewness, kurtosis)
    - Outlier detection using 1.5 × IQR method
    - Histogram visualization for numeric distributions
  - **Temporal Analysis for Date/Time Fields** (Beta):
    - Automatic detection of date, timestamp, and time fields
    - Time range analysis (earliest, latest, span, missing values)
    - Temporal pattern detection (daily, weekly, monthly, quarterly, yearly)
    - Distribution visualizations across different time granularities
    - Gap detection and time series continuity analysis
  - **String Analysis for Text Fields** (Beta):
    - String length analysis (min, max, average, distribution)
    - Pattern detection (email, phone, URL, numeric patterns)
    - Character composition analysis (letters, digits, special characters)
    - Whitespace and formatting detection (leading/trailing, multiple spaces)
    - Empty string and null value analysis
  - **Data Quality Assessment**: A 0-100 quality score per field, with color-coded indicators and recommendations
  - See detailed value counts and percentages in sortable tables
  - Export profiling results as Qlik .qvs scripts for further analysis
  - Automatic warning for large files before loading all data
  - Open results as Markdown or Visual Analysis in separate windows
  - **Note**: All analysis features (statistical, temporal, string) are in beta and subject to refinement
- **Export Data**: Export QVD data to multiple formats:
  - **Apache Arrow** - High-performance columnar format for analytics (Beta)
  - **Avro** - Compact binary format with schema evolution support (Beta)
  - **CSV** - Comma-separated values for universal compatibility
  - **Excel** - Microsoft Excel (.xlsx) with styled headers
  - **JSON** - JavaScript Object Notation with pretty formatting
  - **Parquet** - Apache Parquet for efficient columnar storage
  - **PostgreSQL** - SQL script for PostgreSQL database import (Beta)
  - **Qlik Sense Inline Script** - Qlik load script with inline table (with row limit selection)
  - **SQLite** - Portable database file with SQL query support (Beta)
  - **XML** - Extensible markup language for enterprise systems
  - **YAML** - Human-readable structured data format
- **Configurable Page Size**: Choose how many rows a page shows (default: 100, range: 10-1,000), in Settings or below the table
- **About Panel**: Version information, a feature overview, help links and links to the other Ptarmigan Labs tools
- **Help from Inside VS Code**: A **❓ Help** button in the viewer, and commands that open this guide, ask a question or report a bug. See [Getting Help](#getting-help)
- **Extension Logs**: An output channel that shows what the extension did, for troubleshooting
- **Read-Only Access**: Safe viewing without modifying original QVD files

## Part of the Ptarmigan Labs tools

Ctrl-Q QVD Viewer is one of a set of free, open source tools for Qlik Sense and QlikView developers and admins, all MIT licensed and all sponsored by [Ptarmigan Labs](https://ptarmiganlabs.com). See them all at [ptarmiganlabs.com/products](https://ptarmiganlabs.com/products/).

### The Butler family

- **[Butler](https://butler.ptarmiganlabs.com)**: Reload failure alerts, task scheduling, a key-value store and more for Qlik Sense Enterprise on Windows
- **[Butler SOS](https://butler-sos.ptarmiganlabs.com)**: Real-time operational metrics for client-managed Qlik Sense, for dashboards in Grafana and elsewhere
- **[Butler Sheet Icons](https://butler-sheet-icons.ptarmiganlabs.com)**: Automatic sheet icons (thumbnails) for client-managed Qlik Sense and Qlik Cloud

### Ctrl-Q

- **[Ctrl-Q](https://ctrl-q.ptarmiganlabs.com)**: Automate Qlik Sense Enterprise on Windows admin tasks from the command line
- **[Ctrl-Q QVD Viewer](https://ptarmiganlabs.com/products/ctrl-q-qvd-viewer/)** (this extension): View and export QVD files in VS Code

### The .qs library: Qlik Sense extensions

Extensions for both client-managed Qlik Sense and Qlik Cloud:

- **[Onboard.qs](https://ptarmiganlabs.com/products/onboard-qs/)**: Interactive onboarding tours for Qlik Sense apps, no coding required
- **[HelpButton.qs](https://ptarmiganlabs.com/products/helpbutton-qs/)**: A configurable, context-aware help button in the Qlik Sense app toolbar
- **[Chatbox.qs](https://ptarmiganlabs.com/products/chatbox-qs/)** (pre-release): Chat-style conversations from the Qlik Sense data model
- **[QvsView.qs](https://ptarmiganlabs.com/products/qvsview-qs/)** (pre-release): A read-only Qlik load script viewer with syntax highlighting

### More tools

- **[qvdjs](https://ptarmiganlabs.com/products/qvdjs/)**: Read and write QVD files from Node.js. This extension reads QVD files with it
- **[qs-jwt](https://qs-jwt.ptarmiganlabs.com)**: Create JWTs for Qlik Sense Enterprise on Windows and Qlik Cloud
- **[qs-log-scanner](https://ptarmiganlabs.com/products/qs-log-scanner/)**: A terminal UI for exploring Qlik Sense log events sent over UDP

## Getting Started

### Requirements

- **Visual Studio Code 1.105 or later**, released in October 2025. The extension runs in VS Code on Windows, macOS and Linux.

The extension supports the VS Code releases of at least the last 12 months. Once a quarter, its minimum moves up to the newest VS Code release that is at least 12 months old. An older VS Code keeps the last version of the extension that supports it, which the Marketplace offers it on its own.

VS Code 1.101 and 1.102 can't install this version. The Marketplace offers them version 1.4.0 instead, which can't open any QVD file on Windows 11 24H2 and later or on Windows Server 2025. There each file fails with "the file was replaced by a different one after it was checked". The Node.js those versions of VS Code run extensions on gets a file's volume wrong when it looks the file up by name, so the check that the file opened is the file found sees two different files. If you see that message:

- **Update VS Code** (**Help → Check for Updates**), and then the extension.
- **If you can't update VS Code**, install version 1.3.2 instead, which opens QVD files there: in the Extensions view, open the extension's gear menu, choose **Install Specific Version…**, and pick 1.3.2. Then turn off auto-update for the extension in that menu, so that VS Code doesn't bring back 1.4.0.

### Quick Start (3 Steps)

1. **Install the Extension**

   - Open VS Code
   - Go to Extensions (`Ctrl+Shift+X` or `Cmd+Shift+X` on Mac)
   - Search for "Ctrl-Q QVD Viewer" or just "QVD"
   - Select the extension, click "Install"

2. **Open a QVD File**

   - Click on any `.qvd` file in your workspace

3. **Start Viewing**
   - The QVD file will open and automatically show a data preview, with schema, metadata and lineage information in separate tabs

That's it! You're ready to view QVD files in VS Code. If you get stuck, see [Getting Help](#getting-help).

### First-Time Setup: Setting Default Editor

When you open your first QVD file, VS Code might show this dialog:

> ⚠️ **"There are multiple default editors available for the resource."**
>
> - **Configure Default** | **Keep Ctrl-Q QVD Viewer**

**What does this mean?**

This dialog appears when multiple extensions can handle `.qvd` files. VS Code needs to know which one to use by default.

Some XML viewers can view QVD files since they are partly XML-based, but they won't be able to preview the actual data and metadata properly like Ctrl-Q QVD Viewer does.

**What should you do?**

Choose one of these options:

- **Click "Keep Ctrl-Q QVD Viewer"** _(Recommended)_

  - Uses this extension to open QVD files
  - You can always change this later
  - This is the quickest option to get started

- **Click "Configure Default"**
  - Opens settings to choose your preferred editor
  - Select "Ctrl-Q QVD Viewer" from the list
  - This sets it as the permanent default

**Tip:** If you accidentally choose the wrong editor, you can always:

1. Right-click on any `.qvd` file
2. Select "Open With..."
3. Choose "Ctrl-Q QVD Viewer"
4. Check "Configure default editor for '\*.qvd'..." to make it permanent

### Changing Settings (Optional)

By default, a page of the Data tab shows 100 rows. Pick another page size below the table, or change the default:

1. Open Settings: File → Preferences → Settings (or `Ctrl+,`)
2. Search for "Ctrl-Q QVD"
3. Find "Ctrl-Q QVD Viewer: Page Size"
4. Adjust the value (10-1,000 rows)

## Installation

### From the VS Code Marketplace

Install [Ctrl-Q QVD Viewer](https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer) from the Marketplace, or search for "Ctrl-Q QVD Viewer" in VS Code's Extensions view, as in [Quick Start](#quick-start-3-steps).

### From VSIX (Local Installation)

1. Clone this repository
2. Install dependencies: `npm install`
3. Build and package the extension: `npx vsce package`. This runs the production build (`npm run package`) and writes a `.vsix` file to the project root
4. Install in VS Code: in the Extensions view, open the `...` menu, choose **Install from VSIX...** and pick the `.vsix` file

### From Source (Development)

See [Development](#development) section below.

## Usage

### Opening QVD Files

There are two ways to open a QVD file:

1. **From File Explorer**: Click on any `.qvd` or `.QVD` file in the VS Code Explorer sidebar
2. **Using Command Palette**:
   - Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
   - Type "Open QVD File" and select the command
   - Choose a QVD file from the file picker

### Commands

The extension adds these commands to the Command Palette:

- **QVD: Open QVD File**: Pick a QVD file and open it in the viewer
- **QVD: About**: Show the About panel, also opened by the **ℹ️ About** button in the viewer
- **QVD: Show Extension Logs**: Show the extension's output channel, which helps when something goes wrong
- **QVD: Open Documentation**: Open this guide in the browser, as the **❓ Help** button in the viewer does
- **QVD: Ask a Question**: Open [GitHub Discussions](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/discussions)
- **QVD: Report Issue**: Report a bug with VS Code's issue reporter, which adds the VS Code, OS and extension versions itself

The viewer's **⚙️ Settings** button opens the extension's settings.

### What You'll See

The extension displays QVD files in five tabs. The Data, Schema, File Metadata and Lineage tabs each have a search box that filters what the tab shows.

#### 1. Data

A table of the file's rows, with all its columns in file order, a page at a time. Go to any page of the file, the last one included: only the rows of the page shown are read.

Search and sort cover every row of the file. Type in the search box to see only the rows with a cell that holds the text, in any case. Click a column's header to sort every row by it: numbers and dates by value, text as your language sorts it, and empty cells last. A large file takes a while to search or sort, so a bar shows how far it has got, with a Cancel button. Paging through the result is then as quick as before.

The first page of a large file takes a few seconds, because the viewer reads each field's values once. A bar below the tabs shows how far it has got, with a Cancel button. Later pages take milliseconds.

Its search box searches the page shown, not the whole file. Right-click a cell to copy its value.

#### 2. Field Information / Schema

Each field shows:

- Field name
- Number of unique values (symbols)
- Tags, such as `$numeric`, `$integer`, `$text`, `$date` or `$timestamp`, which say what kind of values the field holds
- Number format, the only type a QVD stores for a field: `INTEGER`, `REAL`, `MONEY`, `DATE`, `TIME`, `TIMESTAMP` or, most often, `UNKNOWN`, and its format string, if any
- Comment (if any)
- Where its values are stored in the file: offset, length, bit offset, bit width and bias

#### 3. File Metadata

- Qlik Sense or QlikView document that created the QVD
- Creation date and time (UTC)
- Table name and creator details
- Total number of records
- Comments (if any)
- Tags (if any)
- ...and more

#### 4. Lineage Information

Where the data in the QVD came from, as Qlik recorded it: a list of entries, each with a `Discriminator` (the source, such as a file path, a database connection, `INLINE`, or a `STORE` into another file) and a `Statement` (the SQL statement that read a database source, often empty for other sources).

#### 5. Data Profiling

Analyze value distributions for selected fields to understand data patterns and frequency.

**How to Use Profiling:**

1. Navigate to the **📊 Profiling** tab. At its top, a **📦 QVD File Structure** chart shows how much of the file its header, symbol tables and index table take
2. Tick the checkboxes of 1-3 fields in the field selector
3. Click **"▶️ Run Profiling"** to analyze the data
4. View results for each field including:
   - **Basic Statistics**: Total rows, unique values, NULL/empty count, frequency distribution
   - **Statistical Analysis** (for numeric fields, Beta): Descriptive statistics, spread measures, distribution metrics, outlier detection, and histogram visualization
   - **Temporal Analysis** (for date/time fields, Beta): Time range analysis, temporal patterns, distribution across time granularities, and gap detection
   - **String Analysis** (for text fields, Beta): Length analysis, pattern detection (email, phone, URL), character composition, and whitespace/formatting detection
   - **Interactive Chart**: Bar chart showing top 20 most frequent values
   - **Data Quality Assessment**: A quality score with color-coded indicators and recommendations
   - **Detailed Table**: Complete distribution with values, counts, and percentages

**Features:**

- **Field Comparison**: Compare value distributions across up to 3 fields simultaneously
- **Automatic Analysis Type Detection**: The extension automatically applies the appropriate analysis based on field content (numeric, temporal, or string)
- **Visual Analysis**: Interactive charts powered by Chart.js for clear data visualization
- **Export to QVS**: The **💾 Export to QVS Script** button generates a Qlik .qvs script with the frequency tables, to load into Qlik Sense for further analysis. You choose the delimiter and how many values per field to include (top 20, 100, 1,000, 10,000 or all)
- **Large File Warning**: Automatic warning when profiling files with more than 100,000 rows, as all data must be loaded into memory

**Note:**

- Profiling loads the entire QVD file into memory. For very large files (>100,000 rows), you'll receive a warning before proceeding.
- All analysis features (statistical, temporal, string) are in beta and subject to change and refinement based on user feedback.

### Exporting Data

The Ctrl-Q QVD Viewer allows you to export QVD data to various formats for further analysis or integration with other tools.

#### How to Export

1. Open a QVD file in the viewer
2. Click the **"📤 Export"** button in the top-right corner
3. Select your desired format from the dropdown menu (sorted alphabetically):
   - **Export to Arrow** - High-performance columnar format for analytical workloads (Beta)
   - **Export to Avro** - Binary format with schema for Hadoop/Kafka ecosystems (Beta)
   - **Export to CSV** - Universal text format, compatible with Excel and most data tools
   - **Export to Excel** - Native Excel format (.xlsx) with formatted headers
   - **Export to JSON** - Structured format ideal for web applications and APIs
   - **Export to Parquet** - Efficient columnar format for big data and analytics
   - **Export to PostgreSQL** - SQL script for importing data into PostgreSQL databases (Beta)
   - **Export to Qlik Inline Script** - Qlik Sense load script with inline table
   - **Export to SQLite** - Self-contained database file with SQL support (Beta)
   - **Export to XML** - Structured markup for enterprise integration
   - **Export to YAML** - Human-readable format for configuration and data exchange
4. For **Qlik Inline Script** and **PostgreSQL** exports, you'll be prompted to select the number of rows, counted from the first:
   - Choose from predefined options: 100, 500, 1,000, 5,000, 10,000, or All rows (the prompt shows how many there are)
   - Or choose **Custom...** and enter a number, from 1 up to the number of rows in the file
   - **Qlik Inline Script** then asks for the delimiter: tab, pipe, comma, semicolon, or auto-detect. The `qlikInlineDelimiter` setting picks the default
   - **PostgreSQL** then asks whether to include a `CREATE TABLE` statement. If so, it asks for the table name (default `qvd_data`) and whether to drop an existing table of that name first
5. For **Parquet**, **Avro**, **Arrow**, **SQLite** and **PostgreSQL** exports of a QVD with timestamps, you'll be asked which time zone they were read in. Keep **No time zone** to export them as the wall clocks the QVD holds (see Export Details)
6. Choose the destination folder and file name in the save dialog
7. Click "Save" to complete the export

#### Export Details

- **All data is exported**: The export includes all rows from the QVD file, not just the preview data shown in the viewer (except for Qlik Inline Script and PostgreSQL where you can limit rows)
- **Automatic schema inference**: Data types are automatically detected and preserved in supported formats (Parquet, Excel, Avro, Arrow, SQLite, PostgreSQL)
- **Codes stay as Qlik shows them**: text becomes a number only when it is a plain decimal such as `42`, `-7` or `3.14`, with at most 15 significant digits. Codes such as `0901`, `000000`, `1e3` and `8E5597` stay text. So do blank cells. Earlier versions read them as numbers, so `0901` came out as `901` and a blank cell as `0`. In Parquet, Avro, Arrow, SQLite and PostgreSQL, a blank cell in a column of numbers is written as NULL, and in Excel as an empty cell. A column holding an integer beyond 2^53 gets a floating-point type
- **Dates and timestamps are dates in formats that have them**: Parquet, Avro, Arrow, SQLite, PostgreSQL and Excel write a field of dates or timestamps as such. That is a field tagged `$date` or `$timestamp`, or one in which every value is a date whose text Qlik shows. A field holds timestamps when it is tagged `$timestamp`, when its text shows a time of day, even at midnight, or when any value exported has one, even where Qlik shows only the day. Otherwise it holds dates. They are wall clocks with no time zone, as in the QVD: Parquet `DATE` or `TIMESTAMP` with `isAdjustedToUTC=false`, Avro `date` or `local-timestamp-millis`, Arrow `Date32` or a timestamp with no time zone, PostgreSQL `DATE` or `TIMESTAMP`, and text such as `2016-01-13 06:15:00` in SQLite. Excel formats them as `yyyy-mm-dd` or `yyyy-mm-dd hh:mm:ss`, with milliseconds where they have them, and writes a column with a date before 1900-03-01, which Excel can't show, as text. CSV, JSON, YAML, XML and Qlik inline write the text Qlik shows, as the viewer does. Earlier versions wrote every date as that text
- **Timestamps can be exported as the instants they were**: nothing in a QVD says which time zone its timestamps were read in. When the rows to export hold timestamps, an export to Parquet, Avro, Arrow, SQLite or PostgreSQL asks for that zone. **No time zone**, the default, writes the wall clocks as above. **UTC** is for timestamps that already are UTC, as Qlik's `UTC()` gives them, where `Now()` gives local time. This computer's zone is offered too, though the QVD's may be another, and **Other time zone…** lists every zone VS Code knows. The `exportTimeZone` setting names the zone offered first. Given a zone, the export writes each timestamp as the instant it was: Parquet `TIMESTAMP` with `isAdjustedToUTC=true`, which pyarrow reads as `timestamp[ms, tz=UTC]`, Avro `timestamp-millis`, Arrow a timestamp in that zone, PostgreSQL `TIMESTAMPTZ` with the wall clock and its offset, such as `2016-01-13 06:15:00-06`, and SQLite UTC text, such as `2016-01-13 12:15:00Z`. Dates have no time zone and stay dates. Excel has no time zones, so it writes the wall clocks, as the text formats do
- **Daylight saving time**: where a zone's clocks went forward, a timestamp in the time they skipped never showed on them. It is moved forward past that time, as 02:30 on 2016-03-13 in America/Chicago becomes 03:30 CDT, 08:30 UTC. Where the clocks went back, a timestamp in the time they showed twice is taken as the first, as 01:30 on 2016-11-06 becomes 01:30 CDT, 06:30 UTC. That is the rule of Temporal, java.time and RFC 5545. The message after the export says how many timestamps were moved or taken as the first, and the output log lists the first few of each field. Timestamps in skipped time suggest that they weren't read in the zone named
- **CSV files start with the header row**: the QVD's field names, in QVD order, even when there are no rows. Every value is quoted, and the file is UTF-8. Earlier versions wrote six lines starting with `#` before the header row. A load that skipped them, such as `header is 6 lines` in Qlik or `skiprows=6` in pandas, must stop doing so, or it will skip the first rows of data
- **CSV files are safe to open in a spreadsheet**: text that Excel, LibreOffice or Google Sheets would run as a formula, such as `=HYPERLINK(…)`, gets an apostrophe in front. Numbers such as `-5`, and text such as `+46 70 123 45 67` that only looks like one, are left alone. The `csvEscapeFormulas` setting turns this off
- **Excel files hold every row**: a sheet holds at most 1,048,576 rows, so past 1,048,575 rows below the header row an export continues on sheets named `Data 2`, `Data 3` and so on, each with the header row
- **Beta formats**: Some export formats are marked as Beta, indicating they are fully functional but may receive additional enhancements based on user feedback
- **Progress notification**: You'll see a confirmation message with an option to open the folder containing the exported file

## Extension Settings

This extension contributes the following settings:

- `ctrl-q-qvd-viewer.pageSize`: Rows a page of the Data tab shows when a QVD opens (default: 100, min: 10, max: 1000). The page size can also be changed below the table
- `ctrl-q-qvd-viewer.maxPreviewRows`: No longer used, since the Data tab reads one page at a time. Use `pageSize` instead
- `ctrl-q-qvd-viewer.qlikInlineDelimiter`: The delimiter offered first when exporting a Qlik inline load script: `tab`, `pipe`, `comma`, `semicolon` or `auto-detect` (default: `tab`). Each export can pick another
- `ctrl-q-qvd-viewer.csvEscapeFormulas`: Put an apostrophe before CSV text that a spreadsheet would run as a formula (default: true). Turn it off if the files are only read by programs
- `ctrl-q-qvd-viewer.csvByteOrderMark`: Start CSV files with a UTF-8 byte order mark, which Excel on Windows needs to show å, ä, ö and other non-ASCII text (default: false). Python's `csv` module then reads the mark as part of the first column name, unless the file is opened with `encoding="utf-8-sig"`
- `ctrl-q-qvd-viewer.exportTimeZone`: The time zone a QVD's timestamps were read in, offered first when an export asks for one: an IANA zone such as `America/Chicago`, `UTC`, an alias such as `US/Central`, or an offset such as `-06:00` (default: empty, for no time zone). An export that would use a zone VS Code doesn't know is refused

To change these settings:

1. Go to File → Preferences → Settings (or `Ctrl+,`)
2. Search for "Ctrl-Q QVD"
3. Adjust the value you want to change

## Getting Help

- **This guide**: the viewer's ❓ **Help** button opens it, as does **QVD: Open Documentation** in the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac)
- **Questions**: ask in [GitHub Discussions](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/discussions), or run **QVD: Ask a Question**
- **Bugs**: run **QVD: Report Issue**. It opens VS Code's issue reporter with this extension picked, which adds the VS Code, OS and extension versions itself. You can also [open an issue on GitHub](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/new/choose), with the bug report form. A page that says why a file couldn't be shown has a **Report Issue** button too, when the cause may be a bug
- **Logs**: **QVD: Show Extension Logs** shows what the extension did. Lines from it around the problem help a bug report. Issues and discussions are public, so leave out data, file names and paths you can't share
- **About**: the viewer's ℹ️ **About** button, or **QVD: About**, has the same links and the extension's version

## Development

This section provides a quick overview for developers. For detailed information, see the following documentation:

- **[BUILD.md](docs/BUILD.md)** - Comprehensive build and development guide including prerequisites (Node.js 22 or later), setup, testing, and debugging
- **[BUNDLING.md](docs/BUNDLING.md)** - Extension bundling with esbuild, build scripts, and optimization details
- **[TESTING.md](docs/TESTING.md)** - The test strategy and how to run the tests
- **[CI_CD.md](docs/CI_CD.md)** - CI/CD setup with GitHub Actions, automated testing, and release workflows
- **[PUBLISHING.md](docs/PUBLISHING.md)** - Publishing to VS Code Marketplace, including account setup and deployment
- **[SECURITY_SCANNING.md](docs/SECURITY_SCANNING.md)** - Security scanning before the extension is published
- **[VSCODE_SUPPORT.md](docs/VSCODE_SUPPORT.md)** - Which VS Code versions the extension supports, and how the minimum moves
- **[PAGINATION.md](docs/PAGINATION.md)** - How the Data tab reads a QVD one page at a time
- **[PROFILING.md](docs/PROFILING.md)** - The profiling and data quality features in detail
- **[QVD_FORMAT.md](docs/QVD_FORMAT.md)** - The QVD file format

### Test Data

Sample QVD files are provided in the `test-data/` directory for testing. You can also create your own test QVD files by exporting data from Qlik Sense or QlikView.

For more details on building, testing, and packaging, see **[BUILD.md](docs/BUILD.md)**.

## Known Issues

- Profiling and exports still read the whole file. On very large QVDs they can be refused for memory, with a message that says so
- The extension currently provides read-only access to QVD files

## Contributing

Contributions are welcome! Report bugs in [GitHub Issues](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues), ask questions in [GitHub Discussions](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/discussions), and send pull requests.

## License

MIT. See the [LICENSE](LICENSE) file for details.

---

**Part of the Butler, Ctrl-Q and .qs family of open source tools for Qlik Sense and QlikView, sponsored by [Ptarmigan Labs](https://ptarmiganlabs.com)**  
Learn more at [ptarmiganlabs.com/products](https://ptarmiganlabs.com/products/)
