import { t, msg } from '../../core/i18n/index';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Dialog } from './Dialog';
import { useBackHandler } from '../hooks/useBackHandler';
import styles from './GamePicker.module.css';

// Leave time for the 220ms exit even if a webview drops its animationend event.
const EXIT_FALLBACK_MS = 280;

export interface PickerOption<T extends string | number> {
  value: T;
  name: string;
  hint?: string;
  disabled?: boolean;
  tag?: string;
}

interface GamePickerProps<T extends string | number> {
  label: string;
  value: T;
  options: readonly PickerOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  compact?: boolean;
  placeholder?: string;
}

/** Choices belong to the game, including the open menu on mobile webviews. */
export function GamePicker<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  compact = false,
  placeholder = 'Choose…'
}: GamePickerProps<T>) {
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed');
  const closing = useRef(false);
  const finishClose = useCallback(() => {
    if (!closing.current) return;
    closing.current = false;
    setPhase('closed');
  }, []);
  useEffect(() => {
    if (phase !== 'closing') return;
    const timer = window.setTimeout(finishClose, EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [phase, finishClose]);
  function close(next?: T) {
    if (closing.current) return;
    closing.current = true;
    setPhase('closing');
    if (next !== undefined) onChange(next);
  }
  const valueId = useId();
  const selected = options.find((option) => option.value === value);
  return (
    <div className={styles.field} data-picker={label}>
      {!compact && <span className={styles.label}>{t(label)}</span>}
      <button
        type="button"
        className={styles.trigger}
        aria-label={t(label)}
        aria-describedby={valueId}
        aria-haspopup="dialog"
        aria-expanded={phase === 'open' && !disabled}
        disabled={disabled}
        data-value={value}
        onClick={() => setPhase('open')}
      >
        <span id={valueId}>{t(selected?.name ?? placeholder)}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 5 7 7-7 7" />
        </svg>
      </button>
      {phase !== 'closed' && !disabled && (
        <PickerSheet
          label={t(label)}
          value={value}
          options={options}
          closing={phase === 'closing'}
          onDismiss={() => close()}
          onChange={close}
          onExited={finishClose}
        />
      )}
    </div>
  );
}

function PickerSheet<T extends string | number>({
  label,
  value,
  options,
  onChange,
  onDismiss,
  closing,
  onExited
}: Pick<GamePickerProps<T>, 'label' | 'value' | 'options' | 'onChange'> & {
  onDismiss: () => void;
  closing: boolean;
  onExited: () => void;
}) {
  const titleId = useId();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(value);
  const sheet = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const activeOption = useRef<HTMLButtonElement>(null);
  const typed = useRef({ text: '', time: 0 });
  const searchable = options.length > 12;
  const visible = options.filter((option) =>
    `${t(option.name)} ${t(option.hint ?? '')}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  const enabled = visible.filter((option) => !option.disabled);
  const active = enabled.find((option) => option.value === cursor) ?? enabled[0];
  const activeIndex = active ? visible.indexOf(active) : -1;

  useBackHandler(true, requestClose);
  useEffect(() => {
    activeOption.current?.scrollIntoView?.({ block: 'nearest' });
  }, [active?.value, query]);

  function requestClose(next?: T) {
    if (closing) return;
    // Start the exit from the current frame when an opening sheet is dismissed early.
    for (const node of [sheet.current, scrim.current]) {
      if (!node) continue;
      const style = getComputedStyle(node);
      node.style.setProperty('--picker-exit-opacity', style.opacity);
      if (node === sheet.current)
        node.style.setProperty('--picker-exit-transform', style.transform);
    }
    if (next === undefined) onDismiss();
    else onChange(next);
  }

  function navigate(event: KeyboardEvent) {
    if (closing || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing)
      return;
    const at = enabled.findIndex((option) => option.value === active?.value);
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = Math.min(at + 1, enabled.length - 1);
    if (event.key === 'ArrowUp') next = Math.max(at - 1, 0);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = enabled.length - 1;
    if (next !== null) {
      event.preventDefault();
      if (enabled[next]) setCursor(enabled[next]!.value);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (active && !event.repeat) requestClose(active.value);
    } else if (event.key.length === 1) {
      const now = event.timeStamp;
      const text =
        (now - typed.current.time < 600 ? typed.current.text : '') + event.key.toLowerCase();
      typed.current = { text, time: now };
      const match =
        enabled.find((option) => t(option.name).toLowerCase().startsWith(text)) ??
        enabled.find((option) => t(option.name).toLowerCase().startsWith(event.key.toLowerCase()));
      if (match) {
        event.preventDefault();
        setCursor(match.value);
      }
    }
  }

  return (
    <Dialog
      label={t(label)}
      labelledBy={titleId}
      onDismiss={requestClose}
      className={`${styles.overlay} ${closing ? styles.closing : ''}`}
      portal
    >
      <button
        ref={scrim}
        type="button"
        className={styles.scrim}
        tabIndex={-1}
        aria-label={t(msg('Dismiss {0}', [t(label)]))}
        onClick={() => requestClose()}
      />
      <div
        ref={sheet}
        className={styles.sheet}
        data-picker-sheet
        data-closing={closing}
        onAnimationEnd={(event) => {
          if (closing && event.target === event.currentTarget) onExited();
        }}
      >
        <header className={styles.header}>
          <div>
            <span className={styles.kicker}>{t('Choose')}</span>
            <h2 id={titleId}>{t(label)}</h2>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={() => requestClose()}
            aria-label={t('Close choices')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M6 18 18 6" />
            </svg>
          </button>
        </header>
        {searchable && (
          <input
            className={styles.search}
            type="search"
            aria-label={t(msg('Search {0}', [t(label.toLowerCase())]))}
            placeholder={t('Find a choice…')}
            value={query}
            onChange={(event) => !closing && setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (closing || event.nativeEvent.isComposing) return;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                list.current?.focus();
              } else if (event.key === 'Enter' && active) {
                event.preventDefault();
                requestClose(active.value);
              }
            }}
          />
        )}
        <div
          ref={list}
          id={listId}
          className={styles.list}
          role="listbox"
          aria-label={t(label)}
          aria-activedescendant={activeIndex < 0 ? undefined : `${listId}-${activeIndex}`}
          tabIndex={0}
          data-dialog-initial
          onKeyDown={navigate}
        >
          {visible.map((option, index) => (
            <button
              type="button"
              role="option"
              key={option.value}
              id={`${listId}-${index}`}
              className={styles.option}
              ref={option.value === active?.value ? activeOption : undefined}
              aria-selected={option.value === value}
              aria-disabled={!!option.disabled}
              disabled={option.disabled}
              tabIndex={-1}
              data-value={option.value}
              data-cursor={option.value === active?.value}
              onClick={() => !option.disabled && requestClose(option.value)}
            >
              {option.tag && (
                <span className={styles.tag} aria-hidden="true">
                  {t(option.tag)}
                </span>
              )}
              <span className={styles.optionText}>
                <strong>{t(option.name)}</strong>
                {option.hint && <small>{t(option.hint)}</small>}
              </span>
              <span className={styles.mark} aria-hidden="true">
                {t(option.disabled ? '◇' : option.value === value ? '✓' : '')}
              </span>
            </button>
          ))}
          {visible.length === 0 && (
            <p className={styles.empty} role="status">
              {t('No choices match. Try another search.')}
            </p>
          )}
        </div>
        <p className={styles.footer}>{t('Choose to apply · Back to cancel')}</p>
      </div>
    </Dialog>
  );
}
