# ESM Migration - Quick Reference

## Investigation Status: ✅ Complete

**Date:** October 29, 2025  
**Full Report:** [ESM_MIGRATION_INVESTIGATION.md](./ESM_MIGRATION_INVESTIGATION.md)

## Can VS Code Extensions Use ESM?

**Short Answer:** Not fully, but a hybrid approach works well.

## Current State

- ✅ Project uses CommonJS (CJS) throughout
- ✅ Main dependency `qvdjs` is ESM-ready
- ✅ All tests pass
- ✅ Linting passes

## Recommended Approach

### Hybrid ESM with CommonJS Wrapper

**Structure:**
```
src/extension.cjs       ← Small CJS wrapper (entry point)
src/extension.mjs       ← ESM main logic
src/*.mjs               ← All other modules in ESM
```

**Benefits:**
- ✅ Write 95% of code in modern ESM
- ✅ No build step required
- ✅ Future-proof
- ✅ Low risk, high benefits

## Quick Implementation Pattern

### 1. Entry Point Wrapper (extension.cjs)

```javascript
const vscode = require('vscode');
globalThis.vscode = vscode;

module.exports = {
    async activate(context) {
        const esm = await import('./extension.mjs');
        return esm.activate(context);
    },
    async deactivate() {
        const esm = await import('./extension.mjs');
        if (esm.deactivate) return esm.deactivate();
    }
};
```

### 2. ESM Main Logic (extension.mjs)

```javascript
const vscode = globalThis.vscode;
import { QvdEditorProvider } from './qvdEditorProvider.mjs';

export async function activate(context) {
    // Your logic here
}
```

### 3. Update package.json

```json
{
    "main": "./src/extension.cjs"
}
```

## Why This Limitation?

VS Code extension host is still built on CommonJS:
- Entry point must be CommonJS
- `vscode` API only injected in CJS context
- No official ESM support yet (as of 2025)

## Migration Checklist

When ready to migrate:

- [ ] Create CommonJS wrapper (extension.cjs)
- [ ] Convert modules to .mjs (ESM syntax)
- [ ] Update imports: `require()` → `import`
- [ ] Update exports: `module.exports` → `export`
- [ ] Update package.json main field
- [ ] Test extension activation
- [ ] Test all features
- [ ] Update documentation

## Key References

- 📄 Full investigation report: [ESM_MIGRATION_INVESTIGATION.md](./ESM_MIGRATION_INVESTIGATION.md)
- 🔗 [VS Code Extension API](https://code.visualstudio.com/api)
- 🔗 [Node.js ES Modules](https://nodejs.org/api/esm.html)
- 🔗 [GitHub Issue #130367](https://github.com/microsoft/vscode/issues/130367) - ESM support request

## Next Steps

**As per issue: "Do not make code changes at this point"**

Investigation complete. Ready to implement when approved.

---

💡 **Recommendation:** Proceed with hybrid ESM migration for modern, maintainable code.
