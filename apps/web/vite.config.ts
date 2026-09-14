import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true },
  // the LAN dev server is sometimes exposed through a Cloudflare quick tunnel for phone testing
  server: { allowedHosts: ['.trycloudflare.com'] },
});
