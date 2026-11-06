import type { MatchResult, MatchRules, ModeId } from '../modes/types';
import { EMPTY_MATCH_STATS } from '../talents/types';
import type { RunSave } from '../run/run';
import { roundsFor, tierById } from '../tournament/bracket';

/**
 * Leaving a ranked match early.
 *
 * The rule, the same everywhere a ranked match has stakes: once a point has
 * been played, restarting or leaving it is a forfeit. It counts as a loss -
 * the win streak ends and nothing is paid - and in a cup that loss is an
 * elimination. A match nobody has scored in yet can still be restarted or
 * left for free, and so can anything unranked (Practice, Versus, drills) and
 * Endless, which has no score to forfeit.
 *
 * The Gauntlet keeps its own, stricter version of the same rule: an encounter
 * commits when it starts, so restarting or leaving it always costs a heart -
 * its loss - from the first serve.
 */

/** What restarting or leaving the live match would cost. */
export type LeaveStakes =
  | { readonly kind: 'heart'; readonly hearts: number }
  | { readonly kind: 'loss' }
  | {
      readonly kind: 'cup';
      readonly cup: string;
      readonly round: number;
      readonly rounds: number;
    };

/** Scored ranked modes in which a forfeit is recorded as a loss. */
const FORFEIT_MODES: ReadonlySet<ModeId> = new Set([
  'quick',
  'campaign',
  'daily',
  'challenge',
  'tournament'
]);

export interface Scoreline {
  readonly you: number;
  readonly bot: number;
}

/** Has a point been played since the match began, from wherever it began? */
export function pointsPlayed(rules: MatchRules, score: Scoreline): boolean {
  const start = rules.modifiers.startScore;
  return score.you !== start.you || score.bot !== start.bot;
}

/**
 * What restarting or leaving this match now would cost, or null when it is
 * free. `run` is the Gauntlet run on the profile, for a run match.
 */
export function leaveStakes(
  rules: MatchRules | null,
  score: Scoreline | null,
  run: RunSave | null
): LeaveStakes | null {
  if (!rules?.ranked) return null;
  if (rules.mode === 'run')
    return run && !run.finished && run.version === 2 && run.attempt?.stage === run.stage
      ? { kind: 'heart', hearts: run.hearts }
      : null;
  if (!FORFEIT_MODES.has(rules.mode) || rules.winScore <= 0 || !score) return null;
  if (!pointsPlayed(rules, score)) return null;
  if (rules.mode !== 'tournament') return { kind: 'loss' };
  return {
    kind: 'cup',
    cup: tierById(rules.tournamentTier ?? 0).name,
    round: (rules.tournamentRound ?? 0) + 1,
    rounds: roundsFor(rules.tournamentFormat ? { format: rules.tournamentFormat } : {}).length
  };
}

/** The most play time a forfeit claims for each point played. */
const SECONDS_PER_POINT = 60;

/**
 * The result a forfeit is recorded as: an abandoned loss at the score it was
 * left on, carrying the encounter's identity and prepared paddle so the
 * server can match it to the attempt. It claims no returns, rallies or skill
 * use, so it can only ever cost the player.
 */
export function forfeitResult(
  rules: MatchRules,
  score: Scoreline,
  seconds: number,
  day: string
): MatchResult {
  const start = rules.modifiers.startScore;
  const points = Math.abs(score.you - start.you) + Math.abs(score.bot - start.bot);
  return {
    ...(rules.equipment
      ? { equipment: { ...rules.equipment, kit: { ...rules.equipment.kit } } }
      : {}),
    ...(rules.options ? { options: { ...rules.options } } : {}),
    mode: rules.mode,
    ranked: rules.ranked,
    botId: rules.bot.id,
    botRank: rules.bot.rank,
    won: false,
    scoreYou: score.you,
    scoreBot: score.bot,
    bestRally: 0,
    hits: 0,
    // Wall time since the start, which includes pauses: at most a minute a
    // point, so a long pause is never counted as play.
    seconds: Math.max(0, Math.round(Math.min(seconds, points * SECONDS_PER_POINT))),
    livesLeft: 0,
    objective: rules.objective,
    objectiveMet: false,
    challengeId: rules.challengeId,
    tournamentRound: rules.tournamentRound,
    tournamentTier: rules.tournamentTier,
    ...(rules.tournamentFormat ? { tournamentFormat: rules.tournamentFormat } : {}),
    stageId: rules.stageId,
    dailyKey: rules.dailyKey,
    runStage: rules.runStage,
    bossId: rules.boss?.id,
    day,
    talent: { ...EMPTY_MATCH_STATS },
    flicks: 0,
    court: { banks: 0, switches: 0, breaks: 0, gates: 0 },
    shutout: false,
    comeback: false,
    abandoned: true
  };
}

/**
 * Is this an abandoned ranked result that counts as a forfeit loss? The
 * client reports one only once a point has been played; the Gauntlet's
 * forfeits go through its own run actions instead.
 */
export function isForfeit(result: MatchResult): boolean {
  return result.ranked && result.abandoned && !result.won && FORFEIT_MODES.has(result.mode);
}
