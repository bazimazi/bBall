import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Dialog } from './components/Dialog';

import styles from './Overlay.module.css';

interface OverlayProps {
  show: boolean;
  label: string;
  labelledBy?: string | undefined;
  describedBy?: string | undefined;
  role?: 'dialog' | 'alertdialog';
  onDismiss: () => void;
  gameShortcuts?: boolean;
  children: ReactNode;
}

/**
 * The card over the court, used for the pause menu. It stays mounted so it can
 * fade, and lets pointer events through to the canvas whenever it is hidden.
 */
export function Overlay({
  show,
  label,
  labelledBy,
  describedBy,
  role = 'dialog',
  onDismiss,
  gameShortcuts = false,
  children
}: OverlayProps) {
  const content = (
    <div className={show ? `${styles.overlay} ${styles.show}` : styles.overlay} aria-hidden={!show}>
      <div className={styles.card}>
        {show && (
          <Dialog
            label={label}
            labelledBy={labelledBy}
            describedBy={describedBy}
            role={role}
            onDismiss={onDismiss}
            gameShortcuts={gameShortcuts}
          >
            {children}
          </Dialog>
        )}
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
