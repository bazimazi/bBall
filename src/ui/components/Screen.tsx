import type { ReactNode } from 'react';

import styles from '../Screens.module.css';

interface ScreenProps {
  title: string;
  subtitle?: string;
  onBack?: (() => void) | undefined;
  children: ReactNode;
  /** Pinned under the body, where a thumb can always reach it. */
  footer?: ReactNode;
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

/**
 * The frame every menu screen shares: a header, one scrolling body and an
 * optional footer. Keeping the shell in one place is what stops the menus
 * drifting apart as modes are added.
 */
export function Screen({ title, subtitle, onBack, children, footer }: ScreenProps) {
  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        {onBack && (
          <button type="button" className={styles.back} onClick={onBack} aria-label="Back">
            <BackIcon />
          </button>
        )}
        <span className={styles.headText}>
          <h2 className={styles.title}>{title}</h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </span>
      </header>

      <div className={styles.body}>{children}</div>

      {footer && <footer className={styles.footer}>{footer}</footer>}
    </section>
  );
}
