import styles from '../Overlay.module.css';
import { PanelButton } from './PanelButton';

interface PausePanelProps {
  onResume: () => void;
  onQuit: () => void;
}

export function PausePanel({ onResume, onQuit }: PausePanelProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>Paused</h2>
      <PanelButton onClick={onResume}>Resume</PanelButton>
      <PanelButton variant="ghost" onClick={onQuit}>
        End match
      </PanelButton>
    </div>
  );
}
