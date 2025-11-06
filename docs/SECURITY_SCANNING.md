# Security Scanning for Extension Publishing

## Overview

The CI/CD workflows include automated security scanning to prevent accidentally publishing sensitive files to the VS Code Marketplace. This scan runs before the extension is packaged and published.

## What Files Are Checked

The security scan checks for the following types of sensitive files:

### Environment & Configuration Files

- `.env` - Environment variables file
- `.env.*` - Environment file variants (`.env.local`, `.env.production`, etc.)
- `.envrc` - direnv configuration

### Certificates & Keys

- `*.pem` - Privacy Enhanced Mail certificate/key files
- `*.key` - Private key files
- `*.p12` - PKCS#12 certificate files
- `*.pfx` - Personal Information Exchange files
- `*.cer` - Certificate files
- `*.crt` - Certificate files
- `*.der` - Distinguished Encoding Rules files

### SSH Keys

- `id_rsa` - RSA private key
- `id_dsa` - DSA private key
- `id_ecdsa` - ECDSA private key
- `id_ed25519` - Ed25519 private key
- Any file containing `privatekey` or `private.key`

### Cloud & Service Credentials

- `credentials.json` - Generic credentials file
- `service-account*.json` - Service account keys (GCP, etc.)
- `gcloud.json` - Google Cloud credentials
- `aws-credentials` - AWS credentials file
- `auth.json` - Authentication configuration

### Package Manager Credentials

- `.npmrc` - npm configuration (may contain auth tokens)
- `.pypirc` - PyPI credentials
- `.dockercfg` - Docker registry credentials
- `.docker/config.json` - Docker configuration

### Password & Secret Files

- Files containing `password`
- `secrets.*` - Secret configuration files
- Files containing `token`

### Database Files

- `*.db` - Generic database files
- `*.sqlite` - SQLite database files
- `*.sqlite3` - SQLite 3 database files

### Backup Files

- `*.bak` - Backup files
- `*.backup` - Backup files

## Workflow Integration

The security scan is integrated into two workflows:

### 1. PR Validation Workflow (`pr-validation.yaml`)

- Runs on every pull request
- Scans the package before PR approval
- Blocks PRs if sensitive files are detected

### 2. CI/CD Workflow (`ci.yaml`)

- Runs before publishing to the marketplace
- Final safety check before release
- Prevents publishing if sensitive files are detected

## What Happens When Sensitive Files Are Detected

If the scan detects any sensitive files, it will:

1. **Stop the workflow** - Exit with error code 1
2. **Display detailed information**:
   - List all detected sensitive files
   - Explain what types of data these files might contain
   - Provide remediation steps

Example output:

```
❌ ERROR: Sensitive files detected in extension package!

The following sensitive files would be included in the published extension:
  - .env
  - private.key
  - credentials.json

These files may contain:
  • API keys, tokens, or credentials
  • Private certificates or SSH keys
  • Environment configuration
  • Database files with sensitive data

Action required:
  1. Add these files to .vscodeignore
  2. Verify no sensitive data is committed to the repository
  3. Rotate any exposed credentials
```

## How to Fix Issues

If sensitive files are detected:

1. **Add to `.vscodeignore`**:

   ```
   .env
   *.key
   *.pem
   credentials.json
   ```

2. **Verify the file is not committed**:

   ```bash
   git status
   git log --all --full-history -- path/to/sensitive/file
   ```

3. **If already committed**, remove from history:

   ```bash
   git filter-branch --force --index-filter \
     'git rm --cached --ignore-unmatch path/to/sensitive/file' \
     --prune-empty --tag-name-filter cat -- --all
   ```

4. **Rotate any exposed credentials**:

   - API keys
   - Access tokens
   - Passwords
   - Certificates

5. **Add to `.gitignore`** to prevent future commits:
   ```
   .env
   *.key
   *.pem
   ```

## Testing Locally

You can test the security scan locally before pushing:

```bash
# List files that will be included in the package
npx @vscode/vsce ls

# Package the extension and check
npx @vscode/vsce package
```

## Customizing the Scan

If you need to add more patterns or exclude certain files from the scan, edit the `SENSITIVE_PATTERNS` array in:

- `.github/workflows/ci.yaml`
- `.github/workflows/pr-validation.yaml`

## Best Practices

1. **Never commit sensitive files** to the repository
2. **Use `.gitignore`** for local sensitive files
3. **Use `.vscodeignore`** to exclude from extension package
4. **Use secrets management** for credentials (GitHub Secrets, environment variables)
5. **Rotate credentials** if they've been exposed
6. **Review package contents** regularly using `vsce ls`

## Related Documentation

- [Publishing Extensions](PUBLISHING.md)
- [CI/CD Pipeline](CI_CD.md)
- [VS Code Extension Guidelines](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#advanced-usage)
