# Change Log

All notable changes to the Ctrl-Q QVD Viewer extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## [1.6.0](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v1.5.0...v1.6.0) (2026-11-14)


### Features

* **export:** export a QVD of any size, a chunk of rows at a time ([cadda33](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/cadda3394067f466ac4d9b24fdba5ddfbbe299ee))
* **profiling:** read only the profiled fields, a chunk at a time ([ccc7ac0](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/ccc7ac0cf4c536098f6b13debc00d00e70e19992))


### Bug Fixes

* **export:** a failed Parquet or Avro export no longer deletes the file it was to replace ([cadda33](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/cadda3394067f466ac4d9b24fdba5ddfbbe299ee))
* **export:** book the census before it runs, and say when a QVD can't be read ([56bf756](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/56bf756f391d06524f69660ed6f17af83545c6cd))
* **export:** write SQLite exports straight to disk with node:sqlite ([65f863d](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/65f863d77bd20d4d454e0c62441b5e9e23711db6)), closes [#218](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/218)
* **profiling:** count every distinct value, and show the most frequent ([180a52e](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/180a52e70bbaaab29e2f0a48d2b385b06392714a))
* **profiling:** price each profiled field on its own ([3c7bcd4](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/3c7bcd432df9c089dc9cb8b991ba4177ab9d005b)), closes [#162](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/162)
* **profiling:** price profiling by its field, and make it finish on any file ([a2f86f2](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/a2f86f2a17c311a6a6b11480cd77035240e54d97)), closes [#162](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/162)
* **profiling:** stop saying that profiling loads the whole file ([04fa08a](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/04fa08ac523799d46dfbeeed3d09607d4294a25b)), closes [#162](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/162)


### Documentation

* add sponsor section to README ([d1d14dd](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/d1d14dd0145205a855dbf19d108e6f6fe79ffd52))
* how an export reads a QVD a chunk at a time ([1228ef9](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/1228ef970385c91fb501fd06e5c72602902e9836))


### Miscellaneous

* add a Sponsor link to the Marketplace page ([b836a7a](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/b836a7a6332c9bede4615e6ea7486dff95b646ec))
* **release:** list [#216](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/216)'s and [#217](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/217)'s commits in 1.5.0's changelog ([2079d52](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/2079d521b8de855578190acb14e1138418d73e25)), closes [#190](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/190)


### Code Refactoring

* scan several fields at once, and take types and dates a value at a time ([032b019](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/032b0198a167d6e2e23d648af930b407322ca65f))
* **scan:** keep a scan's file open for the next scan of the file ([d84aab4](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/d84aab49ae02a03c94a5433accb40ff63538920b))


### Tests

* compare exports with main's, and measure what exporting costs ([7702673](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/77026737c065b474f7e3406572be6e4ef9a6c8a9))
* **export:** expect the temporary file under the folder's full real path on Windows ([ba4cb22](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/ba4cb22cd95078b8270d2cae05c381312b312663))
* **profiling:** freeze the profiler as the reference for its results ([a9e77fe](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/a9e77fe39c30e99c7806950fbb5121d5060eb3f9))
* write QVDs of any size, and measure what profiling them costs ([f170e51](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/f170e51b1d8576c9acb369a4177d698001eca654)), closes [#162](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/162)

## [1.5.0](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v1.4.3...v1.5.0) (2026-11-13)


### Features

* **help:** find the user guide, questions and bug reports from inside VS Code ([b8825f0](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/b8825f0e69e6c636161d967127b4a3180f4b192c))
* **viewer:** read the Data tab a page at a time, from one open copy of the file ([0363636](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/03636365b80cb68ed20580106d1bcf58931f0a5c)), closes [#190](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/190)
* **viewer:** search and sort every row of the file, with progress and cancel ([e245ab6](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/e245ab665aec750919f89cda87c7881bb9bf6d54)), closes [#190](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/190)


### Bug Fixes

* **about:** list the Ptarmigan Labs tools as the README does ([6b5047e](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/6b5047e65d1b1fb8509358c975b22334c208b321))
* **profiling:** find URLs and email addresses in linear time ([28f9231](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/28f9231a4767425932e695287be8f1db54dc6cf2))
* **viewer:** book a search's rows once, search large files at Enter, refuse huge text sorts early ([e54a02a](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/e54a02afff8d9b6a8c86a28d33ad8aa0a496b918)), closes [#190](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/190)
* **viewer:** check pages against the file the page shows, and run them one at a time ([99b3c17](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/99b3c174f6539c2249e49278e42b7574a9836f55)), closes [#190](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/190)
* **viewer:** show each field's number format in the Schema tab ([d014457](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/d014457e5df31b750a148b87bc1c4b15585a3945))


### Documentation

* check the README against the extension, and list the Ptarmigan Labs tools ([168d6d1](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/168d6d139ad78be93740629f0f1e59a3b5785eae))
* describe the paged Data tab and its page size setting ([757b97c](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/757b97c968dd3d216de72bd56a4a65a6622383e4)), closes [#190](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/190)
* describe whole-file search and sort in the Data tab ([ef970c9](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/ef970c9c0e01e0ea652f8e64d82ccba2bae7b39c)), closes [#190](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/190)


### Miscellaneous

* **github:** add bug report and feature request forms, and send questions to Discussions ([84d18a9](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/84d18a9c01fed2bc7c84002ea9f347648f48459c))


### Tests

* **about:** match the About panel's links by exact address ([90a0eda](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/90a0edad7343723c068870655a9ed3315942da61))

## [1.4.3](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v1.4.2...v1.4.3) (2026-11-13)


### Bug Fixes

* **export:** bound Excel's stalls, and refuse chunk and sheet sizes it can't use ([f02b09a](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/f02b09a6a94ffee4380e04f9c2f20d71337c3676)), closes [#163](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/163)
* **export:** bound PostgreSQL and Qlik stalls, and escape what broke their scripts ([e257cba](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/e257cba9044d4881bb32e2a29f6ef2dff9c92e8d))
* **export:** cap JSON, YAML and XML chunks by cells, and check their size ([f0842bb](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/f0842bb73376fd2fc844d2eb4f967eaae01f6381))
* **export:** insert SQLite exports in one transaction through one statement ([1f5a657](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/1f5a6579a4e9a7b14505d89118871d5539df01cf)), closes [#163](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/163)
* **export:** let Arrow's dictionaries yield, and price their distinct values ([5e112e2](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/5e112e2750d5b89449a0f4803d567e4104a9e814))
* **export:** log Excel's lost backpressure, and abort its waits on a failed file ([a03766f](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/a03766f0dabe7ae06c0aab472a52ca0a2a928652)), closes [#163](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/163)
* **export:** price Arrow's dictionaries from its own columns, before and after the read ([ae6b2f2](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/ae6b2f2f5eed8cf3f1c534d9dc3b4e6124e6cd7b))
* **export:** refuse a SQLite export the computer's memory can't hold, and cap its slices ([523de6c](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/523de6c45bcabaa69efc89db840a6e5795d5db01))
* **export:** write Arrow exports a record batch at a time ([a601527](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/a601527f38392f2d07ebc636151c2a771da143e5)), closes [#163](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/163)
* **export:** write Excel exports as they go, onto more sheets past a sheet's rows ([a85c220](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/a85c220be3abff0bb5d8f52349de72ee4c165044)), closes [#163](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/163)
* **export:** write JSON, YAML and XML a chunk of rows at a time ([899c063](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/899c0635348bad818630abc3a26a32424bad8d98)), closes [#163](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/163)
* **export:** write PostgreSQL and Qlik inline scripts a chunk of rows at a time ([a8c39d3](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/a8c39d3aeeb2624e63b78eb71a1b4fd3a869f24e)), closes [#163](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/163)


### Miscellaneous

* **deps-dev:** bump eslint from 10.13.0 to 10.14.0 in the dev-dependencies group ([8b013b4](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/8b013b46fbd537f1e7244fd7822fdb5282d0bead))

## [1.4.2](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v1.4.1...v1.4.2) (2026-11-07)


### Bug Fixes

* **about, error page:** open the repository's page, and keep forms off the error page ([c615788](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/c615788bfc25e1bdf128ade6728669bce252df67)), closes [#155](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/155)
* **about:** keep a refused link from reshaping the log, and escape by default ([1eae9f3](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/1eae9f327d4c6caf2e38c0d7a2ee51117da6d078)), closes [#155](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/155)
* **about:** log a refused link quoted, on one line, and cut short ([b154968](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/b154968df4679b7f13034d63c44246020894ccee)), closes [#155](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/155)
* **about:** open only https: links, and run only the panel's own script ([ecdf8bb](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/ecdf8bbd2f5d505ba2cd32c1abccb612e7873f88)), closes [#155](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/155)
* **deps:** upgrade qvdjs to 4.0.3 ([804f40c](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/804f40c5dc67a684dd21910392f9c2c1929eb284))
* **viewer:** write every page's HTML with html, and the report's text escaped ([3acc070](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/3acc070da17a45b1dba5bde6573cccc8406a13cf)), closes [#155](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/155) [#161](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/161)
* **viewer:** put a QVD's text into the viewer's pages as text, not markup ([9efa0df](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/9efa0dfbb6d36446e36381e45de0a2a29398687a)), closes [#155](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/155)
* **viewer:** write the profiling cards with a tag that escapes every value ([e27d972](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/e27d97243cbfe950bd06d55bb6a325ee93337ada)), closes [#155](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/155)


### Tests

* **about:** find the repository's link by exact comparison ([c15bd81](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/c15bd8198ff58cea68e3d215bbfeb9ac4dc8f67e)), closes [#155](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/155)
* **escaping:** cut a page's scripts out as the HTML parser does, not by regex ([9690569](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/9690569d41ca8ff08f338ad9940e6ed905df2f03)), closes [#155](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/155)

## [1.4.1](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v1.4.0...v1.4.1) (2026-11-07)


### Bug Fixes

* require VS Code 1.103, so that QVD files open on Windows 11 24H2 ([83497ab](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/83497ab14d121bb0ebc43efdefbe9bd993888d1b)), closes [#191](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/191)
* **viewer:** say why a QVD can't be read, instead of calling it corrupted ([bcae921](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/bcae9211b77297ffebd837a4563b004af9c4c858)), closes [#191](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/191)
* **viewer:** tell the viewer's own failures from the file's ([4a74732](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/4a74732465e070cdbdf3293143bae53afab53111)), closes [#191](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/191)


### Documentation

* tell users who can't update VS Code to install version 1.3.2 ([fca2a9d](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/fca2a9d7ca93d83bd0e9dac7c94dc38aea2661c0)), closes [#191](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/191)


### Tests

* check on Windows too that a CSV export through a link keeps it ([c19a240](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/c19a2404ed25ca2c190e912bc5cfc795944c218c))
* expect EBUSY from a held file, and stop when PowerShell can't hold it ([2da6245](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/2da6245242d128b61ece90eb155f83928acc1e30)), closes [#191](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/191)
* expect the exported file's path as VS Code names it ([f77e4a7](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/f77e4a7a61bd2d4a89ecb98b31c67b718a4665b1))
* look at a page's body up to its scripts, instead of stripping tags ([5c50e21](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/5c50e21c0705b6fbbe327f4c4cdc613864c5943c)), closes [#191](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/191)
* name VS Code 1.103.0, the new minimum, where comments named 1.101.0 ([3dadd81](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/3dadd81bccb3c2fd4958a17a7ab2a11258e9cf00)), closes [#191](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/191)
* read a QVD PowerShell holds open on Windows, and check its page ([f2792a5](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/f2792a5383e690527b6df14905b92209928bc307)), closes [#191](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/191)
* read the taxi QVD within its own folder, not the working directory ([debe08a](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/debe08afb5c54abb5156004ce3ae7b75184e2a58)), closes [#191](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/191)


### Build System

* leave parquetjs's optional LZO codec out of the bundle ([ecb43f7](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/ecb43f752bedff1f2b60ed9da73e084d0752e04e)), closes [#191](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/191)

## [1.4.0](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v1.3.2...v1.4.0) (2026-11-06)


### Features

* Add QVD structure visualization and file size calculation in profiling tab ([cecab7e](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/cecab7ebef43b903b1d98ec68893846da306b013))
* **export:** add a setting for a byte order mark in CSV files ([f34af51](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/f34af51f2ad17277bc6196213db54dff423affb3))
* **export:** say how many timestamps the time zone's DST moved or left ambiguous ([d97e7bc](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/d97e7bc466eb2ce0efd23bfe8f98cc18b750a68c))
* **export:** store timestamps as UTC instants in a time zone the export names ([2f0b36f](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/2f0b36f2b2986fb3e4182bd9aca32e758ab82b96))


### Bug Fixes

* **ci:** publish to the Marketplace with Trusted Publishing instead of a PAT ([e3145d2](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/e3145d261813da0bee25679b92977f7904196d33))
* **deps:** update js-yaml and the test runner, apply compatible security fixes ([b2e77c5](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/b2e77c534cce0f4a329bf2bf39b62edf9444dc60))
* **deps:** update js-yaml to 5.5.0 ([2d6707b](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/2d6707b38112b419b83f93ca91ccb74f9e4880e8))
* **deps:** update Tabulator to 6.7.1 ([af3de34](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/af3de3496206d1394eeb754fe8ee8609d6941c65))
* **deps:** update the bundled export and chart libraries ([97bd04b](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/97bd04b56ea9a7ea67131b1c3db3497985c80cfc))
* **deps:** upgrade qvdjs to 4.0.2 and require VS Code 1.101 ([b2f404c](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/b2f404ce0986389d6e7235dc3852c59da3d13d20))
* **export:** ask for the time zone whenever the rows exported hold a timestamp ([ddaec50](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/ddaec5023d93aae1075176ccc1bcd9a9544547ee))
* **export:** export a QVD's dates and timestamps as dates, not as text ([14b7d33](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/14b7d332af2baa546b61017a9e9f23c081ae0286)), closes [#165](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/165)
* **export:** export a timestamp field named constructor or toString in a time zone ([2775f7e](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/2775f7e6e887c9e2975e27db4d49e921f3576d9b))
* **export:** keep a field tagged $timestamp, or shown with a time of day, as timestamps when every row exported falls at midnight ([516e0e6](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/516e0e6ba7335d3a19282eb243d51d0696e92cb2)), closes [#165](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/165)
* **export:** keep a missing sql.js wasm file from failing every later SQLite export ([3614b12](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/3614b12a5c0922518d698dd23ee72188e71e3220))
* **export:** keep the time of timestamps that Qlik shows as days ([f12200b](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/f12200b882e32c24b41f30c15e9b2500dc878c69))
* **export:** leave blank cells in Excel's numeric columns empty ([1771f6c](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/1771f6c736ddc4e4d6fd0d0d051181a222ecdad8)), closes [#154](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/154)
* **export:** mark Parquet timestamps as having no time zone ([4cd4b90](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/4cd4b9004a7e49ac6ddb32708f543a5581c5d836))
* **export:** price CSV exports by the chunk they write ([7d1a0bb](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/7d1a0bb6d56b73f96ff323085ba491c678ebb632)), closes [#189](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/189)
* **export:** quote YAML text such as 8E5597 that reads as a number ([a5f71c5](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/a5f71c527d3ce35cb90655aabd2f984b3e9265d0)), closes [#154](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/154)
* **export:** replace a file only once its CSV export is complete ([5fb5db2](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/5fb5db20871cbee06687896f9f4829f2cfb16dad))
* **export:** resolve Avro export only after the file is written and closed ([a653108](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/a6531085f3e629267cf91572b467bc9b4127ff0e))
* **export:** ship sql.js's wasm file so SQLite export works in the packaged extension ([b9d6fa7](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/b9d6fa7b08ee2112d2f6c4a7076bf6c11a18bc06))
* **export:** show milliseconds in Excel timestamps that have them ([e8f5959](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/e8f5959dbc730830f04c6d4d6095dde7913fb358)), closes [#165](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/165)
* **export:** start CSV files with the header row, not six comment lines ([9b51328](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/9b5132899f1140fdb2fc12c25b669a45e8a1676f))
* **export:** stop spreadsheets running CSV text as formulas ([6fd2e31](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/6fd2e3109436ee4f111bee9f959a769677191b2e))
* **export:** store integers beyond 2^53 as doubles instead of wrapping ([39101ba](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/39101ba3bc407bcf86e51f10ec9d8a85a746ae33)), closes [#154](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/154)
* **export:** take Avro columns from the first row, as the SQLite export does ([0c9d2b1](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/0c9d2b16b85365dc7d93175f775ea7210cc50ff1))
* **export:** take the CSV header row from the QVD's fields ([9597da1](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/9597da1d13d7532ac1652c643d3e184796b5faf9))
* **export:** write blanks in a numeric column as NULL, keeping its type ([409acd2](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/409acd22bfae389e9e5f41cfd3f9aefb29dd30e0)), closes [#154](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/154)
* **export:** write dates as dates, and timestamps without a time zone ([7438123](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/7438123f5509bcf4a6e0896568eefb3d2f81a569)), closes [#165](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/165)
* **profiling:** bin the histogram in the profiler, from every numeric value ([b8a45a1](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/b8a45a1f109de9c9a5d4b63d6e7c05a6a1a42a57))
* **profiling:** count empty strings once in the fill rate ([7ea9ac1](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/7ea9ac1c7eb7d2b6df2ce09d910e49b1ac32758c)), closes [#157](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/157)
* **profiling:** count text lengths in characters, as Qlik's Len() does ([a238133](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/a2381335b658596c6bad97151a74e700fee8b852))
* **profiling:** find text lengths' minimum and maximum without spreading ([e7b6b3b](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/e7b6b3bd460ae7bbdd50bed811bde46e58307eb1))
* **profiling:** stop penalising nulls twice through the fill rate ([39ac4c8](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/39ac4c842613ad62db75627bdf5cf067ee0ea493)), closes [#157](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/157)
* **profiling:** stop profiling codes and blank text as numbers ([2f75999](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/2f75999a045d259bcad458e8f74a189af4f6ae7e)), closes [#154](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/154)
* **reader:** count significant digits without trailing zeros ([85d107d](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/85d107df9ca6de51feed058ad2934f224a137ae5)), closes [#154](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/154)
* **reader:** keep decimals too small for a double as text, not as 0 ([f08fe91](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/f08fe91d769976ba7972aff72f07db4571ca4491))
* **reader:** keep opening QVDs reached through a symlink with qvdjs 4 ([7278652](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/72786520e014e1b720275492049a7c424fe4d80c))
* **reader:** price every read against the heap left, and give up a closed editor's reads ([7c942ef](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/7c942ef6ecc8c46187219a0d6efa310373a32f9d)), closes [#189](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/189)
* **reader:** price held text, check exports when they start, and validate row limits ([6854b70](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/6854b705c05c54e2ef75fc31801fbed4650a8096)), closes [#189](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/189)
* **reader:** price the Dates an export read builds ([4befa0c](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/4befa0c454b5edf7aada20d7795e084ddaa096ac)), closes [#165](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/165)
* **reader:** read NaN and Infinity stored in a QVD as empty cells ([5f0d54c](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/5f0d54c6255fd7e7e3f25beb1875196f76b259a4)), closes [#154](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/154)
* **reader:** say what didn't fit, and book reads given up while running ([91fbd5d](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/91fbd5d7fa6b2879cb2cf885bf1dc52863d72fdb)), closes [#189](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/189)
* **reader:** stop full and side-by-side QVD reads running the extension host out of memory ([9d79084](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/9d7908413e88f03d224b29329de7a1b1ce222926)), closes [#189](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/189)
* **reader:** stop reading codes such as 0901 and blank cells as numbers ([ca62754](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/ca6275462d3ffe92ec65f4b02ff6f96525c742e8)), closes [#154](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/154)
* **webview:** build histogram table rows from the bin edges ([5a8d73f](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/5a8d73fe7f9a2b7c6abb23baf854c7b19729791d))
* **webview:** give the page-size dropdown the VS Code dropdown colours ([9e8e789](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/9e8e7897c60be9cbd647723b084787b625df642a))
* **webview:** keep the page when Load More or Load All is refused for memory ([7154492](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/7154492d0fa46f5c04cfdf420113a1d74a476879)), closes [#189](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/189)
* **webview:** send the loaded rows to the webview in batches ([998e4b9](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/998e4b9d5e8582bfad6ae7a644452349010c61db))
* **webview:** show the real loaded row count once the rows arrive ([f34260b](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/f34260b24a43e89f142e0e0bb4f64e719606f557))
* **webview:** size histogram bin decimals to the bin width ([9f97a67](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/9f97a67a6a3b59c8c6aedb9e68b81b8f67d07df8))
* **webview:** style disabled pager buttons by their disabled attribute ([954461a](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/954461a71a35a18f6ff2ca7b81b2ce039245e39f))
* **webview:** take Load More's row count from one helper ([c0af01e](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/c0af01ea4bb05a0a200655d52913ded3cc9fae32))
* **webview:** take the loaded rows without spreading them into push() ([2eff425](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/2eff425ffb9b89c62888ac9472283abf96d5d401))


### Documentation

* Add QVD file format specification ([b2ecda6](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/b2ecda6fa36e23f8c7c250d88a4b6920551be33c))
* describe how dates and timestamps are exported ([60545c8](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/60545c8330106d59cc1753898098dd7703ef0e76)), closes [#165](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/165)
* describe how text that looks like a number is read and exported ([78b081d](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/78b081db67b94b8140907022ae960f4a883593e5)), closes [#154](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/154)
* describe how to export timestamps in a named time zone ([65dd7ec](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/65dd7ec422efd16ba9f3253a2e2d2066888139b3))
* describe the CSV export and its settings ([d79c90c](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/d79c90cc1309a4df96824393b3f9e1f5d04ff36f))
* describe Trusted Publishing setup for Marketplace releases ([1a5acc7](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/1a5acc7fa88707c29e3f96f91f33a4240664abae))
* Enhance QVD_FORMAT.md with detailed explanations on field and index offsets ([209a45a](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/209a45aaf5016ab892d71f27af94d45ab641de91))
* Revise QVD File Format Specification with detailed sections and improved structure ([9053900](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/9053900364b525c63fd38f87af9ef062941e3331))
* say how a field's dates or timestamps are told apart, and Excel's milliseconds ([112d350](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/112d350888825a249dbb94fd6355c4fdb9870c95)), closes [#165](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/165)
* Update README to refine description of the extension ([b394e04](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/b394e047d40fe6ad187c1d4e4f0fbf3896839e7c))


### Miscellaneous

* **deps:** match @types/node to the Node that VS Code 1.101 runs ([e0d2b5f](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/e0d2b5f0d427ca59d43333517263127c25ce8e55))
* **deps:** update @vscode/vsce to 4.1.0 ([78c5836](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/78c58367e9b5df668bda283512f602e315bbd0d7))
* **deps:** update esbuild to 0.28.2 ([cb284c3](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/cb284c30aa78807db44b238724d42819339cda57))
* **deps:** update eslint to 10 ([90e269a](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/90e269a609688418307a492e2a5e3699114d83b1))
* drop TypeScript and npm-run-all, which nothing uses ([d2dd827](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/d2dd827b145580bde0b2ad9a42ed137fa229b099))
* move dependency updates from Renovate to Dependabot ([fd8ce3f](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/fd8ce3f8737958a9cb8829a252a84b3a2e8138d2))
* Update .vscodeignore to include and exclude relevant files and directories ([cd3b1e8](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/cd3b1e896a639e25d59bf39716a63c082f4d5088))


### Code Refactoring

* **export:** apply the DST rule in one place, and look each timestamp up once ([6440979](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/6440979fff9a822c8eac881770d286f4ad06d84c))
* **export:** give the typed exporters one column-type scan ([5b88d01](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/5b88d013ed2070be0b6acc9d6316ea8e9902a49b)), closes [#154](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/154)
* **export:** keep each export format's details in one table ([8aa05d4](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/8aa05d4530f53d01625c909786fa112efb7a93e0)), closes [#165](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/165)
* **webview:** drop the resizableColumns table option ([8d67d3c](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/8d67d3cd7396353591be1d81ecd5dbe83d937b56))
* **webview:** remove the refresh message, which nothing sends ([47dd2dd](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/47dd2dda48caa9f0eb171fd77917c2d92bc0dffa))
* **webview:** share the histogram binning between both webviews ([1d76979](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/1d769797f915165cfa1e6c4f8fb60b0e4981738b))
* **webview:** share the histogram's chart and table as one script ([bd881b1](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/bd881b1d6eb914e85edcdc03ce09012189df4878))


### Tests

* Add performance testing suite for large QVD files ([5a2d139](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/5a2d139a370682be97eea70fd1a5377a34ef6427))
* check which exports read dates, and that finding them can stop ([bd2d024](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/bd2d024739b4bbfe180bd54e9d48a19076dcae23)), closes [#165](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/165)
* check zoned exports, their DST rule, and the time zone question ([6df2ab2](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/6df2ab21ff49a77add0fff4f7fc97e3514a66a47))
* export the QVD with skipped and repeated times to Avro and Arrow too ([22a3f0a](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/22a3f0afb4af642d5204552a349ffc678f197d72))
* **export:** check blank cells next to dates in the typed exports ([ea05d15](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/ea05d155bbf41ef8eb87ce12922c890fce35fd89)), closes [#154](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/issues/154)
* give VS Code a short user data directory in test runs ([5056487](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/5056487a0f816d6c1c4e9241ca2ddb26a1db8479))


### Build System

* **deps:** bump @azure/msal-node ([99ab849](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/99ab8497a7d8ed8e272baa1cf609add6eeb40047))
* **lint:** reject spread arguments in the extension's code ([64cab7e](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/64cab7e332454caaeaa3520dd02a428e456c693d))
* take the webview's Tabulator and Chart.js from npm at build time ([01b3058](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/01b3058905a5722ce610d954c53e9537364dbd41))
* test the bundled SQLite exporter with esbuild.js's own options ([516f85c](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/516f85c62eb180da4e285c5f4acf60dd727b7b98))

## [1.3.2](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v1.3.1...v1.3.2) (2025-11-05)

### Bug Fixes

- **export:** Fix incorrect placement of BETA tag in Export dropdown menu ([636096b](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/636096bf2eb5d716a7b9cf725383af5e74cec2b1))

## [1.3.1](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v1.3.0...v1.3.1) (2025-11-05)

### Bug Fixes

- **ci:** update SBOM tool to latest version ([7fc4e83](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/7fc4e83b4f0e09f3f9219dedf1ce45a86c608655))
- **profiling:** refine date pattern formats in string analysis ([d6cc153](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/d6cc15379eb174a9d70421229e0dde044e57eb4c))

## [1.3.0](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v1.2.0...v1.3.0) (2025-11-05)

### Features

- **profiling:** Add string analysis metrics ([734af51](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/734af514e04800a06c1529f3e842cc4aec02453b))
- **profiling:** Add temporal analysis ([bc75c16](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/bc75c16efcfd258493523e63145850816b59b342))
- **profiling:** Add tooltips and reference links to metrics in the Data Quality Assessment panel ([fb721b1](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/fb721b1becd0705f3c9918851bb6b17b92cc4b32))

### Bug Fixes

- **profiling:** Enhance cardinality classification logic ([32b1c01](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/32b1c01b5f9a480b82e7043dab20bb989c7922b6))

### Documentation

- **profiling:** Update README file with info on the new temporal and string profiling features ([b63f6e2](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/b63f6e20bf3c38e07664b98de75c892ad74dd633))

### Miscellaneous

- Add NYC taxi rides test dataset (QVD and Parquet) ([7e19913](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/7e19913cccd8ccd8444a5b84d81acda4694a1dca))

### Code Refactoring

- Improve code formatting and readability in temporal analysis and date detection modules ([436b80b](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/436b80b3ebe5f00fdca4b3de805fd135fe9d4afa))

## [1.2.0](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v1.1.0...v1.2.0) (2025-11-04)

### Features

- **logging:** Implement centralized logging system for better debugging and error tracking ([7d33871](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/7d33871d6a975bea6fb64beddf7253d794af139d))
- **security:** Add automated security scan to CI workflow ([d3568db](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/d3568db8093e6225b49de5b65f500192856916a4))

### Code Refactoring

- Split the various web views into separate files to prepare for future features ([55be82b](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/55be82b84f3d91c42a2de8ae20dd496482bd8a05))

## [1.1.0](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v1.0.2...v1.1.0) (2025-11-03)

### Features

- Test the extension against both earliest supported and latest versions of VS Code ([29a94aa](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/29a94aadc3e3a586d2f2940fb0c9450cc93e3a78))

### Bug Fixes

- downgrade @types/vscode to version 1.100.0 for compatibility ([6dab137](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/6dab137a52272ee2fd35fc12b729b2a21edaeb3b))

### Documentation

- Improve formatting and clarity in PROFILING.md ([6ce3da7](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/6ce3da7b875be972a14968663030860f21d2e65c))

### Miscellaneous

- **deps:** update dependencies ([49eaeaf](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/49eaeaf1018aa7f69ee67a36df76a1f5a2b87a2b))

## [1.0.2](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v1.0.1...v1.0.2) (2025-10-31)

### Bug Fixes

- Add more screen shots ([f13a47c](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/f13a47cc3a5745f3fef1a0788b1d9db16850b94e))
- update README and extension code formatting for consistency ([12e97dc](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/12e97dc66c8dfc87bffc2813d59be4a4eed54a74))
- update README and extension code formatting for consistency ([a7d81ef](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/a7d81ef5e6c520a07fe24a0d1853d90b56e7b128))

## [1.0.1](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v1.0.0...v1.0.1) (2025-10-31)

### Bug Fixes

- update image links to use absolute URLs in README.md ([ca9769b](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/ca9769bdf0128628d15487843ecdd5459ed527ba))
- update image links to use absolute URLs in README.md ([0515048](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/05150487daff16298bb6af7670bb6648d3853eb3))

## [1.0.0](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v0.1.0...v1.0.0) (2025-10-31)

### ⚠ BREAKING CHANGES

- This is the first stable 1.0.0 release of Ctrl-Q QVD Viewer.
- release version 1.0.0 - first stable release

### Features

- release version 1.0.0 - first stable release ([53f4109](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/53f4109f58e74325bfd915bd005cbfcc9f624cce))
- release version 1.0.0 - first stable release ([91997da](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/91997da7b3e6ca6b211755a36db6445a69d29e2a))

## [0.1.0](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v0.0.5...v0.1.0) (2025-10-31)

### ⚠ BREAKING CHANGES

- Go to 1.0.0
- Go to 1.0.0
- Going to version 1.0.0

### Features

- Go to 1.0.0 ([3c7700e](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/3c7700ea75ec96d4734b611bc7df81bf0afda2d8))
- Go to 1.0.0 ([f8a5777](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/f8a577714f9eb24e0f2869936b125759c7480e36))
- Going to version 1.0.0 ([6343eb8](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/6343eb88f46648660d3cd045204ba0eabf03db4b))

### Documentation

- add screenshots showing the VS Code extension in action ([7149e02](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/7149e021865e8216ddaaede878197e5ab3c7284b))
- Update repo URL ([b22a254](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/b22a2546ad8138e382e0c191bcc96fd17092b7b8))

## [0.0.5](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v0.0.4...v0.0.5) (2025-10-30)

### Features

- **tests:** Add test QVD and CSV files, Lego dataset and Stockholm historical temperatures ([d1e16ac](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/d1e16ac65dfb32fab0ec7926b9b4399bee2f6a95))

### Bug Fixes

- enhance error display for corrupted QVD files with detailed messages ([4e5d1cc](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/4e5d1ccc32053bcc412e8d54f83d47383cfdfda5))
- Failing tests due to test data files were moved ([6c4e33a](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/6c4e33a810d541ba16b788311bfe4de5be9c5612))

### Miscellaneous

- add problem matchers for npm tasks in VSCode configuration ([0bf5d1c](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/0bf5d1c0c3a38df9b649f11afbb0e329596a77d1))

## [0.0.4](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v0.0.3...v0.0.4) (2025-10-30)

### Features

- Add clear search button on all tabs ([97906d4](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/97906d438ba4fbf8ef939a55d6ff1ef0b5837418))
- add guidelines various Agent types ([d98f0e0](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/d98f0e0a95dd0d9343b8825b605fdfae4b43cd32))
- Add new lineage tab in UI ([992248f](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/992248fc64aa80843ad05369c2d3f91a4e4a7ebc))
- Add support for additional export formats (inline script, Avro, Arrow, XML, SQLite ([bb9821f](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/bb9821f40446953caf616d36c2c0286e2f70a3ae))
- Dynamically generate export menu items and improve UI for export options ([8037b51](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/8037b51f24cf4408dbf28ca4a661137511054fac))
- Enhance Avro export by inferring schema from all rows and ensuring type compatibility ([a2514b5](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/a2514b58f3cf40b12ee72ae735fd2b9e53e7500b))
- implement extension bundling to minimize size and compatibility ([ee9f1c2](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/ee9f1c227cd46228b32574a1da3c1b5c9b829481))
- implement extension bundling to minimize size and compatibility ([a12ffce](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/a12ffce6dd9d0157ce0a3be47a8324b95767f2a3))
- Implement PostgreSQL export functionality with metadata and options ([8bb28e2](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/8bb28e2fc37742f0e279daea8765fc7dc851e1d4))
- Replace better-sqlite3 with sql.js for SQLite export and mark as beta ([89bc4a8](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/89bc4a8c2f2286a29ab11e2e880a12e015648e81))

### Bug Fixes

- Add allowedDir configuration for path traversal protection and improve documentation ([3a8cd65](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/3a8cd652937c5f08a7ac0e3ae4037cf749c28395))
- Change to Ctrl-Q icon viewer header text ([f50f60e](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/f50f60e0733953b9f5f3b924bd7877d382897893))
- Fix broken tests ([3220edc](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/3220edc83472da1993c32e7ae8b4165b11f9bb74))
- move build step for extension before linter in PR validation workflow ([74fe890](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/74fe89065ab10b50a65c3335f90d237b96a9178a))
- remove unnecessary compile-tests from pretest script ([62798d9](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/62798d9484aaf86df668c9a51aa9951f8d118522))
- set environment variables for virtual display in CI workflows ([74ed692](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/74ed692ee5ab699e4433bc085a67850dfbb23491))
- simplify launch arguments for VSCode test configuration ([6a92b0c](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/6a92b0c71257ecc7b5ba5ef741e2294d0c3b4200))
- streamline virtual display setup for CI tests and enhance test configuration ([3b4f067](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/3b4f067334473a2e20600aa428718287afa12d09))

### Miscellaneous

- **deps:** update dependency @types/node to v22.18.12 ([ea60b32](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/ea60b3241236f03ab5d0c7dba30d0d23153e9045))
- **deps:** update dependency @types/node to v22.18.13 ([e7b4c33](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/e7b4c3387ad8427ac83a45049ce590d30ef95401))
- **deps:** update dependency @types/node to v22.18.13 ([51f764b](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/51f764be05eb937072e0a0d80bca6121a632a268))
- **deps:** update googleapis/release-please-action action to v4.4.0 ([4fcdcf1](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/4fcdcf129775920e23e9ddafc96f03a921396aed))
- **deps:** update googleapis/release-please-action action to v4.4.0 ([22fa671](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/22fa671571b7e12cfe5ef1c6a5a3b46595b1a830))
- **deps:** update ncipollo/release-action action to v1.20.0 ([924bcbe](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/924bcbea0e2983a03afd9b9ac3c182ff31174cdd))
- **deps:** update ncipollo/release-action action to v1.20.0 ([ef87a11](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/ef87a11cac1b55007520148755f90c5d9ab050f5))
- pin action versions in CI workflows ([d367cd4](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/d367cd4ec0e5ed4093fa8769917d5f17087e2540))
- pin action versions in CI workflows ([7a2ae44](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/7a2ae44ae77b4640d25670a3a30ec00268563217))

### Code Refactoring

- Clean up old doc files ([f555300](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/f555300dcb0a8031f071196274b15c25c882cff5))
- Clean up whitespace in Arrow and Parquet export functions ([c802f1e](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/c802f1e2088b97c43e6a5378caa84b5f16ffb626))
- Normalize data handling in Arrow export function ([47683d5](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/47683d5aceb59102d9de0a35e04545624782dfda))
- Update imports to use consistent quotes and convert synchronous file read to async in AboutPanel ([05a71fc](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/05a71fc1729485cb04f620786a39618c6e8b46e7))

## [0.0.3](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v0.0.2...v0.0.3) (2025-10-21)

### Features

- Add logo image for Ctrl-Q QVD Viewer ([17fe6c3](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/17fe6c3f2b8336a47f361b2670276f2973585d94))
- Add Parquet and CSV test data files ([8840883](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/884088301efdedd388c79de97833b227ccbdadd1))

### Miscellaneous

- **deps:** update dependency @vscode/test-cli to ^0.0.12 ([c7dfb31](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/c7dfb31360bd352335f3e965d705bc487500d545))

## [0.0.2](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/compare/v0.0.1...v0.0.2) (2025-10-21)

### Features

- add CI/CD workflows for automated testing, release management, and publishing ([33b5d8a](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/33b5d8a3131bbfd89d86a2b413ce37b8527918fa))

### Bug Fixes

- Fix broken deploy to marketplace ([7f51f93](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/7f51f93ca926886b2fe2173ce27ef0e05fa27d56))
- resolve ESLint warnings and CI test execution issues ([cffe8a0](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/cffe8a02b6217006b54e2d8f0efbcdcecf09fec6))
- Update PR validation workflow to run tests in a virtual display environment ([ff5e238](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/ff5e238fcccf15b7a522995864a13483c889cd93))

### Miscellaneous

- **deps:** update actions/checkout action to v5 ([83f725e](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/83f725e7a7a12887aef23f09e4d9c3036770ad2a))
- **deps:** update actions/checkout action to v5 ([8d7f4ee](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/8d7f4ee6f9e8f81b81240b55904b0c896352fe4f))
- **deps:** update actions/setup-node action to v6 ([66dc561](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/66dc56193e837164cb7fda274f511df9a49b7f87))
- **deps:** update actions/setup-node action to v6 ([206d588](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/206d588c4925a200bd3ba9b8723434b357dd22a5))

### Code Refactoring

- improve code formatting and readability in About Command Registration test ([2c03c45](https://github.com/ptarmiganlabs/ctrl-q-qvd-viewer/commit/2c03c45feaa901ac293ca745d587efee52aca988))

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

- Uses qvdjs library for QVD file parsing
- Custom editor provider using VS Code webview API
- Theme-aware styling with VS Code CSS variables
- Error handling for invalid or corrupted files
