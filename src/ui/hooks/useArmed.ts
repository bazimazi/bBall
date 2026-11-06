import { useEffect, useState } from 'react';

/** Seconds an armed control waits for its second press before it stands down. */
const ARMED_MS = 5000;

/**
 * A destructive action that asks for a second press.
 *
 * One control is armed at a time, named by a key that its element carries as
 * `data-arm`. The armed state is meant to answer the very next thing the
 * player does, so it stands down by itself after a few seconds and the moment
 * anything else happens: a press or focus anywhere outside that control, or
 * Escape. A later, unrelated tap can therefore never complete the action.
 */
export function useArmed<K extends string>(): readonly [K | null, (key: K | null) => void] {
  const [armed, setArmed] = useState<K | null>(null);

  useEffect(() => {
    if (armed === null) return;
    const inside = (target: EventTarget | null) =>
      target instanceof Element && target.closest('[data-arm]')?.getAttribute('data-arm') === armed;
    const onPress = (event: Event) => {
      if (!inside(event.target)) setArmed(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArmed(null);
    };
    const timer = window.setTimeout(() => setArmed(null), ARMED_MS);
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('focusin', onPress, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onPress, true);
      document.removeEventListener('focusin', onPress, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [armed]);

  return [armed, setArmed] as const;
}
