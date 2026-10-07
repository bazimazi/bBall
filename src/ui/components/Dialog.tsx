import { t } from '../../core/i18n/index';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { activateDialog } from '../focus';

interface DialogProps {
  label: string;
  labelledBy?: string | undefined;
  describedBy?: string | undefined;
  role?: 'dialog' | 'alertdialog';
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
  labelledBy,
  describedBy,
  role = 'dialog',
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
      role={role}
      aria-modal="true"
      aria-label={t(labelledBy ? undefined : label)}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      tabIndex={-1}
      data-game-modal={gameShortcuts ? 'pause' : 'blocked'}
    >
      {t(children)}
    </div>
  );
  return portal && typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
