import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (process.env.VERCEL === '1') {
    let url: URL;
    try {
      url = new URL(process.env.VITE_API_URL ?? env.VITE_API_URL ?? '');
    } catch {
      throw Error('Set the actual HTTPS VITE_API_URL before deploying.');
    }
    if (
      url.protocol !== 'https:' ||
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.origin !== (process.env.VITE_API_URL ?? env.VITE_API_URL)
    )
      throw Error('VITE_API_URL must be a remote HTTPS origin without a path or trailing slash.');
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000',
        '/socket.io': {
          target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000',
          ws: true,
        },
      },
    },
    preview: { port: 4173 },
  };
});
