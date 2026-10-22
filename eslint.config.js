// ESLint flat config for the whole repo (both apps, the shared package,
// scripts and config files). Formatting is left to Prettier.
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default defineConfig(
  // .claude/ can hold other sessions' git worktrees (full copies of the repo).
  { ignores: ['**/dist/**', '**/node_modules/**', 'coverage/**', '.puku/**', '.claude/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Only the two classic hook rules: plugin v7's recommended preset also
      // turns on the React Compiler rules, which this code isn't written for.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['scripts/**/*.mjs', '**/*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/shared/tailwind-preset.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  prettier,
);
