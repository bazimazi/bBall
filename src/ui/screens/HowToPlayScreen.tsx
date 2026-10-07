import { t } from '../../core/i18n/index';
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
      title={t('How to play')}
      subtitle={t('A few returns are all it takes to get started')}
      onBack={onBack}
      footer={
        <button type="button" className={styles.primary} onClick={onTutorial}>
          {t('Try the first-rally lesson')}
        </button>
      }
    >
      <div className={styles.card}>
        <h3 className={styles.sectionLabel}>{t('Meet the ball')}</h3>
        <p>
          {t(
            'Your paddle is on the left in landscape and at the bottom in portrait. Move it into the ball’s path to return it. Score when the opponent misses; first to five wins a regular match.'
          )}
        </p>
        <ControlsReference />
      </div>
      <div className={styles.card}>
        <h3 className={styles.sectionLabel}>{t('Place your return')}</h3>
        <p>
          {t(
            'The centre of your paddle sends the ball straight. Its ends send it at an angle. Try a few centre returns first, then aim for a gap.'
          )}
        </p>
        <p>
          {t('Once comfortable, hit with the outer part while moving that way for a stronger')}
          {t(' ')}
          <b>{t('flick')}</b>
          {t('.')}
        </p>
      </div>
      <div className={styles.card}>
        <h3 className={styles.sectionLabel}>{t('Take your time')}</h3>
        <p>
          {t(
            'Drag to get into position before serving. When your paddle aims the serve, a dashed line shows its direction. Tap or press '
          )}
          {t(keyList(keyBindings, 'serve'))}
          {t(' to launch early.')}
        </p>
        <p>
          {t('Choose ')}
          <b>{t('Serve pacing → When ready')}</b>
          {t(' in Settings to wait at each point. ')}
          <b>{t('Calm')}</b>
          {t(' ')}
          {t('effects remove camera movement and screen flashes.')}
        </p>
      </div>
      <div className={styles.card}>
        <h3 className={styles.sectionLabel}>{t('Read the changing court')}</h3>
        <p>
          {t(
            "Rails bank the ball; durability marks show which ones can break. Read a gate's opening and release beat before aiming through it. Hit its diamond switch to open a route. Marked pace zones change the ball's speed."
          )}
        </p>
        <p>
          {t(
            'These essential cues remain visible in Full and Calm. Practice lets you isolate a boss phase; Pause offers a landing estimate and a 0.1-second step.'
          )}
        </p>
      </div>
      <div className={styles.card}>
        <h3 className={styles.sectionLabel}>{t("Watch the opponent's recovery")}</h3>
        <p>
          {t(
            'Harder opponents place shots and use skills. Their skill bar shows ready, active and recovering abilities. Keep a dash or guard for an exposed return, and vary your own placement.'
          )}
        </p>
        <p>
          {t(
            'Long ranked rallies eventually narrow both paddles. The next serve restores their reach. Master/Mythic Quick contracts declare their extra restrictions before you play.'
          )}
        </p>
      </div>
      <div className={styles.card}>
        <h3 className={styles.sectionLabel}>{t('Keep exploring')}</h3>
        <p>
          {t(
            'Journey Beyond opens continuing sectors after the original fifth-world boss. Gauntlet offers short, long and Endless runs, with routes and services between encounters. Choose a new build, opponent school or court to pursue its mastery record.'
          )}
        </p>
        <p>
          {t(
            'Gauntlet saves completed progress and committed choices. Restarting an unfinished encounter after leaving the app costs one heart; Pause holds the current rally while the game stays open.'
          )}
        </p>
      </div>
      <p className={styles.note}>
        {t(
          'The optional lesson has three short steps and safe retries. Replay or skip it any time. Skills arrive later through Talents. This guide is always available from Home.'
        )}
      </p>
      <button type="button" className={styles.ghost} onClick={onPractice}>
        {t('Warm up with Rookie')}
      </button>
    </Screen>
  );
}
