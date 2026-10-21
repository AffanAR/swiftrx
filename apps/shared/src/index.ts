// Public barrel for the @swiftrx/shared package. Each app imports the bits
// it needs (e.g. `import type { Hospital } from '@swiftrx/shared'`).

export * from './types';
export * from './mockDb';
export * from './auth';
export * from './tenant';
export * from './ui';
export * from './config';
// components.tsx is React; some consumers (the admin / portal) pull
// pre-built primitives from it. Apps that don't need React can import
// from the deeper paths directly.
export * from './components';
