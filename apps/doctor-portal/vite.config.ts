import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The API (apps/api) answers on this origin's /api in dev and preview too, so
// its sign-in cookie is first-party. changeOrigin must stay off (Vite's string
// shorthand turns it on): the API reads the hospital from the Host header and
// refuses a POST whose Origin doesn't match it.
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
    port: 5174,
    // In dev, Vite serves on :5174 and we resolve hospital from ?hospital=...
    // or the host. In prod, the portal is deployed to <hospital>.swiftrx.com
    // and the host is the source of truth for the tenant.
    //
    // Bind to 0.0.0.0 (or '::') so <host>.localhost requests (Chrome/FF
    // resolve *.localhost → 127.0.0.1) actually reach the dev server, and
    // `strictPort` so the port is predictable when the gateway is up.
    //
    // `host: true` binds every interface, which puts the tenant data (mock
    // patients, Rx) on the LAN for anyone on the same network. Bind to
    // loopback instead — Chrome and Firefox resolve *.localhost to 127.0.0.1
    // natively, so subdomain routing still works without exposing the port.
    host: '127.0.0.1',
    strictPort: true,
    proxy: apiProxy,
  },
  preview: { proxy: apiProxy },
  build: {
    rollupOptions: {
      output: {
        // React and the router change far less often than app code, so a
        // separate vendor chunk keeps them cached across deploys. The Rx pad is
        // already its own lazy chunk at /rx.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
