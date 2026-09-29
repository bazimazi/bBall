import type { MatchResult } from '../modes/types';
import { seeded } from '../util/random';

/**
 * Daily quests: three small goals a day - one easy, one medium, one hard -
 * rolled from the date, so everyone shares them and the server can roll the
 * same three.
 *
 * They pay XP the moment they are done, with no claim button to forget, and a
 * little more for finishing all three. They exist to point a player at a
 * mode they have not tried today, never to demand a session: a day without
 * them costs nothing.
 */

export interface QuestContext {
  readonly result: MatchResult;
  /** Journey stars this match earned for the first time. */
  readonly newStars: number;
  /** A boss was beaten, in any mode. */
  readonly bossBeaten: boolean;
  /** The daily challenge was cleared for the first time today. */
  readonly dailyCleared: boolean;
  /** A Gauntlet match was won. */
  readonly runWin: boolean;
}

export interface QuestDef {
  readonly id: string;
  /** 0 easy, 1 medium, 2 hard. */
  readonly tier: 0 | 1 | 2;
  readonly label: string;
  readonly target: number;
  /** `sum` adds up across matches; `best` keeps the highest single match. */
  readonly kind: 'sum' | 'best';
  measure(context: QuestContext): number;
}

export const QUEST_XP: readonly number[] = [60, 100, 150];
/** Paid once all three of a day's quests are done. */
export const QUEST_BONUS_XP = 100;

const won = (context: QuestContext) => (context.result.won ? 1 : 0);

export const QUESTS: readonly QuestDef[] = [
  // -- easy
  {
    id: 'play-3',
    tier: 0,
    label: 'Play 3 matches',
    target: 3,
    kind: 'sum',
    measure: () => 1
  },
  {
    id: 'returns-60',
    tier: 0,
    label: 'Make 60 returns',
    target: 60,
    kind: 'sum',
    measure: ({ result }) => result.hits
  },
  {
    id: 'flicks-5',
    tier: 0,
    label: 'Land 5 flicks',
    target: 5,
    kind: 'sum',
    measure: ({ result }) => result.flicks
  },
  {
    id: 'points-10',
    tier: 0,
    label: 'Win 10 points',
    target: 10,
    kind: 'sum',
    measure: ({ result }) => (result.mode === 'endless' ? 0 : result.scoreYou)
  },
  // -- medium
  {
    id: 'win-3',
    tier: 1,
    label: 'Win 3 matches',
    target: 3,
    kind: 'sum',
    measure: won
  },
  {
    id: 'rally-15',
    tier: 1,
    label: 'Reach a 15-hit rally',
    target: 15,
    kind: 'best',
    measure: ({ result }) => result.bestRally
  },
  {
    id: 'stars-2',
    tier: 1,
    label: 'Earn 2 new Journey stars',
    target: 2,
    kind: 'sum',
    measure: ({ newStars }) => newStars
  },
  {
    id: 'daily',
    tier: 1,
    label: 'Clear the daily challenge',
    target: 1,
    kind: 'sum',
    measure: ({ dailyCleared }) => (dailyCleared ? 1 : 0)
  },
  {
    id: 'flicks-12',
    tier: 1,
    label: 'Land 12 flicks',
    target: 12,
    kind: 'sum',
    measure: ({ result }) => result.flicks
  },
  // -- hard
  {
    id: 'beat-pro-2',
    tier: 2,
    label: 'Beat Pro or stronger twice',
    target: 2,
    kind: 'sum',
    measure: ({ result }) => (result.won && result.botRank >= 3 ? 1 : 0)
  },
  {
    id: 'shutout',
    tier: 2,
    label: 'Win without conceding',
    target: 1,
    kind: 'sum',
    measure: ({ result }) => (result.won && result.shutout ? 1 : 0)
  },
  {
    id: 'boss',
    tier: 2,
    label: 'Beat a boss',
    target: 1,
    kind: 'sum',
    measure: ({ bossBeaten }) => (bossBeaten ? 1 : 0)
  },
  {
    id: 'run-3',
    tier: 2,
    label: 'Win 3 Gauntlet matches',
    target: 3,
    kind: 'sum',
    measure: ({ runWin }) => (runWin ? 1 : 0)
  },
  {
    id: 'rally-30',
    tier: 2,
    label: 'Reach a 30-hit rally',
    target: 30,
    kind: 'best',
    measure: ({ result }) => result.bestRally
  }
];

const BY_ID = new Map(QUESTS.map((quest) => [quest.id, quest]));

export function questById(id: string): QuestDef | undefined {
  return BY_ID.get(id);
}

export interface QuestState {
  /** The day these quests belong to. */
  day: string;
  ids: string[];
  progress: number[];
  done: boolean[];
  /** The all-three bonus has been paid. */
  bonus: boolean;
}

/** The three quests for `day`: one of each tier, the same for everyone. */
export function questsForDay(day: string): QuestDef[] {
  const random = seeded('quests', day);
  const picks: QuestDef[] = [];
  for (const tier of [0, 1, 2] as const) {
    const pool = QUESTS.filter((quest) => quest.tier === tier);
    picks.push(pool[Math.floor(random() * pool.length) % pool.length]!);
  }
  return picks;
}

export function createQuestState(day: string): QuestState {
  const ids = questsForDay(day).map((quest) => quest.id);
  return { day, ids, progress: ids.map(() => 0), done: ids.map(() => false), bonus: false };
}

/** Today's state, rolling over to a fresh set when the day has changed. */
export function questStateFor(state: QuestState | null, day: string): QuestState {
  if (!state || state.day !== day) return createQuestState(day);
  return state;
}

export interface QuestOutcome {
  readonly state: QuestState;
  readonly completed: readonly QuestDef[];
  /** True when this match finished the last of the three. */
  readonly bonus: boolean;
  readonly xp: number;
}

/** Fold a finished match into the day's quests. Pure. */
export function applyQuests(
  source: QuestState | null,
  day: string,
  context: QuestContext
): QuestOutcome {
  const base = questStateFor(source, day);
  const state: QuestState = {
    ...base,
    ids: [...base.ids],
    progress: [...base.progress],
    done: [...base.done]
  };
  const completed: QuestDef[] = [];
  let xp = 0;

  state.ids.forEach((id, i) => {
    const quest = questById(id);
    if (!quest || state.done[i]) return;
    const value = Math.max(0, quest.measure(context));
    const before = state.progress[i] ?? 0;
    const after = quest.kind === 'sum' ? before + value : Math.max(before, value);
    state.progress[i] = Math.min(quest.target, after);
    if (after >= quest.target) {
      state.done[i] = true;
      completed.push(quest);
      xp += QUEST_XP[quest.tier] ?? 0;
    }
  });

  let bonus = false;
  if (!state.bonus && state.done.length > 0 && state.done.every(Boolean)) {
    state.bonus = true;
    bonus = true;
    xp += QUEST_BONUS_XP;
  }
  return { state, completed, bonus, xp };
}
