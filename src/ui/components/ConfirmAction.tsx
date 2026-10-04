import { useId, useLayoutEffect, useRef } from 'react';
import { Overlay } from '../Overlay';
import { useBackHandler } from '../hooks/useBackHandler';
import styles from '../Overlay.module.css';

interface ConfirmActionProps {
  show: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Protect actions that discard saved progress, with the keep action focused first. */
export function ConfirmAction({
  show,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel
}: ConfirmActionProps) {
  const titleId = useId();
  const descriptionId = useId();
  const confirmed = useRef(false);
  useLayoutEffect(() => {
    confirmed.current = false;
  }, [show]);
  useBackHandler(show, onCancel);

  return (
    <Overlay
      show={show}
      label={title}
      labelledBy={titleId}
      describedBy={descriptionId}
      role="alertdialog"
      onDismiss={onCancel}
    >
      <div className={styles.panel}>
        <h2 id={titleId} className={styles.heading}>
          {title}
        </h2>
        <p id={descriptionId} className={styles.explanation}>
          {description}
        </p>
        <button type="button" className={styles.button} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.ghost} ${styles.danger}`}
          onClick={() => {
            if (confirmed.current) return;
            confirmed.current = true;
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Overlay>
  );
}
