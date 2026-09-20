import { botProfile } from '../../core/bots/levels';
import type { MatchResult } from '../../core/modes/types';
import type { ProgressSummary } from '../../core/progression/apply';
import { XpBar } from '../components/XpBar';
import styles from '../Screens.module.css';

interface ResultScreenProps {
  result: MatchResult;
  summary: ProgressSummary | null;
  label: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
}

function title(result: MatchResult): string {
  if (result.mode === 'endless') return 'Run over';
  if (result.mode === 'challenge') return result.objectiveMet ? 'Challenge clear' : 'Not quite';
  return result.won ? 'You win' : 'Bot wins';
}

function duration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

/**
 * Result, performance, XP, unlocks, next action - in that order, on one
 * scrollable card, with the next action pinned under the thumb.
 */
export function ResultScreen({
  result,
  summary,
  label,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary
}: ResultScreenProps) {
  const endless = result.mode === 'endless';
  const award = summary?.award;
  const levelled = (summary?.levelsGained ?? 0) > 0;

  return (
    <section className={styles.screen}>
      <div className={styles.body}>
        <div className={styles.resultHead}>
          <p className={styles.subtitle}>{label}</p>
          <h2
            className={`${styles.resultTitle} ${result.won || result.objectiveMet ? styles.win : styles.lose}`}
          >
            {title(result)}
          </h2>
          {endless ? (
            <p className={styles.scoreLine}>
              <span className={styles.scoreYou}>{result.bestRally}</span>
            </p>
          ) : (
            <p className={styles.scoreLine}>
              <span className={styles.scoreYou}>{result.scoreYou}</span>
              <i>:</i>
              <span className={styles.scoreBot}>{result.scoreBot}</span>
            </p>
          )}
          <p className={styles.subtitle}>
            {endless ? 'Longest rally' : `vs ${botProfile(result.botId).name}`}
          </p>
        </div>

        <div className={styles.stats}>
          <Stat value={result.bestRally} label="Best rally" />
          <Stat value={result.hits} label="Returns" />
          <Stat value={duration(result.seconds)} label="Time" />
        </div>

        {result.objective && !endless && (
          <div
            className={styles.unlockRow}
            style={result.objectiveMet ? undefined : { opacity: 0.6 }}
          >
            <span>{result.objectiveMet ? '✓' : '·'}</span>
            <span>{result.objective.label}</span>
          </div>
        )}

        {levelled && (
          <div className={styles.levelUp}>
            <span>Level {summary?.levelAfter}</span>
            <span className={styles.subtitle}>
              {summary && summary.levelsGained > 1 ? `+${summary.levelsGained} levels` : 'Level up'}
            </span>
          </div>
        )}

        {summary && award && award.total > 0 ? (
          <div className={styles.card}>
            <div className={styles.xpLines}>
              {award.lines.map((line) => (
                <p key={line.label} className={styles.xpLine}>
                  <span>{line.label}</span>
                  <span>+{line.xp}</span>
                </p>
              ))}
              {award.multiplier !== 1 && (
                <p className={styles.xpLine}>
                  <span>Difficulty</span>
                  <span>×{award.multiplier}</span>
                </p>
              )}
              {award.damped && (
                <p className={styles.xpLine}>
                  <span>Daily cap</span>
                  <span>×0.5</span>
                </p>
              )}
            </div>
            <p className={styles.xpTotal}>
              <span>XP earned</span>
              <span>+{award.total}</span>
            </p>
            <div style={{ marginTop: 12 }}>
              <XpBar xp={summary.xpAfter} from={summary.xpBefore} />
            </div>
          </div>
        ) : (
          <p className={styles.note}>
            {result.ranked ? 'No XP from this one' : 'Practice · nothing recorded'}
          </p>
        )}

        {summary && summary.achievements.length > 0 && (
          <>
            <p className={styles.sectionLabel}>Achievements</p>
            {summary.achievements.map((achievement) => (
              <div key={achievement.id} className={styles.unlockRow}>
                <span>★</span>
                <span>{achievement.name}</span>
                {achievement.xp > 0 && (
                  <span style={{ marginLeft: 'auto' }}>+{achievement.xp} XP</span>
                )}
              </div>
            ))}
          </>
        )}

        {summary && summary.unlocks.length > 0 && (
          <>
            <p className={styles.sectionLabel}>Unlocked</p>
            {summary.unlocks.map((cosmetic) => (
              <div key={cosmetic.id} className={styles.unlockRow}>
                <span
                  className={styles.swatchDisc}
                  style={{
                    width: 20,
                    height: 20,
                    background: `linear-gradient(140deg, ${cosmetic.swatch[0]}, ${cosmetic.swatch[1]})`
                  }}
                />
                <span>
                  {cosmetic.name} {cosmetic.kind}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      <footer className={styles.footer}>
        <button type="button" className={styles.primary} onClick={onPrimary}>
          {primaryLabel}
        </button>
        <button type="button" className={styles.ghost} onClick={onSecondary}>
          {secondaryLabel}
        </button>
      </footer>
    </section>
  );
}
