# Extension Bundling

This extension uses [esbuild](https://esbuild.github.io/) to bundle the source code into a single file for better performance and to ensure compatibility with VS Code for Web (github.dev, vscode.dev).

For more details on bundling VS Code extensions, see the [official documentation](https://aka.ms/vscode-bundle-extension).

## Development Scripts

- **`npm run compile`** - Compiles the extension with sourcemaps for development
- **`npm run watch`** - Watches for changes and automatically rebuilds
- **`npm run package`** - Creates a production build (minified, no sourcemaps)
- **`npm run compile-tests`** - Compiles test files
- **`npm test`** - Runs tests

## Build Output

The bundled extension is output to `dist/extension.js`. The `main` field in `package.json` points to this bundled file.

### Development Build

- Includes sourcemaps for debugging
- Not minified for easier troubleshooting
- ~6.8MB bundle + 4.9MB sourcemap

### Production Build

- Minified for smallest size
- No sourcemaps
- ~3.0MB bundle

## Publishing

When publishing the extension, the `vscode:prepublish` script automatically runs `npm run package` to create an optimized production build. The `.vscodeignore` file excludes:

- Source files (`src/`)
- Node modules (`node_modules/`)
- Build configuration (`esbuild.js`, `tsconfig.json`)
- Test files and data

Only the `dist/` folder and necessary assets are included in the published extension.

## VS Code Compatibility

The extension is bundled as CommonJS (CJS) format, which is required by VS Code. The esbuild configuration handles ESM-to-CJS conversion, including proper handling of `import.meta.url` for file path resolution.
