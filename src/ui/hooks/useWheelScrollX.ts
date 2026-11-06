import { useEffect, type RefObject } from 'react';

/**
 * Let an ordinary mouse wheel scroll a sideways strip.
 *
 * A strip that only scrolls on its x axis is out of reach for a mouse with a
 * vertical wheel: the wheel scrolls the page past it, and the hidden-or-thin
 * scrollbar is hard to grab. While the pointer is over the strip and the strip
 * can still move in the wheel's direction, the wheel moves the strip instead.
 * At either end the wheel goes back to scrolling the page, so it never traps
 * the player. Shift+wheel and trackpad swipes are already sideways and are left
 * to the browser.
 */
export function useWheelScrollX(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey) return;
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const range = strip.scrollWidth - strip.clientWidth;
      if (range <= 1) return;
      // RTL strips start at the right edge, with scrollLeft running negative.
      const rtl = getComputedStyle(strip).direction === 'rtl';
      const travelled = rtl ? -strip.scrollLeft : strip.scrollLeft;
      const forward = event.deltaY > 0;
      if (forward ? travelled >= range - 1 : travelled <= 1) return;
      const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? strip.clientWidth : 1;
      event.preventDefault();
      strip.scrollLeft += event.deltaY * unit * (rtl ? -1 : 1);
    };
    strip.addEventListener('wheel', onWheel, { passive: false });
    return () => strip.removeEventListener('wheel', onWheel);
  }, [ref]);
}
