import styles from '../Overlay.module.css';
import { PanelButton } from './PanelButton';

interface ExitPanelProps {
  /** True in a packaged build, where "leave" really does close the app. */
  native: boolean;
  onExit: () => void;
  onCancel: () => void;
}

/**
 * The last back press, the one with nothing behind it.
 *
 * Asked rather than obeyed, because on a phone the back button is a reflex and
 * a match's worth of progress is not worth losing to one.
 */
export function ExitPanel({ native, onExit, onCancel }: ExitPanelProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>{native ? 'Close bBall?' : 'Leave bBall?'}</h2>
      <p className={styles.tagline}>Your progress is saved on this device.</p>
      <PanelButton onClick={onCancel}>Keep playing</PanelButton>
      <PanelButton variant="ghost" onClick={onExit}>
        {native ? 'Close' : 'Leave'}
      </PanelButton>
    </div>
  );
}
