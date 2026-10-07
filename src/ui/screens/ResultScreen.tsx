import { useEffect, useEffectEvent, useId, useState, type CSSProperties } from 'react';

import { botProfile } from '../../core/bots/levels';
import { stageById } from '../../core/campaign/journey';
import { dailySpec } from '../../core/daily/daily';
import { bossById } from '../../core/modes/bosses';
import { coachingFor } from '../../core/modes/coaching';
import { starGoalLabel, type StarGoal } from '../../core/modes/stars';
import type { MatchResult } from '../../core/modes/types';
import type { ProgressSummary } from '../../core/progression/apply';
import { QUEST_BONUS_XP, QUEST_XP } from '../../core/quests/quests';
import { RUN_STAGES } from '../../core/run/run';
import { XpBar } from '../components/XpBar';
import { ResultCoaching } from '../components/ResultCoaching';
import { SaveNotice } from '../components/SaveNotice';
import { useScreenFocus } from '../hooks/useScreenFocus';
import { CheckIcon, CrownIcon, FlameIcon, HeartIcon, StarIcon } from '../icons/ModeIcons';
import modes from '../Modes.module.css';
import styles from '../Screens.module.css';

interface ResultScreenProps {
  result: MatchResult;
  summary: ProgressSummary | null;
  label: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
  onHelp: () => void;
  onTutorial: () => void;
  /** Offered only when there is something to spend. */
  onTalents: () => void;
  /** A star has just landed on the card - the engine plays its chime. */
  onStar?: (index: number) => void;
}

function title(result: MatchResult, summary: ProgressSummary | null): string {
  if (result.mode === 'versus') return result.won ? 'Player 1 wins' : 'Player 2 wins';
  if (result.mode === 'endless') return 'Run over';
  if (result.mode === 'challenge') return result.objectiveMet ? 'Challenge clear' : 'Not quite';
  if (result.mode === 'run') {
    if (summary?.run?.cleared) return 'Gauntlet cleared';
    if (result.won) return result.bossId ? 'Boss down' : 'Match won';
    return summary?.run?.ended ? 'Run over' : 'Heart lost';
  }
  if (result.won && result.bossId)
    return `${bossById(result.bossId)?.spec.name ?? 'Boss'} defeated`;
  if (result.mode === 'campaign') return result.won ? 'Stage clear' : 'Not quite';
  if (result.mode === 'daily') return result.won ? 'Daily clear' : 'Not quite';
  return result.won ? 'You win' : 'Bot wins';
}

function opponent(result: MatchResult): string {
  if (result.mode === 'endless') return 'Longest rally';
  if (result.mode === 'versus') return 'Player 1 : Player 2';
  if (result.bossId) return `vs ${bossById(result.bossId)?.spec.name ?? 'the boss'}`;
  return `vs ${botProfile(result.botId).name}`;
}

/** The two star goals a Journey stage or a daily set, if this match had them. */
function goalsOf(result: MatchResult): readonly [StarGoal, StarGoal] | null {
  if (result.mode === 'campaign' && result.stageId) return stageById(result.stageId)?.goals ?? null;
  if (result.mode === 'daily' && result.dailyKey) return dailySpec(result.dailyKey).goals;
  return null;
}

function duration(seconds: number): string {
  const rounded = Math.round(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
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

/** A number that counts up to its value, eased, the first time it is shown. */
function CountUp({ value, delay = 250 }: { value: number; delay?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now() + delay;
    const span = Math.min(1100, 400 + value * 0.9);
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / span));
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, delay]);
  return <>{shown}</>;
}

/**
 * Three stars, lit one after another with a chime each. Stars this match did
 * not earn stay dark; stars earned on an earlier attempt are not re-shown -
 * the card is about this match.
 */
function StarReveal({
  mask,
  onStar
}: {
  mask: number;
  onStar?: ((index: number) => void) | undefined;
}) {
  const [lit, setLit] = useState(0);
  // Chime delivery follows the latest engine callback without restarting the reveal.
  const soundStar = useEffectEvent((index: number) => onStar?.(index));
  useEffect(() => {
    const timers: number[] = [];
    for (let i = 0; i < 3; i++) {
      timers.push(
        window.setTimeout(
          () => {
            setLit(i + 1);
            if (mask & (1 << i)) soundStar(i);
          },
          380 + i * 330
        )
      );
    }
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [mask]);

  return (
    <div
      className={modes.bigStars}
      role="img"
      aria-label={`${(mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1)} of 3 stars`}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={
            i < lit && mask & (1 << i) ? `${modes.bigStar} ${modes.bigStarOn}` : modes.bigStar
          }
        >
          <StarIcon />
        </span>
      ))}
    </div>
  );
}

/**
 * Result, stars, performance, optional coaching, rewards, next action - on one
 * scrollable card, with the next action pinned under the thumb. Everything
 * rises in one after another, so the card reads as a reveal rather than a
 * table.
 */
export function ResultScreen({
  result,
  summary,
  label,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  onHelp,
  onTutorial,
  onTalents,
  onStar
}: ResultScreenProps) {
  const heading = useScreenFocus();
  const titleId = useId();
  const endless = result.mode === 'endless';
  const award = summary?.award;
  const levelled = (summary?.levelsGained ?? 0) > 0;
  const points = summary?.talentPointsAvailable ?? 0;
  const gained = summary?.talentPoints ?? 0;
  const goals = goalsOf(result);
  const coaching = coachingFor(result, goals ?? []);
  const good = result.mode === 'challenge' ? result.objectiveMet : result.won;
  const run = summary?.run;

  return (
    <section className={styles.screen} aria-labelledby={titleId}>
      <div className={`${styles.body} ${modes.stagger}`}>
        <SaveNotice />
        <div className={styles.resultHead}>
          <p className={styles.subtitle}>{label}</p>
          <h2
            ref={heading}
            id={titleId}
            className={`${styles.resultTitle} ${good ? styles.win : styles.lose}`}
            tabIndex={-1}
            data-screen-heading
          >
            {title(result, summary)}
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
          <p className={styles.subtitle}>{opponent(result)}</p>
        </div>

        {goals && summary && (
          <div className={styles.card}>
            <StarReveal key={summary.stars} mask={summary.stars} onStar={onStar} />
            <div className={modes.goals} style={{ marginTop: 10 }}>
              {[
                { bit: 1, label: 'Win the match' },
                { bit: 2, label: starGoalLabel(goals[0]) },
                { bit: 4, label: starGoalLabel(goals[1]) }
              ].map((goal) => (
                <span
                  key={goal.bit}
                  className={
                    summary.stars & goal.bit ? `${modes.goal} ${modes.goalOn}` : modes.goal
                  }
                >
                  <StarIcon />
                  {goal.label}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className={styles.stats}>
          <Stat value={result.bestRally} label="Best rally" />
          <Stat value={result.hits} label="Returns" />
          {result.waves !== undefined && <Stat value={result.waves} label="Waves cleared" />}
          {result.flicks > 0 ? (
            <Stat value={result.flicks} label="Flicks" />
          ) : (
            <Stat value={duration(result.seconds)} label="Time" />
          )}
        </div>

        {coaching && <ResultCoaching coaching={coaching} onTutorial={onTutorial} onHelp={onHelp} />}

        {result.objective && result.mode === 'challenge' && (
          <div
            className={styles.unlockRow}
            style={result.objectiveMet ? undefined : { opacity: 0.6 }}
          >
            <span>{result.objectiveMet ? '✓' : '·'}</span>
            <span>{result.objective.label}</span>
          </div>
        )}

        {summary?.bossBeaten && result.bossId && (
          <div
            className={modes.resultRow}
            style={
              {
                '--accent': `hsl(${bossById(result.bossId)?.spec.hue ?? 48} 90% 66%)`
              } as CSSProperties
            }
          >
            <CrownIcon />
            <span>{bossById(result.bossId)?.spec.name} defeated</span>
          </div>
        )}

        {summary?.dailyCleared && (
          <div
            className={modes.resultRow}
            style={{ '--accent': 'hsl(28 95% 64%)' } as CSSProperties}
          >
            <FlameIcon />
            <span>Daily streak</span>
            <span>
              {summary.dailyStreak} day{summary.dailyStreak === 1 ? '' : 's'}
            </span>
          </div>
        )}

        {run && !run.ended && (
          <div
            className={modes.resultRow}
            style={{ '--accent': 'hsl(340 90% 66%)' } as CSSProperties}
          >
            <HeartIcon />
            <span>
              {run.save.offer
                ? 'A boon is waiting'
                : `Rematch - ${run.save.hearts} heart${run.save.hearts === 1 ? '' : 's'} left`}
            </span>
            <span>
              {run.save.stage} / {RUN_STAGES}
            </span>
          </div>
        )}

        {summary?.questsDone.map((quest) => (
          <div key={quest.id} className={modes.resultRow}>
            <CheckIcon />
            <span>{quest.label}</span>
            <span>+{QUEST_XP[quest.tier]}</span>
          </div>
        ))}
        {summary?.questBonus && (
          <div className={modes.resultRow}>
            <CheckIcon />
            <span>All three of today's quests</span>
            <span>+{QUEST_BONUS_XP}</span>
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

        {points > 0 && (
          <button type="button" className={styles.unlockRow} onClick={onTalents}>
            <span>◆</span>
            <span>
              {gained > 0
                ? `+${gained} talent point${gained > 1 ? 's' : ''}`
                : 'Talent points waiting'}
            </span>
            <span style={{ marginLeft: 'auto' }}>Spend {points} ›</span>
          </button>
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
              {award.talentMultiplier > 1 && (
                <p className={styles.xpLine}>
                  <span>Talents</span>
                  <span>×{award.talentMultiplier.toFixed(2)}</span>
                </p>
              )}
              {award.damped && (
                <p className={styles.xpLine}>
                  <span>Daily cap</span>
                  <span>×0.5</span>
                </p>
              )}
              {award.extras.map((line) => (
                <p key={`extra-${line.label}`} className={styles.xpLine}>
                  <span>{line.label}</span>
                  <span>+{line.xp}</span>
                </p>
              ))}
            </div>
            <p className={styles.xpTotal}>
              <span>XP earned</span>
              <span>
                +<CountUp value={award.total} />
              </span>
            </p>
            <div style={{ marginTop: 12 }}>
              <XpBar xp={summary.xpAfter} from={summary.xpBefore} />
            </div>
          </div>
        ) : (
          <p className={styles.note}>
            {result.mode === 'versus'
              ? 'Two-player matches are just for fun'
              : result.ranked
                ? 'No XP from this one'
                : 'Practice · nothing recorded'}
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
