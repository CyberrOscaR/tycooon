import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  esbuild: { jsx: 'automatic' },
  server: { fs: { allow: ['..'] } },
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 700 },
});
