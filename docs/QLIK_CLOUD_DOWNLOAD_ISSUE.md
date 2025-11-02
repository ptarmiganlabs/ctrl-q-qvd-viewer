# Qlik Cloud QVD Download Issue

## Problem
The Qlik Cloud REST APIs do NOT provide an endpoint to download binary file content (QVD files).

## APIs Investigated

### 1. data-files API (`/api/v1/data-files`)
- **GET `/api/v1/data-files/{id}`** - Returns JSON metadata only
- **POST** - Upload files
- **PUT** - Re-upload/update files
- **DELETE** - Delete files
- **No download endpoint exists**

### 2. data-sets API (`/api/v1/data-sets`)
- Focused on dataset metadata, schemas, and profiling
- No binary file download capability

### 3. Attempted Endpoints (all return 404 or JSON metadata)
- `/api/v1/data-files/{id}/content`
- `/api/v1/data-files/{id}/download`
- `/api/v1/data-files/{id}/actions/download`
- `/api/v1/qix-datafiles/{id}` - Returns JSON metadata (562 bytes)
- `/api/v1/qix-datafiles/{id}/content`
- `/api/v1/qix-datafiles/{id}/download`

## Evidence
When fetching file ID `5add3238-2f78-4e4e-8de4-0fe88f008bbb` (colors.qvd, 7815 bytes):
- Endpoint: `https://plabs.eu.qlikcloud.com/api/v1/qix-datafiles/{id}`
- Response: 562 bytes of JSON metadata
- Content-Type: `application/json; charset=utf-8`
- Actual file size: 7815 bytes

## Potential Solutions

### Option 1: QIX Engine WebSocket API
The data-files connection type is `qix-datafiles.exe`, suggesting files are accessed through the QIX Engine (Qlik's WebSocket-based analytics engine) rather than REST.

**Research needed:**
- QIX WebSocket protocol for file access
- enigma.js library usage
- File download through QIX sessions

### Option 2: Temp-Contents API
The data-files API mentions `tempContentFileId` for uploads. There may be a reverse operation:
- Upload creates temp content → Get temp content ID → Move to data-files
- Possible reverse: Get file from data-files → Create temp content → Download temp content

**Research needed:**
- temp-contents API specification
- Workflow for exporting data-files to temp-contents
- Download endpoint for temp-contents

### Option 3: Alternative Download Method
- Export via Qlik app
- Direct object storage access (if QVD files are stored in cloud storage)
- Custom Qlik extension with download capability

## Next Steps

1. **Investigate QIX Engine API** - Most likely solution
   - Review QIX WebSocket protocol docs
   - Test enigma.js for file access
   - Determine if QVD files can be downloaded via QIX

2. **Contact Qlik Support** - API gap
   - Confirm no REST endpoint for file download
   - Request feature or workaround
   - Check if this is by design (security/licensing)

3. **Consider Alternatives**
   - If cloud download not supported, document limitation
   - Focus on local QVD file support only
   - Suggest users download files manually

## Impact on Project
- **Phase 1, Step 4** blocked: Cannot implement real file downloads from Qlik Cloud
- Integration tests failing: Downloading metadata instead of binary files
- May need to significantly revise Qlik Cloud integration approach
