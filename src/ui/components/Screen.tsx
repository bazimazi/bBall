import { t } from '../../core/i18n/index';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useScreenFocus } from '../hooks/useScreenFocus';
import { SaveNotice } from './SaveNotice';

import styles from '../Screens.module.css';

interface ScreenProps {
  className?: string | undefined;
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
export function Screen({
  title,
  subtitle,
  onBack,
  onEscape,
  children,
  footer,
  className
}: ScreenProps) {
  const heading = useScreenFocus();
  const titleId = useId();
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  });
  const listening = onEscape !== undefined;
  // On the document rather than the section: Safari does not focus a clicked
  // button, so after any click the key arrives at the body. Dialogs and key
  // capture claim Escape first and stop it before it bubbles this far.
  useEffect(() => {
    if (!listening) return;
    const onKey = (event: KeyboardEvent) => {
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
      escape.current?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [listening]);
  return (
    <section
      className={`${styles.screen}${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        {onBack && (
          <button type="button" className={styles.back} onClick={onBack} aria-label={t('Back')}>
            <BackIcon />
          </button>
        )}
        <span className={styles.headText}>
          <h2 ref={heading} id={titleId} className={styles.title} tabIndex={-1} data-screen-heading>
            {t(title)}
          </h2>
          {subtitle && <p className={styles.subtitle}>{t(subtitle)}</p>}
        </span>
      </header>

      <div className={styles.body}>
        <SaveNotice />
        {t(children)}
      </div>

      {footer && <footer className={styles.footer}>{t(footer)}</footer>}
    </section>
  );
}
