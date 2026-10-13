/**
 * The window controls a packaged game is expected to have.
 *
 * In a browser, F11 is the browser's own and the game has no business
 * touching it. In a native shell there is no browser to provide it, so the
 * game provides it itself - a full-screen duel on a 27" monitor is the point
 * of shipping a desktop build at all.
 */

import { isNativeShell } from './shell';

/** Flip the main window between full screen and windowed. */
export async function toggleFullscreen(): Promise<void> {
  if (!isNativeShell) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const window = getCurrentWindow();
  await window.setFullscreen(!(await window.isFullscreen()));
}

/**
 * Bind F11, and an unclaimed Escape as the way out.
 *
 * Returns a function that unbinds, so this composes with anything that later
 * wants to own the keyboard.
 */
export function installWindowShortcuts(): () => void {
  if (!isNativeShell) return () => {};

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'F11') {
      event.preventDefault();
      void toggleFullscreen();
      return;
    }
    // Escape leaves full screen, as in every other full-screen application -
    // but only when nothing else wanted it. The game pauses on Escape and
    // dialogs close on it, and each of those claims the key with
    // preventDefault. This listener is bound before any of theirs, so it
    // looks once the whole dispatch has finished.
    if (event.key === 'Escape') {
      window.setTimeout(() => {
        if (event.defaultPrevented) return;
        void (async () => {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const current = getCurrentWindow();
          if (await current.isFullscreen()) await current.setFullscreen(false);
        })();
      }, 0);
    }
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
