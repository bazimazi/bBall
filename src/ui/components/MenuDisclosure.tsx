import type { ReactNode } from 'react';
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
  return (
    <details className={styles.disclosure}>
      <summary>
        <span className={styles.disclosureTitle}>{title}</span>
        {hint && <span className={styles.disclosureHint}>{hint}</span>}
      </summary>
      <div className={styles.disclosureBody}>{children}</div>
    </details>
  );
}
