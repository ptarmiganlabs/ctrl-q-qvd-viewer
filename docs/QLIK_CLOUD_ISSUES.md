# GitHub Issues for Qlik Sense Cloud Integration

This document contains the sequential GitHub issues needed to implement Qlik Sense Cloud support in the Ctrl-Q QVD Viewer extension.

Based on the research in [QLIK_CLOUD_RESEARCH.md](./QLIK_CLOUD_RESEARCH.md), the implementation is divided into 4 phases with multiple issues per phase.

---

## Phase 1: Foundation (API Key Authentication)

### Issue 1: Add @qlik/api dependency and project structure

**Description:**
Set up the foundational project structure for Qlik Sense Cloud integration.

**Tasks:**
- [ ] Add `@qlik/api` npm package to `package.json` dependencies
- [ ] Create `src/cloud/` directory structure
- [ ] Add TypeScript/JSDoc type definitions for cloud components
- [ ] Update `.gitignore` if needed for cloud cache directory
- [ ] Update project documentation with new structure

**Acceptance Criteria:**
- `@qlik/api` dependency installed and available
- `src/cloud/` directory exists
- No build or lint errors

**Labels:** `enhancement`, `qlik-cloud`, `phase-1`

---

### Issue 2: Implement authentication provider for API Keys

**Description:**
Create the authentication provider to securely store and manage Qlik Cloud API keys using VS Code's SecretStorage API.

**Tasks:**
- [ ] Create `src/cloud/qlikAuthProvider.mjs` file
- [ ] Implement `QlikAuthProvider` class with methods:
  - `setApiKey(apiKey)` - Store API key securely
  - `getApiKey()` - Retrieve stored API key
  - `hasApiKey()` - Check if API key exists
  - `clearApiKey()` - Remove stored API key
  - `validateTenantUrl(url)` - Validate tenant URL format
  - `normalizeTenantUrl(url)` - Normalize tenant URL
- [ ] Use VS Code SecretStorage API for secure storage
- [ ] Add comprehensive JSDoc documentation
- [ ] Add unit tests for authentication provider

**Acceptance Criteria:**
- API keys stored securely in OS keychain via SecretStorage
- Tenant URL validation works correctly
- No API keys visible in plaintext settings
- All methods properly documented

**Labels:** `enhancement`, `qlik-cloud`, `phase-1`, `security`

**Reference:** See implementation guide in `docs/QLIK_CLOUD_IMPLEMENTATION.md` Step 3

---

### Issue 3: Implement cloud connection manager

**Description:**
Create the connection manager to handle connections to Qlik Cloud tenants using the @qlik/api toolkit.

**Tasks:**
- [ ] Create `src/cloud/cloudConnectionManager.mjs` file
- [ ] Implement `CloudConnectionManager` class with methods:
  - `connect()` - Establish connection to Qlik Cloud
  - `disconnect()` - Disconnect from Qlik Cloud
  - `testConnection()` - Test if connection is valid
  - `getConnection()` - Get active connection
  - `isConnected()` - Check connection status
  - `getTenantUrl()` - Get configured tenant URL
- [ ] Initialize @qlik/api with proper configuration
- [ ] Handle connection errors gracefully
- [ ] Add JSDoc documentation
- [ ] Add unit tests

**Acceptance Criteria:**
- Can successfully connect to Qlik Cloud with valid credentials
- Connection errors are handled and reported clearly
- Connection state is tracked accurately
- Tests verify connection logic

**Labels:** `enhancement`, `qlik-cloud`, `phase-1`

**Reference:** See implementation guide in `docs/QLIK_CLOUD_IMPLEMENTATION.md` Step 4

---

### Issue 4: Implement download manager with caching

**Description:**
Create the download manager to handle downloading QVD files from Qlik Cloud with local caching support.

**Tasks:**
- [ ] Create `src/cloud/downloadManager.mjs` file
- [ ] Implement `DownloadManager` class with methods:
  - `initCache()` - Initialize cache directory
  - `downloadFile(connection, fileId, options)` - Download file from cloud
  - `isCached(fileId)` - Check if file is cached
  - `getCachePath(fileId)` - Get path to cached file
  - `clearCache()` - Clear all cached files
  - `getCacheSize()` - Get total cache size
  - `getCacheSizeFormatted()` - Get human-readable cache size
- [ ] Use extension's global storage for cache directory
- [ ] Show progress notifications during download
- [ ] Support cancellable downloads
- [ ] Add JSDoc documentation
- [ ] Add unit tests

**Acceptance Criteria:**
- Files download successfully from Qlik Cloud
- Downloaded files are cached in proper location
- Progress notifications shown during download
- Cache management functions work correctly
- Tests verify download and cache logic

**Labels:** `enhancement`, `qlik-cloud`, `phase-1`

**Reference:** See implementation guide in `docs/QLIK_CLOUD_IMPLEMENTATION.md` Step 5

---

### Issue 5: Implement cloud QVD reader adapter

**Description:**
Create an adapter that extends the existing QvdReader to support reading QVD files from Qlik Cloud.

**Tasks:**
- [ ] Create `src/cloud/cloudQvdReader.mjs` file
- [ ] Implement `CloudQvdReader` class that:
  - Takes connection manager and download manager as dependencies
  - Implements `readFromCloud(fileId, maxRows)` method
  - Downloads file to cache if needed
  - Uses existing `QvdReader` to parse the file
  - Returns data with cloud metadata
- [ ] Handle errors during download or parsing
- [ ] Add JSDoc documentation
- [ ] Add unit tests with mocked downloads

**Acceptance Criteria:**
- Can read QVD files from Qlik Cloud
- Falls back to cache when available
- Integrates seamlessly with existing QvdReader
- Errors are handled and reported
- Tests verify cloud reading logic

**Labels:** `enhancement`, `qlik-cloud`, `phase-1`

**Reference:** See implementation guide in `docs/QLIK_CLOUD_IMPLEMENTATION.md` Step 6

---

### Issue 6: Add configuration settings for Qlik Cloud

**Description:**
Add VS Code configuration settings to allow users to configure their Qlik Cloud connection.

**Tasks:**
- [ ] Update `package.json` with new configuration properties:
  - `ctrl-q-qvd-viewer.cloud.enabled` - Enable/disable cloud integration
  - `ctrl-q-qvd-viewer.cloud.tenantUrl` - Qlik Cloud tenant URL
  - `ctrl-q-qvd-viewer.cloud.authMethod` - Authentication method (apiKey/oauth)
  - `ctrl-q-qvd-viewer.cloud.cacheEnabled` - Enable/disable caching
  - `ctrl-q-qvd-viewer.cloud.cacheMaxSizeMB` - Maximum cache size
  - `ctrl-q-qvd-viewer.cloud.cacheExpirationHours` - Cache expiration time
- [ ] Add proper validation patterns (e.g., tenant URL format)
- [ ] Add descriptions for each setting
- [ ] Update documentation with configuration instructions

**Acceptance Criteria:**
- Settings appear in VS Code preferences
- Tenant URL validation works
- Default values are sensible
- Settings documented in README

**Labels:** `enhancement`, `qlik-cloud`, `phase-1`, `configuration`

**Reference:** See implementation guide in `docs/QLIK_CLOUD_IMPLEMENTATION.md` Step 7

---

### Issue 7: Register cloud commands in extension

**Description:**
Register new VS Code commands for Qlik Cloud operations and integrate cloud services into the extension.

**Tasks:**
- [ ] Update `src/extension.mjs` to:
  - Initialize cloud services (auth provider, connection manager, download manager)
  - Register `ctrl-q-qvd-viewer.connectCloud` command
  - Register `ctrl-q-qvd-viewer.disconnectCloud` command
  - Register `ctrl-q-qvd-viewer.clearCloudCache` command
- [ ] Implement command handlers with proper error handling
- [ ] Show appropriate notifications for success/failure
- [ ] Update command palette with new commands
- [ ] Test all commands work correctly

**Acceptance Criteria:**
- Connect command prompts for tenant URL and API key
- Disconnect command clears credentials
- Clear cache command removes cached files
- Commands appear in command palette
- All commands have proper error handling

**Labels:** `enhancement`, `qlik-cloud`, `phase-1`

**Reference:** See implementation guide in `docs/QLIK_CLOUD_IMPLEMENTATION.md` Step 8

---

### Issue 8: Add Phase 1 testing and documentation

**Description:**
Create comprehensive tests and documentation for Phase 1 functionality.

**Tasks:**
- [ ] Create test files for all Phase 1 components
- [ ] Write integration tests for end-to-end cloud connection flow
- [ ] Test error scenarios (invalid credentials, network errors, etc.)
- [ ] Update README.md with Qlik Cloud setup instructions
- [ ] Create troubleshooting guide for common issues
- [ ] Add screenshots/GIFs showing cloud connection process
- [ ] Update CHANGELOG.md

**Acceptance Criteria:**
- All Phase 1 components have tests with good coverage
- Integration tests pass
- Documentation is clear and comprehensive
- Users can follow docs to set up cloud connection

**Labels:** `enhancement`, `qlik-cloud`, `phase-1`, `documentation`, `testing`

**Reference:** See implementation guide in `docs/QLIK_CLOUD_IMPLEMENTATION.md` Step 9

---

## Phase 2: File Browser UI

### Issue 9: Create tree view provider for cloud files

**Description:**
Implement a VS Code TreeView provider to display Qlik Cloud QVD files in the Explorer panel.

**Tasks:**
- [ ] Create `src/cloud/cloudFileTreeProvider.mjs` file
- [ ] Implement `CloudFileTreeProvider` class that:
  - Implements VS Code TreeDataProvider interface
  - Lists files from Qlik Cloud using Data Files API
  - Organizes files by spaces/folders
  - Supports expand/collapse of folders
  - Shows file metadata (size, date)
  - Handles refresh events
- [ ] Register tree view in `package.json` contributions
- [ ] Add tree view to Explorer panel
- [ ] Add JSDoc documentation
- [ ] Add tests for tree provider

**Acceptance Criteria:**
- Tree view appears in Explorer panel
- Files and folders displayed correctly
- Can expand/collapse folders
- Refresh updates file list
- File metadata shown accurately

**Labels:** `enhancement`, `qlik-cloud`, `phase-2`, `ui`

**Reference:** See Phase 2 tasks in `docs/QLIK_CLOUD_RESEARCH.md`

---

### Issue 10: Implement file search and filter functionality

**Description:**
Add search and filter capabilities to the cloud file tree view.

**Tasks:**
- [ ] Add search input to tree view
- [ ] Implement file name filtering
- [ ] Support wildcards in search (e.g., `*.qvd`)
- [ ] Add filter by file size
- [ ] Add filter by modification date
- [ ] Show filtered results in tree
- [ ] Persist search/filter state
- [ ] Add clear filter action

**Acceptance Criteria:**
- Search filters files by name
- Wildcard patterns work correctly
- Size and date filters function properly
- Filter state persists across refreshes
- Clear action resets filters

**Labels:** `enhancement`, `qlik-cloud`, `phase-2`, `ui`

---

### Issue 11: Add context menu actions for cloud files

**Description:**
Implement context menu actions for cloud files in the tree view.

**Tasks:**
- [ ] Add "Open" action (opens in QVD viewer)
- [ ] Add "Download to Local..." action
- [ ] Add "Export to..." submenu with export formats
- [ ] Add "Copy Cloud URL" action
- [ ] Add "Show File Info" action (display metadata)
- [ ] Add "Refresh" action
- [ ] Register context menu contributions in `package.json`
- [ ] Implement action handlers
- [ ] Add icons for each action

**Acceptance Criteria:**
- Right-click shows context menu
- All actions work correctly
- File opens in viewer on "Open"
- Export functions work
- File info dialog shows metadata

**Labels:** `enhancement`, `qlik-cloud`, `phase-2`, `ui`

---

### Issue 12: Add file metadata display in tree view

**Description:**
Enhance the tree view to show rich file metadata for each QVD file.

**Tasks:**
- [ ] Display file size next to file name
- [ ] Show modification date in description
- [ ] Add icon for cached files
- [ ] Add loading indicator for slow operations
- [ ] Show space/folder information
- [ ] Add tooltip with full metadata on hover
- [ ] Format sizes and dates appropriately

**Acceptance Criteria:**
- File size shown in human-readable format
- Dates formatted consistently
- Cached files have distinct icon
- Tooltips show additional info
- Loading states visible

**Labels:** `enhancement`, `qlik-cloud`, `phase-2`, `ui`

---

### Issue 13: Implement pagination for large file lists

**Description:**
Add pagination support to handle Qlik Cloud tenants with many files.

**Tasks:**
- [ ] Detect when more files are available
- [ ] Implement "Load More" action in tree view
- [ ] Show loading indicator while fetching next page
- [ ] Handle pagination cursors from API
- [ ] Limit initial load to reasonable number (e.g., 100 files)
- [ ] Show file count in tree view header
- [ ] Cache paginated results

**Acceptance Criteria:**
- Initial load shows first batch of files
- "Load More" fetches next page
- All pages can be loaded
- Performance remains good with large lists
- File count displayed accurately

**Labels:** `enhancement`, `qlik-cloud`, `phase-2`, `performance`

---

### Issue 14: Add comprehensive error handling for file browser

**Description:**
Implement robust error handling and user feedback for file browser operations.

**Tasks:**
- [ ] Handle network errors gracefully
- [ ] Show clear messages for authentication failures
- [ ] Handle permission errors (access denied)
- [ ] Show retry option for transient errors
- [ ] Display rate limit errors with countdown
- [ ] Log errors for debugging
- [ ] Add "View Logs" action in error messages
- [ ] Show empty state when no files found

**Acceptance Criteria:**
- All error types handled appropriately
- Error messages are clear and actionable
- Users can retry failed operations
- Empty states guide users
- Errors logged for troubleshooting

**Labels:** `enhancement`, `qlik-cloud`, `phase-2`, `error-handling`

---

### Issue 15: Add refresh functionality to tree view

**Description:**
Implement manual and automatic refresh capabilities for the cloud file tree view.

**Tasks:**
- [ ] Add refresh button to tree view toolbar
- [ ] Implement manual refresh action
- [ ] Add "Refresh on Focus" option in settings
- [ ] Cache file lists with TTL (time-to-live)
- [ ] Show refresh in progress indicator
- [ ] Invalidate cache on refresh
- [ ] Preserve tree expansion state on refresh

**Acceptance Criteria:**
- Refresh button updates file list
- Auto-refresh works when enabled
- Progress shown during refresh
- Tree state preserved after refresh
- Cache invalidated properly

**Labels:** `enhancement`, `qlik-cloud`, `phase-2`, `ui`

---

### Issue 16: Add Phase 2 testing and documentation

**Description:**
Create tests and documentation for Phase 2 file browser functionality.

**Tasks:**
- [ ] Write tests for tree view provider
- [ ] Test search and filter functionality
- [ ] Test context menu actions
- [ ] Test pagination with mock data
- [ ] Test error scenarios
- [ ] Update documentation with file browser usage
- [ ] Add screenshots of file browser UI
- [ ] Create user guide for browsing cloud files

**Acceptance Criteria:**
- All Phase 2 components tested
- UI tests cover major workflows
- Documentation updated
- Screenshots included

**Labels:** `enhancement`, `qlik-cloud`, `phase-2`, `documentation`, `testing`

---

## Phase 3: Cache Management

### Issue 17: Implement intelligent cache storage system

**Description:**
Enhance the basic caching from Phase 1 with intelligent storage management.

**Tasks:**
- [ ] Implement cache metadata tracking (download time, access time, file size)
- [ ] Store cache index in extension storage
- [ ] Track cache statistics (hits, misses, total size)
- [ ] Implement LRU (Least Recently Used) eviction strategy
- [ ] Add cache versioning for future updates
- [ ] Serialize cache metadata efficiently
- [ ] Add JSDoc documentation
- [ ] Add tests for cache storage

**Acceptance Criteria:**
- Cache metadata persists across sessions
- Statistics tracked accurately
- LRU eviction removes oldest files when limit reached
- Cache survives extension reload

**Labels:** `enhancement`, `qlik-cloud`, `phase-3`, `performance`

---

### Issue 18: Add cache expiration policies

**Description:**
Implement time-based and size-based cache expiration policies.

**Tasks:**
- [ ] Add configurable cache expiration time (hours/days)
- [ ] Implement automatic cleanup of expired files
- [ ] Add max cache size limit
- [ ] Trigger cleanup when size limit exceeded
- [ ] Schedule periodic cache cleanup
- [ ] Add "Cache Expiration Policy" setting
- [ ] Log cache cleanup events
- [ ] Test expiration logic

**Acceptance Criteria:**
- Expired files automatically removed
- Size limit enforced
- Cleanup runs periodically
- Configuration options work
- No cache bloat over time

**Labels:** `enhancement`, `qlik-cloud`, `phase-3`, `performance`

---

### Issue 19: Create cache management UI

**Description:**
Add user interface for viewing and managing the cache.

**Tasks:**
- [ ] Create cache status view showing:
  - Total cache size
  - Number of cached files
  - Cache hit rate
  - Last cleanup time
- [ ] Add "View Cache" command
- [ ] Show list of cached files with metadata
- [ ] Add "Delete" action for individual files
- [ ] Add "Clear All Cache" action with confirmation
- [ ] Add "Optimize Cache" action (cleanup + defrag)
- [ ] Show cache location path

**Acceptance Criteria:**
- Cache status visible and accurate
- Can view cached files
- Can delete individual or all files
- Confirmation required for destructive actions
- Cache size updates in real-time

**Labels:** `enhancement`, `qlik-cloud`, `phase-3`, `ui`

---

### Issue 20: Implement cache size limits and monitoring

**Description:**
Add monitoring and enforcement of cache size limits.

**Tasks:**
- [ ] Add `cacheMaxSizeMB` configuration setting
- [ ] Monitor cache size in real-time
- [ ] Enforce size limit during downloads
- [ ] Show warning when approaching limit
- [ ] Offer to clear cache when limit reached
- [ ] Add cache size to status bar
- [ ] Calculate cache efficiency metrics
- [ ] Test size limit enforcement

**Acceptance Criteria:**
- Size limit configurable and enforced
- Warnings shown when approaching limit
- Status bar shows current cache size
- User can act on limit warnings
- Downloads handle size limit gracefully

**Labels:** `enhancement`, `qlik-cloud`, `phase-3`, `performance`

---

### Issue 21: Add manual cache clearing functionality

**Description:**
Provide multiple ways for users to manually clear the cache.

**Tasks:**
- [ ] Add "Clear Cloud Cache" command to command palette
- [ ] Add cache clear button to tree view toolbar
- [ ] Show confirmation dialog with cache size
- [ ] Implement selective cache clearing (by space, by age)
- [ ] Add "Clear Cache on Disconnect" option
- [ ] Show success notification after clearing
- [ ] Log cache clear events
- [ ] Test all clear operations

**Acceptance Criteria:**
- Multiple ways to clear cache available
- Confirmation prevents accidental clearing
- Selective clearing works correctly
- Success feedback provided
- Cache fully cleared after operation

**Labels:** `enhancement`, `qlik-cloud`, `phase-3`, `ui`

---

### Issue 22: Implement offline mode support

**Description:**
Enable viewing of cached files when offline or disconnected from Qlik Cloud.

**Tasks:**
- [ ] Detect network connectivity status
- [ ] Show offline indicator in UI
- [ ] Allow opening cached files when offline
- [ ] Disable cloud operations when offline
- [ ] Show which files are available offline
- [ ] Auto-reconnect when network restored
- [ ] Add "Offline Mode" toggle in settings
- [ ] Test offline scenarios

**Acceptance Criteria:**
- Cached files accessible offline
- Offline status clearly indicated
- Cloud operations disabled gracefully
- Reconnection automatic
- User can work with cached files without network

**Labels:** `enhancement`, `qlik-cloud`, `phase-3`, `offline`

---

### Issue 23: Add Phase 3 testing and documentation

**Description:**
Create comprehensive tests and documentation for cache management features.

**Tasks:**
- [ ] Write tests for cache storage and retrieval
- [ ] Test expiration policies
- [ ] Test size limits and enforcement
- [ ] Test offline mode
- [ ] Test cache cleanup operations
- [ ] Update documentation with cache management guide
- [ ] Add troubleshooting section for cache issues
- [ ] Document performance best practices

**Acceptance Criteria:**
- All Phase 3 components tested
- Cache scenarios covered
- Documentation complete
- Performance guidelines included

**Labels:** `enhancement`, `qlik-cloud`, `phase-3`, `documentation`, `testing`

---

## Phase 4: OAuth2 Integration (Optional)

### Issue 24: Research and plan OAuth2 implementation

**Description:**
Research OAuth2 implementation details and create implementation plan.

**Tasks:**
- [ ] Review VS Code Authentication API documentation
- [ ] Study existing OAuth2 implementations in VS Code extensions
- [ ] Determine required OAuth scopes for Qlik Cloud
- [ ] Plan OAuth client registration process
- [ ] Design token refresh strategy
- [ ] Plan migration path from API Keys to OAuth2
- [ ] Document OAuth2 architecture
- [ ] Create implementation checklist

**Acceptance Criteria:**
- OAuth2 requirements documented
- Implementation plan created
- Migration strategy defined
- Technical blockers identified

**Labels:** `enhancement`, `qlik-cloud`, `phase-4`, `research`, `oauth`

**Note:** This issue should be completed before starting OAuth2 implementation

---

### Issue 25: Register OAuth client with Qlik Cloud

**Description:**
Set up OAuth client registration in Qlik Cloud for the extension.

**Tasks:**
- [ ] Create OAuth client in Qlik Cloud Management Console
- [ ] Configure client ID and scopes
- [ ] Set up redirect URIs (localhost for development)
- [ ] Document client registration process
- [ ] Create client credentials for testing
- [ ] Plan for production client distribution
- [ ] Add client ID to extension configuration
- [ ] Test client registration

**Acceptance Criteria:**
- OAuth client registered in Qlik Cloud
- Client ID and scopes configured
- Redirect URIs set up
- Registration process documented
- Test credentials available

**Labels:** `enhancement`, `qlik-cloud`, `phase-4`, `oauth`, `setup`

---

### Issue 26: Implement VS Code Authentication Provider

**Description:**
Create a custom VS Code Authentication Provider for Qlik Cloud OAuth2.

**Tasks:**
- [ ] Create `src/cloud/qlikOAuthProvider.mjs` file
- [ ] Implement VS Code AuthenticationProvider interface:
  - `getSessions(scopes)` - Get active sessions
  - `createSession(scopes)` - Initiate OAuth flow
  - `removeSession(sessionId)` - Logout/remove session
- [ ] Register authentication provider in extension
- [ ] Handle authentication events
- [ ] Store sessions securely
- [ ] Add JSDoc documentation
- [ ] Add tests for OAuth provider

**Acceptance Criteria:**
- Authentication provider registered
- OAuth sessions managed correctly
- Provider integrates with VS Code authentication UI
- Sessions persist across reloads
- Tests verify OAuth flow

**Labels:** `enhancement`, `qlik-cloud`, `phase-4`, `oauth`

**Reference:** See research in `docs/QLIK_CLOUD_RESEARCH.md` - Authentication Methods

---

### Issue 27: Implement OAuth2 Authorization Code flow with PKCE

**Description:**
Implement the OAuth2 Authorization Code flow with PKCE for secure authentication.

**Tasks:**
- [ ] Generate PKCE code verifier and challenge
- [ ] Build authorization URL with parameters
- [ ] Open browser for user authentication
- [ ] Set up local redirect server to receive auth code
- [ ] Exchange authorization code for tokens
- [ ] Handle user consent screen
- [ ] Store access and refresh tokens securely
- [ ] Handle OAuth errors gracefully
- [ ] Add JSDoc documentation
- [ ] Test OAuth flow end-to-end

**Acceptance Criteria:**
- Browser opens for authentication
- User can authenticate via Qlik Cloud
- Authorization code exchanged successfully
- Tokens stored securely
- Error scenarios handled
- Flow works end-to-end

**Labels:** `enhancement`, `qlik-cloud`, `phase-4`, `oauth`, `security`

---

### Issue 28: Implement automatic token refresh logic

**Description:**
Add automatic token refresh to maintain authentication without user intervention.

**Tasks:**
- [ ] Detect when access token is expired
- [ ] Implement token refresh using refresh token
- [ ] Handle refresh failures (re-authentication required)
- [ ] Add token refresh to connection manager
- [ ] Retry failed requests after token refresh
- [ ] Add token expiration monitoring
- [ ] Log token refresh events
- [ ] Test refresh scenarios

**Acceptance Criteria:**
- Expired tokens refreshed automatically
- User not interrupted during refresh
- Failed refresh prompts re-authentication
- Requests retry after refresh
- Token refresh logged appropriately

**Labels:** `enhancement`, `qlik-cloud`, `phase-4`, `oauth`

---

### Issue 29: Implement migration from API Keys to OAuth2

**Description:**
Create a smooth migration path for users upgrading from API Key authentication to OAuth2.

**Tasks:**
- [ ] Detect existing API Key configuration
- [ ] Offer migration to OAuth2 on first run
- [ ] Preserve existing settings during migration
- [ ] Support both auth methods simultaneously
- [ ] Add "Switch to OAuth2" command
- [ ] Clear API Key after successful OAuth2 setup
- [ ] Document migration process
- [ ] Test migration scenarios

**Acceptance Criteria:**
- Users can migrate without losing data
- Both auth methods work during transition
- Migration process is smooth
- Documentation guides users
- Tests cover migration paths

**Labels:** `enhancement`, `qlik-cloud`, `phase-4`, `oauth`, `migration`

---

### Issue 30: Add multi-account support with account switcher

**Description:**
Enable users to authenticate with multiple Qlik Cloud tenants and switch between them.

**Tasks:**
- [ ] Support multiple OAuth sessions
- [ ] Store sessions per tenant
- [ ] Add account switcher UI in status bar
- [ ] Show active account in status bar
- [ ] Add "Switch Account" command
- [ ] Add "Add Account" command
- [ ] Handle switching between accounts
- [ ] Preserve per-account settings
- [ ] Test multi-account scenarios

**Acceptance Criteria:**
- Multiple accounts can be configured
- Can switch between accounts easily
- Active account clearly indicated
- Each account has independent settings
- Switching works without errors

**Labels:** `enhancement`, `qlik-cloud`, `phase-4`, `oauth`, `ui`

---

### Issue 31: Add Phase 4 testing and documentation

**Description:**
Create comprehensive tests and documentation for OAuth2 functionality.

**Tasks:**
- [ ] Write tests for OAuth provider
- [ ] Test authorization flow
- [ ] Test token refresh
- [ ] Test migration scenarios
- [ ] Test multi-account support
- [ ] Update documentation with OAuth2 setup
- [ ] Create OAuth2 troubleshooting guide
- [ ] Add FAQ for OAuth2 questions
- [ ] Document security best practices

**Acceptance Criteria:**
- All Phase 4 components tested
- OAuth flows verified
- Documentation complete and clear
- Security practices documented
- Common issues addressed in FAQ

**Labels:** `enhancement`, `qlik-cloud`, `phase-4`, `oauth`, `documentation`, `testing`

---

## Additional Issues

### Issue 32: Add comprehensive integration tests

**Description:**
Create end-to-end integration tests covering all phases.

**Tasks:**
- [ ] Set up test Qlik Cloud tenant
- [ ] Create test data (QVD files in various spaces)
- [ ] Write integration tests for:
  - Authentication (API Key and OAuth2)
  - File listing and browsing
  - File download and caching
  - File opening and viewing
  - Export functionality
  - Error scenarios
  - Offline mode
- [ ] Set up CI/CD pipeline for integration tests
- [ ] Document test setup process

**Acceptance Criteria:**
- Integration tests cover all major workflows
- Tests run in CI/CD
- Test environment documented
- Tests pass consistently

**Labels:** `testing`, `qlik-cloud`, `integration`, `ci-cd`

---

### Issue 33: Performance optimization and monitoring

**Description:**
Optimize performance and add monitoring for Qlik Cloud operations.

**Tasks:**
- [ ] Profile extension performance
- [ ] Optimize file list loading
- [ ] Implement request batching where possible
- [ ] Add performance metrics tracking
- [ ] Optimize cache operations
- [ ] Add telemetry for cloud operations (opt-in)
- [ ] Create performance benchmarks
- [ ] Document performance considerations

**Acceptance Criteria:**
- File lists load quickly
- Cache operations are efficient
- Performance metrics available
- Benchmarks documented
- No performance regressions

**Labels:** `performance`, `qlik-cloud`, `monitoring`

---

### Issue 34: Security audit and hardening

**Description:**
Conduct security audit and implement security hardening measures.

**Tasks:**
- [ ] Review credential storage security
- [ ] Audit API key and token handling
- [ ] Review network communication security
- [ ] Check for sensitive data in logs
- [ ] Implement rate limiting for API calls
- [ ] Add security headers to requests
- [ ] Review permissions and scopes
- [ ] Document security measures
- [ ] Run security scanning tools

**Acceptance Criteria:**
- No credentials in plaintext
- Network communication secure
- No sensitive data leaked
- Security measures documented
- Security scan passes

**Labels:** `security`, `qlik-cloud`, `audit`

---

### Issue 35: User experience improvements and polish

**Description:**
Add final polish and UX improvements based on beta testing feedback.

**Tasks:**
- [ ] Improve error messages for clarity
- [ ] Add onboarding flow for first-time users
- [ ] Improve loading states and animations
- [ ] Add keyboard shortcuts for common actions
- [ ] Improve accessibility (screen readers, etc.)
- [ ] Add user preferences for behavior
- [ ] Polish UI design and icons
- [ ] Gather and address beta tester feedback

**Acceptance Criteria:**
- UX is smooth and intuitive
- Error messages are helpful
- Onboarding guides new users
- Accessibility requirements met
- Beta tester feedback addressed

**Labels:** `enhancement`, `qlik-cloud`, `ux`, `accessibility`

---

### Issue 36: Final documentation and release preparation

**Description:**
Complete all documentation and prepare for final release.

**Tasks:**
- [ ] Update README.md with complete Qlik Cloud documentation
- [ ] Create video tutorials/GIFs
- [ ] Write blog post announcing feature
- [ ] Update CHANGELOG.md
- [ ] Create release notes
- [ ] Update extension marketplace description
- [ ] Prepare marketing materials
- [ ] Create example workspace/project
- [ ] Review all documentation for accuracy
- [ ] Get documentation reviewed

**Acceptance Criteria:**
- All documentation complete
- Tutorials created
- Release notes ready
- Marketplace updated
- Documentation accurate

**Labels:** `documentation`, `qlik-cloud`, `release`

---

## Summary

**Total Issues:** 36

**By Phase:**
- Phase 1 (Foundation): 8 issues
- Phase 2 (File Browser): 8 issues
- Phase 3 (Cache Management): 7 issues
- Phase 4 (OAuth2): 8 issues
- Additional (Integration, Polish): 5 issues

**Estimated Timeline:**
- Phase 1: 2-3 days (Issues 1-8)
- Phase 2: 3-4 days (Issues 9-16)
- Phase 3: 2 days (Issues 17-23)
- Phase 4: 4-5 days (Issues 24-31) - Optional
- Additional: 2-3 days (Issues 32-36)

**Total: 13-17 days** (or 9-12 days without Phase 4)

**Dependencies:**
- Issues 1-8 must be completed before Phase 2
- Issues 9-16 must be completed before Phase 3
- Issues 17-23 must be completed before Phase 4
- Issue 24 must be completed before issues 25-31
- Issues 32-36 can be done alongside or after main phases

**Priority:**
- **High Priority:** Phase 1 (Issues 1-8) - Core functionality
- **High Priority:** Phase 2 (Issues 9-16) - User experience
- **Medium Priority:** Phase 3 (Issues 17-23) - Performance & offline
- **Low Priority:** Phase 4 (Issues 24-31) - Enhanced auth (optional)
- **Medium Priority:** Additional (Issues 32-36) - Quality & release

---

## Notes for Implementation

1. **Start with Phase 1** - It provides the foundation for all other phases
2. **Test continuously** - Each issue should include testing
3. **Document as you go** - Don't leave documentation for the end
4. **Get feedback early** - Release beta versions after each phase
5. **Security first** - Pay special attention to credential handling
6. **Performance matters** - Profile and optimize regularly
7. **User experience** - Test with real users throughout development

For detailed implementation guidance, see:
- **[QLIK_CLOUD_RESEARCH.md](./QLIK_CLOUD_RESEARCH.md)** - Complete research and architecture
- **[QLIK_CLOUD_IMPLEMENTATION.md](./QLIK_CLOUD_IMPLEMENTATION.md)** - Step-by-step implementation guide
- **[QLIK_CLOUD_SUMMARY.md](./QLIK_CLOUD_SUMMARY.md)** - Executive summary and quick reference
