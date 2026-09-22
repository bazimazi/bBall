/**
 * Where the game is running, and the two things it needs from a native shell.
 *
 * The same TypeScript runs in three places: a browser tab, a desktop window
 * (Tauri, on Windows, macOS and Linux) and a mobile app (Tauri, on Android and
 * iOS). Almost nothing cares about the difference. Three things do:
 *
 * - **Leaving the app.** In a tab, sending the player to a provider is a
 *   navigation. In a webview it must not be: providers refuse to render inside
 *   embedded webviews, and navigating away would replace the game with a login
 *   page it could never come back from. The shell opens the system browser
 *   instead.
 * - **Coming back.** A browser returns by URL. A native app returns by URL
 *   scheme - `bball://oauth?status=ok&code=...` - which arrives as an event
 *   rather than a page load.
 * - **Closing.** A packaged app can quit; a tab cannot close itself, and backs
 *   out of its own history instead.
 *
 * Everything here degrades to nothing on the web: `isNativeShell` is false,
 * `openExternal` is a plain navigation, and the deep-link listener is never
 * installed. The Tauri packages are imported dynamically so a web build never
 * ships them.
 */

import { leaveHistory } from './back';

/**
 * True when a Tauri shell is hosting the page.
 *
 * The shell injects `__TAURI_INTERNALS__` before any application code runs, so
 * this is settled by the time anything asks.
 */
export const isNativeShell: boolean =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export type ShellKind = 'web' | 'desktop' | 'mobile';

let kind: ShellKind | null = isNativeShell ? null : 'web';

/**
 * Which shell this is.
 *
 * Resolved once, on first use, because reading it costs a call into the
 * native side. Anything that cannot wait - a render, say - should use
 * {@link isNativeShell}, which needs no round trip.
 */
export async function shellKind(): Promise<ShellKind> {
  if (kind) return kind;
  try {
    const { platform } = await import('@tauri-apps/plugin-os');
    const os = platform();
    kind = os === 'android' || os === 'ios' ? 'mobile' : 'desktop';
  } catch {
    // A shell that cannot answer is still a shell; desktop is the safer guess
    // because it is the one with a keyboard.
    kind = 'desktop';
  }
  return kind;
}

/**
 * Open a URL wherever the player's links normally open.
 *
 * In a tab that is this tab. In a native shell it is the system browser,
 * which is both the only place a provider will accept a sign-in and the only
 * place the player can see the address they are typing a password into.
 */
export async function openExternal(url: string): Promise<void> {
  if (!isNativeShell) {
    window.location.assign(url);
    return;
  }
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}

/**
 * Turn a `bball://` link into the hash route the game already understands.
 *
 * The web build handles `#/oauth?...`, `#/verify-email?token=...` and
 * `#/reset-password?token=...` on the hash, and those handlers are not worth
 * duplicating for the native case. So a deep link is translated rather than
 * re-implemented: `bball://oauth?status=ok&code=X` becomes `#/oauth?status=ok&code=X`,
 * which fires `hashchange` and lands in exactly the same code.
 *
 * Returns null for anything that is not one of ours.
 */
export function hashRouteForDeepLink(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== 'bball:') return null;

  // `bball://oauth?x` puts "oauth" in the host; `bball:/oauth?x` puts it in
  // the path. Both spellings reach us in the wild, so accept either.
  const route = (url.host || url.pathname.replace(/^\/+/, '')).replace(/\/+$/, '');
  if (!route) return null;

  return `#/${route}${url.search}`;
}

/**
 * Deliver `bball://` links to the game for as long as it is running.
 *
 * Also picks up the link that *started* the app, which on Windows and Linux
 * arrives as a launch argument rather than an event, and on macOS may arrive
 * before the page is listening.
 */
export async function installDeepLinkRouting(): Promise<void> {
  if (!isNativeShell) return;

  const route = (link: string) => {
    const hash = hashRouteForDeepLink(link);
    if (!hash) return;
    // Assigning the hash is what fires `hashchange`, which is what the link
    // handlers listen for. Setting the same hash twice would not, so it is
    // cleared first - two sign-ins in one session is a normal thing to do.
    if (window.location.hash === hash) window.location.hash = '';
    window.location.hash = hash;
  };

  try {
    const { onOpenUrl, getCurrent } = await import('@tauri-apps/plugin-deep-link');
    const pending = await getCurrent();
    pending?.forEach(route);
    await onOpenUrl((urls) => urls.forEach(route));
  } catch (error) {
    // Deep links are how social sign-in returns; everything else - playing,
    // passwords, sync - works without them, so this is a warning and not a
    // failure to start.
    console.warn('bball: deep links are unavailable in this shell', error);
  }
}

/**
 * Close the game.
 *
 * A packaged app can actually do this, so it does: `exit_app` is a command on
 * the Rust side rather than a window close, because on Android the window is
 * the activity and the player pressing "Exit" means the app, not the view.
 *
 * A tab cannot be closed by the page that lives in it, so the web build backs
 * out of its own history instead - see `leaveHistory`.
 */
export async function exitApp(): Promise<void> {
  if (!isNativeShell) {
    leaveHistory();
    return;
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('exit_app');
  } catch (error) {
    console.warn('bball: this shell would not close', error);
    leaveHistory();
  }
}
