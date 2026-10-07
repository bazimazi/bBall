import { settingsStore } from '../settings/store';
import { isNativeShell } from './shell';

interface ScreenBridge {
  setFullscreen(enabled: boolean): void;
  isFullscreen(): boolean;
}

declare global {
  interface Window {
    bBallScreen?: ScreenBridge;
  }
}

type Target = 'checking' | 'android' | 'ios' | 'browser' | 'unsupported';
interface FullscreenState {
  target: Target;
  active: boolean;
  pending: boolean;
  error: string | null;
}

function browserSupported(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.fullscreenEnabled &&
    typeof document.documentElement.requestFullscreen === 'function' &&
    typeof document.exitFullscreen === 'function'
  );
}

let state: FullscreenState = {
  target: isNativeShell ? 'checking' : browserSupported() ? 'browser' : 'unsupported',
  active: false,
  pending: false,
  error: null
};
const listeners = new Set<() => void>();
let operation: Promise<boolean> | null = null;

function update(patch: Partial<FullscreenState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function changed(): void {
  update({
    active: window.bBallScreen?.isFullscreen() ?? !!document.fullscreenElement,
    error: null
  });
}

export const fullscreenStore = {
  getSnapshot: () => state,
  subscribe(listener: () => void): () => void {
    if (listeners.size === 0) {
      document.addEventListener('fullscreenchange', changed);
      window.addEventListener('bball:fullscreen', changed);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        document.removeEventListener('fullscreenchange', changed);
        window.removeEventListener('bball:fullscreen', changed);
      }
    };
  }
};

/** Capability checks never request browser fullscreen without a player gesture. */
export async function initializeFullscreen(): Promise<void> {
  let target: Target;
  if (window.bBallScreen) target = 'android';
  else if (isNativeShell) {
    try {
      const { platform } = await import('@tauri-apps/plugin-os');
      target = platform() === 'ios' ? 'ios' : 'unsupported';
    } catch {
      target = 'unsupported';
    }
  } else target = browserSupported() ? 'browser' : 'unsupported';
  update({
    target,
    error: target === state.target ? state.error : null,
    active:
      target === 'android'
        ? window.bBallScreen!.isFullscreen()
        : target === 'ios'
          ? state.active
          : !!document.fullscreenElement
  });
}

async function apply(enabled: boolean): Promise<void> {
  if (state.target === 'android') window.bBallScreen!.setFullscreen(enabled);
  else if (state.target === 'ios') {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_mobile_fullscreen', { enabled });
  } else if (state.target === 'browser') {
    if (enabled && !document.fullscreenElement)
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    else if (!enabled && document.fullscreenElement) await document.exitFullscreen();
  } else if (enabled) throw new Error('Fullscreen unavailable');
}

function change(enabled: boolean): Promise<boolean> {
  // An Off request waits for an in-flight entry, so a late entry cannot undo it.
  if (operation) return enabled ? operation : operation.then(() => change(false));
  update({ pending: true, error: null });
  // Calling apply now preserves the browser's transient user activation.
  operation = apply(enabled)
    .then(() => {
      update({ active: state.target === 'browser' ? !!document.fullscreenElement : enabled });
      return true;
    })
    .catch(() => {
      update({
        error: enabled
          ? "Fullscreen couldn't open. Tap On to try again."
          : "Couldn't leave fullscreen. Try Off again."
      });
      return false;
    })
    .finally(() => {
      operation = null;
      update({ pending: false });
    });
  return operation;
}

export function setFullscreenPreference(enabled: boolean): Promise<boolean> {
  settingsStore.update({ fullscreen: enabled });
  return change(enabled);
}

/** Called directly from play/replay/tutorial gestures, before the match begins. */
export function enterPreferredFullscreen(): void {
  if (
    !settingsStore.getSnapshot().fullscreen ||
    state.target === 'unsupported' ||
    state.target === 'checking'
  )
    return;
  const active =
    state.target === 'browser'
      ? !!document.fullscreenElement
      : state.target === 'android'
        ? window.bBallScreen!.isFullscreen()
        : state.active;
  if (!active) void change(true);
}

/** Native shells can restore on launch; a browser must wait for a play gesture. */
export async function restoreFullscreen(): Promise<void> {
  await initializeFullscreen();
  if (state.target === 'android' || state.target === 'ios')
    await change(settingsStore.getSnapshot().fullscreen);
}
