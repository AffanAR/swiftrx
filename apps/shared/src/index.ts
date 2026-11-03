// Public barrel for the @swiftrx/shared package. Each app imports the bits
// it needs (e.g. `import type { Hospital } from '@swiftrx/shared'`).

export * from './types';
// The data client and its query hooks are how apps read and write data. The
// mockDb exports stay for tests and auth.ts; ESLint keeps app code off them.
export * from './api';
export * from './medicine';
export * from './patient';
export * from './rules';
export * from './safety';
export { onSessionEnded } from './http';
export * from './queries';
export * from './status';
export * from './mockDb';
export * from './auth';
export * from './tenant';
export * from './ui';
export * from './config';
export * from './print';
export * from './theme';
// components.tsx is React; some consumers (the admin / portal) pull
// pre-built primitives from it. Apps that don't need React can import
// from the deeper paths directly.
export * from './components';
