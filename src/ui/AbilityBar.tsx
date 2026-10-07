import { t, msg } from '../core/i18n/index';
import { useEffect, useState, type CSSProperties, type PointerEvent } from 'react';

import type { SkillSide } from '../core/settings/store';
import type { AbilityView } from '../game/types';
import styles from './AbilityBar.module.css';
import { TalentIcon } from './icons/TalentIcon';
import { useSettings } from './hooks/useSettings';
import { keyList, keyName, skillAction } from '../core/settings/controls';

interface AbilityBarProps {
  abilities: readonly AbilityView[];
  /** Hidden outside a live match, so the menus are never crowded. */
  show: boolean;
  /** The screen edge the buttons sit on - the player's choice, per device. */
  side: SkillSide;
  onUse: (slot: number) => void;
}

/** Circumferences of the two rings, for the stroke-dash trick below. */
const COOLDOWN_R = 26;
const EFFECT_R = 19;
const COOLDOWN_RING = 2 * Math.PI * COOLDOWN_R;
const EFFECT_RING = 2 * Math.PI * EFFECT_R;

/** A live effect's own progress: time left, or uses left for a counted one. */
function effectLeft(ability: AbilityView): number {
  if (ability.duration > 0) return Math.min(1, ability.remain / ability.duration);
  if (ability.maxCharges > 0) return Math.min(1, ability.charges / ability.maxCharges);
  return 0;
}

/** Under a second the tenths matter; above it they are noise. */
function shortSeconds(value: number): string {
  return value >= 10 ? `${Math.ceil(value)}` : `${Math.ceil(value * 10) / 10}`;
}

/** The whole state of the button, in the words a screen reader needs. */
function label(ability: AbilityView): string {
  const parts = [ability.name];
  if (ability.active) {
    parts.push('active');
    if (ability.maxCharges > 0) parts.push(`${ability.charges} of ${ability.maxCharges} uses left`);
    if (ability.duration > 0) parts.push(`${shortSeconds(ability.remain)} seconds left`);
  }
  parts.push(ability.ready ? 'ready' : `recharging, ${ability.cooldownLeft} seconds`);
  return parts.join(', ');
}

/** A one-shot ring on the button, and what it is saying. */
interface Burst {
  kind: 'cast' | 'refresh';
  /** Changes per event, so React remounts the node and the CSS replays. */
  id: string;
}

/**
 * Acknowledge actual casts and Echo resets, independently of cooldown progress.
 * Fast recharge or return bonuses can also make the ring jump; those are not
 * Echo. Mounting after Pause must not replay a cast the player already saw.
 */
function useBurst(castId: number, refreshId: number): Burst | null {
  const [played, setPlayed] = useState({ castId, refreshId });
  const [burst, setBurst] = useState<Burst | null>(null);

  // Derived during render like UltimateFlare. A match reset clears feedback;
  // a cast after an Echo reset wins when both arrive in one snapshot.
  if (played.castId !== castId || played.refreshId !== refreshId) {
    const reset = castId < played.castId || refreshId < played.refreshId;
    const kind = reset ? null : castId > played.castId ? 'cast' : 'refresh';
    setPlayed({ castId, refreshId });
    setBurst(kind ? { kind, id: `${castId}:${refreshId}` } : null);
  }

  useEffect(() => {
    if (!burst) return;
    const handle = window.setTimeout(() => setBurst(null), 700);
    return () => window.clearTimeout(handle);
  }, [burst]);

  return burst;
}

interface AbilityButtonProps {
  ability: AbilityView;
  onUse: (slot: number) => void;
}

function AbilityButton({ ability, onUse }: AbilityButtonProps) {
  const index = ability.slot;
  const burst = useBurst(ability.castId, ability.refreshId);
  const { keyBindings } = useSettings();
  const action = skillAction(index);

  // Fire on pointerdown, not click: during a rally the difference between the
  // two is the difference between reaching the ball and watching it go past.
  // The event is swallowed so the paddle does not jump to the thumb as well.
  const handleDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 0 && ability.ready) onUse(index);
  };

  const classes = [styles.button];
  if (ability.ultimate) classes.push(styles.ultimate);
  if (!ability.ready) classes.push(styles.cooling);
  if (ability.active) classes.push(styles.active);

  const left = effectLeft(ability);
  // Every colour on this button comes from the skill's own hue, so two of
  // them running at once are never the same shade of "something is on".
  const style = { '--hue': String(ability.hue) } as CSSProperties;

  return (
    <button
      type="button"
      className={classes.join(' ')}
      style={style}
      aria-label={t(msg('{0}, shortcut {1}', [t(label(ability)), keyList(keyBindings, action)]))}
      aria-disabled={!ability.ready}
      onPointerDown={handleDown}
      onClick={(event) => {
        if (event.detail === 0 && ability.ready) onUse(index);
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <svg className={styles.ring} viewBox="0 0 60 60" aria-hidden="true">
        <circle className={styles.ringTrack} cx="30" cy="30" r={COOLDOWN_R} />
        <circle
          className={styles.ringFill}
          cx="30"
          cy="30"
          r={COOLDOWN_R}
          style={{
            strokeDasharray: COOLDOWN_RING,
            strokeDashoffset: COOLDOWN_RING * (1 - ability.progress)
          }}
        />
        {/*
         * The effect's own ring, inside the cooldown one and running the
         * other way - it drains as the skill burns down, while the outer ring
         * fills as the skill comes back. Never the same motion at once.
         */}
        {ability.active && left > 0 && (
          <circle
            className={styles.effectRing}
            cx="30"
            cy="30"
            r={EFFECT_R}
            style={{
              strokeDasharray: EFFECT_RING,
              strokeDashoffset: EFFECT_RING * (1 - left)
            }}
          />
        )}
      </svg>

      <span className={styles.glyph} aria-hidden="true">
        <TalentIcon id={ability.talent} />
      </span>

      {/*
       * Uses left, for the skills that are spent rather than timed. It is a
       * number and not a row of pips: three returns of Overload and two saves
       * of Aegis have to be told apart at a glance, mid-rally.
       */}
      {ability.active && ability.maxCharges > 0 && (
        <span className={styles.charges} aria-hidden="true">
          {t(ability.charges)}
          <i className={styles.chargesOf}>
            {t('/')}
            {t(ability.maxCharges)}
          </i>
        </span>
      )}

      {/* One line of text at a time: what is left of the effect while it
          runs, and what is left of the cooldown once it is over. */}
      {ability.active && ability.duration > 0 ? (
        <span className={`${styles.timer} ${styles.timerActive}`} aria-hidden="true">
          {t(shortSeconds(ability.remain))}
          {t('s')}
        </span>
      ) : (
        !ability.ready && (
          <span className={styles.timer} aria-hidden="true">
            {t(ability.cooldownLeft)}
            {t('s')}
          </span>
        )
      )}

      <span className={styles.key} aria-hidden="true">
        {t(keyName(keyBindings[action][0]!))}
      </span>

      {/* Keyed on a counter so firing twice in a row replays the ring rather
          than leaving the first one frozen half-way out. */}
      {burst && (
        <span
          key={burst.id}
          className={`${styles.burst} ${burst.kind === 'cast' ? styles.burstCast : styles.burstRefresh}`}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

/**
 * The equipped active skills, during play.
 *
 * Thumb-sized controls on the side the player picked, raised above the bottom
 * paddle lane so the player can drag beneath them. Nothing else is added to
 * the gameplay HUD.
 */
export function AbilityBar({ abilities, show, side, onUse }: AbilityBarProps) {
  if (!show || abilities.length === 0) return null;

  return (
    <div className={side === 'left' ? `${styles.bar} ${styles.left}` : styles.bar}>
      {abilities.map((ability) => (
        <AbilityButton key={ability.id} ability={ability} onUse={onUse} />
      ))}
    </div>
  );
}
