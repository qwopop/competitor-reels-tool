import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
// VITE_BASE_PATH is set for GitHub Pages, which serves the site under /<repo>/.
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    // Forward API calls to the FastAPI backend started by `make run`.
    proxy: {
      '/api': 'http://localhost:8091',
    },
  },
});
