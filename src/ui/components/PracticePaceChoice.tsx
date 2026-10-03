import { settingsStore } from '../../core/settings/store';
import { useSettings } from '../hooks/useSettings';
import styles from '../Screens.module.css';

export function PracticePaceChoice() {
  const { practicePace } = useSettings();
  return (
    <>
      <p className={styles.sectionLabel}>Ball pace</p>
      <div className={styles.segmented} role="group" aria-label="Practice ball pace">
        {(['normal', 'relaxed'] as const).map((pace) => (
          <button
            type="button"
            key={pace}
            aria-pressed={pace === practicePace}
            className={pace === practicePace ? `${styles.ghost} ${styles.selected}` : styles.ghost}
            onClick={() => settingsStore.update({ practicePace: pace })}
          >
            {pace === 'normal' ? 'Normal' : 'Relaxed'}
          </button>
        ))}
      </div>
      <p className={styles.note}>
        Relaxed slows the ball and how quickly rallies speed up. Your paddle stays responsive.
      </p>
    </>
  );
}
