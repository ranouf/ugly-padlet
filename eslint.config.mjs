import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      ".codex/**",
      "dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "previews/**",
      "elanquoi/**",
      "vendor/**",
    ],
  },
  {
    files: ["*.js", "tests/**/*.js", "scripts/**/*.js", "jest.config.cjs", "playwright.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: "readonly",
        Hammer: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["scripts/**/*.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    files: ["tests/jest/**/*.test.js"],
    languageOptions: {
      globals: globals.jest,
    },
  },
];
