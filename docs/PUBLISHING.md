# Publishing to VS Code Marketplace

This document explains how to publish the Ctrl-Q QVD Viewer extension to the Visual Studio Code Marketplace.

## Prerequisites

### 1. Create a Microsoft Publisher Account

1. Go to [Visual Studio Marketplace Publisher Management](https://marketplace.visualstudio.com/manage)
2. Sign in with your Microsoft account
3. Create a publisher with ID: `ptarmiganlabs` (or verify it exists)
4. Fill in the publisher details:
   - **Publisher name**: Ptarmigan Labs
   - **Publisher ID**: ptarmiganlabs
   - **Email**: (your contact email)

### 2. Generate a Personal Access Token (PAT)

1. Navigate to [Azure DevOps](https://dev.azure.com/)
2. Click on your user profile → **Personal Access Tokens**
3. Click **+ New Token**
4. Configure the token:
   - **Name**: VS Code Marketplace Publishing
   - **Organization**: All accessible organizations
   - **Expiration**: Set to your preference (recommend 90 days for security)
   - **Scopes**: Select **Custom defined** and check:
     - ✅ **Marketplace** → **Manage** (this is the critical permission)
5. Click **Create** and **copy the token immediately** (you won't see it again)

### 3. Add PAT to GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the secret:
   - **Name**: `VSCE_PAT`
   - **Value**: (paste your PAT from Azure DevOps)
5. Click **Add secret**

## Publishing Methods

### Option 1: Automated Publishing via GitHub Actions (Recommended)

Once you've set up the `VSCE_PAT` secret:

1. Edit `.github/workflows/ci.yaml`
2. Uncomment the marketplace publishing section:
   ```yaml
   - name: Publish to VS Code Marketplace
     run: vsce publish -p ${{ secrets.VSCE_PAT }}
   ```
3. Commit and push the change
4. The extension will automatically publish when a release is created

**How it works:**
- Release Please creates a release PR when you push conventional commits
- When you merge the PR, it creates a GitHub release
- The CI workflow automatically packages and publishes the extension
- Version number is automatically bumped based on commit messages

### Option 2: Manual Publishing

If you prefer manual control:

1. Install vsce globally:
   ```bash
   npm install -g @vscode/vsce
   ```

2. Login to the marketplace:
   ```bash
   vsce login ptarmiganlabs
   ```
   (Enter your PAT when prompted)

3. Publish the extension:
   ```bash
   vsce publish
   ```

   Or publish a specific version:
   ```bash
   vsce publish minor  # Bumps minor version
   vsce publish 1.0.0  # Publishes specific version
   ```

## Publishing to Open VSX Registry (Optional)

Open VSX is an alternative marketplace used by VS Codium and other editors.

### Setup

1. Create an account at [Open VSX Registry](https://open-vsx.org/)
2. Generate an access token from your account settings
3. Add it to GitHub secrets as `OPEN_VSX_TOKEN`
4. Uncomment the Open VSX publishing section in `.github/workflows/ci.yaml`

## Version Management with Release Please

This project uses [Release Please](https://github.com/googleapis/release-please) for automated version management.

### How to Create Releases

Use [Conventional Commits](https://www.conventionalcommits.org/) in your commit messages:

```bash
# Feature (bumps minor version)
git commit -m "feat: add support for larger QVD files"

# Bug fix (bumps patch version)
git commit -m "fix: resolve pagination issue on last page"

# Breaking change (bumps major version)
git commit -m "feat!: redesign API structure

BREAKING CHANGE: The configuration format has changed"
```

### Release Process

1. **Make changes** with conventional commits
2. **Push to main** branch
3. **Release Please creates a PR** with:
   - Updated version in `package.json`
   - Updated `CHANGELOG.md`
4. **Review and merge** the PR
5. **Release is automatically created** and extension is published

## Marketplace Requirements

### Extension Validation

Before publishing, ensure:

- ✅ Extension icon is set (128x128 PNG)
- ✅ Repository URL is correct
- ✅ README.md is comprehensive
- ✅ LICENSE file exists
- ✅ No hardcoded credentials or secrets
- ✅ Extension size is under 100MB

### Marketplace Guidelines

Follow [VS Code Publishing Guidelines](https://code.visualstudio.com/api/references/extension-guidelines):

- Clear, descriptive extension name
- Professional icon and screenshots
- Detailed description and features list
- Well-documented commands and settings
- Regular updates and bug fixes

## Testing Before Publishing

### Local Testing

1. Package the extension:
   ```bash
   vsce package
   ```

2. Install locally:
   ```bash
   code --install-extension ctrl-q-qvd-viewer-X.Y.Z.vsix
   ```

3. Test all functionality before publishing

### Pre-release Versions

For testing in production marketplace:

```bash
vsce publish --pre-release
```

This creates a pre-release version that users can opt into.

## Monitoring and Updates

### After Publishing

1. Monitor the [marketplace page](https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer)
2. Respond to user reviews and Q&A
3. Track download statistics
4. Keep the extension updated with VS Code API changes

### Updating the Extension

Simply push new commits with conventional commit messages. Release Please handles the rest!

## Troubleshooting

### Common Issues

**Error: "Failed to publish: Permission denied"**
- Verify your PAT has "Marketplace: Manage" scope
- Check that the PAT hasn't expired
- Ensure the publisher ID matches your account

**Error: "Extension already published with this version"**
- Bump the version in `package.json`
- Or use `vsce publish patch/minor/major`

**Error: "Publisher not found"**
- Create the publisher account first
- Verify the publisher ID in `package.json` matches

## Additional Resources

- [VS Code Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce CLI Documentation](https://github.com/microsoft/vscode-vsce)
- [Release Please Documentation](https://github.com/googleapis/release-please)
- [Conventional Commits](https://www.conventionalcommits.org/)
