// Pre-commit tasks: husky runs `npx lint-staged`, which runs these on the
// staged files only.
//
// Prettier and ESLint are started as `node <entry point>` on purpose, not as
// `prettier` / `eslint`. On Windows those names resolve to npm's .cmd shims,
// which run under cmd.exe, and cmd.exe can stall (0% CPU, the tool never
// starts) once a shim gets a long list of file paths — five absolute paths
// under "C:/Users/<name with a space>/" were enough. `node` is a real .exe,
// so it is started directly and the file list never goes through cmd.exe.
const prettier = 'node node_modules/prettier/bin/prettier.cjs --write';
const eslint = 'node node_modules/eslint/bin/eslint.js --fix';

export default {
  '*.{ts,tsx,mjs,js}': [prettier, eslint],
  '*.{json,css,md,html,yml}': [prettier],
};
