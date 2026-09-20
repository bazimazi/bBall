import type { BotLevelId } from '../bots/types';

/**
 * A three-round cup against progressively stronger bots. The tier is chosen
 * from the player's level so the first cup is winnable on day one and the
 * last one still means something at level 20.
 */
export interface TournamentTier {
  readonly id: number;
  readonly name: string;
  readonly minLevel: number;
  readonly opponents: readonly BotLevelId[];
  /** XP for lifting the trophy, before any multipliers. */
  readonly trophyXp: number;
}

export interface TournamentRound {
  readonly name: string;
  readonly winScore: number;
}

export const TOURNAMENT_ROUNDS: readonly TournamentRound[] = [
  { name: 'Quarter-final', winScore: 3 },
  { name: 'Semi-final', winScore: 4 },
  { name: 'Final', winScore: 5 }
];

export const TOURNAMENT_TIERS: readonly TournamentTier[] = [
  {
    id: 0,
    name: 'Bronze Cup',
    minLevel: 1,
    opponents: ['rookie', 'amateur', 'pro'],
    trophyXp: 260
  },
  {
    id: 1,
    name: 'Silver Cup',
    minLevel: 5,
    opponents: ['amateur', 'pro', 'elite'],
    trophyXp: 380
  },
  {
    id: 2,
    name: 'Gold Cup',
    minLevel: 12,
    opponents: ['pro', 'elite', 'legend'],
    trophyXp: 520
  }
];

export interface TournamentRoundResult {
  readonly you: number;
  readonly bot: number;
  readonly won: boolean;
}

/** The saved state of a cup run. Lives inside the player profile. */
export interface TournamentSave {
  tier: number;
  /** Index of the round about to be played. */
  round: number;
  results: TournamentRoundResult[];
  startedAt: number;
  /** Set once the run is finished, win or lose. */
  finished: boolean;
  champion: boolean;
}

export function tierById(id: number): TournamentTier {
  return TOURNAMENT_TIERS[id] ?? TOURNAMENT_TIERS[0]!;
}

/** The highest tier the player has unlocked. */
export function tierForLevel(level: number): TournamentTier {
  let best = TOURNAMENT_TIERS[0]!;
  for (const tier of TOURNAMENT_TIERS) if (level >= tier.minLevel) best = tier;
  return best;
}

export function unlockedTiers(level: number): readonly TournamentTier[] {
  return TOURNAMENT_TIERS.filter((tier) => level >= tier.minLevel);
}

export function createTournament(tier: number, now = Date.now()): TournamentSave {
  return {
    tier: tierById(tier).id,
    round: 0,
    results: [],
    startedAt: now,
    finished: false,
    champion: false
  };
}

export function opponentFor(save: TournamentSave, round = save.round): BotLevelId {
  const tier = tierById(save.tier);
  return tier.opponents[Math.min(round, tier.opponents.length - 1)]!;
}

export function roundFor(round: number): TournamentRound {
  return TOURNAMENT_ROUNDS[Math.min(round, TOURNAMENT_ROUNDS.length - 1)]!;
}

export function isActive(save: TournamentSave | null): save is TournamentSave {
  return !!save && !save.finished;
}

/**
 * Record a played round. A loss ends the run immediately; three wins lifts
 * the trophy. Returns a new object - the caller owns when it is saved.
 */
export function advanceTournament(
  save: TournamentSave,
  result: TournamentRoundResult
): TournamentSave {
  const results = [...save.results.slice(0, save.round), result];
  const round = save.round + 1;
  const champion = result.won && round >= TOURNAMENT_ROUNDS.length;
  return {
    ...save,
    results,
    round: Math.min(round, TOURNAMENT_ROUNDS.length),
    finished: !result.won || champion,
    champion
  };
}
