import { DEFAULT_BOT } from '../bots/levels';
import { DEFAULT_EQUIPPED, DEFAULT_UNLOCKS } from '../cosmetics/catalog';
import { dayKey } from '../progression/xp';
import { AVATARS, type AvatarId, type LifetimeStats, type PlayerProfile } from './types';

export const NAME_MAX = 14;
export const DEFAULT_NAME = 'Player';

export function createStats(): LifetimeStats {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
    pointsWon: 0,
    pointsLost: 0,
    rallyHits: 0,
    bestRally: 0,
    currentStreak: 0,
    bestStreak: 0,
    playSeconds: 0,
    shutouts: 0,
    comebacks: 0,
    endlessRuns: 0,
    endlessBest: 0,
    challengesCleared: 0,
    cupsPlayed: 0,
    cupsWon: 0,
    bestCupRound: 0,
    bestCupTier: -1,
    winsByBot: {}
  };
}

function newId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `p_${Date.now().toString(36)}${random}`;
}

export function randomAvatar(): AvatarId {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)] ?? 'orb';
}

/** Trim a typed name down to something that always fits the UI. */
export function cleanName(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return trimmed.length > 0 ? trimmed : DEFAULT_NAME;
}

export function createProfile(now = Date.now()): PlayerProfile {
  return {
    id: newId(),
    name: DEFAULT_NAME,
    avatar: randomAvatar(),
    createdAt: now,
    updatedAt: now,
    onboarded: false,
    xp: 0,
    stats: createStats(),
    achievements: {},
    unlocks: [...DEFAULT_UNLOCKS],
    equipped: { ...DEFAULT_EQUIPPED },
    challenges: {},
    tournament: null,
    lastTournament: null,
    daily: { day: dayKey(new Date(now)), matches: 0 },
    preferences: { lastBot: DEFAULT_BOT, lastPracticeBot: DEFAULT_BOT }
  };
}
