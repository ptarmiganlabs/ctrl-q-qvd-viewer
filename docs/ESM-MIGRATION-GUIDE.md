# ESM Migration Guide for VS Code Extensions

This document provides a systematic approach for migrating VS Code extensions from CommonJS to ESM using a hybrid pattern.

## Quick Reference

### File Conversions Completed

| Category | Files Converted | Status |
|----------|----------------|--------|
| Entry Points | 2 (CJS wrapper + ESM impl) | ✅ Complete |
| Core Modules | 3 (aboutPanel, qvdReader, qvdEditorProvider) | ✅ Complete |
| Exporters | 12 (all export format handlers) | ✅ Complete |
| **Total** | **17 files** | ✅ Complete |

## The Hybrid Pattern

VS Code extensions MUST have a CommonJS entry point because the extension host uses `require()`. However, internal modules can be ESM.

### Pattern Structure

```
extension.cjs (CommonJS)
    ↓ dynamic import()
extension.mjs (ESM)
    ↓ static import
Internal Modules (ESM)
```

## Step-by-Step Conversion Process

### Step 1: Create CJS Wrapper

Create `src/extension.cjs`:

```javascript
// CommonJS wrapper for VS Code extension entry point
async function activate(context) {
  try {
    const { activate: esmActivate } = await import('./extension.mjs');
    return await esmActivate(context);
  } catch (error) {
    console.error('Failed to activate extension:', error);
    throw error;
  }
}

async function deactivate() {
  try {
    const { deactivate: esmDeactivate } = await import('./extension.mjs');
    return await esmDeactivate();
  } catch (error) {
    console.error('Failed to deactivate extension:', error);
    throw error;
  }
}

module.exports = { activate, deactivate };
```

### Step 2: Create ESM Implementation

Convert `src/extension.js` to `src/extension.mjs`:

**Before (CJS):**
```javascript
const vscode = require('vscode');
const MyClass = require('./myClass');

function activate(context) {
  // ...
}

module.exports = { activate, deactivate };
```

**After (ESM):**
```javascript
import * as vscode from 'vscode';
import MyClass from './myClass.mjs';

export async function activate(context) {
  // ...
}

export function deactivate() {}
```

### Step 3: Convert Internal Modules

For each internal module:

1. **Rename**: `.js` → `.mjs`
2. **Convert imports**:
   ```javascript
   // Before
   const vscode = require('vscode');
   const fs = require('fs');
   const path = require('path');
   
   // After
   import * as vscode from 'vscode';
   import { readFileSync } from 'fs';
   import { join, dirname, basename } from 'path';
   ```

3. **Convert exports**:
   ```javascript
   // Before
   module.exports = MyClass;
   module.exports = { myFunction };
   
   // After
   export default MyClass;
   export { myFunction };
   ```

4. **Update imports of this module**:
   ```javascript
   // Before
   const MyClass = require('./myClass');
   
   // After
   import MyClass from './myClass.mjs';
   ```

### Step 4: Update package.json

```json
{
  "main": "./src/extension.cjs"
}
```

### Step 5: Handle Special Cases

#### Dynamic Imports in ESM

```javascript
// For conditional or dynamic imports
const os = await import('os');
const homedir = os.homedir();
```

#### __dirname in ESM

```javascript
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

#### Unused Parameters

Prefix with underscore to satisfy linters:

```javascript
// Before
// eslint-disable-next-line no-unused-vars
async function myFunc(param1, param2, param3) {
  throw new Error('Not implemented');
}

// After
async function myFunc(_param1, _param2, _param3) {
  throw new Error('Not implemented');
}
```

## Common Patterns

### Pattern 1: Named Destructured Imports

```javascript
// CJS
const { exportToCSV } = require('./csvExporter');

// ESM
import { exportToCSV } from './csvExporter.mjs';
```

### Pattern 2: Default Imports

```javascript
// CJS
const DataExporter = require('./exporters/index');

// ESM
import DataExporter from './exporters/index.mjs';
```

### Pattern 3: Namespace Imports

```javascript
// CJS
const vscode = require('vscode');

// ESM
import * as vscode from 'vscode';
```

### Pattern 4: Mixed Imports

```javascript
// CJS
const path = require('path');
const basename = path.basename;
const dirname = path.dirname;

// ESM
import { basename, dirname, join, extname } from 'path';
```

## Automated Conversion Commands

For bulk conversion, use sed:

```bash
# Convert require to import
sed -i 's/const vscode = require("vscode");/import * as vscode from "vscode";/' file.mjs
sed -i 's/const MyClass = require("\.\/myClass");/import MyClass from ".\/myClass.mjs";/' file.mjs

# Convert module.exports to export
sed -i 's/module\.exports = /export default /' file.mjs
sed -i 's/module\.exports = { \(.*\) };/export { \1 };/' file.mjs

# Replace path.* calls
sed -i 's/path\.basename/basename/g' file.mjs
sed -i 's/path\.dirname/dirname/g' file.mjs
sed -i 's/path\.join/join/g' file.mjs
```

## Testing Checklist

After migration:

- [ ] Run `npm run lint` - should pass with 0 errors
- [ ] Run `npm run package` - should build successfully
- [ ] Test extension activation in VS Code
- [ ] Test all commands
- [ ] Test file opening/viewing
- [ ] Test all export formats
- [ ] Verify settings work correctly

## Common Issues & Solutions

### Issue 1: Cannot find module

**Problem:** `Error: Cannot find module './myModule'`

**Solution:** Ensure `.mjs` extension is used in imports:
```javascript
// Wrong
import MyClass from './myModule';

// Correct
import MyClass from './myModule.mjs';
```

### Issue 2: require is not defined

**Problem:** `ReferenceError: require is not defined`

**Solution:** Convert all `require()` calls to `import` statements, or use:
```javascript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
```

### Issue 3: __dirname is not defined

**Problem:** `ReferenceError: __dirname is not defined`

**Solution:** Use ESM alternative:
```javascript
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

## Dependencies Compatibility

Most modern npm packages support both CJS and ESM:
- ✅ `qvdjs` - Provides ESM exports
- ✅ `apache-arrow` - Provides ESM exports  
- ✅ `papaparse` - Provides ESM exports
- ✅ `exceljs` - Provides ESM exports

For packages without ESM support, they still work via Node.js interop.

## Benefits

1. **Modern Syntax**: Use latest JavaScript features
2. **Better Tree-Shaking**: Improved bundle sizes
3. **Static Analysis**: Better IDE support
4. **Future-Proof**: Ready for full ESM migration
5. **Dependency Compatibility**: Works with ESM-only packages

## Limitations

- VS Code extension entry must remain CommonJS
- Dynamic `import()` adds minimal overhead
- Some legacy packages may have interop issues

## When to Use This Pattern

Use this hybrid pattern when:
- ✅ You need VS Code compatibility
- ✅ You want modern ESM internally
- ✅ Your dependencies support ESM
- ✅ You're building new features

Avoid if:
- ❌ All your dependencies are CJS-only
- ❌ You need to support very old Node.js versions (< 12)

## Complete Example

See the actual implementation in this repository:
- CJS wrapper: `src/extension.cjs`
- ESM implementation: `src/extension.mjs`
- ESM modules: All other `.mjs` files in `src/`

## References

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Node.js ESM Documentation](https://nodejs.org/api/esm.html)
- [MDN Import/Export](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import)

---

Last Updated: 2025-10-29
