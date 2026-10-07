import { isStageId, type JourneyProgress } from '../campaign/journey';
import { createWorkshop, cloneWorkshop, workshopOf } from '../equipment/workshop';
import type { WorkshopState } from '../equipment/types';
import { snapshotOf } from '../equipment/catalog';
import { ARENA_PRESETS } from '../modes/arenas';
import { masteryOf } from '../progression/mastery';
import { createDailyRecord, isDayKey, MAX_FREEZES, type DailyRecord } from '../daily/daily';
import { isBossId } from '../modes/bosses';
import { questById, type QuestState } from '../quests/quests';
import { isBoonId, boonById } from '../run/boons';
import {
  createRunRecords,
  MAX_HEARTS,
  MAX_PRESSURE,
  RUN_STAGES,
  type RunRecords,
  type RunSave
} from '../run/run';
import { MAX_RUN_DEPTH, RUN_HISTORY, RUN_FORMATS, type RunFormat } from '../run/formats';

/**
 * Everything the newer modes keep: Journey stars, the daily streak, today's
 * quests, a Gauntlet run in progress and its records, and a couple of
 * lifetime counts that belong to none of the older stat blocks.
 *
 * Kept as one object on the profile, and stored by the server as one
 * document, so a new mode adds a field here rather than a table there.
 */
export interface ProgressState {
  workshop: WorkshopState;
  endlessRecords: Record<string, { rally: number; waves: number }>;
  mastery: Record<string, number>;
  /** Stage id -> star mask. */
  journey: JourneyProgress;
  daily: DailyRecord;
  dailyMaster: DailyRecord;
  quests: QuestState | null;
  /** Days on which all three quests were finished. */
  questSweeps: number;
  run: RunSave | null;
  /** The last run to finish, so the Gauntlet screen can show how it went. */
  lastRun: RunSave | null;
  runRecords: RunRecords;
  /** Boss id -> wins against it, in any mode. */
  bosses: Record<string, number>;
  /** Flicks landed, all time. */
  flicks: number;
  contracts: number;
}

export function createProgress(): ProgressState {
  return {
    workshop: createWorkshop(),
    endlessRecords: {},
    mastery: {},
    journey: {},
    daily: createDailyRecord(),
    dailyMaster: createDailyRecord(),
    quests: null,
    questSweeps: 0,
    run: null,
    lastRun: null,
    runRecords: createRunRecords(),
    bosses: {},
    contracts: 0,
    flicks: 0
  };
}

export function cloneProgress(progress: ProgressState): ProgressState {
  return {
    workshop: cloneWorkshop(progress.workshop ?? createWorkshop()),
    endlessRecords: Object.fromEntries(
      Object.entries(progress.endlessRecords ?? {}).map(([k, v]) => [k, { ...v }])
    ),
    mastery: { ...(progress.mastery ?? {}) },
    journey: { ...progress.journey },
    daily: { ...progress.daily },
    dailyMaster: { ...(progress.dailyMaster ?? createDailyRecord()) },
    quests: progress.quests
      ? {
          ...progress.quests,
          ids: [...progress.quests.ids],
          progress: [...progress.quests.progress],
          done: [...progress.quests.done]
        }
      : null,
    questSweeps: progress.questSweeps,
    run: progress.run ? cloneRun(progress.run) : null,
    lastRun: progress.lastRun ? cloneRun(progress.lastRun) : null,
    runRecords: { ...progress.runRecords },
    bosses: { ...progress.bosses },
    contracts: progress.contracts ?? 0,
    flicks: progress.flicks
  };
}

function cloneRun(run: RunSave): RunSave {
  return {
    ...run,
    ...(run.equipment ? { equipment: snapshotOf(run.equipment) } : {}),
    boons: { ...run.boons },
    offer: run.offer ? [...run.offer] : null,
    results: run.results.map((item) => ({ ...item }))
  };
}

// ------------------------------------------------------------- validation

type Bag = Record<string, unknown>;

function bag(value: unknown): Bag {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Bag) : {};
}

function num(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function text(value: unknown, fallback: string, max = 64): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}

function journeyOf(value: unknown): JourneyProgress {
  const result: JourneyProgress = {};
  for (const [id, mask] of Object.entries(bag(value))) {
    if (id === 'frontier-v2') {
      result[id] = num(mask, 0, 0, 999999999);
      continue;
    }
    if (isStageId(id)) result[id] = num(mask, 0, 0, 7);
  }
  return result;
}

function dailyOf(value: unknown): DailyRecord {
  const source = bag(value);
  const base = createDailyRecord();
  const day = text(source.day, '');
  const lastClear = text(source.lastClear, '');
  return {
    day: isDayKey(day) ? day : '',
    medals: num(source.medals, 0, 0, 7),
    attempts: num(source.attempts, 0),
    streak: num(source.streak, base.streak),
    bestStreak: num(source.bestStreak, base.bestStreak),
    lastClear: isDayKey(lastClear) ? lastClear : '',
    freezes: num(source.freezes, 0, 0, MAX_FREEZES),
    clears: num(source.clears, 0)
  };
}

function questsOf(value: unknown): QuestState | null {
  if (!value || typeof value !== 'object') return null;
  const source = bag(value);
  const day = text(source.day, '');
  const ids = Array.isArray(source.ids) ? source.ids.filter((id) => !!questById(id as string)) : [];
  if (!isDayKey(day) || ids.length === 0) return null;
  const progress = Array.isArray(source.progress) ? source.progress : [];
  const done = Array.isArray(source.done) ? source.done : [];
  return {
    day,
    ids: ids.slice(0, 3) as string[],
    progress: ids
      .slice(0, 3)
      .map((id, i) => num(progress[i], 0, 0, questById(id as string)!.target)),
    done: ids.slice(0, 3).map((_, i) => done[i] === true),
    bonus: source.bonus === true
  };
}

function runOf(value: unknown): RunSave | null {
  if (!value || typeof value !== 'object') return null;
  const source = bag(value);
  const seed = text(source.seed, '', 40);
  if (!seed) return null;
  const boons: Record<string, number> = {};
  for (const [id, rank] of Object.entries(bag(source.boons))) {
    const boon = boonById(id);
    if (boon && !boon.instant) boons[id] = num(rank, 0, 0, boon.maxRank);
  }
  let relics = 0;
  for (const id of Object.keys(boons))
    if (boonById(id)?.family === 'relic' && boons[id]! > 0 && ++relics > 3) delete boons[id];
  const offer = Array.isArray(source.offer)
    ? source.offer.filter((id): id is string => isBoonId(id)).slice(0, 3)
    : null;
  const results = Array.isArray(source.results) ? source.results : [];
  return {
    seed,
    ...(snapshotOf(source.equipment) ? { equipment: snapshotOf(source.equipment) } : {}),
    workshopEligible: source.workshopEligible === true,
    workshopActs: num(source.workshopActs, 0),
    workshopActHits: num(source.workshopActHits, 0, 0, 3),
    ...(source.version === 2
      ? {
          draftRoll: num(source.draftRoll, 0),
          ...(bag(source.attempt).stage === source.stage
            ? { attempt: { stage: num(source.stage, 0, 0, MAX_RUN_DEPTH) } }
            : {})
        }
      : {}),
    ...(source.version === 2 && RUN_FORMATS.includes(source.format as RunFormat)
      ? {
          version: 2,
          format: source.format as RunFormat,
          actOffset: num(source.actOffset, 0, 0, 5),
          credits: num(source.credits, 0, 0, 9),
          route: source.route === 'risk' ? ('risk' as const) : ('safe' as const),
          bankedActs: num(source.bankedActs, 0)
        }
      : {}),
    pressure: num(source.pressure, 0, 0, MAX_PRESSURE),
    stage: num(
      source.stage,
      0,
      0,
      source.version === 2 && RUN_FORMATS.includes(source.format as RunFormat)
        ? MAX_RUN_DEPTH
        : RUN_STAGES
    ),
    hearts: num(source.hearts, 0, 0, MAX_HEARTS),
    boons,
    offer: offer && offer.length > 0 ? offer : null,
    results: results.slice(-RUN_HISTORY).map((entry) => {
      const item = bag(entry);
      return {
        stage: num(
          item.stage,
          0,
          0,
          source.version === 2 && RUN_FORMATS.includes(source.format as RunFormat)
            ? MAX_RUN_DEPTH
            : RUN_STAGES
        ),
        won: item.won === true,
        you: num(item.you, 0, 0, 99),
        bot: num(item.bot, 0, 0, 99)
      };
    }),
    startedAt: num(source.startedAt, Date.now()),
    finished: source.finished === true,
    won: source.won === true
  };
}

function recordsOf(value: unknown): RunRecords {
  const source = bag(value);
  return {
    runs: num(source.runs, 0),
    clears: num(source.clears, 0),
    bestStage: num(source.bestStage, 0, 0, MAX_RUN_DEPTH),
    bestPressure: num(source.bestPressure, -1, -1, MAX_PRESSURE)
  };
}

function bossesOf(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [id, wins] of Object.entries(bag(value))) {
    if (isBossId(id)) result[id] = num(wins, 0);
  }
  return result;
}

/** Repair-first, like the rest of the profile: anything unreadable becomes its default. */
export function progressOf(value: unknown): ProgressState {
  const source = bag(value);
  let run = runOf(source.run);
  let lastRun = runOf(source.lastRun);
  // A finished run belongs in `lastRun`, never as the live one.
  if (run?.finished) {
    lastRun = run;
    run = null;
  }
  return {
    workshop: workshopOf(source.workshop),
    endlessRecords: Object.fromEntries(
      ['open', 'waves', ...ARENA_PRESETS.map((a) => a.id)]
        .filter((k) => bag(source.endlessRecords)[k] !== undefined)
        .map((k) => [
          k,
          {
            rally: num(bag(bag(source.endlessRecords)[k]).rally, 0),
            waves: num(bag(bag(source.endlessRecords)[k]).waves, 0)
          }
        ])
    ),
    mastery: masteryOf(source.mastery),
    journey: journeyOf(source.journey),
    daily: dailyOf(source.daily),
    dailyMaster: dailyOf(source.dailyMaster),
    quests: questsOf(source.quests),
    questSweeps: num(source.questSweeps, 0),
    run,
    lastRun,
    runRecords: recordsOf(source.runRecords),
    bosses: bossesOf(source.bosses),
    contracts: num(source.contracts, 0, 0, 999999999),
    flicks: num(source.flicks, 0)
  };
}
