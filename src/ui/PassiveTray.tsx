import { t, msg, secondsUnit } from '../core/i18n/index';
import { useEffect, useState, type CSSProperties } from 'react';

import type { SkillSide } from '../core/settings/store';
import type { PassiveView } from '../game/types';
import { useSettings } from './hooks/useSettings';
import { TalentIcon } from './icons/TalentIcon';
import styles from './PassiveTray.module.css';

interface PassiveTrayProps {
  passives: readonly PassiveView[];
  /** Hidden outside a live match, like the skill buttons. */
  show: boolean;
  /** The edge the skill buttons are on: the tray takes the other one. */
  skillSide: SkillSide;
}

const R = 16;
const RING = 2 * Math.PI * R;

const STATE_WORDS: Record<PassiveView['state'], string> = {
  idle: 'Idle',
  building: 'Building',
  ready: 'Ready',
  active: 'Active',
  spent: 'Spent'
};

/** The chip's whole state, in words, each part translated on its own. */
function label(passive: PassiveView): string {
  const parts = [t(passive.name), t(STATE_WORDS[passive.state])];
  if (passive.value !== null)
    parts.push(
      passive.max > 0
        ? msg('{0} of {1}', [t(passive.value), t(passive.max)])
        : String(t(passive.value))
    );
  if (passive.seconds > 0) parts.push(msg('{0} seconds left', [t(passive.seconds)]));
  return parts.join(t(', '));
}

/**
 * A one-shot ring each time the passive pays out. Derived during render, like
 * the skill bar's bursts: mounting again after a pause must not replay a
 * payout the player already saw, and a new match counting from zero is a
 * reset rather than a payout.
 */
function useFlash(procs: number): number | null {
  const [seen, setSeen] = useState(procs);
  const [flash, setFlash] = useState<number | null>(null);
  if (seen !== procs) {
    setSeen(procs);
    setFlash(procs > seen ? procs : null);
  }
  useEffect(() => {
    if (flash === null) return;
    const handle = window.setTimeout(() => setFlash(null), 650);
    return () => window.clearTimeout(handle);
  }, [flash]);
  return flash;
}

function PassiveChip({ passive }: { passive: PassiveView }) {
  const flash = useFlash(passive.procs);
  const { graphicsIntensity } = useSettings();
  const text = label(passive);
  return (
    <span
      className={styles.chip}
      data-state={passive.state}
      data-graphics={graphicsIntensity}
      style={{ '--hue': String(passive.hue) } as CSSProperties}
      role="img"
      aria-label={text}
      title={text}
    >
      <svg className={styles.ring} viewBox="0 0 40 40" aria-hidden="true">
        <circle className={styles.ringTrack} cx="20" cy="20" r={R} />
        {passive.progress > 0 && (
          <circle
            className={styles.ringFill}
            cx="20"
            cy="20"
            r={R}
            style={{ strokeDasharray: RING, strokeDashoffset: RING * (1 - passive.progress) }}
          />
        )}
      </svg>
      <span className={styles.glyph} aria-hidden="true">
        <TalentIcon id={passive.id} />
      </span>
      {passive.value !== null && (
        <span className={styles.value} aria-hidden="true">
          {t(passive.value)}
        </span>
      )}
      {passive.seconds > 0 && (
        <span className={styles.seconds} aria-hidden="true">
          {t(passive.seconds)}
          {secondsUnit()}
        </span>
      )}
      {flash !== null && <span key={flash} className={styles.flash} aria-hidden="true" />}
    </span>
  );
}

/**
 * The passive half of the build, during play.
 *
 * Small, round and never pressable: one chip per passive with a state worth
 * watching - a Shield charge recharging, a Momentum count building, a
 * Blink Strike window open - each in its branch colour, ringed with its
 * progress and flashing when it pays out. It sits on the edge the skill
 * buttons do not, keeping out of both paddle lanes the same way they do, and
 * takes no input at all: the court underneath stays the player's.
 */
export function PassiveTray({ passives, show, skillSide }: PassiveTrayProps) {
  if (!show || passives.length === 0) return null;
  return (
    <div
      className={skillSide === 'left' ? styles.tray : `${styles.tray} ${styles.left}`}
      role="group"
      aria-label={t('Passive talents')}
      data-crowded={passives.length > 6}
    >
      {passives.map((passive) => (
        <PassiveChip key={passive.id} passive={passive} />
      ))}
    </div>
  );
}
