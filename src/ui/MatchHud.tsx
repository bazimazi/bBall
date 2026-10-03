import type { GameSnapshot } from '../game/types';
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
  const bot = versus ? 'P2' : 'Bot';
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
            <span>
              {bot} <b>{snapshot.scoreBot}</b>
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
      {snapshot.goals.length > 0 ? (
        <button
          className={styles.goals}
          type="button"
          onClick={onGoals}
          disabled={!snapshot.canPause}
        >
          <strong>Star goals</strong>
          {snapshot.goals.slice(1).map((goal) => (
            <span key={goal.id}>
              {goal.state === 'missed'
                ? '× '
                : goal.state === 'reached' || goal.state === 'earned'
                  ? '✓ '
                  : ''}
              {goal.progress}
            </span>
          ))}
        </button>
      ) : (
        objective && <p className={styles.objective}>{objective}</p>
      )}
    </div>
  );
}
