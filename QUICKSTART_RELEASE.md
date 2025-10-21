# Quick Start: Your First Release

This guide will walk you through creating your first automated release with the new CI/CD setup.

## Step 1: Verify Setup

Check that these files exist:

```bash
.github/workflows/ci.yaml
.github/workflows/pr-validation.yaml
release-please-config.json
.release-please-manifest.json
```

✅ All created!

## Step 2: Make Some Commits

Use conventional commit messages. Here are examples:

```bash
# Feature (will bump from 0.0.1 to 0.1.0)
git add .
git commit -m "feat: add CI/CD with release-please"
git push origin main
```

Wait a few minutes for GitHub Actions to run...

## Step 3: Check GitHub

1. Go to your repository on GitHub
2. Click the **Actions** tab
3. You should see the "CI/CD" workflow running
4. Wait for it to complete (should be green ✅)

## Step 4: Find the Release PR

1. Click the **Pull Requests** tab
2. Look for a PR titled: **"chore: release 0.1.0"** (or similar)
3. Open the PR and review:
   - Changed `package.json` version
   - Generated `CHANGELOG.md`
   - All commits since last release

## Step 5: Merge the Release PR

1. Review the changes
2. Click **Merge pull request**
3. Confirm the merge

## Step 6: Watch the Magic ✨

After merging, the CI/CD workflow will automatically:

1. Create a GitHub Release (tagged v0.1.0)
2. Package your extension (.vsix file)
3. Upload the .vsix to the release
4. Generate and attach SBOM
5. Publish to marketplace (when configured)

Check:
- **Releases** tab for the new release
- **Actions** tab to watch the publish workflow

## That's It! 🎉

Your first automated release is complete!

## For Future Releases

Just keep making commits with conventional messages:

```bash
# Bug fix (0.1.0 → 0.1.1)
git commit -m "fix: resolve pagination issue"

# New feature (0.1.1 → 0.2.0)
git commit -m "feat: add export functionality"

# Breaking change (0.2.0 → 1.0.0)
git commit -m "feat!: redesign API

BREAKING CHANGE: Configuration format changed"
```

Push to main, and Release Please handles the rest!

## Common Commands

```bash
# Check status of workflows
gh workflow view ci.yaml

# List recent releases
gh release list

# Download latest release
gh release download

# View PR list
gh pr list
```

## Troubleshooting

### No Release PR Created?

- Ensure you're on the `main` branch
- Check that commits follow conventional format
- Need at least one `feat:` or `fix:` commit
- Check Actions tab for errors

### Workflow Failed?

1. Click on the failed workflow in Actions
2. Click on the failed job
3. Expand the failed step
4. Read the error message
5. Check docs/CI_CD.md for solutions

### Want to Test Locally First?

```bash
# Run linter
npm run lint

# Run tests
npm test

# Package extension
npm install -g @vscode/vsce
vsce package

# Install locally to test
code --install-extension ctrl-q-qvd-viewer-*.vsix
```

## Next Steps

Once your first release works:

1. Set up marketplace publishing (see docs/PUBLISHING.md)
2. Add badges to README.md
3. Configure Dependabot for security updates
4. Customize changelog sections if needed

## Need Help?

- 📖 Read [CI_CD.md](./docs/CI_CD.md) for full documentation
- 📖 Read [PUBLISHING.md](./docs/PUBLISHING.md) for marketplace setup
- 🔗 Check [Release Please docs](https://github.com/googleapis/release-please)
- 🔗 Review [Butler's workflows](https://github.com/ptarmiganlabs/butler/tree/master/.github/workflows) for reference
