import { starCount } from '../modes/stars';
import { MASTERY_TRACKS } from '../progression/mastery';
import { JOURNEY, LEGACY_STAGES, totalStars, worldCleared } from '../campaign/journey';
import { LEGACY_BOSSES, BOSSES } from '../modes/bosses';
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

export type AchievementGroup =
  'play' | 'rally' | 'skill' | 'cup' | 'level' | 'journey' | 'daily' | 'gauntlet';

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

/** One achievement per Journey world, for beating its boss. */
function worldAchievement(world: number, id: string, name: string, xp: number): Achievement {
  const def = JOURNEY.find((item) => item.id === world)!;
  return {
    id,
    name,
    description: `Clear ${def.name}`,
    group: 'journey',
    xp,
    check: ({ profile }) => worldCleared(profile.progress.journey, def)
  };
}

const bossesBeaten = (profile: AchievementContext['profile']): number =>
  Object.values(profile.progress.bosses).filter((wins) => wins > 0).length;

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
  worldAchievement(1, 'journey-w1', 'Daybreak', 120),
  worldAchievement(2, 'journey-w2', 'Pinball Wizard', 160),
  worldAchievement(3, 'journey-w3', 'Storm Chaser', 200),
  worldAchievement(4, 'journey-w4', 'Forged', 240),
  worldAchievement(5, 'journey-w5', 'Apex Predator', 400),
  {
    id: 'journey-stars-45',
    name: 'Stargazer',
    description: 'Earn 45 Journey stars',
    group: 'journey',
    xp: 200,
    check: ({ profile }) => totalStars(profile.progress.journey) >= 45,
    progress: ({ profile }) => ratio(totalStars(profile.progress.journey), 45)
  },
  {
    id: 'journey-stars-all',
    name: 'Constellation',
    description: 'Earn every star in the original five worlds',
    group: 'journey',
    xp: 500,
    check: ({ profile }) =>
      LEGACY_STAGES.every((stage) => profile.progress.journey[stage.id] === 7),
    progress: ({ profile }) =>
      ratio(
        LEGACY_STAGES.reduce(
          (sum, stage) => sum + starCount(profile.progress.journey[stage.id] ?? 0),
          0
        ),
        90
      )
  },
  {
    id: 'boss-4',
    name: 'Boss Hunter',
    description: 'Beat four different bosses',
    group: 'journey',
    xp: 200,
    check: ({ profile }) => bossesBeaten(profile) >= 4,
    progress: ({ profile }) => ratio(bossesBeaten(profile), 4)
  },
  {
    id: 'boss-all',
    name: 'Nemesis',
    description: 'Beat every boss',
    group: 'journey',
    xp: 350,
    check: ({ profile }) => LEGACY_BOSSES.every((b) => !!profile.progress.bosses[b.spec.id]),
    progress: ({ profile }) =>
      ratio(
        LEGACY_BOSSES.filter((b) => !!profile.progress.bosses[b.spec.id]).length,
        LEGACY_BOSSES.length
      )
  },
  {
    id: 'flick-100',
    name: 'Wristy',
    description: 'Land 100 flicks',
    group: 'skill',
    xp: 120,
    check: ({ profile }) => profile.progress.flicks >= 100,
    progress: ({ profile }) => ratio(profile.progress.flicks, 100)
  },
  {
    id: 'daily-first',
    name: 'Daily Bread',
    description: 'Clear a daily challenge',
    group: 'daily',
    xp: 60,
    check: ({ profile }) => profile.progress.daily.clears >= 1
  },
  {
    id: 'daily-7',
    name: 'Regular Hours',
    description: 'Reach a 7-day daily streak',
    group: 'daily',
    xp: 200,
    check: ({ profile }) => profile.progress.daily.bestStreak >= 7,
    progress: ({ profile }) => ratio(profile.progress.daily.bestStreak, 7)
  },
  {
    id: 'daily-30',
    name: 'Devotion',
    description: 'Reach a 30-day daily streak',
    group: 'daily',
    xp: 500,
    check: ({ profile }) => profile.progress.daily.bestStreak >= 30,
    progress: ({ profile }) => ratio(profile.progress.daily.bestStreak, 30)
  },
  {
    id: 'quest-sweep',
    name: 'Full Set',
    description: "Finish all three of a day's quests",
    group: 'daily',
    xp: 80,
    check: ({ profile }) => profile.progress.questSweeps >= 1
  },
  {
    id: 'run-clear',
    name: 'Gauntlet Runner',
    description: 'Clear the Gauntlet',
    group: 'gauntlet',
    xp: 300,
    check: ({ profile }) => profile.progress.runRecords.clears >= 1
  },
  {
    id: 'run-pressure-3',
    name: 'Under Pressure',
    description: 'Clear the Gauntlet at Pressure 3',
    group: 'gauntlet',
    xp: 400,
    check: ({ profile }) => profile.progress.runRecords.bestPressure >= 3,
    progress: ({ profile }) => ratio(profile.progress.runRecords.bestPressure + 1, 4)
  },
  {
    id: 'run-pressure-5',
    name: 'Diamond',
    description: 'Clear the Gauntlet at Pressure 5',
    group: 'gauntlet',
    xp: 600,
    check: ({ profile }) => profile.progress.runRecords.bestPressure >= 5,
    progress: ({ profile }) => ratio(profile.progress.runRecords.bestPressure + 1, 6)
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
  },
  ...JOURNEY.slice(5).map((w) => worldAchievement(w.id, `journey-w${w.id}`, w.name, 200)),
  {
    id: 'journey-expansion-stars',
    name: 'The Atlas',
    description: 'Earn all 1,890 Story Journey stars',
    group: 'journey',
    xp: 1000,
    check: ({ profile }) => totalStars(profile.progress.journey) >= 1890,
    progress: ({ profile }) => ratio(totalStars(profile.progress.journey), 1890)
  },
  {
    id: 'boss-expansion-all',
    name: 'Council Breaker',
    description: 'Defeat all 25 bosses',
    group: 'journey',
    xp: 800,
    check: ({ profile }) => BOSSES.every((b) => !!profile.progress.bosses[b.spec.id]),
    progress: ({ profile }) => ratio(bossesBeaten(profile), 25)
  },
  ...[1, 10, 100, 1000].map((n) => ({
    id: `frontier-${n}`,
    name: `Frontier ${n}`,
    description: `Complete ${n} Frontier sectors`,
    group: 'journey' as const,
    xp: 250,
    check: ({ profile }: AchievementContext) => (profile.progress.journey['frontier-v2'] ?? 0) >= n,
    progress: ({ profile }: AchievementContext) =>
      ratio(profile.progress.journey['frontier-v2'] ?? 0, n)
  })),
  ...[50, 100, 250, 500, 1000].map((n) => ({
    id: `mastery-${n}`,
    name: `Mastery ${n}`,
    description: `Reach level ${n} with bounded combat power`,
    group: 'level' as const,
    xp: 0,
    check: ({ level }: AchievementContext) => level >= n,
    progress: ({ level }: AchievementContext) => ratio(level, n)
  })),
  ...[10, 30, 50].map((n) => ({
    id: `pressure-${n}`,
    name: `Pressure ${n}`,
    description: `Clear an act or run at Pressure ${n}`,
    group: 'gauntlet' as const,
    xp: 500,
    check: ({ profile }: AchievementContext) => profile.progress.runRecords.bestPressure >= n,
    progress: ({ profile }: AchievementContext) =>
      ratio(Math.max(0, profile.progress.runRecords.bestPressure), n)
  })),
  ...MASTERY_TRACKS.map((t) => ({
    id: `track-${t.id}`,
    name: `${t.name} adept`,
    description: `Earn 100 ${t.name.toLowerCase()} marks against Pro or harder opponents`,
    group: 'play' as const,
    xp: 200,
    check: ({ profile }: AchievementContext) => (profile.progress.mastery[t.id] ?? 0) >= 100,
    progress: ({ profile }: AchievementContext) => ratio(profile.progress.mastery[t.id] ?? 0, 100)
  }))
];

const BY_ID = new Map(ACHIEVEMENTS.map((item) => [item.id, item]));

export function achievementById(id: string): Achievement | undefined {
  return BY_ID.get(id);
}

export function isAchievementId(id: string): boolean {
  return BY_ID.has(id);
}
