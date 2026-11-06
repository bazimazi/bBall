import { t, msg, secondsUnit } from '../core/i18n/index';
import type { GameSnapshot, GoalView } from '../game/types';
import { useId, type CSSProperties, type ReactNode } from 'react';
import { settingsStore } from '../core/settings/store';
import { useSettings } from './hooks/useSettings';
import { TalentIcon } from './icons/TalentIcon';
import { GOAL_STATUS } from './components/goalStatus';
import styles from './MatchHud.module.css';

interface MatchHudProps {
  snapshot: GameSnapshot;
  objective: string | null;
  onGoals: () => void;
}

function goalGlyph(goal: GoalView): string {
  if (goal.state === 'missed') return '×';
  return goal.state === 'reached' || goal.state === 'earned' ? '★' : '☆';
}

function goalText(goal: GoalView): string {
  return msg('{0}: {1}, {2}', [t(goal.label), t(goal.progress), t(GOAL_STATUS[goal.state])]);
}

/**
 * The live objective, one line, shown whether or not the panel is expanded:
 * the series game, a timed objective's clock, wave or objective progress,
 * each star goal's counter and the rally-pressure reach cut. Each part is
 * translated on its own.
 */
function liveParts(snapshot: GameSnapshot): ReactNode[] {
  const parts: ReactNode[] = [];
  const { series, clock, progress } = snapshot;
  if (series)
    parts.push(
      <span key="series" title={msg('Best of {0}', [t(series.length)])}>
        {msg('Game {0} · {1}–{2}', [t(series.game), t(series.you), t(series.foe)])}
      </span>
    );
  if (clock)
    parts.push(
      <span key="clock" className={styles.clock} data-over={clock.elapsed > clock.limit}>
        {t('Time')} <b>{t(clock.elapsed)}</b>
        {t('/')}
        {t(clock.limit)}
        {secondsUnit()}
      </span>
    );
  if (progress) parts.push(<span key="progress">{t(progress)}</span>);
  for (const goal of snapshot.goals) {
    // Winning is the score itself, already on the line above.
    if (goal.id === 'win') continue;
    // A settled goal is its star; only the ones still in play need counting.
    parts.push(
      <span key={goal.id} data-state={goal.state} title={goalText(goal)}>
        <i aria-hidden="true">{t(goalGlyph(goal))}</i>
        {goal.state === 'active' && <> {t(goal.progress)}</>}
      </span>
    );
  }
  if (snapshot.rallyPressure)
    parts.push(
      <span
        key="pressure"
        className={styles.pressure}
        title={t(msg('Rally pressure: reach reduced by {0}%', [t(snapshot.rallyPressure)]))}
      >
        {t('Reach −')}
        {t(snapshot.rallyPressure)}
        {t('%')}
      </span>
    );
  return parts;
}

/** Score changes announce once; rally and goal counters have no live region. */
export function MatchHud({ snapshot, objective, onGoals }: MatchHudProps) {
  const { matchInfoExpanded } = useSettings();
  const detailsId = useId();
  const liveId = useId();
  const toggleLabel = t(matchInfoExpanded ? 'Collapse match info' : 'Expand match info');
  const versus = snapshot.mode === 'versus';
  const technique = !!snapshot.technique;
  const you = technique ? 'Targets' : versus ? 'P1' : 'You';
  const bot = technique ? 'Misses' : versus ? 'P2' : (snapshot.opponentName ?? 'Bot');
  const shortName = bot.split(' · ')[0];
  const lives = snapshot.maxLives > 0;
  const live = liveParts(snapshot);
  const announcement = lives
    ? `${snapshot.lives} of ${snapshot.maxLives} lives left`
    : technique
      ? msg('{0} targets, {1} misses. Three targets before three misses.', [
          t(snapshot.scoreYou),
          t(snapshot.scoreBot)
        ])
      : `${versus ? 'Player 1' : 'You'} ${snapshot.scoreYou}, ${versus ? 'Player 2' : 'opponent'} ${snapshot.scoreBot}. First to ${snapshot.winScore}.`;
  return (
    <div className={styles.info} data-technique={technique}>
      <button
        className={styles.summary}
        type="button"
        aria-label={toggleLabel}
        aria-describedby={live.length > 0 ? liveId : undefined}
        title={toggleLabel}
        aria-expanded={matchInfoExpanded}
        aria-controls={detailsId}
        onClick={(event) => {
          if (event.detail > 0) event.currentTarget.blur();
          settingsStore.update({ matchInfoExpanded: !matchInfoExpanded });
        }}
      >
        <span className={styles.head}>
          <span className={styles.score} aria-hidden="true">
            {lives ? (
              <span>
                {t('Lives')}
                {t(' ')}
                <b>
                  {t(snapshot.lives)}
                  {t('/')}
                  {t(snapshot.maxLives)}
                </b>
              </span>
            ) : (
              <>
                <span>
                  {t(you)} <b className={styles.you}>{t(snapshot.scoreYou)}</b>
                </span>
                <span className={styles.botScore} title={t(bot)}>
                  <span className={styles.opponentName}>{t(shortName)}</span>{' '}
                  <b>{t(snapshot.scoreBot)}</b>
                </span>
              </>
            )}
          </span>
          {live.length > 0 && (
            <span id={liveId} className={styles.live}>
              {live}
            </span>
          )}
        </span>
        <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true">
          <path d={matchInfoExpanded ? 'M4 10 8 6 12 10' : 'M4 6 8 10 12 6'} />
        </svg>
      </button>
      <span className={styles.sr} role="status" aria-live="polite" aria-atomic="true">
        {t(announcement)}
      </span>
      {snapshot.sharedReturns !== undefined && (
        <p className={styles.objective}>{t(msg('{0}/30 returns', [t(snapshot.sharedReturns)]))}</p>
      )}
      {technique && (
        <p className={styles.objective}>{t('Solo drill · 3 targets before 3 misses')}</p>
      )}
      {snapshot.bossCue && <p className={styles.objective}>{t(snapshot.bossCue)}</p>}
      <div id={detailsId} hidden={!matchInfoExpanded}>
        {!technique && (
          <p className={styles.target}>
            {t(
              lives
                ? msg('Best rally {0}', [t(snapshot.bestThisMatch)])
                : msg('First to {0}', [t(snapshot.winScore)])
            )}
          </p>
        )}
        {!versus && snapshot.paddleKit && (
          <p
            className={`${styles.objective} ${styles.equipment}`}
            title={t(
              technique
                ? msg('Your paddle: {0}', [t(snapshot.paddleKit)])
                : msg('Your paddle: {0}. Rival: {1}', [
                    t(snapshot.paddleKit),
                    t(snapshot.opponentKit ?? 'Neutral paddle')
                  ])
            )}
          >
            {t(snapshot.materialCharge ? 'Impact stored ◇ · ' : '')}
            {t(snapshot.paddleKit)}
          </p>
        )}
        {!versus && !technique && !!snapshot.enemyAbilities?.length && (
          <div className={styles.enemy} role="group" aria-label={t('Opponent skills')}>
            <span className={styles.enemyLabel}>{t('Rival')}</span>
            {snapshot.enemyAbilities.map((skill) => (
              <span
                key={skill.id}
                className={styles.enemySkill}
                style={{ '--skill-hue': skill.hue } as CSSProperties}
                role="img"
                aria-label={t(
                  msg('{0}: {1}', [
                    t(skill.name),
                    t(
                      skill.active
                        ? 'active'
                        : skill.ready
                          ? 'ready'
                          : `${skill.cooldownLeft}s recovery`
                    )
                  ])
                )}
                title={t(
                  msg('{0}: {1}', [
                    t(skill.name),
                    t(
                      skill.active
                        ? 'active'
                        : skill.ready
                          ? 'ready'
                          : `${skill.cooldownLeft}s recovery`
                    )
                  ])
                )}
                data-active={skill.active}
                data-ready={skill.ready}
              >
                <TalentIcon id={skill.talent} />
                <small aria-hidden="true">
                  {t(skill.active ? '!' : skill.ready ? '✓' : skill.cooldownLeft)}
                </small>
              </span>
            ))}
          </div>
        )}
        {snapshot.goals.length > 0 ? (
          <button
            className={styles.goals}
            type="button"
            onClick={(event) => {
              if (event.detail > 0) event.currentTarget.blur();
              onGoals();
            }}
            disabled={!snapshot.canPause}
            aria-label={msg('Star goals. {0}. Pause to review.', [
              snapshot.goals.map(goalText).join('. ')
            ])}
          >
            <strong>{t('Goals')}</strong>
            <span className={styles.goalPips} aria-hidden="true">
              {snapshot.goals.map((goal) => (
                <span key={goal.id} data-state={goal.state} title={goalText(goal)}>
                  {t(goalGlyph(goal))}
                </span>
              ))}
            </span>
            <span aria-hidden="true">{t('›')}</span>
          </button>
        ) : (
          objective && (
            <button
              className={styles.rules}
              type="button"
              onClick={(event) => {
                if (event.detail > 0) event.currentTarget.blur();
                onGoals();
              }}
              disabled={!snapshot.canPause}
              title={t(objective)}
              aria-label={t(msg('{0}. Pause to review match rules.', [t(objective)]))}
            >
              <span>{t(objective)}</span>
              <small aria-hidden="true">{t('›')}</small>
            </button>
          )
        )}
      </div>
    </div>
  );
}
