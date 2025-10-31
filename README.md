<p align="center"><img src="media/ctrl-q-logo-no-text.png" width="200"><p>

<h1 align="center">Ctrl-Q QVD Viewer</h1>

<h2 align="center">A powerful Visual Studio Code extension for viewing and exporting Qlik Sense and QlikView QVD files.<br><br>
View data, metadata, schema, and lineage information directly within VS Code.</h2>

<p align="center">
Opening a QVD file and exploring its data, schema, metadata and lineage:

<img src="media/screenshot/ctrl-q-qvd-viewer-in-vs-code-1.gif" width="800">
</p>

<h2 align="center">Designed for Qlik developers and data engineers.<br>
Open source with a permissive MIT license.<br>
</h2>

<p align="center">
<a href="https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer"><img src="https://img.shields.io/badge/Source---" alt="Source"></a>
<a href="https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/actions/workflows/pr-validation.yaml"><img src="https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/actions/workflows/pr-validation.yaml/badge.svg" alt="Build status"></a>
<a href="https://www.repostatus.org/#active"><img src="https://www.repostatus.org/badges/latest/active.svg" alt="Project Status: Active – The project has reached a stable, usable state and is being actively developed." /></a>
<a href="https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer"><img src="https://img.shields.io/visual-studio-marketplace/v/ptarmiganlabs.ctrl-q-qvd-viewer" alt="VS Marketplace Version"></a>
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
- **Export Data**: Export QVD data to multiple formats:
  - **Apache Arrow** - High-performance columnar format for analytics
  - **Avro** - Compact binary format with schema evolution support
  - **CSV** - Comma-separated values for universal compatibility
  - **Excel** - Microsoft Excel (.xlsx) with styled headers
  - **JSON** - JavaScript Object Notation with pretty formatting
  - **Parquet** - Apache Parquet for efficient columnar storage
  - **Qlik Sense Inline Script** - Qlik load script with inline table (with row limit selection)
  - **SQLite** - Portable database file with SQL query support
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
- **[Ctrl-Q](https://ctrl-q.ptarmiganlabs.com)**: Command-line tool for Qlik Sense administration and DevOps
- **[Butler SOS](https://butler-sos.ptarmiganlabs.com)**: Real-time monitoring and metrics for Qlik Sense
- **[Butler CW](https://butler-cw.ptarmiganlabs.com)**: Cache warming utility for Qlik Sense apps
- **Ctrl-Q QVD Viewer** (this extension): View QVD files directly in VS Code

Learn more about the Butler family at [https://ptarmiganlabs.com/the-butler-family/](https://ptarmiganlabs.com/the-butler-family/)

## Getting Started

### Quick Start (3 Steps)

1. **Install the Extension**

   - Open VS Code
   - Go to Extensions (`Ctrl+Shift+X` or `Cmd+Shift+X` on Mac)
   - Search for "Ctrl-Q QVD Viewer"
   - Click "Install"

2. **Open a QVD File**

   - Click on any `.qvd` file in your workspace

3. **Start Viewing**
   - The QVD file will open automatically showing metadata and data preview

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

The extension displays QVD files in three sections:

#### 1. File Metadata

- Creator document name
- Creation date and time (UTC)
- Table creator information
- Total number of records

#### 2. Field Information

Each field shows:

- Field name
- Data type (INTEGER, TEXT, etc.)
- Number of unique symbols
- Bit width for data storage

#### 3. Data Preview

A formatted table with pagination controls showing the loaded rows with all columns from the QVD file.

### Exporting Data

The Ctrl-Q QVD Viewer allows you to export QVD data to various formats for further analysis or integration with other tools.

#### How to Export

1. Open a QVD file in the viewer
2. Click the **"📤 Export"** button in the top-right corner
3. Select your desired format from the dropdown menu (sorted alphabetically):
   - **Export to Arrow** - High-performance columnar format for analytical workloads
   - **Export to Avro** - Binary format with schema for Hadoop/Kafka ecosystems
   - **Export to CSV** - Universal text format, compatible with Excel and most data tools
   - **Export to Excel** - Native Excel format (.xlsx) with formatted headers
   - **Export to JSON** - Structured format ideal for web applications and APIs
   - **Export to Parquet** - Efficient columnar format for big data and analytics
   - **Export to Qlik Inline Script** - Qlik Sense load script with inline table
   - **Export to SQLite** - Self-contained database file with SQL support
   - **Export to XML** - Structured markup for enterprise integration
   - **Export to YAML** - Human-readable format for configuration and data exchange
4. For **Qlik Inline Script** exports, you'll be prompted to select the number of rows:
   - Choose from predefined options: 10, 100, 1,000, 10,000, or All rows
   - Or enter a custom value (validated as a positive integer)
5. Choose the destination folder and file name in the save dialog
6. Click "Save" to complete the export

#### Export Details

- **All data is exported**: The export includes all rows from the QVD file, not just the preview data shown in the viewer (except for Qlik Inline Script where you can limit rows)
- **Automatic schema inference**: Data types are automatically detected and preserved in supported formats (Parquet, Excel, Avro, Arrow, SQLite)
- **Progress notification**: You'll see a confirmation message with an option to open the folder containing the exported file

### Example Output

When you open a QVD file, you'll see:

- File metadata at the top
- Field information with types and statistics
- Data preview in a table format below

## Extension Settings

This extension contributes the following settings:

- `ctrl-q-qvd-viewer.maxPreviewRows`: Maximum number of rows to load from the QVD file for preview and pagination (default: 5000, min: 100, max: 100000)

To change this setting:

1. Go to File → Preferences → Settings (or `Ctrl+,`)
2. Search for "Ctrl-Q QVD"
3. Adjust the "Max Preview Rows" value

## Development

### Prerequisites

- Node.js 22.x or later
- npm 11.x or later
- Visual Studio Code 1.105.0 or later

### Building the Extension

1. Clone the repository:

   ```bash
   git clone https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer.git
   cd ctrl-q-qvd-viewer
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run linting:

   ```bash
   npm run lint
   ```

### Testing the Extension Locally

1. Open the project in VS Code:

   ```bash
   code .
   ```

2. Press `F5` to start debugging

   - This will open a new VS Code window with the extension loaded
   - The extension will be in development mode

3. In the new window:

   - Open a QVD file or use Command Palette → "Open QVD File"
   - The QVD viewer should display the file contents

4. Make changes to the code and reload the extension window (`Ctrl+R` or `Cmd+R`)

### Creating a Test QVD File

A sample QVD file is provided in `test-data/sample.qvd` for testing the metadata display. To create your own test QVD files, you can:

1. Export data as QVD from Qlik Sense or QlikView
2. Use the qvdjs library programmatically
3. Use other QVD creation tools

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

**Part of the Butler family of tools for Qlik Sense and QlikView**  
Learn more at [butler.ptarmiganlabs.com](https://butler.ptarmiganlabs.com) | [ptarmiganlabs.com](https://ptarmiganlabs.com)
