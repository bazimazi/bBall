import { t, msg } from '../../core/i18n/index';
import styles from '../Overlay.module.css';
import { PanelButton } from './PanelButton';
import { ControlsReference } from '../components/ControlsReference';
import { GoalList } from '../components/GoalList';
import { SaveNotice } from '../components/SaveNotice';
import type { AbilityView, GoalView } from '../../game/types';
import { abilityById } from '../../core/talents/abilities';
import { leaveStakes, type LeaveStakes } from '../../core/progression/forfeit';
import { useBackHandler } from '../hooks/useBackHandler';
import { useProfile } from '../hooks/useProfile';
import { acceptLeave, cancelLeave, useLeaveState, type LeaveAction } from '../hooks/useGameFlow';
import { useEffect, useId, useLayoutEffect, useRef } from 'react';

/** "1 heart", "2 hearts". */
const hearts = (count: number) => `${count} heart${count === 1 ? '' : 's'}`;

/** The pause menu's restart label, or null when restarting is not offered. */
function restartLabel(stakes: LeaveStakes | null): string | null {
  if (!stakes) return 'Restart';
  if (stakes.kind === 'heart')
    return msg('Restart · lose 1 heart{0}', [t(stakes.hearts === 1 ? ' (ends run)' : '')]);
  // A cup round lost is a cup lost: there is nothing left to restart.
  return stakes.kind === 'loss' ? 'Restart · counts as a loss' : null;
}

function quitLabelFor(stakes: LeaveStakes | null, fallback: string): string {
  if (!stakes) return fallback;
  if (stakes.kind === 'heart')
    return `Leave · lose 1 heart${stakes.hearts === 1 ? ' (ends run)' : ''}`;
  return stakes.kind === 'loss' ? 'Leave · counts as a loss' : 'Forfeit the cup';
}

/** The question asked before a restart or quit that costs something. */
function confirmation(
  action: LeaveAction,
  stakes: LeaveStakes
): { title: string; description: string; confirm: string } {
  if (stakes.kind === 'heart') {
    const last = stakes.hearts <= 1;
    if (action === 'restart')
      return last
        ? {
            title: 'Restart on your last heart?',
            description:
              'Restarting counts as losing this encounter. It costs your last heart, so the run ends here. Your earned XP and unlocks stay.',
            confirm: 'Restart and end run'
          }
        : {
            title: 'Restart this encounter?',
            description: `Restarting counts as losing this encounter. It costs one heart, leaving ${hearts(stakes.hearts - 1)}.`,
            confirm: msg('Restart · lose 1 heart{0}', [''])
          };
    return last
      ? {
          title: 'Leave on your last heart?',
          description:
            'Leaving counts as losing this encounter. It costs your last heart, so the run ends here. Your earned XP and unlocks stay.',
          confirm: 'Leave and end run'
        }
      : {
          title: 'Leave this encounter?',
          description: `Leaving counts as losing this encounter. It costs one heart, leaving ${hearts(stakes.hearts - 1)}, and the same opponent waits for a rematch.`,
          confirm: 'Leave · lose 1 heart'
        };
  }
  if (stakes.kind === 'cup')
    return {
      title: 'Forfeit the cup?',
      description: `A point has been played, so leaving loses this round. That ends your ${stakes.cup} in round ${stakes.round} of ${stakes.rounds}. Your earned XP and unlocks stay.`,
      confirm: 'Forfeit the cup'
    };
  return action === 'restart'
    ? {
        title: 'Restart and take the loss?',
        description:
          'A point has been played, so restarting records this match as a loss. It ends your win streak and pays no XP.',
        confirm: 'Restart · take the loss'
      }
    : {
        title: 'Leave and take the loss?',
        description:
          'A point has been played, so leaving records this match as a loss. It ends your win streak and pays no XP.',
        confirm: 'Leave · take the loss'
      };
}

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
  technique?: boolean;
  objective?: string | null;
  goals?: readonly GoalView[];
  enemyAbilities?: readonly AbilityView[] | undefined;
  specializations?: readonly string[] | undefined;
  canSwitchSpecialization?: boolean | undefined;
  activeSpecialization?: number | null | undefined;
  onSwitchSpecialization?: (index: number) => void;
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
  technique = false,
  objective,
  goals = [],
  enemyAbilities = [],
  specializations = [],
  canSwitchSpecialization = false,
  activeSpecialization,
  onSwitchSpecialization
}: PausePanelProps) {
  // Restarting or leaving can cost a heart, a loss or a cup: say which on the
  // buttons, and ask before spending it.
  const { rules, request } = useLeaveState();
  const run = useProfile().progress.run;
  const stakes = leaveStakes(rules, score ?? null, run);
  const restart = restartLabel(stakes);
  const asking = request && stakes ? confirmation(request, stakes) : null;
  // A question about stakes that no longer apply is withdrawn.
  const withdrawn = !!request && !stakes;
  useEffect(() => {
    if (withdrawn) cancelLeave();
  }, [withdrawn]);

  // The question replaces the menu inside the same dialog. Keep receives
  // focus; Keep, Back and Escape all return to the menu without spending.
  const titleId = useId();
  const descriptionId = useId();
  const root = useRef<HTMLDivElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);
  const confirmed = useRef(false);
  useLayoutEffect(() => {
    if (asking) keep.current?.focus();
    else if (wasAsking.current)
      root.current?.querySelector<HTMLElement>('[data-dialog-initial]')?.focus();
    wasAsking.current = !!asking;
    confirmed.current = false;
  }, [asking]);
  useBackHandler(!!asking, cancelLeave);
  useEffect(() => {
    if (!asking) return;
    // Ahead of the pause dialog's own Escape, which would resume the match.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      cancelLeave();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [asking]);

  if (asking)
    return (
      <div
        ref={root}
        className={styles.panel}
        role="group"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId} className={styles.heading}>
          {t(asking.title)}
        </h2>
        <p id={descriptionId} className={styles.explanation}>
          {t(asking.description)}
        </p>
        <button type="button" ref={keep} className={styles.button} onClick={cancelLeave}>
          {t('Keep playing')}
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.ghost} ${styles.danger}`}
          onClick={() => {
            if (confirmed.current) return;
            confirmed.current = true;
            const action = acceptLeave();
            if (action === 'restart') onRestart();
            else if (action === 'quit') onQuit();
          }}
        >
          {t(asking.confirm)}
        </button>
      </div>
    );

  return (
    <div ref={root} className={styles.panel}>
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
              t(technique ? 'Targets' : versus ? 'Player 1' : 'You'),
              t(score.you),
              t(technique ? 'Misses' : versus ? 'Player 2' : 'opponent'),
              t(score.bot)
            ])
          )}
        >
          <span className={styles.scoreYou}>{t(score.you)}</span>
          <i>{t(':')}</i>
          <span className={styles.scoreBot}>{t(score.bot)}</span>
        </p>
      )}
      {technique && <p className={styles.tagline}>{t('Targets : Misses')}</p>}
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
      {specializations.length > 0 && (
        <div>
          <p className={styles.tagline}>{t('Courtside specializations')}</p>
          <p className={styles.tagline}>
            {t(
              canSwitchSpecialization
                ? 'Choose one build before the next serve. Cooldowns and spent defenses carry over.'
                : 'Switching opens between rallies, once per point.'
            )}
          </p>
          {specializations.map((name, index) => (
            <PanelButton
              key={index}
              variant="ghost"
              disabled={!canSwitchSpecialization || activeSpecialization === index}
              onClick={() => onSwitchSpecialization?.(index)}
            >
              {t(name)}
              {activeSpecialization === index ? ' ✓' : ''}
            </PanelButton>
          ))}
        </div>
      )}
      {goals.length === 0 && objective && <p className={styles.tagline}>{t(objective)}</p>}
      {!technique && enemyAbilities.length > 0 && (
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
      <PanelButton onClick={onResume} initialFocus>
        {t('Resume')}
      </PanelButton>
      <PanelButton variant="ghost" onClick={onSettings}>
        {t('Settings')}
      </PanelButton>
      {restart && (
        <PanelButton variant="ghost" onClick={() => onRestart()}>
          {t(restart)}
        </PanelButton>
      )}
      <PanelButton variant="ghost" onClick={() => onQuit()}>
        {t(quitLabelFor(stakes, quitLabel))}
      </PanelButton>
      <SaveNotice />
      <details className={styles.controls}>
        <summary tabIndex={0}>{t('Controls')}</summary>
        <ControlsReference versus={versus} />
      </details>
    </div>
  );
}
