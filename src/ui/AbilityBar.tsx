import type { PointerEvent } from 'react';

import type { AbilityView } from '../game/types';
import styles from './AbilityBar.module.css';

interface AbilityBarProps {
  abilities: readonly AbilityView[];
  /** Hidden outside a live match, so the menus are never crowded. */
  show: boolean;
  onUse: (slot: number) => void;
}

/** Circumference of the cooldown ring, for the stroke-dash trick below. */
const RING = 2 * Math.PI * 26;

interface AbilityButtonProps {
  ability: AbilityView;
  index: number;
  onUse: (slot: number) => void;
}

function AbilityButton({ ability, index, onUse }: AbilityButtonProps) {
  // Fire on pointerdown, not click: during a rally the difference between the
  // two is the difference between reaching the ball and watching it go past.
  // The event is swallowed so the paddle does not jump to the thumb as well.
  const handleDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onUse(index);
  };

  const classes = [styles.button];
  if (ability.ultimate) classes.push(styles.ultimate);
  if (!ability.ready) classes.push(styles.cooling);
  if (ability.active) classes.push(styles.active);

  return (
    <button
      type="button"
      className={classes.join(' ')}
      aria-label={`${ability.name}${ability.ready ? '' : ' (recharging)'}`}
      aria-disabled={!ability.ready}
      onPointerDown={handleDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <svg className={styles.ring} viewBox="0 0 60 60" aria-hidden="true">
        <circle className={styles.ringTrack} cx="30" cy="30" r="26" />
        <circle
          className={styles.ringFill}
          cx="30"
          cy="30"
          r="26"
          style={{
            strokeDasharray: RING,
            strokeDashoffset: RING * (1 - ability.progress)
          }}
        />
      </svg>
      <span className={styles.glyph} aria-hidden="true">
        {ability.glyph}
      </span>
      <span className={styles.key} aria-hidden="true">
        {index + 1}
      </span>
    </button>
  );
}

/**
 * The equipped active skills, during play.
 *
 * Bottom corner, thumb-sized, and deliberately outside the court: the field
 * is centred and letterboxed on every screen, so this sits in space the ball
 * can never occupy. Nothing else is added to the gameplay HUD.
 */
export function AbilityBar({ abilities, show, onUse }: AbilityBarProps) {
  if (!show || abilities.length === 0) return null;

  return (
    <div className={styles.bar}>
      {abilities.map((ability, index) => (
        <AbilityButton key={ability.id} ability={ability} index={index} onUse={onUse} />
      ))}
    </div>
  );
}
