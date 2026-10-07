import { ARENA_PRESETS, arenaPreset } from '../../../src/core/modes/arenas';
import { masteryTags } from '../../../src/core/progression/mastery';
import { dominantBranch } from '../../../src/core/talents/save';
import { masterCardLoadout } from '../../../src/core/talents/builds';
import { PERSONALITIES } from '../../../src/core/modes/recipes';
import { dailyIdentity } from '../../../src/core/daily/daily';
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
import { stageById, stageOpen } from '../../../src/core/campaign/journey';
import { daysBetween, isDayKey } from '../../../src/core/daily/daily';
import { dayKey } from '../../../src/core/progression/xp';
import { isRunActive } from '../../../src/core/run/run';
import { challengeById } from '../../../src/core/modes/challenges';
import { isModeId } from '../../../src/core/modes/catalog';
import {
  campaignRules,
  challengeRules,
  dailyRules,
  endlessRules,
  objectiveMet,
  practiceRules,
  quickMatchRules,
  runRules,
  tournamentRules
} from '../../../src/core/modes/rules';
import type { MatchResult, MatchRules } from '../../../src/core/modes/types';
import type { PlayerProfile } from '../../../src/core/profile/types';
import { levelOf } from '../../../src/core/progression/levels';
import { canCrit, canSave, resolveLoadout, withBoons } from '../../../src/core/talents/effects';
import { abilityById } from '../../../src/core/talents/abilities';
import { ownedAbilities } from '../../../src/core/talents/save';
import { BALANCE } from '../../../src/core/balance/config';
import { roundsFor } from '../../../src/core/tournament/bracket';
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
  /**
   * The shortest gap between two uses of one skill, whatever the build.
   * Read from the balance file's recast lockout rather than restated, so
   * the two can never drift apart.
   */
  minAbilityCooldown: BALANCE.talents.minRecast,
  /** Ranked matches accepted in one hour, before the budget check bites. */
  playBudgetWindowMs: 60 * 60 * 1000,
  /** Seconds of play accepted per hour of wall clock. */
  playBudgetSeconds: 90 * 60,
  /** How far into the future a client clock may claim a match happened. */
  clockSkewMs: 10 * 60 * 1000
} as const;

export type RejectionCode =
  | 'invalid-match-options'
  | 'locked-contract'
  | 'invalid-court-events'
  | 'unknown-mode'
  | 'unknown-bot'
  | 'bot-mode-mismatch'
  | 'unknown-challenge'
  | 'no-active-tournament'
  | 'tournament-mismatch'
  | 'unknown-stage'
  | 'stage-locked'
  | 'unknown-daily'
  | 'daily-expired'
  | 'no-active-run'
  | 'run-mismatch'
  | 'unranked-mode'
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
  profile: PlayerProfile,
  now: number
): MatchRules | Rejection {
  if (!isModeId(submission.mode)) return reject('unknown-mode', 'That game mode does not exist.');
  if (!isBotLevelId(submission.botId))
    return reject('unknown-bot', 'That opponent does not exist.');

  if (
    submission.options &&
    ((submission.options.arenaId && !arenaPreset(submission.options.arenaId)) ||
      (submission.options.personality && !PERSONALITIES.includes(submission.options.personality)) ||
      (submission.options.contract &&
        (submission.mode !== 'quick' || submission.botId !== 'legend')) ||
      !['quick', 'practice', 'endless', 'versus'].includes(submission.mode))
  ) {
    return reject('invalid-match-options', 'Those options are not available for this encounter.');
  }
  if (submission.mode !== 'versus' && (submission.options?.mirror || submission.options?.duel))
    return reject('invalid-match-options', 'Couch modifiers are only available in Versus.');
  if (
    submission.mode !== 'practice' &&
    (submission.options?.bossId || submission.options?.bossPhase !== undefined)
  )
    return reject('invalid-match-options', 'Boss phase drills are only available in Practice.');
  if (
    (submission.options?.waves && submission.mode !== 'endless') ||
    (submission.options?.series && !['quick', 'versus'].includes(submission.mode))
  )
    return reject('invalid-match-options', 'Those formats are only available in their own mode.');
  switch (submission.mode) {
    case 'quick':
    case 'practice': {
      // The wall is the endless sparring partner and is not on the ladder.
      const selectable = SELECTABLE_BOTS.some((bot) => bot.id === submission.botId);
      if (!selectable) {
        return reject('bot-mode-mismatch', 'That opponent cannot be picked for this mode.');
      }
      return submission.mode === 'quick'
        ? quickMatchRules(submission.botId, submission.options)
        : practiceRules(submission.botId, 'normal', submission.options);
    }

    case 'endless': {
      if (submission.botId !== 'wall') {
        return reject('bot-mode-mismatch', 'Endless is only played against the wall.');
      }
      return endlessRules(submission.options);
    }

    case 'challenge': {
      const challenge = submission.challengeId ? challengeById(submission.challengeId) : undefined;
      if (
        challenge &&
        challenge.id.startsWith('contract-') &&
        Number(challenge.id.slice(9)) > (profile.progress.contracts ?? 0) + 1
      )
        return reject('locked-contract', 'Complete the preceding contract first.');
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
      if (save.round >= roundsFor(save).length) {
        return reject('tournament-mismatch', 'That cup is already over.');
      }
      return rules;
    }

    case 'campaign': {
      const stage = submission.stageId ? stageById(submission.stageId) : undefined;
      if (!stage) return reject('unknown-stage', 'That stage does not exist.');
      // A stage is opened by the stars and clears the server holds, not by a
      // client that says it got there.
      if (!stageOpen(profile.progress.journey, stage)) {
        return reject('stage-locked', 'That stage is not open yet.');
      }
      const rules = campaignRules(stage);
      if (rules.bot.id !== submission.botId) {
        return reject('bot-mode-mismatch', 'That stage is not played against that opponent.');
      }
      return rules;
    }

    case 'daily': {
      const key = submission.dailyKey;
      if (!key || !isDayKey(dailyIdentity(key).day))
        return reject('unknown-daily', 'That daily does not exist.');
      // A day either side of the server's own covers every time zone; a
      // challenge from last week does not get a second life.
      const gap = daysBetween(dayKey(new Date(now)), dailyIdentity(key).day);
      if (
        !Number.isFinite(gap) ||
        (dailyIdentity(key).kind === 'archive' ? gap > 0 || gap < -30 : Math.abs(gap) > 1)
      ) {
        return reject('daily-expired', 'That daily challenge has closed.');
      }
      const rules = dailyRules(key);
      if (rules.bot.id !== submission.botId) {
        return reject('bot-mode-mismatch', 'That daily is not played against that opponent.');
      }
      return rules;
    }

    case 'run': {
      const run = profile.progress.run;
      if (!isRunActive(run)) return reject('no-active-run', 'You have no run in progress.');
      if (run.offer) return reject('run-mismatch', 'A boon is waiting to be picked first.');
      if (run.version === 2 && run.attempt?.stage !== run.stage)
        return reject('run-mismatch', 'Commit the encounter before playing.');
      if (run.version === 2 && submission.runStage !== run.stage)
        return reject('run-mismatch', 'The committed encounter depth is required.');
      if (submission.runStage !== undefined && submission.runStage !== run.stage) {
        return reject('run-mismatch', 'That match of the run has already been played.');
      }
      // The encounter is re-derived from the run's seed, so the opponent,
      // the court and the boons in play are the server's, not the report's.
      const rules = runRules(run);
      if (rules.bot.id !== submission.botId) {
        return reject('run-mismatch', 'That is not your next opponent.');
      }
      return rules;
    }

    case 'versus':
      return reject('unranked-mode', 'Two-player matches are not recorded.');
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
  if (
    submission.waves !== undefined &&
    (!rules.options?.waves || submission.waves > Math.floor(hits / 12))
  )
    return reject('impossible-rally', 'Wave depth exceeds the returns played.');

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
function checkTalentUse(
  submission: MatchSubmissionDto,
  profile: PlayerProfile,
  rules: MatchRules
): Rejection | null {
  const stats = submission.talent;
  const level = levelOf(profile.xp);
  // A Gauntlet match is played with the run's boons folded in - a Guard Wall
  // save is honest on a build that owns no Shield.
  const base = resolveLoadout(profile.talents, level);
  const loadout = rules.fixedBuild
    ? masterCardLoadout()
    : rules.boons
      ? withBoons(base, rules.boons)
      : base;
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
  // Overload's returns are critical by definition, and Hot Hand and Blitz
  // can make one too - "owns Critical Strike" used to be the whole test, and
  // it rejected every honest Overload match.
  if (stats.crits > 0 && !canCrit(loadout.effects)) {
    return reject('ability-not-owned', 'Nothing in that build can land a critical return.');
  }
  // Aegis and Adrenaline save balls as well as Shield does, and all three
  // are reported as one count.
  const aegisEquipped = equipped.includes('aegis');
  if (stats.shieldSaves > 0 && !canSave(loadout.effects) && !aegisEquipped) {
    return reject('ability-not-owned', 'Nothing in that build can save a ball.');
  }
  if (stats.secondChances > 0 && loadout.effects.secondChances === 0) {
    return reject('ability-not-owned', 'Second Chance is not part of that build.');
  }

  const ultimatesEquipped = equipped.some((id) => abilityById(id)?.ultimate === true);
  if (stats.ultimates > 0 && !ultimatesEquipped) {
    return reject('ability-not-owned', 'No ultimate was equipped for that match.');
  }

  // Every cast bumps abilitiesUsed exactly once, and each specific counter is
  // a subset of the casts, so the parts can never outweigh the whole. Power
  // Strike is the one skill whose single cast may charge two returns.
  const strikeCasts = Math.ceil(stats.powerStrikes / Math.max(1, loadout.effects.powerStrikeHits));
  const parts = stats.dashes + stats.ultimates + strikeCasts + stats.perfectGuards;
  if (parts > stats.abilitiesUsed) {
    return reject('impossible-talent-stats', 'More skill effects than skills used.');
  }

  const slots = Math.max(1, loadout.slots);
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
  // A drive runs across every point won in a row, so it can outlast any one
  // rally - it is bounded by the returns played, not by the longest rally.
  if (stats.bestDrive > Math.max(submission.hits, 0)) {
    return reject('impossible-talent-stats', 'That drive is longer than the returns played.');
  }
  if (stats.secondChances > loadout.effects.secondChances) {
    return reject('impossible-talent-stats', 'More second chances than the build carries.');
  }

  // Charges in hand, plus everything the recharge timer could return - and
  // every save Aegis and Adrenaline could have added on top.
  const { effects } = loadout;
  const shieldCeiling =
    (effects.shieldCharges > 0
      ? effects.shieldCharges +
        Math.ceil(
          (submission.seconds + submission.hits * effects.shieldTempo) / effects.shieldRecharge
        ) +
        1
      : 0) +
    (aegisEquipped
      ? effects.aegisSaves * (Math.ceil(submission.seconds / effects.aegisCooldown) + 1)
      : 0) +
    (effects.adrenalineEvery > 0 ? Math.floor(submission.hits / effects.adrenalineEvery) : 0);
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

  const rules = resolveRules(submission, context.profile, context.now);
  if ('ok' in rules) return rules;

  if ((submission.flicks ?? 0) > submission.hits) {
    return reject('impossible-rally', 'More flicks than returns played.');
  }

  const scoreProblem = checkScores(submission, rules);
  if (scoreProblem) return scoreProblem;

  const rallyProblem = checkRallyAndTime(submission, rules);
  if (rallyProblem) return rallyProblem;

  const talentProblem = checkTalentUse(submission, context.profile, rules);
  if (talentProblem) return talentProblem;

  // The budget is the backstop the per-match checks cannot provide: each
  // submission can be individually plausible while the stream of them is not.
  if (rules.ranked && !submission.abandoned) {
    const projected = context.recentPlaySeconds + submission.seconds;
    if (projected > LIMITS.playBudgetSeconds) {
      return reject('play-budget-exceeded', 'That is more play than an hour holds.');
    }
  }

  const court = submission.court ?? { banks: 0, switches: 0, breaks: 0, gates: 0 };
  const arenas = [
    ...(rules.options?.waves ? ARENA_PRESETS.map((a) => a.arena) : []),
    rules.modifiers.arena,
    ...(rules.boss?.phases.map((p) => p.arena) ?? [])
  ];
  if (
    (!arenas.some((a) => a?.rails?.length) && court.banks > 0) ||
    (!arenas.some((a) => a?.switches?.length) && court.switches > 0) ||
    (!arenas.some((a) => a?.gates?.length) && court.gates > 0) ||
    (!arenas.some((a) => a?.rails?.some((r) => r.hp) || a?.bricks) && court.breaks > 0) ||
    Object.values(court).some((n) => n > submission.seconds * 100 + 100)
  ) {
    return reject('invalid-court-events', 'Those court contacts cannot occur in this encounter.');
  }
  const core = {
    mastery: masteryTags(
      rules,
      rules.fixedBuild
        ? (masterCardLoadout().branch ?? null)
        : dominantBranch(context.profile.talents)
    ),
    mode: rules.mode,
    ...(submission.waves !== undefined ? { waves: submission.waves } : {}),
    ...(rules.options ? { options: { ...rules.options } } : {}),
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
    ...(rules.tournamentFormat ? { tournamentFormat: rules.tournamentFormat } : {}),
    stageId: rules.stageId,
    dailyKey: rules.dailyKey,
    runStage: rules.runStage,
    bossId: rules.boss?.id,
    flicks: submission.flicks ?? 0,
    court: { ...court },
    // The player's own day keeps their quests on their calendar; a day
    // further out than time zones explain is ignored for the server's own.
    day:
      submission.day && Math.abs(daysBetween(dayKey(new Date(context.now)), submission.day)) <= 1
        ? submission.day
        : undefined,
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
