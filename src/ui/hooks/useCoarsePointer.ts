import { useSyncExternalStore } from 'react';

const QUERY = '(hover: none)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches || 'ontouchstart' in window;
}

/** True when the player is most likely using a finger rather than a mouse. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
