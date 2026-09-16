import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true },
  // the LAN dev server is sometimes exposed through a Cloudflare quick tunnel for phone testing
  server: {
    allowedHosts: ['.trycloudflare.com'],
    // the gallery's index lives in a Cloudflare Worker on the real domain; borrow it in dev so the
    // local site behaves like the published one (name search needs the names it returns)
    proxy: { '/api': { target: 'https://emogotchi.emonad.lol', changeOrigin: true, secure: true } },
  },
});
