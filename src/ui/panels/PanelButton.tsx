import type { ReactNode } from 'react';

import styles from '../Overlay.module.css';

interface PanelButtonProps {
  onClick: () => void;
  children: ReactNode;
  variant?: 'primary' | 'ghost';
}

export function PanelButton({ onClick, children, variant = 'primary' }: PanelButtonProps) {
  const className = variant === 'ghost' ? `${styles.button} ${styles.ghost}` : styles.button;
  return (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  );
}
