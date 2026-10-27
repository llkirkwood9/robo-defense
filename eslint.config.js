// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  // Formatting is owned by Prettier; turn off stylistic rules that would conflict with it.
  prettierConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
]);
