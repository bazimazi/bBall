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
            Lives{' '}
            <b>
              {snapshot.lives}/{snapshot.maxLives}
            </b>
          </span>
        ) : (
          <>
            <span>
              {you} <b className={styles.you}>{snapshot.scoreYou}</b>
            </span>
            <span className={styles.botScore} title={bot}>
              <span className={styles.opponentName}>{shortName}</span> <b>{snapshot.scoreBot}</b>
            </span>
          </>
        )}
      </p>
      <span className={styles.sr} role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <p className={styles.target}>
        {lives ? `Best rally ${snapshot.bestThisMatch}` : `First to ${snapshot.winScore}`}
      </p>
      {!!snapshot.rallyPressure && (
        <p
          className={styles.objective}
          title={`Rally pressure: reach reduced by ${snapshot.rallyPressure}%`}
        >
          Reach −{snapshot.rallyPressure}%
        </p>
      )}
      {!versus && snapshot.paddleKit && (
        <p
          className={`${styles.objective} ${styles.equipment}`}
          title={`Your paddle: ${snapshot.paddleKit}. Rival: ${snapshot.opponentKit ?? 'Neutral paddle'}`}
        >
          {snapshot.materialCharge ? 'Impact stored ◇ · ' : ''}
          {snapshot.paddleKit}
        </p>
      )}
      {!versus && !!snapshot.enemyAbilities?.length && (
        <div className={styles.enemy} role="group" aria-label="Opponent skills">
          <span className={styles.enemyLabel}>Rival</span>
          {snapshot.enemyAbilities.map((skill) => (
            <span
              key={skill.id}
              className={styles.enemySkill}
              style={{ '--skill-hue': skill.hue } as CSSProperties}
              role="img"
              aria-label={`${skill.name}: ${skill.active ? 'active' : skill.ready ? 'ready' : `${skill.cooldownLeft}s recovery`}`}
              title={`${skill.name}: ${skill.active ? 'active' : skill.ready ? 'ready' : `${skill.cooldownLeft}s recovery`}`}
              data-active={skill.active}
              data-ready={skill.ready}
            >
              <TalentIcon id={skill.talent} />
              <small aria-hidden="true">
                {skill.active ? '!' : skill.ready ? '✓' : skill.cooldownLeft}
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
          aria-label={`Star goals. ${snapshot.goals.map((goal) => `${goal.label}: ${goal.progress}, ${goal.state}`).join('. ')}. Pause to review.`}
        >
          <strong>Goals</strong>
          <span className={styles.goalPips} aria-hidden="true">
            {snapshot.goals.map((goal) => (
              <span
                key={goal.id}
                data-state={goal.state}
                title={`${goal.label}: ${goal.progress}, ${goal.state}`}
              >
                {goal.state === 'missed'
                  ? '×'
                  : goal.state === 'reached' || goal.state === 'earned'
                    ? '★'
                    : '☆'}
              </span>
            ))}
          </span>
          <span aria-hidden="true">›</span>
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
            title={objective}
            aria-label={`${objective}. Pause to review match rules.`}
          >
            <span>{objective}</span>
            <small aria-hidden="true">›</small>
          </button>
        )
      )}
    </div>
  );
}
