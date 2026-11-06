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
 * Copy sql.js's WebAssembly file next to the bundle, where the SQLite exporter
 * reads it from: node_modules is not packaged with the extension.
 * @type {import('esbuild').Plugin}
 */
const copySqlWasmPlugin = {
  name: "copy-sql-wasm",

  setup(build) {
    build.onEnd(() => {
      const { outdir, outfile } = build.initialOptions;
      const targetDir = outdir ?? path.dirname(outfile);
      fs.mkdirSync(targetDir, { recursive: true });
      // sql.js keeps the file next to its main script
      fs.copyFileSync(
        path.join(path.dirname(require.resolve("sql.js")), "sql-wasm.wasm"),
        path.join(targetDir, "sql-wasm.wasm")
      );
    });
  },
};

/**
 * Copy the libraries the webview inlines, Tabulator and Chart.js, into
 * dist/webview, where the webview templates read them from. Taking them from
 * their npm packages keeps their versions in package.json, where update tools
 * see them. The webviews' own shared scripts, in src/webview/client, are
 * copied there too.
 * @type {import('esbuild').Plugin}
 */
const copyWebviewLibsPlugin = {
  name: "copy-webview-libs",

  setup(build) {
    build.onEnd(() => {
      const { outdir, outfile } = build.initialOptions;
      const targetDir = path.join(outdir ?? path.dirname(outfile), "webview");
      fs.mkdirSync(targetDir, { recursive: true });
      const libs = {
        "tabulator.min.js": require.resolve(
          "tabulator-tables/dist/js/tabulator.min.js"
        ),
        "tabulator.min.css": require.resolve(
          "tabulator-tables/dist/css/tabulator.min.css"
        ),
        // chart.js exports no path to its UMD build, which sits next to its main script
        "chart.umd.js": path.join(
          path.dirname(require.resolve("chart.js")),
          "chart.umd.js"
        ),
        "histogramView.js": path.join(
          __dirname,
          "src",
          "webview",
          "client",
          "histogramView.js"
        ),
      };
      for (const [name, source] of Object.entries(libs)) {
        fs.copyFileSync(source, path.join(targetDir, name));
      }
    });
  },
};

/**
 * Options for bundling the extension. The tests bundle the SQLite exporter with
 * them too, to check that it finds its WebAssembly file once bundled.
 * @type {import('esbuild').BuildOptions}
 */
const buildOptions = {
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
  plugins: [copySqlWasmPlugin, copyWebviewLibsPlugin],
};

async function main() {
  const ctx = await esbuild.context({
    ...buildOptions,
    plugins: [
      ...buildOptions.plugins,
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

// Build when run as a script; the tests only load this file for buildOptions
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { buildOptions };
