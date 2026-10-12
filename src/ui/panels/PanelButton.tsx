import { t } from '../../core/i18n/index';
import type { ReactNode } from 'react';

import styles from '../Overlay.module.css';

interface PanelButtonProps {
  onClick: () => void;
  children: ReactNode;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  initialFocus?: boolean;
}

export function PanelButton({
  onClick,
  children,
  variant = 'primary',
  disabled = false,
  initialFocus = false
}: PanelButtonProps) {
  const className = variant === 'ghost' ? `${styles.button} ${styles.ghost}` : styles.button;
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      data-dialog-initial={initialFocus || undefined}
    >
      {t(children)}
    </button>
  );
}
