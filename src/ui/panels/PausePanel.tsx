import styles from '../Overlay.module.css';
import { PanelButton } from './PanelButton';

interface PausePanelProps {
  /** What is being played, e.g. "Gold Cup · Final". */
  label: string;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

export function PausePanel({ label, onResume, onRestart, onQuit }: PausePanelProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Paused</h2>
      <p className={styles.tagline}>{label}</p>
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
