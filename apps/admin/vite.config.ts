import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@swiftrx/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5175,
    // Loopback only — `host: true` would expose the admin console (and the
    // seed data it renders) to the whole LAN.
    host: '127.0.0.1',
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        // See apps/doctor-portal/vite.config.ts — vendor code is stable across
        // deploys, so it gets its own long-lived cache entry.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
