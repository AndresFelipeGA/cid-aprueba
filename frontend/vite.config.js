import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds into the project's existing `public/` directory so Express keeps
// serving the frontend exactly as before (see src/app.js `express.static`).
// `publicDir` (frontend/public: assets/, css/styles.css) is copied verbatim
// into the same output — no change to those file paths.
export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
