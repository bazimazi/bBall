import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    open: true,
    /*
     * The API, proxied onto the dev server's own origin.
     *
     * Worth the three lines: it makes development match production, where the
     * game and the API are served together. Same origin means no CORS
     * preflights to get wrong, and it means the refresh token travels as an
     * httpOnly cookie in development exactly as it does in production, rather
     * than through the localStorage fallback that only exists for split
     * deployments.
     *
     * Set VITE_API_URL instead to point a build at an API somewhere else.
     */
    proxy: {
      '/v1': {
        target: process.env.VITE_DEV_API ?? 'http://127.0.0.1:8787',
        changeOrigin: false
      }
    }
  },
  build: {
    target: 'es2022',
    sourcemap: true
  }
});
