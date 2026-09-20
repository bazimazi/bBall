import type { BotLevelId } from '../bots/types';
import type { Equipped } from '../cosmetics/catalog';
import type { TalentSave } from '../talents/types';
import type { TournamentSave } from '../tournament/bracket';

/** The six simple avatars. Each one is drawn as an inline SVG glyph. */
export const AVATARS = ['orb', 'ring', 'spark', 'wedge', 'grid', 'bolt'] as const;
export type AvatarId = (typeof AVATARS)[number];

export interface LifetimeStats {
  matches: number;
  wins: number;
  losses: number;
  pointsWon: number;
  pointsLost: number;
  /** Returns the player has hit, all time. */
  rallyHits: number;
  bestRally: number;
  currentStreak: number;
  bestStreak: number;
  playSeconds: number;
  shutouts: number;
  comebacks: number;
  endlessRuns: number;
  endlessBest: number;
  challengesCleared: number;
  cupsPlayed: number;
  cupsWon: number;
  bestCupRound: number;
  /** Highest cup tier won, or -1 when the player has never won one. */
  bestCupTier: number;
  /** Ranked wins per bot level. */
  winsByBot: Partial<Record<BotLevelId, number>>;
}

export interface ChallengeRecord {
  attempts: number;
  cleared: boolean;
  bestRally: number;
  clearedAt: number;
}

/** Guards against farming the same match over and over in one sitting. */
export interface DailyCounter {
  day: string;
  matches: number;
}

export interface PlayerProfile {
  /** Stable id, handy if a leaderboard ever shows up. */
  id: string;
  name: string;
  avatar: AvatarId;
  createdAt: number;
  updatedAt: number;
  /** True once the player has seen (or skipped) the first-run card. */
  onboarded: boolean;

  xp: number;
  stats: LifetimeStats;

  /**
   * The player's build: talent ranks, unspent points and equipped actives.
   * Talent points come from levelling, so this moves with {@link xp} and
   * never with the difficulty of the match being played.
   */
  talents: TalentSave;

  /** Achievement id -> unlock timestamp. */
  achievements: Record<string, number>;
  /** Cosmetic ids the player owns, including the always-available ones. */
  unlocks: string[];
  equipped: Equipped;

  challenges: Record<string, ChallengeRecord>;
  tournament: TournamentSave | null;
  /** Last cup the player finished, kept so the bracket screen can show it. */
  lastTournament: TournamentSave | null;

  daily: DailyCounter;

  preferences: {
    /** Last bot picked in Quick Match, so the choice sticks. */
    lastBot: BotLevelId;
    lastPracticeBot: BotLevelId;
  };
}
