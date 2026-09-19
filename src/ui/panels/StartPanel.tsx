import styles from '../Overlay.module.css';
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import { PanelButton } from './PanelButton';

interface StartPanelProps {
  best: number;
  onPlay: () => void;
}

export function StartPanel({ best, onPlay }: StartPanelProps) {
  const coarse = useCoarsePointer();

  return (
    <div className={styles.panel}>
      <h1 className={styles.logo}>
        <span>b</span>Ball
      </h1>
      <p className={styles.tagline}>First to 5 wins</p>
      <PanelButton onClick={onPlay}>Play</PanelButton>
      <p className={styles.hint}>
        {coarse ? 'Drag anywhere to move' : 'Move the mouse or use ↑ ↓'}
      </p>
      <p className={styles.stat}>{best > 0 ? `Best rally ${best}` : ''}</p>
    </div>
  );
}
