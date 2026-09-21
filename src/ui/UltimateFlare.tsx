import { useEffect, useState, type CSSProperties } from 'react';

import styles from './UltimateFlare.module.css';

interface UltimateFlareProps {
  /** Bumped once per capstone cast. 0 until one is cast this match. */
  castId: number;
  hue: number;
  /** True while some capstone's effect is still running. */
  active: boolean;
  /** Hidden outside a live match, like the rest of the gameplay chrome. */
  show: boolean;
}

/** Milliseconds the cast flare runs for. Matches `flareOut` in the stylesheet. */
const FLARE_MS = 800;

/**
 * A capstone, drawn on the page rather than on the court.
 *
 * The canvas fills the viewport, so nearly everything an ultimate does is
 * already page-wide - but the HUD buttons and the ability bar sit *above* the
 * canvas, and without this they would be the only two things on screen that
 * carried on as though nothing had happened. This layer goes over all of it.
 *
 * Two pieces, and neither of them asks for attention:
 *
 *  - the flare: one rim flash at the moment of the cast;
 *  - the veil: the edge of the page held in the skill's colour, breathing
 *    slowly, for as long as the effect runs. Peripheral vision alone is
 *    enough to know an ultimate is up.
 *
 * The flare is driven from state rather than rendered straight off `castId`,
 * because this layer is unmounted whenever the game is paused: keyed on the
 * id alone, resuming - or opening the pause menu and restarting - would
 * replay the last capstone's flash over a match it has nothing to do with.
 *
 * It never takes a pointer event, so a player can keep steering through it.
 */
export function UltimateFlare({ castId, hue, active, show }: UltimateFlareProps) {
  const [played, setPlayed] = useState(castId);
  const [flare, setFlare] = useState(0);

  // Adjusted during render rather than in an effect: the flare is derived
  // from the prop, and an effect would only buy a second render pass for
  // information this one already has. A new match resets the counter to 0,
  // which lands here as "no flare", which is exactly right.
  if (played !== castId) {
    setPlayed(castId);
    setFlare(castId);
  }

  useEffect(() => {
    if (flare === 0) return;
    const handle = window.setTimeout(() => setFlare(0), FLARE_MS);
    return () => window.clearTimeout(handle);
  }, [flare]);

  if (!show || (!active && flare === 0)) return null;

  const style = { '--hue': String(hue) } as CSSProperties;

  return (
    <div className={styles.layer} style={style} aria-hidden="true">
      {active && <div className={styles.veil} />}
      {flare > 0 && <div key={flare} className={styles.flare} />}
    </div>
  );
}
