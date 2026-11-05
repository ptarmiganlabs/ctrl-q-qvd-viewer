# Publishing to VS Code Marketplace

This document explains how to publish the Ctrl-Q QVD Viewer extension to the Visual Studio Code Marketplace.

## Prerequisites

### 1. Access to the Marketplace publisher

The extension is published under the existing Marketplace publisher **Ptarmigan Labs** (ID `PtarmiganLabs`). Publisher IDs aren't case-sensitive, so `"publisher": "ptarmiganlabs"` in `package.json` refers to it.

1. Go to [Visual Studio Marketplace Publisher Management](https://marketplace.visualstudio.com/manage)
2. Sign in with a Microsoft account that is a member of the Ptarmigan Labs publisher

If the page only offers to create a publisher, the account you signed in with isn't a member. Don't create a new publisher: an extension's ID includes its publisher, so anything published under a new one would be a separate extension that existing users never get updates from. If Microsoft asks whether an address is a work or school account or a personal account, the choice matters, because they are separate accounts.

### 2. Create a Trusted Publishing policy

CI publishes with Marketplace Trusted Publishing: the workflow exchanges a GitHub OIDC token for a Marketplace token that lasts up to 15 minutes, so no Personal Access Token is stored in the repository.

1. On the publisher management page, open **Ptarmigan Labs** → **Trusted Publishing** → **Create**
2. Fill in the policy:
   - **Policy name**: `ctrl-q-qvd-viewer CI` (any name works)
   - **Repository owner**: `ptarmiganlabs`
   - **Repository**: `ctrl-q-qvd-viewer`
   - **Workflow file**: `ci.yaml`
   - **Environment**: leave empty (the `publish` job doesn't use a GitHub environment)
3. Select **Create**

If the workflow file is renamed, or the `publish` job is moved into a GitHub environment, update the policy to match, or publishing will fail.

## Publishing Methods

### Option 1: Automated Publishing via GitHub Actions (Recommended)

The `publish` job in `.github/workflows/ci.yaml` runs whenever Release Please creates a release. It installs vsce 4.1.0 or later and runs `vsce publish --oidc`; the job's `id-token: write` permission lets vsce request the GitHub OIDC token.

**How it works:**

- Release Please creates a release PR when you push conventional commits
- When you merge the PR, it creates a GitHub release
- The CI workflow automatically packages and publishes the extension
- Version number is automatically bumped based on commit messages

### Option 2: Manual Publishing

If you need to publish without CI:

1. Install vsce globally:

   ```bash
   npm install -g @vscode/vsce
   ```

2. Package the extension:

   ```bash
   vsce package
   ```

3. On the [publisher management page](https://marketplace.visualstudio.com/manage), open the extension's menu and upload the `.vsix` file as an update.

Publishing from the command line (`vsce login ptarmiganlabs`, then `vsce publish`) needs a Personal Access Token created for **All accessible organizations** with the **Marketplace → Manage** scope. Azure DevOps is retiring that kind of token (a "global" PAT); see the [VS Code Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) for the current status.

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

**Publishing fails at the "Publish to VS Code Marketplace" step**

- Check that the Trusted Publishing policy names repository owner `ptarmiganlabs`, repository `ctrl-q-qvd-viewer` and workflow file `ci.yaml`
- Check that the `publish` job still has the `id-token: write` permission
- vsce doesn't fall back to a Personal Access Token when the OIDC exchange fails, so adding a `VSCE_PAT` secret won't help

**Error: "Extension already published with this version"**

- Bump the version in `package.json`
- Or use `vsce publish patch/minor/major`

**Error: "Publisher not found"**

- Verify the publisher ID in `package.json` is `ptarmiganlabs` (case doesn't matter)
- Don't create a new publisher; see [Access to the Marketplace publisher](#1-access-to-the-marketplace-publisher)

## Additional Resources

- [VS Code Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce CLI Documentation](https://github.com/microsoft/vscode-vsce)
- [Release Please Documentation](https://github.com/googleapis/release-please)
- [Conventional Commits](https://www.conventionalcommits.org/)
