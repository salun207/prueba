import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
