import { useCallback, useEffect, useRef, useState } from 'react';

/** Calendar presentation only: the client's local day, refreshed on visible return. */
export function useLocalClock() {
  const [now, setNow] = useState(() => new Date());
  const timer = useRef(0);
  const refresh = useCallback(function updateClock(clock = new Date()) {
    window.clearTimeout(timer.current);
    timer.current = 0;
    if (document.hidden) return;
    setNow(clock);
    const midnight = new Date(clock);
    midnight.setHours(24, 0, 0, 0);
    // Poll for clock/timezone changes and countdowns; wake sooner at midnight.
    timer.current = window.setTimeout(
      () => updateClock(),
      Math.min(30_000, Math.max(1, midnight.getTime() - clock.getTime()))
    );
  }, []);

  useEffect(() => {
    const tick = () => refresh();
    tick();
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearTimeout(timer.current);
      timer.current = 0;
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  return { now, refresh };
}
