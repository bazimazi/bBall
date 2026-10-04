import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { activateDialog } from '../focus';

interface DialogProps {
  label: string;
  onDismiss: () => void;
  className?: string | undefined;
  children: ReactNode;
  /** A detail sheet escapes the menu's stacking context. */
  portal?: boolean;
  /** Only Pause keeps the game's pause/serve/mute shortcuts active. */
  gameShortcuts?: boolean;
}

export function Dialog({
  label,
  onDismiss,
  className,
  children,
  portal = false,
  gameShortcuts = false
}: DialogProps) {
  const root = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  useLayoutEffect(() => {
    dismiss.current = onDismiss;
  });
  useLayoutEffect(() => {
    if (root.current) return activateDialog(root.current, () => dismiss.current());
  }, []);
  const content = (
    <div
      ref={root}
      className={className}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      data-game-modal={gameShortcuts ? 'pause' : 'blocked'}
    >
      {children}
    </div>
  );
  return portal && typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
