import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * Two shapes of build come out of this file.
 *
 * The default one is the web game: served from the same origin as the API, so
 * `/v1` needs nothing but a path, and the dev server proxies it.
 *
 * `--mode desktop` is the one Tauri packages. Its webview is served from
 * `tauri://localhost`, which is not the API's origin and never can be, so
 * that build needs an absolute `VITE_API_URL` (see `.env.desktop`) and no
 * proxy at all. The same mode is used for the mobile shells.
 */
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const desktop = mode === 'desktop';

  /*
   * A phone or an emulator cannot reach the host's loopback address, so
   * `tauri android dev` and `tauri ios dev` publish the address they can
   * reach as TAURI_DEV_HOST and expect the dev server to bind to it.
   */
  const devHost = process.env.TAURI_DEV_HOST;

  return {
    plugins: [react()],
    base: './',
    // Tauri's own output is worth reading; Vite clearing the screen over it
    // is not.
    clearScreen: !desktop,
    envPrefix: ['VITE_', 'TAURI_ENV_'],
    server: {
      port: 5173,
      // The native shell opens the window itself; a browser tab as well would
      // be a second copy of the game fighting over the same save.
      open: !desktop,
      // Loopback unless a phone needs to reach it, which is the one case that
      // justifies listening on every interface on the machine.
      host: devHost ?? 'localhost',
      // Tauri is configured to load a fixed URL, so a port that silently
      // moved would leave it pointing at nothing.
      strictPort: desktop,
      hmr: devHost ? { protocol: 'ws', host: devHost, port: 5174 } : undefined,
      watch: {
        // Rust output changes constantly during a build and none of it is
        // part of the front end.
        ignored: ['**/src-tauri/**']
      },
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
       * The desktop build always does, because its origin is its own.
       */
      proxy: desktop
        ? undefined
        : {
            '/v1': {
              target: process.env.VITE_DEV_API ?? 'http://127.0.0.1:8787',
              changeOrigin: false
            }
          }
    },
    build: {
      /*
       * The web build targets what browsers ship. The desktop build targets
       * the webview it will actually run in, which is not the same thing:
       * Windows has evergreen WebView2, but macOS and iOS run whatever
       * WebKit came with the oldest system version the bundle claims to
       * support, and Linux runs WebKitGTK.
       */
      target: desktop
        ? process.env.TAURI_ENV_PLATFORM === 'windows'
          ? 'chrome105'
          : 'safari13'
        : 'es2022',
      sourcemap: true
    }
  };
});
