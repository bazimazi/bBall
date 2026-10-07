import { t, msg } from '../../core/i18n/index';
import styles from '../Overlay.module.css';
import { PanelButton } from './PanelButton';
import { ControlsReference } from '../components/ControlsReference';
import { GoalList } from '../components/GoalList';
import { SaveNotice } from '../components/SaveNotice';
import type { AbilityView, GoalView } from '../../game/types';
import { abilityById } from '../../core/talents/abilities';

interface PausePanelProps {
  /** What is being played, e.g. "Gold Cup · Final". */
  label: string;
  resized?: boolean;
  /** Where the match stands, when it is scored in points. */
  score?: { you: number; bot: number } | null;
  /** Lives left, when it is played in lives instead. */
  lives?: { left: number; max: number } | null;
  practiceLanding?: string | null | undefined;
  onStep?: (() => void) | undefined;
  onResume: () => void;
  onSettings: () => void;
  onRestart: () => void;
  onQuit: () => void;
  quitLabel?: string;
  versus?: boolean;
  objective?: string | null;
  goals?: readonly GoalView[];
  enemyAbilities?: readonly AbilityView[] | undefined;
}

export function PausePanel({
  label,
  resized = false,
  score,
  lives,
  practiceLanding,
  onStep,
  onResume,
  onSettings,
  onRestart,
  onQuit,
  quitLabel = 'Quit to menu',
  versus = false,
  objective,
  goals = [],
  enemyAbilities = []
}: PausePanelProps) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.heading}>{t('Paused')}</h2>
      <p className={styles.tagline}>{t(label)}</p>
      {resized && (
        <p className={styles.tagline}>
          {t('The court size changed. Find the ball, then resume when ready.')}
        </p>
      )}
      {score && (
        <p
          className={styles.score}
          aria-label={t(
            msg('{0} {1}, {2} {3}', [
              t(versus ? 'Player 1' : 'You'),
              t(score.you),
              t(versus ? 'Player 2' : 'opponent'),
              t(score.bot)
            ])
          )}
        >
          <span className={styles.scoreYou}>{t(score.you)}</span>
          <i>{t(':')}</i>
          <span className={styles.scoreBot}>{t(score.bot)}</span>
        </p>
      )}
      {lives && (
        <p
          className={styles.score}
          aria-label={t(msg('{0} of {1} lives left', [t(lives.left), t(lives.max)]))}
        >
          <span className={styles.scoreYou}>
            {t('♥'.repeat(lives.left))}
            <span className={styles.spent}>
              {t('♥'.repeat(Math.max(0, lives.max - lives.left)))}
            </span>
          </span>
        </p>
      )}
      <GoalList goals={goals} />
      {goals.length === 0 && objective && <p className={styles.tagline}>{t(objective)}</p>}
      {enemyAbilities.length > 0 && (
        <details className={styles.controls}>
          <summary>
            {t('Opponent skills · ')}
            {t(enemyAbilities.length)}
          </summary>
          <dl className={styles.opponentSkills}>
            {enemyAbilities.map((skill) => (
              <div key={skill.id}>
                <dt>
                  {t(skill.name)}
                  {t(' ·')}
                  {t(' ')}
                  {t(
                    skill.active
                      ? 'Active'
                      : skill.ready
                        ? 'Ready'
                        : msg('{0}s recovery', [t(skill.cooldownLeft)])
                  )}
                </dt>
                <dd>{t(abilityById(skill.id)?.blurb)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {onStep && (
        <>
          <p className={styles.tagline}>
            {t(practiceLanding ?? 'Step to inspect the serve or rally.')}
          </p>
          <PanelButton variant="ghost" onClick={onStep}>
            {t('Step 0.1 seconds')}
          </PanelButton>
        </>
      )}
      <PanelButton onClick={onResume}>{t('Resume')}</PanelButton>
      <PanelButton variant="ghost" onClick={onSettings}>
        {t('Settings')}
      </PanelButton>
      <PanelButton variant="ghost" onClick={onRestart}>
        {t('Restart')}
      </PanelButton>
      <PanelButton variant="ghost" onClick={onQuit}>
        {t(quitLabel)}
      </PanelButton>
      <SaveNotice />
      <details className={styles.controls}>
        <summary tabIndex={0}>{t('Controls')}</summary>
        <ControlsReference versus={versus} />
      </details>
    </div>
  );
}
