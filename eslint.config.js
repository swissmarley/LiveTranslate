// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*"],
  },
  {
    // Node scripts: process.env is read at run time, not inlined by the bundler.
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { Buffer: "readonly" } },
    rules: { "expo/no-env-var-destructuring": "off" },
  },
]);
