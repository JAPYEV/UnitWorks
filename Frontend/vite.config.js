import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      // Algorithms and compatibility rules shared with the backend (one source of truth)
      alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) }
    },
    server: {
      port: 5173,
      fs: { allow: ['..'] },
      // Dev only: forward /api to the Express backend so the browser stays same-origin
      proxy: { '/api': { target: env.API_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true } }
    }
  };
});
