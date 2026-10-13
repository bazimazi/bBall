import { TECHNIQUES, type TechniqueId } from '../../core/modes/drills';
import { MenuDisclosure } from '../components/MenuDisclosure';
import { sharedResultText } from '../../core/modes/sharedChallenge';
import { t, msg } from '../../core/i18n/index';
import { ITEM_INFO, LOOT_ITEMS } from '../../core/loot/catalog';
import { useEffect, useEffectEvent, useId, useState, type CSSProperties } from 'react';

import { botProfile } from '../../core/bots/levels';
import { stageById } from '../../core/campaign/journey';
import { dailySpec } from '../../core/daily/daily';
import { nextWorkshopRecipe, WORKSHOP_CONTRACTS } from '../../core/equipment/workshop';
import { bossById } from '../../core/modes/bosses';
import { coachingFor } from '../../core/modes/coaching';
import { starGoalLabel, type StarGoal } from '../../core/modes/stars';
import type { MatchResult } from '../../core/modes/types';
import type { ProgressSummary } from '../../core/progression/apply';
import { QUEST_BONUS_XP, QUEST_XP } from '../../core/quests/quests';
import { runLength } from '../../core/run/formats';
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
  onWorkshop?: () => void;
  onLab?: () => void;
  onTechnique?: ((id: TechniqueId) => void) | undefined;
  onPracticeEncounter?: (() => void) | undefined;
  /** A star has just landed on the card - the engine plays its chime. */
  onStar?: (index: number) => void;
}

function title(result: MatchResult, summary: ProgressSummary | null): string {
  if (result.technique) return result.won ? 'Drill complete' : 'Keep practising';
  if (result.sharedCode) return result.won ? 'Target reached' : 'Challenge over';
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
  if (result.mode === 'tournament' && summary?.cupWon) return 'Cup won';
  return result.won ? 'You win' : 'Bot wins';
}

function opponent(result: MatchResult): string {
  if (result.sharedCode) return 'Returns';
  if (result.technique) return 'Targets : Misses';
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
      <div className={styles.statValue}>{t(value)}</div>
      <div className={styles.statLabel}>{t(label)}</div>
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
  return <>{t(shown)}</>;
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
      aria-label={t(msg('{0} of 3 stars', [t((mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1))]))}
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
  onWorkshop,
  onLab,
  onTechnique,
  onPracticeEncounter,
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
  const coaching = result.technique ? null : coachingFor(result, goals ?? []);
  const technique = TECHNIQUES.find((drill) => drill.id === result.technique);
  const good = result.mode === 'challenge' ? result.objectiveMet : result.won;
  const run = summary?.run;

  return (
    <section className={styles.screen} aria-labelledby={titleId}>
      <div className={`${styles.body} ${modes.stagger}`}>
        <SaveNotice />
        <div className={styles.resultHead}>
          <p className={styles.subtitle}>{t(label)}</p>
          <h2
            ref={heading}
            id={titleId}
            className={`${styles.resultTitle} ${good ? styles.win : styles.lose}`}
            tabIndex={-1}
            data-screen-heading
          >
            {t(title(result, summary))}
          </h2>
          {endless ? (
            <p className={styles.scoreLine}>
              <span className={styles.scoreYou}>
                {t(result.sharedCode ? result.hits : result.bestRally)}
              </span>
            </p>
          ) : (
            <p className={styles.scoreLine}>
              <span className={styles.scoreYou}>{t(result.scoreYou)}</span>
              <i>{t(':')}</i>
              <span className={styles.scoreBot}>{t(result.scoreBot)}</span>
            </p>
          )}
          <p className={styles.subtitle}>{t(opponent(result))}</p>
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
                  {t(goal.label)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className={`${styles.stats} ${result.waves !== undefined ? styles.statsFour : ''}`}>
          <Stat value={result.bestRally} label={t('Best rally')} />
          <Stat value={result.hits} label={t('Returns')} />
          {result.waves !== undefined && <Stat value={result.waves} label={t('Waves cleared')} />}
          {result.flicks > 0 ? (
            <Stat value={result.flicks} label={t('Flicks')} />
          ) : (
            <Stat value={duration(result.seconds)} label={t('Time')} />
          )}
        </div>

        {run && !run.ended && (
          <div
            className={modes.resultRow}
            style={{ '--accent': 'hsl(340 90% 66%)' } as CSSProperties}
          >
            <HeartIcon />
            <span>
              {t(
                run.save.offer
                  ? 'A boon is waiting'
                  : msg('Rematch - {0} heart{1} left', [
                      t(run.save.hearts),
                      t(run.save.hearts === 1 ? '' : 's')
                    ])
              )}
            </span>
            <span>
              {t(
                run.save.format === 'endless'
                  ? msg('Depth {0}', [t(run.save.stage + 1)])
                  : msg('{0} / {1}', [t(run.save.stage), t(runLength(run.save))])
              )}
            </span>
          </div>
        )}

        {coaching && <ResultCoaching coaching={coaching} onTutorial={onTutorial} onHelp={onHelp} />}
        {technique && (
          <div className={styles.card}>
            <h3>{t('Solo drill · 3 targets before 3 misses')}</h3>
            <p>{t(technique.hint)}</p>
          </div>
        )}

        {result.sharedCode && (
          <div className={styles.card}>
            <h3>{t('Share this challenge')}</h3>
            <p>
              {t(
                'Copy the code and score below. A friend can enter the code in Shared rally challenge.'
              )}
            </p>
            <textarea
              aria-label={t('Challenge summary')}
              readOnly
              rows={5}
              style={{ width: '100%', boxSizing: 'border-box' }}
              dir="ltr"
              value={sharedResultText(result.sharedCode, result)}
              onFocus={(event) => event.target.select()}
            />
          </div>
        )}
        {onPracticeEncounter && (
          <div className={styles.card}>
            <h3>{t('Practise this encounter')}</h3>
            <p>
              {t(
                'Rehearse this court and opponent without rewards or penalties. Bosses use the phase you reached. Return to this result when ready.'
              )}
            </p>
            <button type="button" className={styles.ghost} onClick={onPracticeEncounter}>
              {t('Start three-point practice')}
            </button>
            {onTechnique && (
              <MenuDisclosure
                title={t('Technique drills')}
                hint={t('Three targets · repeatable feeds · neutral build')}
              >
                {TECHNIQUES.map((drill) => (
                  <button
                    key={drill.id}
                    type="button"
                    className={styles.ghost}
                    onClick={() => onTechnique(drill.id)}
                  >
                    {t(drill.name)}
                  </button>
                ))}
              </MenuDisclosure>
            )}
          </div>
        )}

        {result.objective && result.mode === 'challenge' && (
          <div
            className={styles.unlockRow}
            style={result.objectiveMet ? undefined : { opacity: 0.6 }}
          >
            <span>{t(result.objectiveMet ? '✓' : '·')}</span>
            <span>{t(result.objective.label)}</span>
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
            <span>
              {t(bossById(result.bossId)?.spec.name)}
              {t(' defeated')}
            </span>
          </div>
        )}

        {summary?.dailyCleared && (
          <div
            className={modes.resultRow}
            style={{ '--accent': 'hsl(28 95% 64%)' } as CSSProperties}
          >
            <FlameIcon />
            <span>{t('Daily streak')}</span>
            <span>
              {t(summary.dailyStreak)}
              {t(' day')}
              {t(summary.dailyStreak === 1 ? '' : 's')}
            </span>
          </div>
        )}

        {summary?.questsDone.map((quest) => (
          <div key={quest.id} className={modes.resultRow}>
            <CheckIcon />
            <span>{t(quest.label)}</span>
            <span>
              {t('+')}
              {t(QUEST_XP[quest.tier])}
            </span>
          </div>
        ))}
        {summary?.questBonus && (
          <div className={modes.resultRow}>
            <CheckIcon />
            <span>{t("All three of today's quests")}</span>
            <span>
              {t('+')}
              {t(QUEST_BONUS_XP)}
            </span>
          </div>
        )}

        {levelled && (
          <div className={styles.levelUp}>
            <span>
              {t('Level ')}
              {t(summary?.levelAfter)}
            </span>
            <span className={styles.subtitle}>
              {t(
                summary && summary.levelsGained > 1
                  ? msg('+{0} levels', [t(summary.levelsGained)])
                  : 'Level up'
              )}
            </span>
          </div>
        )}

        {points > 0 && (
          <button type="button" className={styles.unlockRow} onClick={onTalents}>
            <span>{t('◆')}</span>
            <span>
              {t(
                gained > 0
                  ? msg('+{0} talent point{1}', [t(gained), t(gained > 1 ? 's' : '')])
                  : 'Talent points waiting'
              )}
            </span>
            <span style={{ marginInlineStart: 'auto' }}>
              {t('Spend ')}
              {t(points)}
              {t(' ›')}
            </span>
          </button>
        )}

        {(summary?.workshop?.marks ?? 0) > 0 && (
          <div className={styles.card}>
            {/* Laid out like the XP card below it: lines, then a total. */}
            <div className={styles.xpLines}>
              <p className={styles.xpLine}>
                <span>{t('Workshop Marks')}</span>
                <span>
                  {t('+')}
                  {t(summary!.workshop.marks)}
                </span>
              </p>
              {summary!.workshop.contracts.map((name) => (
                <p key={name} className={styles.xpLine}>
                  <span>{t(name)}</span>
                  <span>{t('Complete')}</span>
                </p>
              ))}
              {WORKSHOP_CONTRACTS.filter(
                (c) => (summary!.profile.progress.workshop.contracts[c.id] ?? 0) < c.target
              )
                .slice(0, 2)
                .map((c) => (
                  <p key={c.id} className={styles.xpLine}>
                    <span>{t(c.name)}</span>
                    <span>
                      {t(summary!.profile.progress.workshop.contracts[c.id] ?? 0)}
                      {t('/')}
                      {t(c.target)}
                    </span>
                  </p>
                ))}
            </div>
            <p className={styles.xpTotal}>
              <span>{t('Marks')}</span>
              <span>{t(summary!.profile.progress.workshop.marks)}</span>
            </p>
            <p className={styles.note} style={{ marginTop: 10 }}>
              {t(nextWorkshopRecipe(summary!.profile.progress.workshop))}
            </p>
            {onWorkshop && (
              <button type="button" className={styles.ghost} onClick={onWorkshop}>
                {t('Paddle Workshop')}
              </button>
            )}
          </div>
        )}
        {summary && award && award.total > 0 ? (
          <div className={styles.card}>
            <div className={styles.xpLines}>
              {award.lines.map((line) => (
                <p key={line.label} className={styles.xpLine}>
                  <span>{t(line.label)}</span>
                  <span>
                    {t('+')}
                    {t(line.xp)}
                  </span>
                </p>
              ))}
              {award.multiplier !== 1 && (
                <p className={styles.xpLine}>
                  <span>{t('Difficulty')}</span>
                  <span>
                    {t('×')}
                    {t(award.multiplier)}
                  </span>
                </p>
              )}
              {award.talentMultiplier > 1 && (
                <p className={styles.xpLine}>
                  <span>{t('Talents')}</span>
                  <span>
                    {t('×')}
                    {t(award.talentMultiplier.toFixed(2))}
                  </span>
                </p>
              )}
              {award.damped && (
                <p className={styles.xpLine}>
                  <span>{t('Daily cap')}</span>
                  <span>{t('×0.5')}</span>
                </p>
              )}
              {award.extras.map((line) => (
                <p key={`extra-${line.label}`} className={styles.xpLine}>
                  <span>{t(line.label)}</span>
                  <span>
                    {t('+')}
                    {t(line.xp)}
                  </span>
                </p>
              ))}
            </div>
            <p className={styles.xpTotal}>
              <span>{t('XP earned')}</span>
              <span>
                {t('+')}
                <CountUp value={award.total} />
              </span>
            </p>
            <div style={{ marginTop: 12 }}>
              <XpBar xp={summary.xpAfter} from={summary.xpBefore} />
            </div>
          </div>
        ) : (
          <p className={styles.note}>
            {t(
              result.mode === 'versus'
                ? 'Two-player matches are just for fun'
                : result.technique
                  ? 'Solo drill · no rewards'
                  : result.ranked
                    ? 'No XP from this one'
                    : 'Practice · nothing recorded'
            )}
          </p>
        )}

        {summary?.loot && LOOT_ITEMS.some((item) => summary.loot.items[item] > 0) && (
          <div className={styles.card}>
            <p className={styles.sectionLabel}>{t('Loot banked')}</p>
            {LOOT_ITEMS.filter((item) => summary.loot.items[item] > 0).map((item) => (
              <p className={styles.xpLine} key={item}>
                <span>{t(ITEM_INFO[item].name)}</span>
                <strong>{t(msg('+{0}', [t(summary.loot.items[item])]))}</strong>
              </p>
            ))}
            {summary.loot.circuitCompleted && (
              <p className={styles.note}>
                {t('Resonance Circuit completed · bonus core and threads included')}
              </p>
            )}
            {summary.loot.discovery && (
              <p className={styles.note}>{t('First mode visit · bonus threads included')}</p>
            )}
            {summary.loot.firstClear && (
              <p className={styles.note}>{t('First clear · bonus loot included')}</p>
            )}
            <button type="button" className={styles.ghost} onClick={onLab}>
              {t('Spend loot in the Resonance Lab')}
            </button>
          </div>
        )}

        {summary && summary.achievements.length > 0 && (
          <>
            <p className={styles.sectionLabel}>{t('Achievements')}</p>
            {summary.achievements.map((achievement) => (
              <div key={achievement.id} className={styles.unlockRow}>
                <span>{t('★')}</span>
                <span>{t(achievement.name)}</span>
                {achievement.xp > 0 && (
                  <span style={{ marginInlineStart: 'auto' }}>
                    {t('+')}
                    {t(achievement.xp)}
                    {t(' XP')}
                  </span>
                )}
              </div>
            ))}
          </>
        )}

        {summary && summary.unlocks.length > 0 && (
          <>
            <p className={styles.sectionLabel}>{t('Unlocked')}</p>
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
                  {t(cosmetic.name)} {t(cosmetic.kind)}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      <footer className={styles.footer}>
        <button type="button" className={styles.primary} onClick={onPrimary}>
          {t(primaryLabel)}
        </button>
        <button type="button" className={styles.ghost} onClick={onSecondary}>
          {t(secondaryLabel)}
        </button>
      </footer>
    </section>
  );
}
