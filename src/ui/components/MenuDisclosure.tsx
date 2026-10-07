import { useId, useState, type ReactNode } from 'react';
import styles from '../Screens.module.css';

/** Optional settings stay discoverable without crowding the play choices. */
export function MenuDisclosure({
  title,
  hint,
  children
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <div className={styles.disclosure} data-disclosure data-open={open}>
      <button
        type="button"
        className={styles.disclosureTrigger}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.disclosureTitle}>{title}</span>
        {hint && <span className={styles.disclosureHint}>{hint}</span>}
      </button>
      <div id={bodyId} className={styles.disclosurePanel} aria-hidden={!open} inert={!open}>
        <div className={styles.disclosureContent}>
          <div className={styles.disclosureBody}>{children}</div>
        </div>
      </div>
    </div>
  );
}
