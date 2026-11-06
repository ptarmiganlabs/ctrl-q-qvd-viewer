import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "out/**", "dist/**", ".vscode-test/**", ".claude/**"],
  },
  {
    files: ["**/*.js"],
    ignores: ["**/*.min.js", "**/*bundle*.js", "**/*.qvd"],
    languageOptions: {
      globals: {
        ...globals.commonjs,
        ...globals.node,
        ...globals.mocha,
        ...globals.browser,
      },

      ecmaVersion: 2022,
      sourceType: "module",
    },

    rules: {
      "no-const-assign": "warn",
      "no-this-before-super": "warn",
      "no-undef": "warn",
      "no-unreachable": "warn",
      "no-unused-vars": "warn",
      "constructor-super": "warn",
      "valid-typeof": "warn",
    },
  },
  {
    // The extension's code handles whole QVD files, so a spread call can meet one element per row
    files: ["src/**/*.js", "src/**/*.mjs"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: ":matches(CallExpression, NewExpression) > SpreadElement",
          message:
            "A spread argument passes one argument per element, which overflows the stack from about 120,000. Use a loop or reduce instead.",
        },
      ],
    },
  },
  {
    // Scripts the webviews inline: plain browser scripts, run after Chart.js and Tabulator
    files: ["src/webview/client/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        Chart: "readonly",
        Tabulator: "readonly",
      },
      sourceType: "script",
    },
  },
];
