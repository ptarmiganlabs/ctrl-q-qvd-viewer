# Integration Testing Guide

This guide explains how to run integration tests that verify real connectivity to Qlik Sense Cloud.

## Overview

The test suite includes two types of tests:

1. **Unit Tests** (Always Run)

   - Test logic and error handling with mocked connections
   - No real API credentials needed
   - Fast execution
   - Run automatically with `npm test`

2. **Integration Tests** (Optional)
   - Test real connectivity to Qlik Sense Cloud
   - Require valid API credentials
   - Make actual API calls
   - Verify end-to-end functionality

## Running Unit Tests Only

By default, only unit tests run:

```bash
npm test
```

You'll see messages for skipped integration tests:

```text
⚠ Skipping integration test - set QLIK_API_KEY and QLIK_TENANT_URL to run
```

## Running Integration Tests

### Prerequisites

1. **Qlik Sense Cloud Tenant**

   - Active Qlik Sense Cloud subscription
   - Tenant URL (e.g., `your-tenant.us.qlikcloud.com`)

2. **API Key**

   - Generate an API key from Qlik Cloud Management Console
   - Navigate to: Profile → API Keys → Generate New Key
   - Copy the key immediately (it won't be shown again)
   - More info: https://qlik.dev/authenticate/api-key/generate-your-first-api-key/

3. **Test File (Optional for Download Tests)**
   - Upload a QVD file to Qlik Cloud Data Files
   - Note the file ID for testing downloads

### Environment Variables Setup

#### Recommended: Using .env File (Best for Local Development)

The easiest and most secure way to provide credentials:

1. **Copy the example file:**

   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your credentials:**

   ```bash
   QLIK_API_KEY=eyJhbGciOiJFUzM4NCIsImtpZCI...
   QLIK_TENANT_URL=mytenant.us.qlikcloud.com
   QLIK_TEST_FILE_ID=67890abc-def1-2345-6789-0abcdef12345
   ```

3. **Run integration tests:**
   ```bash
   npm run test:integration
   ```

The `.env` file is already in `.gitignore` and will never be committed.

#### Alternative: Manual Environment Variables

If you prefer not to use a `.env` file, you can set environment variables manually:

##### Required for All Integration Tests

```bash
export QLIK_API_KEY="your-api-key-here"
export QLIK_TENANT_URL="your-tenant.us.qlikcloud.com"
```

##### Optional for Download Tests

```bash
export QLIK_TEST_FILE_ID="file-id-from-qlik-cloud"
```

### Running Tests

#### Quick Start (Recommended)

```bash
# 1. Setup (one-time)
cp .env.example .env
# Edit .env with your credentials

# 2. Run integration tests
npm run test:integration

# 3. Run unit tests only (no credentials needed)
npm test
```

#### macOS/Linux

**Option 1: Using .env file (Recommended)**

```bash
npm run test:integration
```

**Option 2: Manual environment variables**

```bash
# Set environment variables
export QLIK_API_KEY="eyJhbGciOiJFUz..."
export QLIK_TENANT_URL="mytenant.us.qlikcloud.com"
export QLIK_TEST_FILE_ID="67890abc-def1-2345-6789-0abcdef12345"

# Run all tests (unit + integration)
npm test
```

#### Windows (PowerShell)

**Option 1: Using .env file (Recommended)**

```powershell
npm run test:integration
```

**Option 2: Manual environment variables**

```powershell
# Set environment variables
$env:QLIK_API_KEY="eyJhbGciOiJFUz..."
$env:QLIK_TENANT_URL="mytenant.us.qlikcloud.com"
$env:QLIK_TEST_FILE_ID="67890abc-def1-2345-6789-0abcdef12345"

# Run all tests (unit + integration)
npm test
```

#### Windows (Command Prompt)

**Option 1: Using .env file (Recommended)**

```cmd
npm run test:integration
```

**Option 2: Manual environment variables**

```cmd
# Set environment variables
set QLIK_API_KEY=eyJhbGciOiJFUz...
set QLIK_TENANT_URL=mytenant.us.qlikcloud.com
set QLIK_TEST_FILE_ID=67890abc-def1-2345-6789-0abcdef12345

# Run all tests (unit + integration)
npm test
```

### One-Line Test Execution (Advanced)

For quick one-time testing without creating a `.env` file:

#### macOS/Linux

```bash
QLIK_API_KEY="your-key" QLIK_TENANT_URL="your-tenant.us.qlikcloud.com" npm test
```

## Integration Test Coverage

### CloudConnectionManager Integration Tests

1. **Connection Test**

   - Verifies successful connection to Qlik Cloud
   - Checks connection state management
   - **API Call**: Connection initialization

2. **User Authentication Test**

   - Calls `users.getMyUser()` to verify authentication
   - Validates user object structure
   - **API Call**: `GET /api/v1/users/me`

3. **Test Connection Method**

   - Verifies `testConnection()` works with real API
   - Tests lightweight connectivity check
   - **API Call**: `GET /api/v1/spaces?limit=1`

4. **Invalid API Key Test**
   - Verifies proper handling of invalid credentials
   - Tests error handling and reporting
   - **API Call**: Attempts connection with invalid key

### DownloadManager Integration Tests

1. **File Download Test**

   - Downloads real QVD file from Qlik Cloud
   - Verifies file is saved to cache
   - Checks file size and content
   - **API Call**: `GET /api/v1/data-files/{fileId}/data`
   - **Requires**: `QLIK_TEST_FILE_ID`

2. **Cache Usage Test**

   - Downloads file twice
   - Verifies second download uses cache
   - Confirms no redundant network calls
   - **Requires**: `QLIK_TEST_FILE_ID`

3. **Cache Statistics Test**

   - Verifies accurate cache size calculation
   - Tests file count tracking
   - Validates formatted size output
   - **Requires**: `QLIK_TEST_FILE_ID`

4. **Cache Clearing Test**
   - Downloads file and verifies caching
   - Clears cache
   - Confirms file removed from cache
   - **Requires**: `QLIK_TEST_FILE_ID`

## Getting Test File ID

To get a file ID for download testing:

### Using Qlik Cloud Console

1. Log in to Qlik Cloud Management Console
2. Navigate to **Data** → **Data Files**
3. Upload a QVD file or locate an existing one
4. Click on the file to view details
5. Copy the File ID from the URL or details panel

### Using Qlik Cloud REST API

```bash
# Get list of data files
curl -X GET "https://your-tenant.us.qlikcloud.com/api/v1/data-files" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Find a file ID in the response
```

### Using @qlik/api SDK

```javascript
import { dataFiles } from "@qlik/api";

const hostConfig = {
  host: "https://your-tenant.us.qlikcloud.com",
  authType: "apikey",
  apiKey: "your-api-key",
};

const files = await dataFiles(hostConfig).getDataFiles({ limit: 10 });
console.log(
  "Available files:",
  files.data.map((f) => ({ id: f.id, name: f.name }))
);
```

## Expected Test Output

### Without Integration Tests

```
  CloudConnectionManager Test Suite
    ✓ Unit tests...
    Integration Tests (with real API)
      ⚠ Skipping integration test - set QLIK_API_KEY and QLIK_TENANT_URL to run
      ⚠ Skipping integration test - set QLIK_API_KEY and QLIK_TENANT_URL to run
      ⚠ Skipping integration test - set QLIK_API_KEY and QLIK_TENANT_URL to run

  81 passing (330ms)
```

### With Integration Tests

```
  CloudConnectionManager Test Suite
    ✓ Unit tests...
    Integration Tests (with real API)
      ✓ should connect to real Qlik Cloud with valid credentials
      ✓ should successfully call Qlik Cloud API (users.getMyUser)
        ✓ Successfully authenticated as: user@example.com
      ✓ should successfully test connection with testConnection()
      ✓ should fail with invalid API key
        ✓ Correctly rejected invalid API key: Unauthorized

  DownloadManager Test Suite
    ✓ Unit tests...
    Integration Tests (with real API)
      ✓ should download real file from Qlik Cloud
        ✓ Successfully downloaded file: abc123 (45678 bytes)
      ✓ should use cache for subsequent downloads
        ✓ Successfully verified cache usage
      ✓ should get accurate cache statistics
        ✓ Cache stats: 1 file(s), 44.6 KB
      ✓ should clear cache successfully
        ✓ Successfully cleared cache

  92 passing (2.5s)
```

## Security Best Practices

### Never Commit Credentials

- ✅ **DO**: Use environment variables
- ✅ **DO**: Use `.env` file (already in `.gitignore`)
- ✅ **DO**: Use CI/CD secrets for automated testing
- ❌ **DON'T**: Hardcode API keys in test files
- ❌ **DON'T**: Commit `.env` files to git
- ❌ **DON'T**: Share API keys in screenshots or logs

### API Key Permissions

For testing, your API key should have:

- **Data Files**: Read access (for download tests)
- **Users**: Read access (for authentication tests)
- **Spaces**: Read access (for connection tests)

Use a **dedicated testing API key** with minimal permissions, not your production key.

### Revoking API Keys

If you accidentally expose your API key:

1. Immediately revoke it in Qlik Cloud Console
2. Generate a new key
3. Update your environment variables

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "18"

      - run: npm install

      # Run unit tests (always)
      - run: npm test

      # Run integration tests (only if secrets configured)
      - name: Integration Tests
        if: ${{ secrets.QLIK_API_KEY != '' }}
        env:
          QLIK_API_KEY: ${{ secrets.QLIK_API_KEY }}
          QLIK_TENANT_URL: ${{ secrets.QLIK_TENANT_URL }}
          QLIK_TEST_FILE_ID: ${{ secrets.QLIK_TEST_FILE_ID }}
        run: npm test
```

## Troubleshooting

### Integration Tests Not Running

**Symptom**: All integration tests are skipped

**Solution**:

- Verify environment variables are set: `echo $QLIK_API_KEY`
- Check variable names match exactly (case-sensitive)
- Ensure no extra spaces in values

### Authentication Failures

**Symptom**: Tests fail with "401 Unauthorized"

**Solution**:

- Verify API key is valid and not expired
- Check API key has required permissions
- Ensure tenant URL is correct (no `https://` prefix)

### Download Tests Skipped

**Symptom**: Connection tests pass but download tests skip

**Solution**:

- Set `QLIK_TEST_FILE_ID` environment variable
- Verify file ID exists in your tenant
- Check API key has Data Files read permission

### Network Errors

**Symptom**: Tests fail with network/timeout errors

**Solution**:

- Check internet connectivity
- Verify tenant URL is accessible
- Check firewall/proxy settings
- Ensure tenant is not suspended

## Test Performance

- **Unit Tests Only**: ~330ms (81 tests)
- **With Integration Tests**: ~2-5s (92 tests)
  - Connection overhead: ~500ms
  - API calls: ~200ms each
  - File downloads: 1-3s (depends on file size)

## Support

For issues with:

- **Test framework**: Open issue in this repository
- **Qlik Cloud API**: See https://qlik.dev/
- **API keys**: Contact your Qlik Cloud administrator
- **@qlik/api SDK**: See https://github.com/qlik-oss/qlik-api-ts

## Related Documentation

- [Qlik Cloud API Documentation](https://qlik.dev/apis)
- [API Key Authentication Guide](https://qlik.dev/authenticate/api-key/)
- [@qlik/api SDK Reference](https://github.com/qlik-oss/qlik-api-ts)
- [Qlik Cloud Data Files API](https://qlik.dev/apis/rest/data-files)
