import { useEffect, useId, useRef, useState } from 'react';

import screens from '../Screens.module.css';
import styles from './DailyResultCopy.module.css';

interface DailyResultCopyProps {
  text: string;
}

type Phase = 'idle' | 'copying' | 'copied' | 'failed';

/** Copy stays optional: refusal always leaves a manual path to the same text. */
export function DailyResultCopy({ text }: DailyResultCopyProps) {
  const [result, setResult] = useState<{ text: string; phase: Phase }>({ text, phase: 'idle' });
  const [manual, setManual] = useState(false);
  const request = useRef<{ text: string } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const statusId = useId();

  // Keep the button and manual field mounted when the record changes, but a
  // previous result's pending/success message must not describe the new text.
  if (result.text !== text) setResult({ text, phase: 'idle' });

  // An API write cannot be cancelled; ignore its response after a record change
  // or navigation. It must not clear a newer request's guard either.
  useEffect(
    () => () => {
      request.current = null;
    },
    [text]
  );

  useEffect(() => {
    if (result.phase !== 'failed' || document.activeElement !== button.current) return;
    field.current?.focus();
    field.current?.select();
  }, [result.phase]);

  const copy = async () => {
    if (request.current?.text === text) return;
    const pending = { text };
    request.current = pending;
    setResult({ text, phase: 'copying' });
    try {
      // Called directly in the player's gesture, without a permission preflight.
      await navigator.clipboard.writeText(text);
      if (request.current !== pending) return;
      if (document.activeElement === field.current) button.current?.focus();
      setResult({ text, phase: 'copied' });
      setManual(false);
    } catch {
      if (request.current !== pending) return;
      setResult({ text, phase: 'failed' });
      setManual(true);
    } finally {
      if (request.current === pending) request.current = null;
    }
  };

  const message =
    result.phase === 'copying'
      ? 'Copying result…'
      : result.phase === 'copied'
        ? 'Copied to clipboard.'
        : result.phase === 'failed'
          ? 'Automatic copy didn’t work here. Select and copy the result below, or try Copy result again.'
          : manual
            ? 'Select and copy the result below.'
            : '';

  return (
    <div className={styles.copy}>
      <button
        ref={button}
        type="button"
        className={screens.ghost}
        aria-disabled={result.phase === 'copying'}
        aria-busy={result.phase === 'copying'}
        onClick={() => void copy()}
      >
        Copy result
      </button>
      <p id={statusId} role="status" aria-atomic="true" className={screens.note}>
        {message}
      </p>
      {manual && (
        <textarea
          ref={field}
          className={`${screens.input} ${styles.text}`}
          aria-label="Daily result text"
          aria-describedby={statusId}
          value={text}
          readOnly
          rows={3}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </div>
  );
}
