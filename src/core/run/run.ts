import type { BotLevelId } from '../bots/types';
import { ARENA_PRESETS } from '../modes/arenas';
import { bossById } from '../modes/bosses';
import type { ArenaSpec, MatchModifiers } from '../modes/types';
import { pickOne, seeded } from '../util/random';
import { boonAvailable, boonById, BOONS, type BoonDef, type BoonRanks } from './boons';

/**
 * The Gauntlet: a roguelite run of nine matches in three acts, each act two
 * opponents and a boss.
 *
 * Win a match and draft one boon of three; lose one and a heart goes, and
 * the same opponent waits for a rematch. Three hearts, no saves between
 * runs, and every run different - its opponents, courts, bosses and drafts
 * all rolled from one seed, which is also what lets the server re-derive a
 * run it is asked to believe.
 *
 * Clearing it opens Pressure: five cumulative ranks of harder runs, for the
 * players who want the same game to keep asking more of them.
 */

export const RUN_STAGES = 9;
export const RUN_HEARTS = 3;
export const MAX_HEARTS = 5;
export const MAX_PRESSURE = 5;

export interface PressureRank {
  readonly level: number;
  readonly name: string;
  readonly blurb: string;
}

/** Cumulative: Pressure 3 is ranks 1, 2 and 3 together. */
export const PRESSURE: readonly PressureRank[] = [
  { level: 1, name: 'Quicker', blurb: 'The ball starts 8% faster' },
  { level: 2, name: 'Thin Ice', blurb: 'Two hearts instead of three' },
  { level: 3, name: 'Hard Courts', blurb: 'Every match is played on a hazard court' },
  { level: 4, name: 'Slim Pickings', blurb: 'Drafts offer two boons, not three' },
  { level: 5, name: 'Overdrive', blurb: 'Faster still, and every match starts a point down' }
];

export interface RunMatchRecord {
  readonly stage: number;
  readonly won: boolean;
  readonly you: number;
  readonly bot: number;
}

/** A run in progress, kept in the profile so it survives closing the app. */
export interface RunSave {
  seed: string;
  pressure: number;
  /** Index of the next encounter, 0..RUN_STAGES. */
  stage: number;
  hearts: number;
  boons: BoonRanks;
  /** The draft waiting to be picked, or null. A match cannot start while one waits. */
  offer: string[] | null;
  results: RunMatchRecord[];
  startedAt: number;
  finished: boolean;
  won: boolean;
}

export interface RunRecords {
  runs: number;
  clears: number;
  /** Most encounters won in a single run. */
  bestStage: number;
  /** Highest Pressure a run has been cleared at, or -1 for none. */
  bestPressure: number;
}

export function createRunRecords(): RunRecords {
  return { runs: 0, clears: 0, bestStage: 0, bestPressure: -1 };
}

/** The highest Pressure a player may start a run at. */
export function pressureUnlocked(records: RunRecords): number {
  return Math.min(MAX_PRESSURE, records.bestPressure + 1);
}

export function heartsFor(pressure: number): number {
  return pressure >= 2 ? RUN_HEARTS - 1 : RUN_HEARTS;
}

export function createRun(seed: string, pressure: number, now = Date.now()): RunSave {
  const level = Math.max(0, Math.min(MAX_PRESSURE, Math.round(pressure)));
  return {
    seed,
    pressure: level,
    stage: 0,
    hearts: heartsFor(level),
    boons: {},
    offer: null,
    results: [],
    startedAt: now,
    finished: false,
    won: false
  };
}

// ------------------------------------------------------------- encounters

export interface Encounter {
  readonly stage: number;
  /** 0-based act. */
  readonly act: number;
  readonly boss: string | null;
  readonly bot: BotLevelId;
  readonly winScore: number;
  /** The court, before Pressure and boons are folded in. */
  readonly modifiers: Partial<MatchModifiers>;
  readonly courtName: string | null;
}

const ACT_BOTS: readonly (readonly BotLevelId[])[] = [
  ['rookie', 'amateur'],
  ['amateur', 'pro'],
  ['pro', 'elite']
];

const ACT_BOSSES: readonly (readonly string[])[] = [
  ['colossus', 'orbiter'],
  ['tempest', 'bastion', 'singularity'],
  ['trickster', 'apex']
];

export function actOf(stage: number): number {
  return Math.min(2, Math.floor(stage / 3));
}

export function isBossStage(stage: number): boolean {
  return stage % 3 === 2;
}

/** What waits at `stage` of this run. Pure: the same seed always says the same. */
export function encounterFor(save: RunSave, stage = save.stage): Encounter {
  const act = actOf(stage);
  const random = seeded('run', save.seed, stage);
  if (isBossStage(stage)) {
    const id = pickOne(random, ACT_BOSSES[act]!);
    const boss = bossById(id);
    return {
      stage,
      act,
      boss: id,
      bot: boss?.bot ?? 'pro',
      winScore: boss?.winScore ?? 5,
      modifiers: boss?.modifiers ?? {},
      courtName: null
    };
  }

  const bot = ACT_BOTS[act]![stage % 3] ?? 'pro';
  // Half the ordinary matches get a hazard court - every one of them does
  // from Pressure 3.
  const courtRoll = random();
  const hazard = save.pressure >= 3 || courtRoll < 0.5;
  const preset = hazard ? pickOne(random, ARENA_PRESETS) : null;
  const arena: ArenaSpec | undefined = preset?.arena;
  return {
    stage,
    act,
    boss: null,
    bot,
    winScore: 3,
    modifiers: arena ? { arena } : {},
    courtName: preset?.name ?? null
  };
}

/** Pressure's effect on one match's modifiers. */
export function applyPressure(modifiers: MatchModifiers, pressure: number): void {
  if (pressure >= 1) modifiers.serveSpeedScale *= 1.08;
  if (pressure >= 5) {
    modifiers.serveSpeedScale *= 1.06;
    modifiers.startScore = { you: modifiers.startScore.you, bot: modifiers.startScore.bot + 1 };
  }
}

// ------------------------------------------------------------------ draft

export function offerSize(pressure: number): number {
  return pressure >= 4 ? 2 : 3;
}

/**
 * The draft after winning `stage`: a seeded pick from what the run could
 * still use. A duo boon, when one has come available, always takes a slot -
 * it is the reward for the build the player has been making.
 */
export function draftFor(save: RunSave, stage: number): string[] {
  const random = seeded('draft', save.seed, stage);
  const available = BOONS.filter((boon) => boonAvailable(boon, save.boons));
  const duos = available.filter((boon) => boon.family === 'duo');
  const rest = available.filter((boon) => boon.family !== 'duo' && !boon.instant);
  const size = offerSize(save.pressure);
  const picks: BoonDef[] = [];
  if (duos.length > 0) picks.push(pickOne(random, duos));
  // Second Wind appears only when a heart has actually been lost.
  const heart = boonById('heart');
  if (heart && save.hearts < heartsFor(save.pressure) && random() < 0.5) picks.push(heart);
  const pool = [...rest];
  while (picks.length < size && pool.length > 0) {
    const index = Math.floor(random() * pool.length) % pool.length;
    picks.push(pool.splice(index, 1)[0]!);
  }
  return picks.slice(0, size).map((boon) => boon.id);
}

// ----------------------------------------------------------------- advance

export interface RunAdvance {
  readonly save: RunSave;
  /** The run ended with this match, won or lost. */
  readonly ended: boolean;
  readonly cleared: boolean;
  /** A heart was lost. */
  readonly heartLost: boolean;
}

/**
 * Record one finished Gauntlet match. A win moves the run on and opens a
 * draft; a loss costs a heart and keeps the same opponent. Pure.
 */
export function advanceRun(source: RunSave, won: boolean, you: number, bot: number): RunAdvance {
  const save: RunSave = {
    ...source,
    boons: { ...source.boons },
    results: [...source.results, { stage: source.stage, won, you, bot }],
    offer: null
  };
  if (won) {
    const stage = source.stage + 1;
    save.stage = stage;
    if (stage >= RUN_STAGES) {
      save.finished = true;
      save.won = true;
      return { save, ended: true, cleared: true, heartLost: false };
    }
    save.offer = draftFor(source, source.stage);
    return { save, ended: false, cleared: false, heartLost: false };
  }
  save.hearts = Math.max(0, source.hearts - 1);
  if (save.hearts === 0) {
    save.finished = true;
    return { save, ended: true, cleared: false, heartLost: true };
  }
  return { save, ended: false, cleared: false, heartLost: true };
}

/**
 * Take one boon from the waiting draft. Returns null when the pick is not
 * one of the offer - a stale tap, or a tampered request.
 */
export function pickBoon(source: RunSave, id: string): RunSave | null {
  if (!source.offer || !source.offer.includes(id) || source.finished) return null;
  const boon = boonById(id);
  if (!boon) return null;
  const save: RunSave = { ...source, boons: { ...source.boons }, offer: null };
  if (boon.instant) {
    if (boon.id === 'heart') save.hearts = Math.min(MAX_HEARTS, save.hearts + 1);
  } else {
    save.boons[id] = Math.min(boon.maxRank, (save.boons[id] ?? 0) + 1);
  }
  return save;
}

export function isRunActive(save: RunSave | null): save is RunSave {
  return !!save && !save.finished;
}

/** A fresh seed for a new run. */
export function newRunSeed(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return random.replace(/[^A-Za-z0-9-]/g, '').slice(0, 36);
}
