import { useEffect, useSyncExternalStore } from 'react';
import { fullscreenStore, initializeFullscreen } from '../../core/platform/fullscreen';

export function useFullscreen() {
  const state = useSyncExternalStore(
    fullscreenStore.subscribe,
    fullscreenStore.getSnapshot,
    fullscreenStore.getSnapshot
  );
  useEffect(() => {
    void initializeFullscreen();
  }, []);
  return state;
}
