import { t, msg } from '../../core/i18n/index';
import { useState, type KeyboardEvent } from 'react';
import {
  DEFAULT_BINDINGS,
  KEY_ACTIONS,
  actionLabel,
  assignKey,
  keyName,
  type KeyAction
} from '../../core/settings/controls';
import { settingsStore } from '../../core/settings/store';
import { useSettings } from '../hooks/useSettings';
import { useBackHandler } from '../hooks/useBackHandler';
import styles from './KeyBindingsEditor.module.css';

export function KeyBindingsEditor() {
  const { keyBindings } = useSettings();
  const [editing, setEditing] = useState<{ action: KeyAction; slot: number } | null>(null);
  const [message, setMessage] = useState('');
  useBackHandler(editing !== null, () => setEditing(null));

  const capture = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!editing) return;
    if (event.key === 'Tab') {
      setEditing(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (event.key === 'Escape') {
      setEditing(null);
      setMessage('Change cancelled.');
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
      setMessage('Use one key without Ctrl, Alt, Shift or Command.');
      return;
    }
    const next = assignKey(keyBindings, editing.action, editing.slot, event.key);
    if (next.error !== null) {
      setMessage(next.error);
      return;
    }
    settingsStore.update({ keyBindings: next.bindings });
    setMessage(`${actionLabel(editing.action)}: ${keyName(event.key.toLowerCase())}.`);
    setEditing(null);
  };

  return (
    <details className={styles.editor}>
      <summary>{t('Keyboard controls')}</summary>
      <p>
        {t(
          'Choose a key button, then press its replacement. Escape cancels; Tab moves to the next control.'
        )}
      </p>
      <div className={styles.rows}>
        {KEY_ACTIONS.map((action) => (
          <div className={styles.row} key={action}>
            <span>{t(actionLabel(action))}</span>
            <div className={styles.keys}>
              {[0, 1].map((slot) => {
                const key = keyBindings[action][slot];
                const active = editing?.action === action && editing.slot === slot;
                return (
                  <button
                    type="button"
                    key={slot}
                    aria-pressed={active}
                    aria-label={t(
                      msg('{0}, {1} key: {2}', [
                        t(actionLabel(action)),
                        t(slot === 0 ? 'primary' : 'alternate'),
                        key ? keyName(key) : 'not assigned'
                      ])
                    )}
                    onClick={() => {
                      setEditing(active ? null : { action, slot });
                      setMessage('');
                    }}
                    onKeyDown={capture}
                    onBlur={() => {
                      if (active) setEditing(null);
                    }}
                  >
                    {t(active ? 'Press a key…' : key ? keyName(key) : 'Add key')}
                  </button>
                );
              })}
              {keyBindings[action].length > 1 && (
                <button
                  type="button"
                  aria-label={t(msg('Remove alternate key for {0}', [t(actionLabel(action))]))}
                  onClick={() => {
                    settingsStore.update({
                      keyBindings: { ...keyBindings, [action]: keyBindings[action].slice(0, 1) }
                    });
                    setEditing(null);
                    setMessage(`${actionLabel(action)} alternate key removed.`);
                  }}
                >
                  {t('×')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p role="status" aria-live="polite" aria-atomic="true">
        {t(
          message ||
            (editing
              ? msg('Press a key for {0}.', [t(actionLabel(editing.action))])
              : 'Escape remains a pause key. Player 2 movement keys also work in solo play.')
        )}
      </p>
      <button
        type="button"
        onClick={() => {
          settingsStore.update({ keyBindings: DEFAULT_BINDINGS });
          setEditing(null);
          setMessage('Default keyboard controls restored.');
        }}
      >
        {t('Restore default keys')}
      </button>
    </details>
  );
}
