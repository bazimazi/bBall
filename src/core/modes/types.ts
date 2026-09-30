import type { BotLevelId, BotProfile } from '../bots/types';
import type { BoonRanks } from '../run/boons';
import type { StarGoal } from './stars';

/**
 * A round obstacle in the court. Positions are fractions of the court -
 * `x` along its length, `y` across it - so a stage looks the same on every
 * screen shape.
 */
export interface BumperSpec {
  readonly x: number;
  readonly y: number;
  /** Radius, in field units. */
  readonly r: number;
  /** When set, the bumper circles (x, y) at `radius` field units. */
  readonly orbit?: { readonly radius: number; readonly speed: number; readonly phase: number };
}

/**
 * A linked pair of portals. A ball that falls into either mouth leaves by
 * the other at the same speed and on the same heading. Positions are
 * fractions of the court, like a bumper's; `r` is the mouth's radius in
 * field units.
 */
export interface PortalSpec {
  readonly a: { readonly x: number; readonly y: number };
  readonly b: { readonly x: number; readonly y: number };
  readonly r: number;
  /** The pair's colour. Two pairs on one court must never read as one. */
  readonly hue?: number;
}

/**
 * The court itself as a rule: what stands in it, and what pushes the ball
 * around. Every hazard is data, read by `game/arena.ts`, so a stage, a boss
 * or a daily challenge describes its court rather than coding one.
 */
export interface ArenaSpec {
  readonly bumpers?: readonly BumperSpec[];
  /**
   * Wind across the court, in field units per second squared. It changes
   * direction every `period` seconds (0 = never), with a warning first.
   */
  readonly wind?: { readonly strength: number; readonly period: number };
  /** A gravity well: pull at 150 units away, in units per second squared. */
  readonly well?: { readonly x: number; readonly y: number; readonly strength: number };
  /** Linked pairs of portals that carry the ball from one mouth to the other. */
  readonly portals?: readonly PortalSpec[];
  /**
   * Brick walls standing in front of each side's goal. A ball that hits a
   * brick breaks it and bounces back the way it came.
   */
  readonly bricks?: {
    readonly rows: number;
    /** Which walls stand: both, or only one side's. */
    readonly sides: 'both' | 'you' | 'bot';
    /** Bricks that take two hits. */
    readonly armored?: boolean;
    /** Rebuild the wall at every serve. */
    readonly regrow?: boolean;
  };
}

/** One step up in a boss's fight, reached when the player's score hits `at`. */
export interface BossPhase {
  readonly at: number;
  /** Shown as a banner when the phase starts. */
  readonly label: string;
  /** A sharper brain for the rest of the match. */
  readonly bot?: BotLevelId;
  readonly botPaddleScale?: number;
  /** Multiplier on every hazard's strength and speed. */
  readonly intensity?: number;
  /** The boss's returns bend late, like the player's Swerve. Units/s². */
  readonly swerve?: number;
}

/**
 * A boss: an opponent with a name, a court of its own, and phases that make
 * the second half of the fight a different fight from the first.
 */
export interface BossSpec {
  readonly id: string;
  readonly name: string;
  /** A few words under the name on the intro card. */
  readonly title: string;
  readonly hue: number;
  /** From the first serve. */
  readonly swerve?: number;
  readonly phases: readonly BossPhase[];
}
import type { TalentMatchStats } from '../talents/types';

export type ModeId =
  | 'quick'
  | 'endless'
  | 'challenge'
  | 'tournament'
  | 'practice'
  | 'campaign'
  | 'daily'
  | 'run'
  | 'versus';

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
  /** What stands in the court and what pushes the ball about. */
  arena?: ArenaSpec | undefined;
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
  /** Shown over the court instead of `label` when the player is on a touch screen. */
  readonly touchLabel?: string;
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
  /**
   * Two people, one screen: both paddles are human and neither has a build.
   * Never ranked, never recorded.
   */
  readonly versus?: boolean | undefined;
  /** A boss fight: intro card, phases and a court of its own. */
  readonly boss?: BossSpec | undefined;
  /** The Journey stage being played. */
  readonly stageId?: string | undefined;
  /** The day whose daily challenge this is. */
  readonly dailyKey?: string | undefined;
  /** The Gauntlet encounter being played, and the boons the run holds. */
  readonly runStage?: number | undefined;
  readonly boons?: BoonRanks | undefined;
  /** Star goals shown before the match and checked after it. */
  readonly goals?: readonly [StarGoal, StarGoal] | undefined;
  /** Shown as a banner on the first serve - a stage name, a daily's title. */
  readonly intro?: { readonly title: string; readonly sub: string } | undefined;
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
  readonly stageId?: string | undefined;
  readonly dailyKey?: string | undefined;
  readonly runStage?: number | undefined;
  /** The boss this match was against, if it was one. */
  readonly bossId?: string | undefined;
  /**
   * The player's own calendar day when the match ended. Quests belong to the
   * player's day, not the server's; the server accepts it within a day of its
   * own and falls back to its own date otherwise.
   */
  readonly day?: string | undefined;
  /** What the player's build did this match. Drives talent statistics. */
  readonly talent: TalentMatchStats;
  /** Returns whipped off the paddle's end while it moved that way. */
  readonly flicks: number;
  /** Won without conceding a point. */
  readonly shutout: boolean;
  /** Won after trailing by two or more. */
  readonly comeback: boolean;
  /** True when the player quit before the match finished. */
  readonly abandoned: boolean;
}
