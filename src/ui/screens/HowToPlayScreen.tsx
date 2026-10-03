import { ControlsReference } from '../components/ControlsReference';
import { Screen } from '../components/Screen';
import styles from '../Screens.module.css';
import { useSettings } from '../hooks/useSettings';
import { keyList } from '../../core/settings/controls';

interface HowToPlayScreenProps {
  onTutorial: () => void;
  onPractice: () => void;
  onBack: () => void;
}

export function HowToPlayScreen({ onTutorial, onPractice, onBack }: HowToPlayScreenProps) {
  const { keyBindings } = useSettings();
  return (
    <Screen
      title="How to play"
      subtitle="A few returns are all it takes to get started"
      onBack={onBack}
      footer={
        <button type="button" className={styles.primary} onClick={onTutorial}>
          Try the first-rally lesson
        </button>
      }
    >
      <div className={styles.card}>
        <h3 className={styles.sectionLabel}>Meet the ball</h3>
        <p>
          Your paddle is on the left in landscape and at the bottom in portrait. Move it into the
          ball’s path to return it. Score when the opponent misses; first to five wins a regular
          match.
        </p>
        <ControlsReference />
      </div>
      <div className={styles.card}>
        <h3 className={styles.sectionLabel}>Place your return</h3>
        <p>
          The centre of your paddle sends the ball straight. Its ends send it at an angle. Try a few
          centre returns first, then aim for a gap.
        </p>
        <p>
          Once comfortable, hit with the outer part while moving that way for a stronger{' '}
          <b>flick</b>.
        </p>
      </div>
      <div className={styles.card}>
        <h3 className={styles.sectionLabel}>Take your time</h3>
        <p>
          Drag to get into position before serving. When your paddle aims the serve, a dashed line
          shows its direction. Tap or press {keyList(keyBindings, 'serve')} to launch early.
        </p>
        <p>
          Choose <b>Serve pacing → When ready</b> in Settings to wait at each point. <b>Calm</b>{' '}
          effects remove camera movement and screen flashes.
        </p>
      </div>
      <p className={styles.note}>
        The optional lesson has three short steps and safe retries. Replay or skip it any time.
        Skills arrive later through Talents. This guide is always available from Home.
      </p>
      <button type="button" className={styles.ghost} onClick={onPractice}>
        Warm up with Rookie
      </button>
    </Screen>
  );
}
