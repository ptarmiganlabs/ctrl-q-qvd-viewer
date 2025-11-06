// CommonJS wrapper for VS Code extension entry point
// VS Code's extension host requires CommonJS, so we use dynamic import() to load ESM modules

/**
 * Activate the extension
 * @param {any} context - VS Code extension context
 * @returns {Promise<void>}
 */
async function activate(context) {
	try {
		// Dynamically import the ESM implementation
		const { activate: esmActivate } = await import('./extension.mjs');
		return await esmActivate(context);
	} catch (error) {
		console.error('Failed to activate Ctrl-Q QVD Viewer extension:', error);
		throw error;
	}
}

/**
 * Deactivate the extension
 * @returns {Promise<void>}
 */
async function deactivate() {
	try {
		// Dynamically import the ESM implementation
		const { deactivate: esmDeactivate } = await import('./extension.mjs');
		return await esmDeactivate();
	} catch (error) {
		console.error('Failed to deactivate Ctrl-Q QVD Viewer extension:', error);
		throw error;
	}
}

module.exports = {
	activate,
	deactivate
};
