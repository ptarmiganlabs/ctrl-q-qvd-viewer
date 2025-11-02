# Qlik Sense Cloud Integration Module

This directory contains the implementation for Qlik Sense Cloud integration in the Ctrl-Q QVD Viewer extension.

## Architecture Overview

The cloud integration is organized into several key components:

### Core Components

1. **QlikAuthProvider** (`qlikAuthProvider.mjs`)

   - Manages secure storage of API keys using VS Code's SecretStorage API
   - Validates and normalizes tenant URLs
   - Handles credential lifecycle

2. **CloudConnectionManager** (`cloudConnectionManager.mjs`)

   - Establishes and manages connections to Qlik Cloud tenants
   - Uses `@qlik/api` toolkit for API communication
   - Tracks connection state and handles errors

3. **DownloadManager** (`downloadManager.mjs`)

   - Handles downloading QVD files from Qlik Cloud
   - Implements intelligent local caching
   - Manages cache lifecycle and statistics

4. **CloudQvdReader** (`cloudQvdReader.mjs`)
   - Adapter between cloud files and existing QVD reader
   - Provides seamless integration with local file handling
   - Lists and retrieves cloud QVD files

## Implementation Phases

### Phase 1: Foundation (API Key Authentication) ✅ In Progress

- Basic cloud connectivity with API Key authentication
- File listing and download with caching
- Integration with existing QVD viewer

### Phase 2: Enhanced UX (Planned)

- TreeView for browsing cloud files
- Search and filter capabilities
- Progress indicators and metadata display

### Phase 3: Cache Management (Planned)

- Intelligent cache with expiration policies
- Cache size limits and management UI
- Offline mode support

### Phase 4: OAuth2 (Optional)

- OAuth2 Authorization Code flow with PKCE
- Browser-based authentication
- Automatic token refresh

## Development Status

| Component              | Status      | Issue |
| ---------------------- | ----------- | ----- |
| Project Structure      | ✅ Complete | #1    |
| QlikAuthProvider       | 🚧 Pending  | #2    |
| CloudConnectionManager | 🚧 Pending  | #3    |
| DownloadManager        | 🚧 Pending  | #4    |
| CloudQvdReader         | 🚧 Pending  | #5    |

## Dependencies

- `@qlik/api` - Official Qlik Cloud API toolkit
- `vscode` - VS Code extension API
- Node.js built-in modules (`fs`, `path`)

## Usage Example (Future)

```javascript
import {
  QlikAuthProvider,
  CloudConnectionManager,
  CloudQvdReader,
} from "./cloud";

// Initialize components
const authProvider = new QlikAuthProvider(context);
await authProvider.setApiKey("your-api-key");
await authProvider.setTenantUrl("https://your-tenant.qlikcloud.com");

// Connect to Qlik Cloud
const connectionManager = new CloudConnectionManager(authProvider);
await connectionManager.connect();

// Read cloud QVD files
const downloadManager = new DownloadManager(connectionManager, context);
const reader = new CloudQvdReader(downloadManager);
const files = await reader.listFiles();
```

## Security Considerations

- API keys are stored securely in OS keychain via VS Code SecretStorage
- No credentials are stored in plaintext
- Cache directory is excluded from version control
- All network communication uses HTTPS

## Testing

Unit tests for each component will be added in subsequent issues.

## Documentation

For detailed implementation guidance, see:

- [QLIK_CLOUD_IMPLEMENTATION.md](../../docs/QLIK_CLOUD_IMPLEMENTATION.md)
- [QLIK_CLOUD_RESEARCH.md](../../docs/QLIK_CLOUD_RESEARCH.md)
- [QLIK_CLOUD_ISSUES.md](../../docs/QLIK_CLOUD_ISSUES.md)
