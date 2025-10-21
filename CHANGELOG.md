# Change Log

All notable changes to the Ctrl-Q QVD Viewer extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## [0.0.2](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v0.0.1...v0.0.2) (2025-10-21)


### Features

* add CI/CD workflows for automated testing, release management, and publishing ([33b5d8a](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/33b5d8a3131bbfd89d86a2b413ce37b8527918fa))


### Bug Fixes

* Fix broken deploy to marketplace ([7f51f93](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/7f51f93ca926886b2fe2173ce27ef0e05fa27d56))
* resolve ESLint warnings and CI test execution issues ([cffe8a0](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/cffe8a02b6217006b54e2d8f0efbcdcecf09fec6))
* Update PR validation workflow to run tests in a virtual display environment ([ff5e238](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/ff5e238fcccf15b7a522995864a13483c889cd93))


### Miscellaneous

* **deps:** update actions/checkout action to v5 ([83f725e](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/83f725e7a7a12887aef23f09e4d9c3036770ad2a))
* **deps:** update actions/checkout action to v5 ([8d7f4ee](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/8d7f4ee6f9e8f81b81240b55904b0c896352fe4f))
* **deps:** update actions/setup-node action to v6 ([66dc561](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/66dc56193e837164cb7fda274f511df9a49b7f87))
* **deps:** update actions/setup-node action to v6 ([206d588](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/206d588c4925a200bd3ba9b8723434b357dd22a5))


### Code Refactoring

* improve code formatting and readability in About Command Registration test ([2c03c45](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/2c03c45feaa901ac293ca745d587efee52aca988))

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
