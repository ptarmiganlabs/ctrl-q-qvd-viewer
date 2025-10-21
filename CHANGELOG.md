# Change Log

All notable changes to the Ctrl-Q QVD Viewer extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## [0.0.1] - 2025-10-20

### Added
- Initial release of Ctrl-Q QVD Viewer for VS Code
- QVD file viewer with custom editor integration
- Metadata display showing:
  - File creation information (creator, date, table creator)
  - Total number of records
  - Field definitions with types and technical details
- Data preview in formatted table
- Configurable row limit (default: 25, range: 1-1000)
- "Open QVD File" command in command palette
- Automatic file association for .qvd and .QVD files
- Read-only viewing mode
- Support for QVD files created by Qlik Sense and QlikView
- Comprehensive documentation (README.md and BUILD.md)
- Automated tests for core functionality
- Part of the Butler family of tools for Qlik Sense
- Sponsored by Ptarmigan Labs

### Technical Details
- Uses qvd4js library for QVD file parsing
- XML metadata extraction using xml2js
- Custom editor provider using VS Code webview API
- Theme-aware styling with VS Code CSS variables
- Error handling for invalid or corrupted files