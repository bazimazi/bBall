import { LANGUAGES } from '../../core/i18n/languages';
import { t } from '../../core/i18n';
import { settingsStore } from '../../core/settings/store';
import { useSettings } from '../hooks/useSettings';
import styles from '../Screens.module.css';

/** Available before the first match so a new player can read onboarding. */
export function LanguageChoice() {
  const { language } = useSettings();
  return (
    <fieldset className={styles.choiceGroup}>
      <legend className={styles.label}>{t('Which language would you prefer?')}</legend>
      <div className={styles.segmented}>
        {LANGUAGES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            lang={choice.id}
            dir={choice.direction}
            className={choice.id === language ? `${styles.ghost} ${styles.selected}` : styles.ghost}
            aria-pressed={choice.id === language}
            onClick={() => settingsStore.update({ language: choice.id })}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
