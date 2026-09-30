import styles from '../Overlay.module.css';
import { PanelButton } from './PanelButton';

interface PausePanelProps {
  /** What is being played, e.g. "Gold Cup · Final". */
  label: string;
  /** Where the match stands, when it is scored in points. */
  score?: { you: number; bot: number } | null;
  /** Lives left, when it is played in lives instead. */
  lives?: { left: number; max: number } | null;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

export function PausePanel({ label, score, lives, onResume, onRestart, onQuit }: PausePanelProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Paused</h2>
      <p className={styles.tagline}>{label}</p>
      {score && (
        <p className={styles.score} aria-label={`Score ${score.you} to ${score.bot}`}>
          <span className={styles.scoreYou}>{score.you}</span>
          <i>:</i>
          <span className={styles.scoreBot}>{score.bot}</span>
        </p>
      )}
      {lives && (
        <p className={styles.score} aria-label={`${lives.left} of ${lives.max} lives left`}>
          <span className={styles.scoreYou}>
            {'♥'.repeat(lives.left)}
            <span className={styles.spent}>{'♥'.repeat(Math.max(0, lives.max - lives.left))}</span>
          </span>
        </p>
      )}
      <PanelButton onClick={onResume}>Resume</PanelButton>
      <PanelButton variant="ghost" onClick={onRestart}>
        Restart
      </PanelButton>
      <PanelButton variant="ghost" onClick={onQuit}>
        Quit to menu
      </PanelButton>
    </div>
  );
}
