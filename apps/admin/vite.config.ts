import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// See apps/doctor-portal/vite.config.ts: the API answers on this origin's /api,
// with the Host header left as the browser sent it.
const apiProxy = {
  '/api': { target: `http://127.0.0.1:${process.env.API_PORT || 5176}`, changeOrigin: false },
};

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
    proxy: apiProxy,
  },
  preview: { proxy: apiProxy },
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
