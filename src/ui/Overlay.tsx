import type { ReactNode } from 'react';

import styles from './Overlay.module.css';

interface OverlayProps {
  show: boolean;
  children: ReactNode;
}

/**
 * The card over the court, used for the pause menu. It stays mounted so it can
 * fade, and lets pointer events through to the canvas whenever it is hidden.
 */
export function Overlay({ show, children }: OverlayProps) {
  return (
    <div className={show ? `${styles.overlay} ${styles.show}` : styles.overlay} aria-live="polite">
      <div className={styles.card}>{show && children}</div>
    </div>
  );
}
