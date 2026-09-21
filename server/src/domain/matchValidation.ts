/**
 * Anti-cheat: turning a client's account of a match into a result the server
 * is willing to act on.
 *
 * The premise is that the client is an untrusted environment and always will
 * be. Nothing here tries to stop a determined player editing their own copy
 * of the game - that is unwinnable, and chasing it produces false rejections
 * for honest players on bad connections. What it does is make the *server's*
 * numbers impossible to dictate:
 *
 * - The submission carries no XP, no level, no talent points and no unlocks.
 *   Those are computed here from the same pure functions the client uses, so
 *   the only thing a tampered client can influence is the evidence.
 * - The evidence is then checked against the rules of the mode it claims to
 *   have been played under, and against physics: a hundred returns cannot
 *   happen in four seconds, a Quick Match cannot end 9-2, an ability cannot
 *   fire from a build that does not own it.
 * - Anything that survives is plausible rather than proven. That is the right
 *   bar for a single-player ladder, and the shape leaves room for a
 *   server-authoritative simulation later without moving anything else.
 *
 * Every rejection returns a stable reason so a support question has an
 * answer, and so the test suite can assert on the specific rule that fired.
 */

import { isBotLevelId, SELECTABLE_BOTS } from '../../../src/core/bots/levels';
import { challengeById } from '../../../src/core/modes/challenges';
import { isModeId } from '../../../src/core/modes/catalog';
import {
  challengeRules,
  endlessRules,
  objectiveMet,
  practiceRules,
  quickMatchRules,
  tournamentRules
} from '../../../src/core/modes/rules';
import type { MatchResult, MatchRules } from '../../../src/core/modes/types';
import type { PlayerProfile } from '../../../src/core/profile/types';
import { levelOf } from '../../../src/core/progression/levels';
import { resolveLoadout } from '../../../src/core/talents/effects';
import { ownedAbilities, rankOf } from '../../../src/core/talents/save';
import { abilitySlotsForLevel } from '../../../src/core/balance/config';
import { TOURNAMENT_ROUNDS } from '../../../src/core/tournament/bracket';
import type { MatchSubmissionDto } from '../../../shared/protocol';

/** Physical floors, with generous headroom over what the simulation allows. */
export const LIMITS = {
  /**
   * Seconds the ball needs to cross the court once, at the hardest cap the
   * balance file permits, on the shortest legal court. The real number is
   * about 0.44 s; this is deliberately looser so a laggy phone that
   * under-reports its own clock is not called a cheat.
   */
  secondsPerReturn: 0.3,
  /** Serve, rally and the pause after a point, per point played. */
  secondsPerPoint: 0.5,
  /** Nothing legitimate runs this long; a submission claiming it is noise. */
  maxSeconds: 4 * 60 * 60,
  maxScore: 99,
  maxHits: 100_000,
  /** The shortest any ability's cooldown can be made by any build. */
  minAbilityCooldown: 2,
  /** Ranked matches accepted in one hour, before the budget check bites. */
  playBudgetWindowMs: 60 * 60 * 1000,
  /** Seconds of play accepted per hour of wall clock. */
  playBudgetSeconds: 90 * 60,
  /** How far into the future a client clock may claim a match happened. */
  clockSkewMs: 10 * 60 * 1000
} as const;

export type RejectionCode =
  | 'unknown-mode'
  | 'unknown-bot'
  | 'bot-mode-mismatch'
  | 'unknown-challenge'
  | 'no-active-tournament'
  | 'tournament-mismatch'
  | 'impossible-score'
  | 'score-below-start'
  | 'inconsistent-outcome'
  | 'impossible-rally'
  | 'impossible-duration'
  | 'impossible-lives'
  | 'impossible-ability-use'
  | 'ability-not-owned'
  | 'impossible-talent-stats'
  | 'future-timestamp'
  | 'play-budget-exceeded';

export interface Rejection {
  readonly ok: false;
  readonly code: RejectionCode;
  readonly reason: string;
}

export interface Acceptance {
  readonly ok: true;
  /** The rules the server believes this match was played under. */
  readonly rules: MatchRules;
  /**
   * The result the server will act on.
   *
   * Every field the client is not trusted with - `ranked`, `botRank`,
   * `objectiveMet`, the objective itself - has been replaced with the
   * server's own value.
   */
  readonly result: MatchResult;
  /** Non-fatal discrepancies worth logging. */
  readonly notes: readonly string[];
}

export type ValidationResult = Acceptance | Rejection;

export interface ValidationContext {
  readonly profile: PlayerProfile;
  /** Seconds of play already recorded in the budget window. */
  readonly recentPlaySeconds: number;
  readonly now: number;
}

const reject = (code: RejectionCode, reason: string): Rejection => ({ ok: false, code, reason });

function resolveRules(
  submission: MatchSubmissionDto,
  profile: PlayerProfile
): MatchRules | Rejection {
  if (!isModeId(submission.mode)) return reject('unknown-mode', 'That game mode does not exist.');
  if (!isBotLevelId(submission.botId))
    return reject('unknown-bot', 'That opponent does not exist.');

  switch (submission.mode) {
    case 'quick':
    case 'practice': {
      // The wall is the endless sparring partner and is not on the ladder.
      const selectable = SELECTABLE_BOTS.some((bot) => bot.id === submission.botId);
      if (!selectable) {
        return reject('bot-mode-mismatch', 'That opponent cannot be picked for this mode.');
      }
      return submission.mode === 'quick'
        ? quickMatchRules(submission.botId)
        : practiceRules(submission.botId);
    }

    case 'endless': {
      if (submission.botId !== 'wall') {
        return reject('bot-mode-mismatch', 'Endless is only played against the wall.');
      }
      return endlessRules();
    }

    case 'challenge': {
      const challenge = submission.challengeId ? challengeById(submission.challengeId) : undefined;
      if (!challenge) return reject('unknown-challenge', 'That challenge does not exist.');
      if (challenge.bot !== submission.botId) {
        return reject('bot-mode-mismatch', 'That challenge is not played against that opponent.');
      }
      return challengeRules(challenge);
    }

    case 'tournament': {
      const save = profile.tournament;
      if (!save) return reject('no-active-tournament', 'You have no cup in progress.');
      const rules = tournamentRules(save);
      if (rules.bot.id !== submission.botId) {
        return reject('tournament-mismatch', 'That is not your next cup opponent.');
      }
      if (submission.tournamentRound !== undefined && submission.tournamentRound !== save.round) {
        return reject('tournament-mismatch', 'That cup round has already been played.');
      }
      if (submission.tournamentTier !== undefined && submission.tournamentTier !== save.tier) {
        return reject('tournament-mismatch', 'That is not the cup you are playing.');
      }
      if (save.round >= TOURNAMENT_ROUNDS.length) {
        return reject('tournament-mismatch', 'That cup is already over.');
      }
      return rules;
    }
  }
}

function checkScores(submission: MatchSubmissionDto, rules: MatchRules): Rejection | null {
  const { scoreYou, scoreBot } = submission;
  const start = rules.modifiers.startScore;

  if (scoreYou > LIMITS.maxScore || scoreBot > LIMITS.maxScore) {
    return reject('impossible-score', 'That scoreline is not possible.');
  }
  if (scoreYou < start.you || scoreBot < start.bot) {
    return reject('score-below-start', 'That scoreline is below where the match began.');
  }

  if (rules.winScore > 0) {
    if (scoreYou > rules.winScore || scoreBot > rules.winScore) {
      return reject('impossible-score', 'That scoreline is past the winning score.');
    }
    if (!submission.abandoned) {
      const top = Math.max(scoreYou, scoreBot);
      if (top !== rules.winScore) {
        return reject('impossible-score', 'That match did not reach a winning score.');
      }
      if (submission.won !== scoreYou > scoreBot) {
        return reject('inconsistent-outcome', 'The winner does not match the scoreline.');
      }
    } else if (Math.max(scoreYou, scoreBot) >= rules.winScore) {
      return reject('inconsistent-outcome', 'A finished match cannot also be abandoned.');
    }
  }

  if (submission.shutout && !(submission.won && scoreBot === start.bot)) {
    return reject('inconsistent-outcome', 'That was not a shutout.');
  }
  if (submission.comeback && !submission.won) {
    return reject('inconsistent-outcome', 'A comeback has to be a win.');
  }
  return null;
}

function checkRallyAndTime(submission: MatchSubmissionDto, rules: MatchRules): Rejection | null {
  const { hits, bestRally, seconds } = submission;

  if (hits > LIMITS.maxHits || bestRally > LIMITS.maxHits) {
    return reject('impossible-rally', 'That rally count is not possible.');
  }

  // A rally counts both players' returns, so the player's own returns can be
  // as few as half of it - rounded down, because the rally may have started
  // on a serve the player did not touch.
  if (bestRally > 0 && hits < Math.floor(bestRally / 2)) {
    return reject('impossible-rally', 'That rally is longer than the returns played.');
  }

  if (seconds < 0 || seconds > LIMITS.maxSeconds) {
    return reject('impossible-duration', 'That match length is not possible.');
  }

  const points = Math.max(
    0,
    submission.scoreYou +
      submission.scoreBot -
      rules.modifiers.startScore.you -
      rules.modifiers.startScore.bot
  );
  // Each of the player's returns implies a round trip across the court; each
  // point implies a serve and a pause. Both floors are far below what the
  // simulation can actually produce.
  const floor = hits * LIMITS.secondsPerReturn + points * LIMITS.secondsPerPoint;
  if (seconds + 1 < floor) {
    return reject('impossible-duration', 'That many returns could not fit in that time.');
  }

  if (rules.lives > 0) {
    if (submission.livesLeft < 0 || submission.livesLeft > rules.lives) {
      return reject('impossible-lives', 'That life count is not possible.');
    }
    if (!submission.abandoned && submission.livesLeft > 0 && !submission.won) {
      return reject('impossible-lives', 'That run ended with lives to spare.');
    }
  } else if (submission.livesLeft !== 0) {
    return reject('impossible-lives', 'That mode does not use lives.');
  }

  return null;
}

/**
 * What a build could physically have done in the time available.
 *
 * The caps come from {@link resolveLoadout} - the same resolver the engine
 * reads - so a deeper build is allowed more without any number being
 * duplicated here.
 */
function checkTalentUse(submission: MatchSubmissionDto, profile: PlayerProfile): Rejection | null {
  const stats = submission.talent;
  const level = levelOf(profile.xp);
  const loadout = resolveLoadout(profile.talents, level);
  const equipped = loadout.equipped.filter((id): id is NonNullable<typeof id> => id !== null);
  const owned = new Set(ownedAbilities(profile.talents));

  for (const [key, value] of Object.entries(stats)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return reject('impossible-talent-stats', `${key} is not a sensible number.`);
    }
  }

  if (equipped.length === 0 && stats.abilitiesUsed > 0) {
    return reject('ability-not-owned', 'No skills were equipped for that match.');
  }
  if (stats.powerStrikes > 0 && !owned.has('power-strike')) {
    return reject('ability-not-owned', 'Power Strike is not part of that build.');
  }
  if (stats.dashes > 0 && !owned.has('dash')) {
    return reject('ability-not-owned', 'Dash is not part of that build.');
  }
  if (stats.perfectGuards > 0 && !owned.has('perfect-guard')) {
    return reject('ability-not-owned', 'Perfect Guard is not part of that build.');
  }
  if (stats.crits > 0 && rankOf(profile.talents, 'critical-strike') === 0) {
    return reject('ability-not-owned', 'Critical Strike is not part of that build.');
  }
  if (stats.shieldSaves > 0 && loadout.effects.shieldCharges === 0) {
    return reject('ability-not-owned', 'Shield is not part of that build.');
  }
  if (stats.secondChances > 0 && loadout.effects.secondChances === 0) {
    return reject('ability-not-owned', 'Second Chance is not part of that build.');
  }

  const ultimatesEquipped = equipped.some((id) =>
    (['overload', 'slipstream', 'aegis', 'zenith', 'echo'] as const).includes(
      id as 'overload' | 'slipstream' | 'aegis' | 'zenith' | 'echo'
    )
  );
  if (stats.ultimates > 0 && !ultimatesEquipped) {
    return reject('ability-not-owned', 'No ultimate was equipped for that match.');
  }

  // Every cast bumps abilitiesUsed exactly once, and each specific counter is
  // a subset of the casts, so the parts can never outweigh the whole.
  const parts = stats.dashes + stats.ultimates + stats.powerStrikes + stats.perfectGuards;
  if (parts > stats.abilitiesUsed) {
    return reject('impossible-talent-stats', 'More skill effects than skills used.');
  }

  const slots = Math.max(1, abilitySlotsForLevel(level));
  const castCeiling = slots * Math.ceil(submission.seconds / LIMITS.minAbilityCooldown + 1);
  if (stats.abilitiesUsed > castCeiling) {
    return reject('impossible-ability-use', 'More skills used than cooldowns allow.');
  }

  if (stats.crits > submission.hits) {
    return reject('impossible-talent-stats', 'More criticals than returns played.');
  }
  if (stats.powerStrikes > submission.hits || stats.perfectGuards > submission.hits) {
    return reject('impossible-talent-stats', 'More skill returns than returns played.');
  }
  if (stats.bestDrive > Math.max(submission.bestRally, 0)) {
    return reject('impossible-talent-stats', 'That drive is longer than the longest rally.');
  }
  if (stats.secondChances > loadout.effects.secondChances) {
    return reject('impossible-talent-stats', 'More second chances than the build carries.');
  }

  // Charges in hand, plus everything the recharge timer could return.
  const shieldCeiling =
    loadout.effects.shieldCharges +
    (loadout.effects.shieldRecharge > 0
      ? Math.ceil(submission.seconds / loadout.effects.shieldRecharge) + 1
      : 0);
  if (stats.shieldSaves > shieldCeiling) {
    return reject('impossible-talent-stats', 'More shield saves than the build could recharge.');
  }

  return null;
}

/**
 * Validate a submission and produce the result the server will act on.
 */
export function validateMatch(
  submission: MatchSubmissionDto,
  context: ValidationContext
): ValidationResult {
  const notes: string[] = [];

  if (submission.playedAt > context.now + LIMITS.clockSkewMs) {
    return reject('future-timestamp', 'That match is dated in the future.');
  }

  const rules = resolveRules(submission, context.profile);
  if ('ok' in rules) return rules;

  const scoreProblem = checkScores(submission, rules);
  if (scoreProblem) return scoreProblem;

  const rallyProblem = checkRallyAndTime(submission, rules);
  if (rallyProblem) return rallyProblem;

  const talentProblem = checkTalentUse(submission, context.profile);
  if (talentProblem) return talentProblem;

  // The budget is the backstop the per-match checks cannot provide: each
  // submission can be individually plausible while the stream of them is not.
  if (rules.ranked && !submission.abandoned) {
    const projected = context.recentPlaySeconds + submission.seconds;
    if (projected > LIMITS.playBudgetSeconds) {
      return reject('play-budget-exceeded', 'That is more play than an hour holds.');
    }
  }

  const core = {
    mode: rules.mode,
    // Never the client's word: practice is unranked because the mode says so.
    ranked: rules.ranked,
    botId: rules.bot.id,
    botRank: rules.bot.rank,
    won: submission.won,
    scoreYou: submission.scoreYou,
    scoreBot: submission.scoreBot,
    bestRally: submission.bestRally,
    hits: submission.hits,
    seconds: Math.round(submission.seconds),
    livesLeft: submission.livesLeft,
    objective: rules.objective,
    challengeId: rules.challengeId,
    tournamentRound: rules.tournamentRound,
    tournamentTier: rules.tournamentTier,
    talent: { ...submission.talent },
    shutout: submission.shutout,
    comeback: submission.comeback,
    abandoned: submission.abandoned
  };

  // Recomputed, not read. A challenge is cleared because its objective was
  // met, not because a request said so.
  const met = objectiveMet(rules.objective, core);
  if (met !== submission.objectiveMet) {
    notes.push(`objectiveMet corrected to ${met}`);
  }

  const result: MatchResult = { ...core, objectiveMet: met };
  return { ok: true, rules, result, notes };
}
