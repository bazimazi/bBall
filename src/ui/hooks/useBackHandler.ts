import { useEffect, useRef } from 'react';

import { pushBackHandler } from '../../core/platform/back';

/**
 * Answer the back button while `active` - a browser's, or Android's.
 *
 * Whoever registered last is asked first, and React mounts children after
 * their parents, so the innermost thing on screen wins without anyone having
 * to say so: a modal beats the screen it sits in, and that screen beats the
 * app's own "leave the game?" prompt.
 *
 * The handler is read through a ref rather than registered directly, because
 * re-registering on every render would keep pushing a parent back above the
 * children that are meant to answer first. Only `active` moves it.
 */
export function useBackHandler(active: boolean, handler: () => void): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => latest.current());
  }, [active]);
}
