import { useState } from 'react';

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
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

/**
 * Type a level and play the game as it is there.
 *
 * The demo runs on a throwaway profile, so every choice on this screen is
 * reversible by definition - leaving hands the real save back exactly as it
 * was, whatever happened in between.
 */
export function DemoScreen({ demoLevel, onStart, onExit, onBack }: DemoScreenProps) {
  const [level, setLevel] = useState(demoLevel ?? 1);
  const [text, setText] = useState(String(demoLevel ?? 1));

  // The field may be mid-edit (empty, or a number that is not a level yet);
  // the preview keeps showing the last level that was, so it never flickers.
  const typed = Number.parseInt(text, 10);
  const valid = Number.isInteger(typed) && typed >= 1 && typed <= DEMO_LEVEL_MAX;

  const edit = (next: string) => {
    setText(next);
    const value = Number.parseInt(next, 10);
    if (Number.isInteger(value) && value >= 1 && value <= DEMO_LEVEL_MAX) setLevel(value);
  };

  const points = earnedPoints(level);
  const slots = abilitySlotsForLevel(level);
  const cups = unlockedTiers(level);
  const pointsCap = BALANCE.talents.pointsUntilLevel;

  return (
    <Screen
      title="Demo"
      subtitle="Play any level. Nothing is saved."
      onBack={onBack}
      footer={
        <>
          <button
            type="button"
            className={styles.primary}
            disabled={!valid}
            onClick={() => onStart(level)}
          >
            {demoLevel === null ? `Demo level ${level}` : `Switch to level ${level}`}
          </button>
          {demoLevel !== null && (
            <button type="button" className={styles.ghost} onClick={onExit}>
              Exit demo
            </button>
          )}
        </>
      }
    >
      <p className={styles.sectionLabel}>Level</p>
      <input
        className={styles.input}
        type="number"
        inputMode="numeric"
        min={1}
        max={DEMO_LEVEL_MAX}
        step={1}
        value={text}
        aria-label={`Demo level, 1 to ${DEMO_LEVEL_MAX}`}
        onChange={(event) => edit(event.target.value)}
        onBlur={() => setText(String(level))}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !valid) return;
          event.currentTarget.blur();
          onStart(level);
        }}
      />

      <p className={styles.sectionLabel}>At this level</p>
      <div className={styles.stats}>
        <Fact value={points} label="Talent points" />
        <Fact value={slots} label="Skill slots" />
        <Fact value={cups.length} label="Cups open" />
        <Fact value={cosmeticsAt(level)} label="Cosmetics" />
        <Fact value={paddleSpeedForLevel(level)} label="Paddle speed" />
      </div>

      <p className={styles.note}>
        A demo profile starts with a clean record and the talent points level {level} has earned.
        Levelling never stops, but what it pays does: talent points end at level {pointsCap} and
        paddle speed at {BALANCE.paddle.max}. Matches, XP and builds from a demo are thrown away
        when you leave - your real progress is untouched.
      </p>
    </Screen>
  );
}
