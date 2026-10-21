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
    port: 5174,
    // In dev, Vite serves on :5174 and we resolve hospital from ?hospital=...
    // or the host. In prod, the portal is deployed to <hospital>.swiftrx.com
    // and the host is the source of truth for the tenant.
    //
    // Bind to 0.0.0.0 (or '::') so <host>.localhost requests (Chrome/FF
    // resolve *.localhost → 127.0.0.1) actually reach the dev server, and
    // `strictPort` so the port is predictable when the gateway is up.
    host: true,
    strictPort: true,
  },
});
