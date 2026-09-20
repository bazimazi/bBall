import { CHALLENGES } from '../modes/challenges';
import type { MatchResult } from '../modes/types';
import type { PlayerProfile } from '../profile/types';

export interface AchievementContext {
  /** The profile *after* the match's stats have been folded in. */
  readonly profile: PlayerProfile;
  readonly level: number;
  /** The match that just finished, when there was one. */
  readonly result: MatchResult | null;
}

export type AchievementGroup = 'play' | 'rally' | 'skill' | 'cup' | 'level';

export interface Achievement {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly group: AchievementGroup;
  /** Bonus XP granted the moment it unlocks. */
  readonly xp: number;
  check(context: AchievementContext): boolean;
  /** Progress for the UI, 0..1. Optional; defaults to unlocked or not. */
  progress?(context: AchievementContext): number;
}

const ratio = (value: number, target: number): number =>
  target <= 0 ? 1 : Math.max(0, Math.min(1, value / target));

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'first-win',
    name: 'On the Board',
    description: 'Win your first match',
    group: 'play',
    xp: 60,
    check: ({ profile }) => profile.stats.wins >= 1,
    progress: ({ profile }) => ratio(profile.stats.wins, 1)
  },
  {
    id: 'centurion',
    name: 'Centurion',
    description: 'Play 100 matches',
    group: 'play',
    xp: 250,
    check: ({ profile }) => profile.stats.matches >= 100,
    progress: ({ profile }) => ratio(profile.stats.matches, 100)
  },
  {
    id: 'workhorse',
    name: 'Workhorse',
    description: 'Hit 1000 returns',
    group: 'play',
    xp: 200,
    check: ({ profile }) => profile.stats.rallyHits >= 1000,
    progress: ({ profile }) => ratio(profile.stats.rallyHits, 1000)
  },
  {
    id: 'rally-20',
    name: 'Rally Builder',
    description: 'Reach a 20-hit rally',
    group: 'rally',
    xp: 80,
    check: ({ profile }) => profile.stats.bestRally >= 20,
    progress: ({ profile }) => ratio(profile.stats.bestRally, 20)
  },
  {
    id: 'rally-40',
    name: 'Unbroken',
    description: 'Reach a 40-hit rally',
    group: 'rally',
    xp: 150,
    check: ({ profile }) => profile.stats.bestRally >= 40,
    progress: ({ profile }) => ratio(profile.stats.bestRally, 40)
  },
  {
    id: 'endless-30',
    name: 'Still Standing',
    description: 'Survive a 30 rally in Endless',
    group: 'rally',
    xp: 100,
    check: ({ profile }) => profile.stats.endlessBest >= 30,
    progress: ({ profile }) => ratio(profile.stats.endlessBest, 30)
  },
  {
    id: 'endless-60',
    name: 'Metronome',
    description: 'Survive a 60 rally in Endless',
    group: 'rally',
    xp: 200,
    check: ({ profile }) => profile.stats.endlessBest >= 60,
    progress: ({ profile }) => ratio(profile.stats.endlessBest, 60)
  },
  {
    id: 'endless-100',
    name: 'Perpetual',
    description: 'Survive a 100 rally in Endless',
    group: 'rally',
    xp: 350,
    check: ({ profile }) => profile.stats.endlessBest >= 100,
    progress: ({ profile }) => ratio(profile.stats.endlessBest, 100)
  },
  {
    id: 'streak-3',
    name: 'Hat-trick',
    description: 'Win 3 matches in a row',
    group: 'skill',
    xp: 100,
    check: ({ profile }) => profile.stats.bestStreak >= 3,
    progress: ({ profile }) => ratio(profile.stats.bestStreak, 3)
  },
  {
    id: 'streak-7',
    name: 'Untouchable',
    description: 'Win 7 matches in a row',
    group: 'skill',
    xp: 200,
    check: ({ profile }) => profile.stats.bestStreak >= 7,
    progress: ({ profile }) => ratio(profile.stats.bestStreak, 7)
  },
  {
    id: 'shutout',
    name: 'Clean Sheet',
    description: 'Win a match without conceding',
    group: 'skill',
    xp: 100,
    check: ({ profile }) => profile.stats.shutouts >= 1
  },
  {
    id: 'comeback-kid',
    name: 'Comeback Kid',
    description: 'Win after trailing by two',
    group: 'skill',
    xp: 120,
    check: ({ profile }) => profile.stats.comebacks >= 1
  },
  {
    id: 'giant-killer',
    name: 'Giant Killer',
    description: 'Beat the Elite bot',
    group: 'skill',
    xp: 150,
    check: ({ profile }) => (profile.stats.winsByBot.elite ?? 0) >= 1
  },
  {
    id: 'legend-slayer',
    name: 'Legend Slayer',
    description: 'Beat the Legend bot',
    group: 'skill',
    xp: 300,
    check: ({ profile }) => (profile.stats.winsByBot.legend ?? 0) >= 1
  },
  {
    id: 'challenger',
    name: 'Challenger',
    description: 'Clear 3 challenges',
    group: 'skill',
    xp: 150,
    check: ({ profile }) => profile.stats.challengesCleared >= 3,
    progress: ({ profile }) => ratio(profile.stats.challengesCleared, 3)
  },
  {
    id: 'challenge-master',
    name: 'Challenge Master',
    description: 'Clear every challenge',
    group: 'skill',
    xp: 300,
    check: ({ profile }) => profile.stats.challengesCleared >= CHALLENGES.length,
    progress: ({ profile }) => ratio(profile.stats.challengesCleared, CHALLENGES.length)
  },
  {
    id: 'cup-finalist',
    name: 'Finalist',
    description: 'Reach a cup final',
    group: 'cup',
    xp: 120,
    check: ({ profile }) => profile.stats.bestCupRound >= 3
  },
  {
    id: 'cup-champion',
    name: 'Champion',
    description: 'Win a tournament',
    group: 'cup',
    xp: 250,
    check: ({ profile }) => profile.stats.cupsWon >= 1
  },
  {
    id: 'cup-gold',
    name: 'Gold Standard',
    description: 'Win the Gold Cup',
    group: 'cup',
    xp: 400,
    check: ({ profile }) => profile.stats.bestCupTier >= 2
  },
  {
    id: 'level-5',
    name: 'Getting Warm',
    description: 'Reach level 5',
    group: 'level',
    xp: 0,
    check: ({ level }) => level >= 5,
    progress: ({ level }) => ratio(level, 5)
  },
  {
    id: 'level-10',
    name: 'Regular',
    description: 'Reach level 10',
    group: 'level',
    xp: 0,
    check: ({ level }) => level >= 10,
    progress: ({ level }) => ratio(level, 10)
  },
  {
    id: 'level-20',
    name: 'Veteran',
    description: 'Reach level 20',
    group: 'level',
    xp: 0,
    check: ({ level }) => level >= 20,
    progress: ({ level }) => ratio(level, 20)
  }
];

const BY_ID = new Map(ACHIEVEMENTS.map((item) => [item.id, item]));

export function achievementById(id: string): Achievement | undefined {
  return BY_ID.get(id);
}

export function isAchievementId(id: string): boolean {
  return BY_ID.has(id);
}
