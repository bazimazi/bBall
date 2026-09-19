import type { GameSnapshot } from '../game/types';
import styles from './Overlay.module.css';
import { GameOverPanel } from './panels/GameOverPanel';
import { PausePanel } from './panels/PausePanel';
import { StartPanel } from './panels/StartPanel';

interface OverlayProps {
  snapshot: GameSnapshot;
  onPlay: () => void;
  onResume: () => void;
  onQuit: () => void;
}

/**
 * The card stack over the court: title screen, pause menu and result. The
 * overlay itself stays mounted so it can fade, and lets pointer events through
 * to the canvas whenever no panel is up.
 */
export function Overlay({ snapshot, onPlay, onResume, onQuit }: OverlayProps) {
  const { panel } = snapshot;

  return (
    <div
      className={panel ? `${styles.overlay} ${styles.show}` : styles.overlay}
      aria-live="polite"
    >
      <div className={styles.card}>
        {panel === 'start' && <StartPanel best={snapshot.best} onPlay={onPlay} />}
        {panel === 'pause' && <PausePanel onResume={onResume} onQuit={onQuit} />}
        {panel === 'over' && <GameOverPanel snapshot={snapshot} onPlayAgain={onPlay} />}
      </div>
    </div>
  );
}
