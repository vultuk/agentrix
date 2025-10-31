import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react';

  export default defineConfig(({ mode }) => ({
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
    },
    build: {
      // Set VITE_DISABLE_MINIFY=1 to ship non-minified output
      minify: process.env.VITE_DISABLE_MINIFY ? false : 'esbuild',
      sourcemap: !!process.env.VITE_DISABLE_MINIFY,
    },
  }));
