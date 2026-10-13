import { useState } from 'react';
import { sharedChallengeRules } from '../../core/modes/sharedChallenge';
import { t } from '../../core/i18n';
import { CourtPreview } from '../components/RulePreview';
import { Screen } from '../components/Screen';
import styles from '../Screens.module.css';

export function SharedChallengeScreen({
  onStart,
  onBack
}: {
  onStart: (code: string) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState('BB1-FRIENDS');
  const rules = sharedChallengeRules(code);
  return (
    <Screen
      title={t('Shared rally challenge')}
      subtitle={t('Same code · same court · neutral build')}
      onBack={onBack}
      footer={
        <button
          type="button"
          className={styles.primary}
          disabled={!rules}
          onClick={() => onStart(code)}
        >
          {t('Start shared challenge')}
        </button>
      }
    >
      <div className={styles.card}>
        <label className={styles.field}>
          {t('Challenge code')}
          <input
            className={styles.input}
            autoCapitalize="characters"
            spellCheck={false}
            aria-label={t('Challenge code')}
            value={code}
            maxLength={20}
            dir="ltr"
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <p>
          <code dir="ltr">BB1-</code>{' '}
          {t(
            'Add 1–16 letters or numbers after the prefix shown. Give a friend the same code, then compare your results.'
          )}
        </p>
        {!rules && <p role="alert">{t('Enter a valid challenge code.')}</p>}
        {rules && <CourtPreview arena={rules.modifiers.arena} />}
        <p>{t('Target: 30 returns before three misses · neutral build · no rewards')}</p>
        <p>{t('Use the same court width and game version to compare scores.')}</p>
      </div>
    </Screen>
  );
}
