# CI/CD Setup Guide

This document explains the CI/CD setup for the Ctrl-Q QVD Viewer extension.

## Overview

The project uses GitHub Actions for:
- ✅ Automated testing and linting
- ✅ Version management with Release Please
- ✅ Extension packaging
- ✅ Publishing to VS Code Marketplace
- ✅ SBOM (Software Bill of Materials) generation

## Workflows

### 1. Main CI/CD Workflow (`.github/workflows/ci.yaml`)

Triggers on:
- Push to `main` branch
- Pull requests to `main`
- Manual workflow dispatch

**Jobs:**

1. **test**: Runs on all pushes and PRs
   - Installs dependencies
   - Runs ESLint
   - Executes test suite

2. **release-please**: Runs only on main branch pushes after tests pass
   - Creates/updates release PR
   - Bumps version based on conventional commits
   - Updates CHANGELOG.md
   - Creates GitHub release when PR is merged

3. **publish**: Runs when a release is created
   - Packages the extension (.vsix file)
   - Uploads to GitHub release
   - Publishes to VS Code Marketplace (when configured)
   - Optionally publishes to Open VSX

4. **sbom**: Generates software bill of materials
   - Creates SPDX SBOM for security compliance
   - Uploads to GitHub release

### 2. PR Validation Workflow (`.github/workflows/pr-validation.yaml`)

Triggers on pull request events.

**Jobs:**

1. **validate**: Full validation of PR
   - Linting
   - Tests
   - Build verification
   - Breaking change detection

2. **size-check**: Monitors extension size
   - Warns if package exceeds 50MB
   - Prevents marketplace upload issues

## Release Please Configuration

### Conventional Commits

The project uses [Conventional Commits](https://www.conventionalcommits.org/) for version management:

```bash
# Patch version (0.0.X)
fix: resolve pagination bug

# Minor version (0.X.0)
feat: add export to CSV functionality

# Major version (X.0.0)
feat!: redesign extension API

BREAKING CHANGE: Configuration format changed
```

### Configuration Files

**`release-please-config.json`**: Main configuration
- Release type: node
- Package name: ctrl-q-qvd-viewer
- Changelog sections and formatting
- Version bump rules

**`.release-please-manifest.json`**: Version tracking
- Tracks current version
- Updated automatically by Release Please

## Setting Up CI/CD

### Step 1: Repository Settings

No special configuration needed - the workflows use `GITHUB_TOKEN` automatically.

### Step 2: Configure Marketplace Publishing

See [PUBLISHING.md](./PUBLISHING.md) for detailed instructions:

1. Create VS Code Marketplace publisher account
2. Generate Azure DevOps PAT with Marketplace scope
3. Add `VSCE_PAT` to GitHub repository secrets
4. Uncomment publishing steps in `ci.yaml`

### Step 3: Optional - Open VSX Publishing

1. Create account at https://open-vsx.org/
2. Generate access token
3. Add `OPEN_VSX_TOKEN` to GitHub secrets
4. Uncomment Open VSX steps in `ci.yaml`

## How Releases Work

### Automatic Release Process

1. **Developer makes changes** using conventional commits:
   ```bash
   git commit -m "feat: add dark theme support"
   git push origin feature-branch
   ```

2. **Create PR and merge** to main:
   - PR validation runs automatically
   - Code is reviewed and merged

3. **Release Please creates release PR**:
   - Analyzes commits since last release
   - Determines version bump (patch/minor/major)
   - Updates `package.json` version
   - Generates/updates `CHANGELOG.md`
   - Creates PR titled "chore: release X.Y.Z"

4. **Review and merge release PR**:
   - Review changelog entries
   - Merge the PR

5. **Automated publishing**:
   - GitHub release is created with tag
   - Extension is packaged (.vsix)
   - Published to VS Code Marketplace
   - SBOM is generated and attached

### Manual Release Trigger

You can manually trigger a release:

1. Go to Actions tab
2. Select "CI/CD" workflow
3. Click "Run workflow"
4. Select branch and run

## Monitoring CI/CD

### GitHub Actions

View workflow runs:
- Repository → Actions tab
- See status of all workflows
- View logs for debugging

### Release Status

Check release status:
- Repository → Releases
- See all versions and assets
- Download VSIX files

### Marketplace Status

After publishing:
- [Your extension page](https://marketplace.visualstudio.com/items?itemName=ptarmiganlabs.ctrl-q-qvd-viewer)
- Downloads and ratings
- User reviews and Q&A

## Workflow Badges

Add these to your README.md:

```markdown
[![CI/CD](https://github.com/ptarmiganlabs/qvd4vscode/actions/workflows/ci.yaml/badge.svg)](https://github.com/ptarmiganlabs/qvd4vscode/actions/workflows/ci.yaml)
[![PR Validation](https://github.com/ptarmiganlabs/qvd4vscode/actions/workflows/pr-validation.yaml/badge.svg)](https://github.com/ptarmiganlabs/qvd4vscode/actions/workflows/pr-validation.yaml)
```

## Troubleshooting

### Build Failures

**Tests fail on CI but pass locally:**
- Check Node.js version matches (22.x)
- Ensure all dependencies are in package.json
- Check for environment-specific issues

**Linting errors:**
- Run `npm run lint` locally first
- Fix issues before pushing
- Consider auto-formatting on commit

### Release Issues

**Release Please not creating PR:**
- Check commit message format
- Ensure commits follow conventional commits
- Verify you're on main branch
- May need at least one feature/fix commit

**Version not bumping correctly:**
- Review commit types (feat vs fix)
- Check for breaking change markers
- See release-please-config.json for rules

**Publishing fails:**
- Verify VSCE_PAT secret is set
- Check PAT hasn't expired
- Ensure publisher account exists
- Review marketplace guidelines

### SBOM Generation

**SBOM job fails:**
- Check network connectivity
- Verify sbom-tool download URL
- Review dependency installation

## Security Best Practices

### Secrets Management

- Never commit secrets or tokens
- Rotate PATs regularly (every 90 days)
- Use minimal required permissions
- Store all secrets in GitHub Secrets

### Dependency Security

- Dependabot enabled by default
- Review and merge security updates
- Keep Node.js version current
- Monitor SBOM for vulnerabilities

## Customization

### Adding New Jobs

Edit `.github/workflows/ci.yaml`:

```yaml
my-custom-job:
  runs-on: ubuntu-latest
  needs: test  # Run after tests pass
  steps:
    - uses: actions/checkout@v4
    - name: My custom step
      run: echo "Custom logic here"
```

### Changing Release Rules

Edit `release-please-config.json`:

```json
{
  "packages": {
    ".": {
      "release-type": "node",
      "bump-minor-pre-major": false,  // Change version bump rules
      "bump-patch-for-minor-pre-major": false
    }
  }
}
```

### Adding Changelog Sections

Edit `release-please-config.json`:

```json
{
  "changelog-sections": [
    {
      "type": "security",
      "section": "Security Fixes",
      "hidden": false
    }
  ]
}
```

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Release Please Documentation](https://github.com/googleapis/release-please)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Conventional Commits Specification](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
