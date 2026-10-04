import { useId, type ReactNode } from 'react';
import { useScreenFocus } from '../hooks/useScreenFocus';

import styles from '../Screens.module.css';

interface ScreenProps {
  title: string;
  subtitle?: string;
  onBack?: (() => void) | undefined;
  /** A submenu may let Escape return to its paused match. Child handlers take priority. */
  onEscape?: (() => void) | undefined;
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
export function Screen({ title, subtitle, onBack, onEscape, children, footer }: ScreenProps) {
  const heading = useScreenFocus();
  const titleId = useId();
  return (
    <section
      className={styles.screen}
      aria-labelledby={titleId}
      onKeyDown={
        onEscape
          ? (event) => {
              if (
                event.key !== 'Escape' ||
                event.defaultPrevented ||
                event.repeat ||
                event.ctrlKey ||
                event.altKey ||
                event.metaKey
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              onEscape();
            }
          : undefined
      }
    >
      <header className={styles.header}>
        {onBack && (
          <button type="button" className={styles.back} onClick={onBack} aria-label="Back">
            <BackIcon />
          </button>
        )}
        <span className={styles.headText}>
          <h2 ref={heading} id={titleId} className={styles.title} tabIndex={-1} data-screen-heading>
            {title}
          </h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </span>
      </header>

      <div className={styles.body}>{children}</div>

      {footer && <footer className={styles.footer}>{footer}</footer>}
    </section>
  );
}
