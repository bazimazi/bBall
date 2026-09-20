import type { BotLevelId, BotProfile } from '../bots/types';
import type { TalentMatchStats } from '../talents/types';

export type ModeId = 'quick' | 'endless' | 'challenge' | 'tournament' | 'practice';

/**
 * Everything a mode is allowed to change about a match. The simulation reads
 * these instead of hard-coded constants, so a new mode never means new
 * branches inside the physics.
 */
export interface MatchModifiers {
  /** Multiplies the player's paddle length. Always 1 for ranked ladders. */
  playerPaddleScale: number;
  botPaddleScale: number;
  serveSpeedScale: number;
  speedPerHitScale: number;
  maxSpeedScale: number;
  /** Fraction of the player's paddle length lost on every return. */
  shrinkPerHit: number;
  /** Scoreboard the match opens on - used by the comeback challenge. */
  startScore: { you: number; bot: number };
}

export const NEUTRAL_MODIFIERS: MatchModifiers = {
  playerPaddleScale: 1,
  botPaddleScale: 1,
  serveSpeedScale: 1,
  speedPerHitScale: 1,
  maxSpeedScale: 1,
  shrinkPerHit: 0,
  startScore: { you: 0, bot: 0 }
};

export type ObjectiveId = 'win' | 'rally' | 'shutout' | 'quick-win' | 'survive';

export interface MatchObjective {
  readonly id: ObjectiveId;
  /** Shown before the match and on the result card. Keep it to a few words. */
  readonly label: string;
  readonly value: number;
}

/** A fully resolved match setup. The engine takes one of these and plays it. */
export interface MatchRules {
  readonly mode: ModeId;
  readonly bot: BotProfile;
  /** Points needed to win. 0 means the match has no score-based end. */
  readonly winScore: number;
  /** Misses allowed before the run ends. 0 means lives are not used. */
  readonly lives: number;
  readonly modifiers: MatchModifiers;
  /** Ranked matches earn XP and move lifetime stats. Practice does not. */
  readonly ranked: boolean;
  /** Short title for the result card, e.g. "Semi-final". */
  readonly label: string;
  readonly objective: MatchObjective | null;
  readonly challengeId?: string | undefined;
  readonly tournamentRound?: number | undefined;
  readonly tournamentTier?: number | undefined;
}

/** What a finished match reports back. Pure data - no engine references. */
export interface MatchResult {
  readonly mode: ModeId;
  readonly ranked: boolean;
  readonly botId: BotLevelId;
  readonly botRank: number;
  readonly won: boolean;
  readonly scoreYou: number;
  readonly scoreBot: number;
  readonly bestRally: number;
  /** Returns the player made across the whole match. */
  readonly hits: number;
  readonly seconds: number;
  readonly livesLeft: number;
  readonly objectiveMet: boolean;
  readonly objective: MatchObjective | null;
  readonly challengeId?: string | undefined;
  readonly tournamentRound?: number | undefined;
  readonly tournamentTier?: number | undefined;
  /** What the player's build did this match. Drives talent statistics. */
  readonly talent: TalentMatchStats;
  /** Won without conceding a point. */
  readonly shutout: boolean;
  /** Won after trailing by two or more. */
  readonly comeback: boolean;
  /** True when the player quit before the match finished. */
  readonly abandoned: boolean;
}
