import { recipe } from '../modes/recipes';
import type { BotLevelId } from '../bots/types';
import { presetsOn } from '../modes/arenas';
import { starCount, type StarGoal } from '../modes/stars';
import type { MatchModifiers } from '../modes/types';
import { pickOne, seeded } from '../util/random';

/**
 * The daily challenge: one match, the same for everyone on the same date,
 * rolled from the date alone.
 *
 * A court, a twist and an opponent, with two star goals on top of the win.
 * Attempts are unlimited - it is a puzzle to crack, not a ticket to spend -
 * but only the first clear of the day pays its bonus and moves the streak.
 *
 * The streak forgives. Every seven days of it banks a freeze (two at most),
 * and a missed day spends one silently, so a single busy evening does not
 * throw away a month. Nothing here ever nags.
 */

export interface DailySpec {
  readonly courtFamily?: string;
  /** The `YYYY-MM-DD` day this challenge belongs to. */
  readonly key: string;
  readonly title: string;
  /** The court and the twist, in a line. */
  readonly blurb: string;
  readonly bot: BotLevelId;
  readonly winScore: number;
  readonly modifiers: Partial<MatchModifiers>;
  readonly goals: readonly [StarGoal, StarGoal];
}

interface Twist {
  readonly name: string;
  readonly modifiers: Partial<MatchModifiers>;
  readonly winScore?: number;
}

const TWISTS: readonly Twist[] = [
  { name: 'straight up', modifiers: {} },
  { name: 'a shorter paddle', modifiers: { playerPaddleScale: 0.82 } },
  { name: 'a faster ball', modifiers: { serveSpeedScale: 1.14, speedPerHitScale: 1.3 } },
  { name: 'a point down', modifiers: { startScore: { you: 0, bot: 1 } } },
  { name: 'first to five', modifiers: {}, winScore: 5 },
  { name: 'a bigger opponent', modifiers: { botPaddleScale: 1.25 } }
];

const BOTS: readonly BotLevelId[] = ['amateur', 'pro', 'pro'];

const GOALS: readonly StarGoal[] = [
  { id: 'margin', value: 2 },
  { id: 'rally', value: 12 },
  { id: 'flicks', value: 4 },
  { id: 'shutout', value: 0 },
  { id: 'fast', value: 110 },
  { id: 'returns', value: 25 }
];

/** Streak days that bank one freeze, and the most that can be held. */
export const FREEZE_EVERY = 7;
export const MAX_FREEZES = 2;

export function dailyIdentity(key: string): {
  day: string;
  kind: 'standard' | 'master' | 'archive';
} {
  if (key.startsWith('m2-')) return { day: key.slice(3), kind: 'master' };
  if (key.startsWith('a2-')) return { day: key.slice(3), kind: 'archive' };
  return { day: key, kind: 'standard' };
}
export function weeklySeed(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return `weekly-v2-${date.toISOString().slice(0, 10)}`;
}
export function dailySpec(key: string): DailySpec {
  const identity = dailyIdentity(key);
  if (identity.kind === 'archive') return { ...dailySpec(identity.day), key };
  if (identity.kind === 'master') {
    const r = recipe(`daily-master-v2-${identity.day}`, 0, 4);
    return {
      key,
      courtFamily: r.courtFamily,
      title: `Master · ${r.courtName}`,
      blurb: `${r.blurb}. Fixed level-50 Control build, Legend, shorter paddle, first to five`,
      bot: 'legend',
      winScore: 5,
      modifiers: { ...r.modifiers, playerPaddleScale: 0.88 },
      goals: [
        { id: 'margin', value: 2 },
        { id: 'flicks', value: 5 }
      ]
    };
  }
  const random = seeded('daily', key);
  const preset = pickOne(random, presetsOn(key));
  const twist = pickOne(random, TWISTS);
  const bot = pickOne(random, BOTS);
  const first = pickOne(random, GOALS);
  // A comeback twist cannot also ask for a clean sheet.
  const rest = GOALS.filter(
    (goal) => goal.id !== first.id && !(goal.id === 'shutout' && twist.modifiers.startScore)
  );
  const second = pickOne(random, rest);
  const firstGoal =
    first.id === 'shutout' && twist.modifiers.startScore
      ? { id: 'margin' as const, value: 2 }
      : first;

  return {
    key,
    title: preset.name,
    blurb: twist.name === 'straight up' ? preset.blurb : `${preset.blurb}, and ${twist.name}`,
    bot,
    winScore: twist.winScore ?? 3,
    modifiers: { ...twist.modifiers, arena: preset.arena },
    goals: [firstGoal, second]
  };
}

// ---------------------------------------------------------------- records

export interface DailyRecord {
  /** The day `medals` and `attempts` belong to. */
  day: string;
  /** Star mask earned on that day's challenge. */
  medals: number;
  attempts: number;
  streak: number;
  bestStreak: number;
  /** The last day a daily was cleared, or '' for never. */
  lastClear: string;
  freezes: number;
  /** Days cleared, all time. */
  clears: number;
}

export function createDailyRecord(): DailyRecord {
  return {
    day: '',
    medals: 0,
    attempts: 0,
    streak: 0,
    bestStreak: 0,
    lastClear: '',
    freezes: 0,
    clears: 0
  };
}

/** Whole days from `a` to `b`, both `YYYY-MM-DD`. NaN when either is not a date. */
export function daysBetween(a: string, b: string): number {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return Number.NaN;
    const stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const date = new Date(stamp);
    return date.toISOString().slice(0, 10) === value ? stamp : Number.NaN;
  };
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}

export function isDayKey(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(daysBetween(value, value));
}

/**
 * Is the streak still alive on `today`? It is while the last clear was today
 * or yesterday, or while enough freezes are banked to cover the gap.
 */
export function streakAlive(record: DailyRecord, today: string): boolean {
  if (record.streak <= 0 || !record.lastClear) return false;
  const gap = daysBetween(record.lastClear, today);
  if (!Number.isFinite(gap) || gap < 0) return true;
  return gap - 1 <= record.freezes;
}

export interface DailyOutcome {
  readonly record: DailyRecord;
  /** The first clear of this day's challenge. */
  readonly firstClear: boolean;
  /** Stars earned this time that the day had not already banked. */
  readonly newMedals: number;
}

/** Fold one attempt at `key`'s challenge into the record. Pure. */
export function applyDaily(source: DailyRecord, key: string, stars: number): DailyOutcome {
  const record: DailyRecord = { ...source };
  if (record.day !== key) {
    record.day = key;
    record.medals = 0;
    record.attempts = 0;
  }
  record.attempts += 1;
  const before = record.medals;
  record.medals |= stars;
  const newMedals = starCount(record.medals) - starCount(before);
  const firstClear = (stars & 1) === 1 && (before & 1) === 0;

  if (firstClear) {
    record.clears += 1;
    const gap = record.lastClear ? daysBetween(record.lastClear, key) : Number.NaN;
    if (!record.lastClear || !Number.isFinite(gap)) {
      record.streak = 1;
      record.lastClear = key;
    } else if (gap > 0) {
      const missed = gap - 1;
      if (missed <= record.freezes) {
        record.freezes -= missed;
        record.streak += 1;
      } else {
        record.streak = 1;
      }
      record.lastClear = key;
      if (record.streak % FREEZE_EVERY === 0) {
        record.freezes = Math.min(MAX_FREEZES, record.freezes + 1);
      }
    }
    // A clear of an older day than the last one (a phone left open past
    // midnight) still counts as a clear, but never moves the streak.
    record.bestStreak = Math.max(record.bestStreak, record.streak);
  }
  return { record, firstClear, newMedals };
}
