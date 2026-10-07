import { t, msg } from '../core/i18n/index';
import type { GameSnapshot } from '../game/types';
import type { CSSProperties } from 'react';
import { TalentIcon } from './icons/TalentIcon';
import styles from './MatchHud.module.css';

interface MatchHudProps {
  snapshot: GameSnapshot;
  objective: string | null;
  onGoals: () => void;
}

/** Score changes announce once; rally and goal counters have no live region. */
export function MatchHud({ snapshot, objective, onGoals }: MatchHudProps) {
  const versus = snapshot.mode === 'versus';
  const you = versus ? 'P1' : 'You';
  const bot = versus ? 'P2' : (snapshot.opponentName ?? 'Bot');
  const shortName = bot.split(' · ')[0];
  const lives = snapshot.maxLives > 0;
  const announcement = lives
    ? `${snapshot.lives} of ${snapshot.maxLives} lives left`
    : `${versus ? 'Player 1' : 'You'} ${snapshot.scoreYou}, ${versus ? 'Player 2' : 'opponent'} ${snapshot.scoreBot}. First to ${snapshot.winScore}.`;
  return (
    <div className={styles.info}>
      <p className={styles.score} aria-hidden="true">
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
      </p>
      <span className={styles.sr} role="status" aria-live="polite" aria-atomic="true">
        {t(announcement)}
      </span>
      <p className={styles.target}>
        {t(
          lives
            ? msg('Best rally {0}', [t(snapshot.bestThisMatch)])
            : msg('First to {0}', [t(snapshot.winScore)])
        )}
      </p>
      {!!snapshot.rallyPressure && (
        <p
          className={styles.objective}
          title={t(msg('Rally pressure: reach reduced by {0}%', [t(snapshot.rallyPressure)]))}
        >
          {t('Reach −')}
          {t(snapshot.rallyPressure)}
          {t('%')}
        </p>
      )}
      {!versus && snapshot.paddleKit && (
        <p
          className={`${styles.objective} ${styles.equipment}`}
          title={t(
            msg('Your paddle: {0}. Rival: {1}', [
              t(snapshot.paddleKit),
              t(snapshot.opponentKit ?? 'Neutral paddle')
            ])
          )}
        >
          {t(snapshot.materialCharge ? 'Impact stored ◇ · ' : '')}
          {t(snapshot.paddleKit)}
        </p>
      )}
      {!versus && !!snapshot.enemyAbilities?.length && (
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
          aria-label={t(
            msg('Star goals. {0}. Pause to review.', [
              t(
                snapshot.goals
                  .map((goal) => `${goal.label}: ${goal.progress}, ${goal.state}`)
                  .join('. ')
              )
            ])
          )}
        >
          <strong>{t('Goals')}</strong>
          <span className={styles.goalPips} aria-hidden="true">
            {snapshot.goals.map((goal) => (
              <span
                key={goal.id}
                data-state={goal.state}
                title={t(msg('{0}: {1}, {2}', [t(goal.label), t(goal.progress), t(goal.state)]))}
              >
                {t(
                  goal.state === 'missed'
                    ? '×'
                    : goal.state === 'reached' || goal.state === 'earned'
                      ? '★'
                      : '☆'
                )}
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
  );
}
