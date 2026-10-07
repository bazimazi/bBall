import { t } from '../../core/i18n/index';
import styles from '../Overlay.module.css';
import { PanelButton } from './PanelButton';
import { useLocalSave } from '../hooks/useLocalSave';
import { SaveNotice } from '../components/SaveNotice';

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
  const unsaved = useLocalSave() !== 'saved';
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>{t(native ? 'Close bBall?' : 'Leave bBall?')}</h2>
      {!unsaved && <p className={styles.tagline}>{t('Your progress is saved on this device.')}</p>}
      <PanelButton onClick={onCancel}>{t('Keep playing')}</PanelButton>
      <SaveNotice />
      <PanelButton variant="ghost" onClick={onExit}>
        {t(native ? 'Close' : 'Leave')}
      </PanelButton>
    </div>
  );
}
