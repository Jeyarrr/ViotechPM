import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000',
      '/socket.io': { target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000', ws: true },
    },
  },
  preview: { port: 4173 },
});
