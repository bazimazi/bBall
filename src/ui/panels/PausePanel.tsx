import styles from '../Overlay.module.css';
import { PanelButton } from './PanelButton';
import { ControlsReference } from '../components/ControlsReference';
import { GoalList } from '../components/GoalList';
import type { GoalView } from '../../game/types';

interface PausePanelProps {
  /** What is being played, e.g. "Gold Cup · Final". */
  label: string;
  /** Where the match stands, when it is scored in points. */
  score?: { you: number; bot: number } | null;
  /** Lives left, when it is played in lives instead. */
  lives?: { left: number; max: number } | null;
  onResume: () => void;
  onSettings: () => void;
  onRestart: () => void;
  onQuit: () => void;
  versus?: boolean;
  objective?: string | null;
  goals?: readonly GoalView[];
}

export function PausePanel({
  label,
  score,
  lives,
  onResume,
  onSettings,
  onRestart,
  onQuit,
  versus = false,
  objective,
  goals = []
}: PausePanelProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Paused</h2>
      <p className={styles.tagline}>{label}</p>
      {score && (
        <p
          className={styles.score}
          aria-label={`${versus ? 'Player 1' : 'You'} ${score.you}, ${versus ? 'Player 2' : 'opponent'} ${score.bot}`}
        >
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
      <GoalList goals={goals} />
      {goals.length === 0 && objective && <p className={styles.tagline}>{objective}</p>}
      <PanelButton onClick={onResume}>Resume</PanelButton>
      <PanelButton variant="ghost" onClick={onSettings}>
        Settings
      </PanelButton>
      <PanelButton variant="ghost" onClick={onRestart}>
        Restart
      </PanelButton>
      <PanelButton variant="ghost" onClick={onQuit}>
        Quit to menu
      </PanelButton>
      <details className={styles.controls}>
        <summary tabIndex={0}>Controls</summary>
        <ControlsReference versus={versus} />
      </details>
    </div>
  );
}
