<h1 align="center">Ctrl-Q QVD Viewer</h1>

<h2 align="center">A powerful Visual Studio Code extension for viewing and exporting Qlik Sense and QlikView QVD files.<br><br>
View data, metadata, schema, and lineage information directly within VS Code.</h2>

<h4 align="center">Designed for Qlik developers, admins and data engineers.<br>
Open source with a permissive MIT license.<br>
</h2>

<p align="center">
<a href="https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer"><img src="https://img.shields.io/badge/Source---" alt="Source"></a>
<a href="https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer"><img src="https://img.shields.io/badge/Project%20Status-Active-brightgreen" alt="Project Status: Active"></a>
</p>

---

**Sponsored by [Ptarmigan Labs](https://ptarmiganlabs.com)**

## Features

- **View QVD Files**: Open and view QVD files created by Qlik Sense or QlikView
- **Display Metadata**: View comprehensive metadata about QVD files including:
  - File creation information
  - Table creator details
  - Total number of records
  - Field definitions with types, symbols, and technical details
  - Lineage information (if available in the QVD file)
- **Data Preview**: View sample data from QVD files in a formatted table with pagination
- **Data Profiling**: Analyze value distributions in your QVD fields ([detailed documentation](docs/PROFILING.md))
  - Select 1-3 fields for comparison
  - View frequency distributions in interactive bar charts
  - See detailed value counts and percentages in sortable tables
  - Export profiling results as Qlik .qvs scripts for further analysis
  - Automatic warning for large files before loading all data
  - Open results as Markdown or Visual Analysis in separate windows
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
- **Configurable Display**: Customize the number of rows to load (default: 5,000, range: 100-100,000)
- **About Panel**: Access information about the Butler family of tools
- **Read-Only Access**: Safe viewing without modifying original QVD files

## About Ctrl-Q

Ctrl-Q is a set of sibling tools to the **Butler family** of tools for Qlik Sense and QlikView developers and admins.
The Butler suite provides a best-in-class set of utilities for managing, monitoring, and enhancing Qlik environments, while Ctrl-Q focuses on command-line and developer-centric tools.

### The Butler Family

- **[Butler](https://butler.ptarmiganlabs.com)**: Core monitoring and automation tool for Qlik Sense Enterprise
- **[Butler SOS](https://butler-sos.ptarmiganlabs.com)**: Real-time monitoring and metrics for Qlik Sense
- **[Butler CW](https://butler-cw.ptarmiganlabs.com)**: Cache warming utility for Qlik Sense apps
- **[Ctrl-Q](https://ctrl-q.ptarmiganlabs.com)**: Command-line tool for Qlik Sense administration and DevOps
- **Ctrl-Q QVD Viewer** (this extension): View QVD files directly in VS Code

Learn more about the Butler family at [https://ptarmiganlabs.com/the-butler-family/](https://ptarmiganlabs.com/the-butler-family/)

## Getting Started

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

That's it! You're ready to view QVD files in VS Code.

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

By default, the extension loads 5,000 rows of data for preview and pagination. To change this:

1. Open Settings: File → Preferences → Settings (or `Ctrl+,`)
2. Search for "Ctrl-Q QVD"
3. Find "Ctrl-Q QVD Viewer: Max Preview Rows"
4. Adjust the value (100-100,000 rows)

## Installation

### From VSIX (Local Installation)

1. Clone this repository
2. Install dependencies: `npm install`
3. Package the extension: `npm run package` (or use `vsce package`)
4. Install in VS Code: Extensions → Install from VSIX

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

### What You'll See

The extension displays QVD files in five tabs:

#### 1. Data Preview

A formatted table with pagination controls showing the loaded rows with all columns from the QVD file.

#### 2. Field Information / Schema

Each field shows:

- Field name
- Data type (INTEGER, TEXT, etc.)
- Number of unique symbols
- Tags
- ...and other technical details

#### 3. File Metadata

- Qlik Sense or QlikView document that created the QVD
- Creation date and time (UTC)
- Table name and creator details
- Total number of records
- Comments (if any)
- Tags (if any)
- ...and more

#### 4. Lineage Information

The lineage is an array of objects, each with `Discriminator` and `Statement` properties.

- Discriminator
- Statement

#### 5. Data Profiling

Analyze value distributions for selected fields to understand data patterns and frequency.

**How to Use Profiling:**

1. Navigate to the **📊 Profiling** tab
2. Select 1-3 fields from the field selector (use Ctrl/Cmd+Click for multiple selections)
3. Click **"▶️ Run Profiling"** to analyze the data
4. View results for each field including:
   - **Statistics**: Total rows, unique values, NULL/empty count
   - **Interactive Chart**: Bar chart showing top 20 most frequent values
   - **Detailed Table**: Complete distribution with values, counts, and percentages

**Features:**

- **Field Comparison**: Compare value distributions across up to 3 fields simultaneously
- **Visual Analysis**: Interactive charts powered by Chart.js for clear data visualization
- **Export to QVS**: Generate Qlik .qvs scripts containing frequency data tables that can be loaded into Qlik Sense for further analysis
- **Large File Warning**: Automatic warning when profiling files with more than 100,000 rows, as all data must be loaded into memory

**Note:** Profiling loads the entire QVD file into memory. For very large files (>100,000 rows), you'll receive a warning before proceeding.

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
4. For **Qlik Inline Script** and **PostgreSQL** exports, you'll be prompted to select the number of rows:
   - Choose from predefined options: 10, 100, 1,000, 10,000, or All rows
   - Or enter a custom value (validated as a positive integer)
5. Choose the destination folder and file name in the save dialog
6. Click "Save" to complete the export

#### Export Details

- **All data is exported**: The export includes all rows from the QVD file, not just the preview data shown in the viewer (except for Qlik Inline Script and PostgreSQL where you can limit rows)
- **Automatic schema inference**: Data types are automatically detected and preserved in supported formats (Parquet, Excel, Avro, Arrow, SQLite, PostgreSQL)
- **Beta formats**: Some export formats are marked as Beta, indicating they are fully functional but may receive additional enhancements based on user feedback
- **Progress notification**: You'll see a confirmation message with an option to open the folder containing the exported file

## Extension Settings

This extension contributes the following settings:

- `ctrl-q-qvd-viewer.maxPreviewRows`: Maximum number of rows to load from the QVD file for preview and pagination (default: 5000, min: 100, max: 100000)

To change this setting:

1. Go to File → Preferences → Settings (or `Ctrl+,`)
2. Search for "Ctrl-Q QVD"
3. Adjust the "Max Preview Rows" value

## Development

This section provides a quick overview for developers. For detailed information, see the following documentation:

- **[BUILD.md](docs/BUILD.md)** - Comprehensive build and development guide including prerequisites, setup, testing, and debugging
- **[BUNDLING.md](docs/BUNDLING.md)** - Extension bundling with esbuild, build scripts, and optimization details
- **[CI_CD.md](docs/CI_CD.md)** - CI/CD setup with GitHub Actions, automated testing, and release workflows
- **[PUBLISHING.md](docs/PUBLISHING.md)** - Publishing to VS Code Marketplace, including account setup and deployment

### Test Data

Sample QVD files are provided in the `test-data/` directory for testing. You can also create your own test QVD files by exporting data from Qlik Sense or QlikView.

For more details on building, testing, and packaging, see **[BUILD.md](docs/BUILD.md)**.

## Known Issues

- Large QVD files may take long to load; use the maxPreviewRows setting to limit display
- The extension currently provides read-only access to QVD files

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Sponsorship

This extension is sponsored by [Ptarmigan Labs](https://ptarmiganlabs.com), creators of the Butler suite of tools for Qlik Sense and QlikView.

## License

MIT. See LICENSE file for details.

---

**Part of the Butler and Ctrl-Q family of tools for Qlik Sense and QlikView**  
Learn more at [butler.ptarmiganlabs.com](https://butler.ptarmiganlabs.com) | [ptarmiganlabs.com](https://ptarmiganlabs.com)
