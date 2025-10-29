/**
 * CommonJS entry point wrapper for VS Code extension
 * 
 * VS Code extensions must use CommonJS for the entry point as of 2025.
 * This wrapper dynamically imports the ESM modules where the actual logic resides.
 * 
 * The vscode API is only available in CommonJS context, so we pass it to ESM
 * via globalThis for access by the ESM modules.
 */

const vscode = require('vscode');

// Make vscode API available globally for ESM modules
globalThis.vscode = vscode;

/**
 * Extension activation entry point
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    // Dynamically import the ESM module
    const esm = await import('./extension.mjs');
    
    // Delegate to ESM activate function
    return esm.activate(context);
}

/**
 * Extension deactivation entry point
 */
async function deactivate() {
    // Dynamically import the ESM module
    const esm = await import('./extension.mjs');
    
    // Delegate to ESM deactivate function if it exists
    if (esm.deactivate) {
        return esm.deactivate();
    }
}

module.exports = {
    activate,
    deactivate
};
