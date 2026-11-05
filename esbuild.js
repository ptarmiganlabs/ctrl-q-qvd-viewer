// VS Code Extension Bundling Configuration
// See: https://aka.ms/vscode-bundle-extension

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location == null) return;
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`
        );
      });
      console.log("[watch] build finished");
    });
  },
};

/**
 * Copy sql.js's WebAssembly file next to the bundle. sql.js loads sql-wasm.wasm
 * from the directory of the script it runs from, which in the bundle is dist/.
 * @type {import('esbuild').Plugin}
 */
const copySqlWasmPlugin = {
  name: "copy-sql-wasm",

  setup(build) {
    build.onEnd(() => {
      const outdir = path.dirname(build.initialOptions.outfile);
      fs.mkdirSync(outdir, { recursive: true });
      fs.copyFileSync(
        require.resolve("sql.js/dist/sql-wasm.wasm"),
        path.join(outdir, "sql-wasm.wasm")
      );
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.mjs"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode"],
    logLevel: "warning",
    // Define __filename and __dirname for ESM-style code
    define: {
      "import.meta.url": "__importMetaUrl",
    },
    banner: {
      js: `const __importMetaUrl = require('url').pathToFileURL(__filename).href;`,
    },
    plugins: [
      copySqlWasmPlugin,
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
