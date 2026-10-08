import { useLayoutEffect, useRef, type MouseEvent } from 'react';

const EASING = 'cubic-bezier(.22, 1, .36, 1)';
function cancelAnimation(animation: Animation) {
  // Cancellation rejects finished; interruption and unmount are expected here.
  void animation.finished.catch(() => {});
  animation.cancel();
}

/** Animate existing panels so navigation never remounts the focused control. */
export function useWorkshopMotion(key: string, order: number, assemble = false) {
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef<{ key: string; order: number; node: HTMLDivElement | null }>(null);
  const active = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const node = root.current;
    const before = previous.current;
    previous.current = { key, order, node };
    if (before && before.node !== node && active.current) {
      cancelAnimation(active.current);
      active.current = null;
    }
    if (!node || !before || before.node !== node || before.key === key) return;
    if (typeof node.animate !== 'function') return;
    const interrupted =
      active.current?.playState === 'running' || active.current?.playState === 'paused';
    const current = interrupted ? getComputedStyle(node) : null;
    const direction = getComputedStyle(node).direction === 'rtl' ? -1 : 1;
    const from = current
      ? { opacity: current.opacity, transform: current.transform }
      : {
          opacity: assemble ? 0.65 : 0,
          transform: assemble
            ? 'scale(.96)'
            : `translateX(${(order >= before.order ? 10 : -10) * direction}px)`
        };
    if (active.current) cancelAnimation(active.current);
    active.current = node.animate([from, { opacity: 1, transform: 'none' }], {
      duration: assemble ? 240 : 260,
      easing: EASING
    });
  });
  useLayoutEffect(
    () => () => {
      if (active.current) cancelAnimation(active.current);
    },
    []
  );
  return root;
}

/** Retain modal focus/inertness until the last exit frame, even on early Escape. */
export function useWorkshopDetailMotion(detail: string | null, onDismiss: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const timeout = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined);
  useLayoutEffect(() => {
    closing.current = false;
    const node = panel.current;
    const overlay = node?.parentElement;
    return () => {
      window.clearTimeout(timeout.current);
      node?.getAnimations?.().forEach(cancelAnimation);
      overlay?.getAnimations?.().forEach(cancelAnimation);
    };
  }, [detail]);
  const close = () => {
    if (closing.current) return;
    const node = panel.current;
    const overlay = node?.parentElement;
    if (!node || !overlay || typeof node.animate !== 'function') {
      onDismiss();
      return;
    }
    closing.current = true;
    node.dataset.closing = 'true';
    const pose = getComputedStyle(node);
    const from = { opacity: pose.opacity, transform: pose.transform };
    const opacity = getComputedStyle(overlay).opacity;
    node.getAnimations().forEach(cancelAnimation);
    overlay.getAnimations().forEach(cancelAnimation);
    const options = { duration: 180, easing: EASING, fill: 'forwards' as const };
    overlay.animate([{ opacity }, { opacity: 0 }], options);
    const animation = node.animate(
      [from, { opacity: 0, transform: 'translateY(8px) scale(.97)' }],
      options
    );
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout.current);
      onDismiss();
    };
    animation.onfinish = finish;
    // A suspended renderer must still release the focus trap and background.
    timeout.current = window.setTimeout(finish, 240);
  };
  const blockClosingClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!closing.current) return;
    event.preventDefault();
    event.stopPropagation();
  };
  return { panel, close, blockClosingClick };
}
