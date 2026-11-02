// ESLint flat config for the whole repo (both apps, the shared package,
// scripts and config files). Formatting is left to Prettier.
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
// jsx-a11y 6.10.2 (the latest release) declares ESLint ≤ 9 as its peer, so
// `npm ci` refused ESLint 10. The `overrides` entry in package.json lets it
// use the repo's ESLint; it works. Drop that entry once a release supports 10.
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default defineConfig(
  // .claude/ can hold other sessions' git worktrees (full copies of the repo).
  { ignores: ['**/dist/**', '**/node_modules/**', 'coverage/**', '.puku/**', '.claude/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // The Playwright end-to-end tests run in Node and drive a browser.
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      // Only the two classic hook rules: plugin v7's recommended preset also
      // turns on the React Compiler rules, which this code isn't written for.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // The Rx pad is keyboard-first, so semantics matter: a clickable <div>
      // is unreachable by keyboard and invisible to a screen reader.
      ...jsxA11y.flatConfigs.recommended.rules,
      // autoFocus is a deliberate choice on sign-in forms and modal fields —
      // those are the two places a keyboard user expects to land. Keeping it
      // means an explicit opt-in per field instead of a repo-wide ban.
      'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],
      // MedicationRow is a focus-tracking wrapper: it marks the row active
      // when any control inside it receives focus or is clicked. That is its
      // entire purpose and needs no ARIA role of its own.
      'jsx-a11y/no-static-element-interactions': ['error', { allowExpressionValues: true }],
    },
  },
  {
    // Apps read and write data through `api` and the query hooks, never the
    // mock db, so swapping in the real backend only changes api.ts. (Sign-in
    // already goes to the server, through apps/shared/src/auth.ts.)
    files: ['apps/admin/src/**/*.{ts,tsx}', 'apps/doctor-portal/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@swiftrx/shared',
              importNames: [
                'MOCK_HOSPITALS',
                'MOCK_USERS',
                'MOCK_PATIENTS',
                'MOCK_DRUGS',
                'MOCK_DIAGNOSES',
                'MOCK_INVESTIGATIONS',
                'MOCK_QUICK_PACKS',
                'MOCK_SIGNED_RX',
                'MOCK_AUDIT',
                'getHospital',
              ],
              message: 'Read and write data through `api` or the query hooks (queries.ts).',
            },
          ],
        },
      ],
    },
  },
  {
    // The API runs in Node, not a browser.
    files: ['apps/api/**/*.ts'],
    languageOptions: { globals: globals.node },
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
