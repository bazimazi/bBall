/**
 * Safe-area insets from the Android shell.
 *
 * The page is drawn edge to edge, and every piece of chrome keeps clear of the
 * system bars through `--safe-t/r/b/l`, which default to
 * `env(safe-area-inset-*)`. The Android WebView only fills those in for a
 * display cutout, though - never for the status bar or the navigation bar - so
 * a footer button lands under the gesture handle.
 *
 * `MainActivity` knows the real insets and exposes them as `bBallInsets.get()`
 * (read once here, at start-up) and a `bball:insets` event (sent whenever they
 * change). Both are overlaid on the stylesheet's values as inline custom
 * properties, which win over `:root`. Everywhere else - a browser, a desktop
 * window, iOS - there is no bridge and this does nothing.
 */

interface Insets {
  t: number;
  r: number;
  b: number;
  l: number;
}

interface InsetsBridge {
  get(): string;
}

declare global {
  interface Window {
    bBallInsets?: InsetsBridge;
  }
}

function apply(insets: Insets): void {
  const style = document.documentElement.style;
  style.setProperty('--safe-t', `${insets.t}px`);
  style.setProperty('--safe-r', `${insets.r}px`);
  style.setProperty('--safe-b', `${insets.b}px`);
  style.setProperty('--safe-l', `${insets.l}px`);
  // The court is fitted inside the insets on resize, so ask for a new layout.
  window.dispatchEvent(new Event('resize'));
}

export function installNativeInsets(): void {
  const bridge = window.bBallInsets;
  if (!bridge) return;
  window.addEventListener('bball:insets', (event) => apply((event as CustomEvent<Insets>).detail));
  try {
    const insets = JSON.parse(bridge.get()) as Insets;
    // All zero means the activity has not measured yet; its event follows.
    if (insets.t || insets.r || insets.b || insets.l) apply(insets);
  } catch {
    // Keep the stylesheet's `env()` values.
  }
}
