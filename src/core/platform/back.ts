/**
 * The back button, wherever it comes from.
 *
 * A browser tab has one in the chrome, Android has one in the system bar, and
 * both arrive in exactly the same way once the page has something to go back
 * to: as `popstate`. Tauri's Android activity presses the webview's own back
 * first (`canGoBack()` then `goBack()`), and only closes the app when the
 * webview has nowhere left to go - so a page that keeps one spare history
 * entry alive is a page whose back button never kills the app by surprise.
 *
 * That is the whole trick here. One guard entry is pushed at start-up, and
 * pushed again the moment it is consumed. Every press therefore reaches
 * {@link pushBackHandler}'s topmost listener - the innermost thing on screen -
 * and the app is only ever left through {@link exitApp}, deliberately.
 *
 * The game is a single page with no router, so none of this touches the URL:
 * the guard entries carry the same address as the page itself.
 */

/** Called when back is pressed. Whoever is on top of the stack consumes it. */
export type BackHandler = () => void;

const handlers: BackHandler[] = [];

/** How many entries this module has pushed, so a real exit can unwind them. */
let pushed = 0;
/** `history.length` when the guard was armed, to catch other people's pushes. */
let startLength = 0;
let installed = false;
let leaving = false;
let onExitRequest: BackHandler | null = null;

const GUARD = { bball: 'back-guard' } as const;

function pushGuard(): void {
  window.history.pushState(GUARD, '');
  pushed += 1;
}

/**
 * Take the next back press, until the returned function is called.
 *
 * Handlers are a stack: the last one registered is the one that answers, which
 * is what a modal inside a screen inside a menu already means.
 */
export function pushBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const at = handlers.lastIndexOf(handler);
    if (at >= 0) handlers.splice(at, 1);
  };
}

/**
 * What to do with a back press nobody wanted - the one at the very top of the
 * app. This is where the "are you sure you want to leave" prompt lives.
 */
export function setExitRequestHandler(handler: BackHandler | null): void {
  onExitRequest = handler;
}

function onPopState(): void {
  // A real exit is on its way out through the same history entries; letting
  // it be re-armed here is what would trap the player in the page.
  if (leaving) return;

  // Re-arm before anything else. On Android this is what keeps
  // `WebView.canGoBack()` true, and so what stops the next press from
  // finishing the activity behind the game's back.
  pushGuard();
  // The entry just consumed is gone, so the net depth is unchanged.
  pushed -= 1;

  const handler = handlers.at(-1);
  if (handler) handler();
  else onExitRequest?.();
}

/** Arm the guard and start listening. Safe to call more than once. */
export function installBackRouting(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  startLength = window.history.length;
  pushGuard();
  window.addEventListener('popstate', onPopState);
}

/**
 * Give up the guard and leave the page.
 *
 * Only the web needs this - a native shell exits through the process, not
 * through history - and even there a tab the player opened themselves cannot
 * be closed by script. Unwinding past the entry the game started on is the
 * one thing that always works: it is the ordinary "back out of this site"
 * the player asked for.
 */
export function leaveHistory(): void {
  leaving = true;
  window.removeEventListener('popstate', onPopState);
  // The guard is not the only thing on the stack: a deep link arrives by
  // setting the hash, which pushes an entry of its own. Whichever count is
  // larger is the one that actually clears the game's own entries.
  const added = Math.max(pushed, window.history.length - startLength);
  window.history.go(-(added + 1));
  // A tab opened straight onto the game has nothing behind it, so the line
  // above does nothing at all. `close()` works only for a window script
  // opened, and silently fails otherwise - which is the honest end of the
  // road: there is no way to close someone's tab for them.
  window.setTimeout(() => window.close(), 120);
}
