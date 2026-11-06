import { t, msg } from '../../core/i18n/index';
import { useId, useState } from 'react';

import { abilitySlotsForLevel, BALANCE, paddleSpeedForLevel } from '../../core/balance/config';
import { COSMETICS, isUnlocked } from '../../core/cosmetics/catalog';
import { DEMO_LEVEL_MAX } from '../../core/profile/demo';
import { earnedPoints } from '../../core/talents/save';
import { unlockedTiers } from '../../core/tournament/bracket';
import { Screen } from '../components/Screen';
import styles from '../Screens.module.css';

interface DemoScreenProps {
  /** The level already being demoed, or null when the real save is in play. */
  demoLevel: number | null;
  onStart: (level: number) => void;
  onExit: () => void;
  onBack: () => void;
}

/** Cosmetics a player at `level` would own, ignoring achievement unlocks. */
function cosmeticsAt(level: number): number {
  return COSMETICS.filter((item) => isUnlocked(item, level, new Set())).length;
}

function Fact({ value, label }: { value: string | number; label: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{t(value)}</div>
      <div className={styles.statLabel}>{t(label)}</div>
    </div>
  );
}

/**
 * Type a level and play the game as it is there.
 *
 * The demo runs on a throwaway profile, so every choice on this screen is
 * reversible by definition - leaving hands the real save back, including
 * account updates received while the demo was running.
 */
export function DemoScreen({ demoLevel, onStart, onExit, onBack }: DemoScreenProps) {
  const [level, setLevel] = useState(demoLevel ?? 1);
  const [text, setText] = useState(String(demoLevel ?? 1));

  const rangeId = useId();
  // The field may be mid-edit (empty, or a number that is not a level). Every
  // label then says so instead of describing the last level that was valid:
  // the button, the facts and the note only ever name the level in the field.
  const typed = text.trim() === '' ? NaN : Number(text);
  const valid = Number.isInteger(typed) && typed >= 1 && typed <= DEMO_LEVEL_MAX;

  const edit = (next: string) => {
    setText(next);
    const value = Number(next);
    if (Number.isInteger(value) && value >= 1 && value <= DEMO_LEVEL_MAX) setLevel(value);
  };

  /** Leaving the field settles it on the nearest level, so it never stays out of range. */
  const settle = () => {
    if (valid) return;
    if (!Number.isFinite(typed)) {
      setText(String(level));
      return;
    }
    const nearest = Math.min(DEMO_LEVEL_MAX, Math.max(1, Math.round(typed)));
    setLevel(nearest);
    setText(String(nearest));
  };

  const points = earnedPoints(level);
  const slots = abilitySlotsForLevel(level);
  const cups = unlockedTiers(level);
  const pointsCap = BALANCE.talents.pointsUntilLevel;
  const fact = (value: number) => (valid ? value : '—');

  return (
    <Screen
      title={t('Demo')}
      subtitle={t('Play any level. Nothing is saved.')}
      onBack={onBack}
      footer={
        <>
          <button
            type="button"
            className={styles.primary}
            disabled={!valid}
            onClick={() => onStart(level)}
          >
            {t(
              !valid
                ? demoLevel === null
                  ? 'Demo a level'
                  : 'Change demo level'
                : demoLevel === null
                  ? msg('Demo level {0}', [t(level)])
                  : msg('Switch to level {0}', [t(level)])
            )}
          </button>
          {demoLevel !== null && (
            <button type="button" className={styles.ghost} onClick={onExit}>
              {t('Exit demo')}
            </button>
          )}
        </>
      }
    >
      <p className={styles.sectionLabel}>{t('Level')}</p>
      <input
        className={styles.input}
        type="number"
        inputMode="numeric"
        min={1}
        max={DEMO_LEVEL_MAX}
        step={1}
        value={text}
        aria-label={t(msg('Demo level, 1 to {0}', [t(DEMO_LEVEL_MAX)]))}
        aria-invalid={!valid}
        aria-describedby={rangeId}
        onChange={(event) => edit(event.target.value)}
        onBlur={settle}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !valid) return;
          event.currentTarget.blur();
          onStart(level);
        }}
      />

      <p
        id={rangeId}
        className={valid ? styles.fieldHint : `${styles.fieldHint} ${styles.fieldError}`}
        aria-live="polite"
      >
        {t(`Choose a level from 1 to ${DEMO_LEVEL_MAX}.`)}
      </p>

      <p className={styles.sectionLabel}>{t('At this level')}</p>
      <div className={styles.stats}>
        <Fact value={fact(points)} label={t('Talent points')} />
        <Fact value={fact(slots)} label={t('Skill slots')} />
        <Fact value={fact(cups.length)} label={t('Cups open')} />
        <Fact value={fact(cosmeticsAt(level))} label={t('Cosmetics')} />
        <Fact value={fact(paddleSpeedForLevel(level))} label={t('Paddle speed')} />
      </div>

      {/* Mid-edit there is no level to describe; the rule above says what is wrong. */}
      {valid && (
        <p className={styles.note}>
          {t('A demo profile starts with a clean record and the talent points level ')}
          {t(level)}{' '}
          {t(
            ' has earned. Levelling never stops, but what it pays does: talent points end at level '
          )}
          {t(pointsCap)}
          {t(' and paddle speed at ')}
          {t(BALANCE.paddle.max)}
          {t(
            '. Matches, XP and builds from a demo are thrown away when you leave - your real progress is untouched.'
          )}
        </p>
      )}
    </Screen>
  );
}
