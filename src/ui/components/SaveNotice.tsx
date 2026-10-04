import { useLayoutEffect, useRef, useState } from 'react';
import { localSaveStatus } from '../../core/storage/localStore';
import { useLocalSave } from '../hooks/useLocalSave';
import styles from './SaveNotice.module.css';

/** Shown in menus and Pause, so a storage failure does not cover a live rally. */
export function SaveNotice() {
  const state = useLocalSave();
  const unsaved = state !== 'saved';
  const [attempted, setAttempted] = useState(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const focusFeedback = useRef(false);
  useLayoutEffect(() => {
    if (!unsaved && focusFeedback.current) {
      focusFeedback.current = false;
      feedback.current?.focus({ preventScroll: true });
    }
  }, [unsaved, attempted]);

  if (!unsaved && !attempted) return null;
  return (
    <div className={unsaved ? styles.notice : `${styles.notice} ${styles.saved}`}>
      <p ref={feedback} role="status" tabIndex={-1}>
        {state === 'restore' ? (
          <>
            <strong>Existing saved data is protected.</strong> Some data could not be read when
            bBall opened. Reopen bBall to load it; changes made to that data in this session will be
            lost. <strong>Try saving again</strong> can save other pending changes.
          </>
        ) : unsaved ? (
          <>
            <strong>Recent changes could not be saved on this device.</strong> Keep bBall open:
            closing or reloading may lose unsaved changes. Storage may be full or blocked.{' '}
            {attempted && 'Saving is still unavailable. '}
            Try saving again when storage is available.
          </>
        ) : (
          'Changes saved on this device.'
        )}
      </p>
      {unsaved && (
        <button
          type="button"
          onClick={(event) => {
            const focused = document.activeElement === event.currentTarget;
            focusFeedback.current = localSaveStatus.retry() && focused;
            setAttempted(true);
          }}
        >
          Try saving again
        </button>
      )}
    </div>
  );
}
