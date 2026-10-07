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
      <div className={styles.card}>
        <h3 className={styles.sectionLabel}>Read the changing court</h3>
        <p>
          Rails bank the ball; durability marks show which ones can break. Read a gate's opening and
          release beat before aiming through it. Hit its diamond switch to open a route. Marked pace
          zones change the ball's speed.
        </p>
        <p>
          These essential cues remain visible in Full and Calm. Practice lets you isolate a boss
          phase; Pause offers a landing estimate and a 0.1-second step.
        </p>
      </div>
      <div className={styles.card}>
        <h3 className={styles.sectionLabel}>Watch the opponent's recovery</h3>
        <p>
          Harder opponents place shots and use skills. Their skill bar shows ready, active and
          recovering abilities. Keep a dash or guard for an exposed return, and vary your own
          placement.
        </p>
        <p>
          Long ranked rallies eventually narrow both paddles. The next serve restores their reach.
          Master/Mythic Quick contracts declare their extra restrictions before you play.
        </p>
      </div>
      <div className={styles.card}>
        <h3 className={styles.sectionLabel}>Keep exploring</h3>
        <p>
          Journey Beyond opens continuing sectors after the original fifth-world boss. Gauntlet
          offers short, long and Endless runs, with routes and services between encounters. Choose a
          new build, opponent school or court to pursue its mastery record.
        </p>
        <p>
          Gauntlet saves completed progress and committed choices. Restarting an unfinished
          encounter after leaving the app costs one heart; Pause holds the current rally while the
          game stays open.
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
