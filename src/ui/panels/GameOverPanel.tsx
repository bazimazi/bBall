import type { GameSnapshot } from '../../game/types';
import styles from '../Overlay.module.css';
import { PanelButton } from './PanelButton';

interface GameOverPanelProps {
  snapshot: GameSnapshot;
  onPlayAgain: () => void;
}

function rallyLine({ bestThisMatch, newBest, best }: GameSnapshot): string {
  if (bestThisMatch === 0) return '';
  const suffix = newBest ? ' · new best!' : ` · best ${best}`;
  return `Longest rally ${bestThisMatch}${suffix}`;
}

export function GameOverPanel({ snapshot, onPlayAgain }: GameOverPanelProps) {
  const won = snapshot.winner === 'you';

  return (
    <div className={styles.panel}>
      <h2 className={`${styles.heading} ${won ? styles.win : styles.lose}`}>
        {won ? 'You win' : 'Bot wins'}
      </h2>
      <p className={styles.scoreLine}>
        <span className={styles.scoreYou}>{snapshot.scoreYou}</span>
        <i>:</i>
        <span className={styles.scoreBot}>{snapshot.scoreBot}</span>
      </p>
      <PanelButton onClick={onPlayAgain}>Play again</PanelButton>
      <p className={styles.stat}>{rallyLine(snapshot)}</p>
    </div>
  );
}
