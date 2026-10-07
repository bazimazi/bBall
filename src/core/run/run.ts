import type { EquipmentSnapshot } from '../equipment/types';
import type { Personality } from '../modes/recipes';
import type { BotLevelId } from '../bots/types';
import { presetsOn } from '../modes/arenas';
import { bossById } from '../modes/bosses';
import type { ArenaSpec, MatchModifiers } from '../modes/types';
import { pickOne, seeded } from '../util/random';
import {
  boonAvailable,
  boonById,
  BOONS,
  LEGACY_BOONS,
  RELICS,
  type BoonDef,
  type BoonRanks
} from './boons';
import { recipe } from '../modes/recipes';
import { EXPANSION_BOSS_IDS } from '../campaign/expansion';
import { actLength, actIndex, runLength, RUN_HISTORY, type RunFormat } from './formats';

/**
 * The legacy Gauntlet: nine matches in three acts, each act two
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
export const MAX_PRESSURE = 50;

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
  { level: 5, name: 'Overdrive', blurb: 'Faster still, and every match starts a point down' },
  ...Array.from({ length: 45 }, (_, i) => ({
    level: i + 6,
    name: `${['Hazard mastery', 'Elite tactics', 'Legend schools', 'Court mastery', 'Mythic'][Math.min(4, Math.floor((i + 6) / 10))]!} ${i + 6}`,
    blurb: `${Math.round((i + 1) * 0.375)}% less reach; increasingly strong opponent schools, capped pace and longer rallies`
  }))
];

export interface RunMatchRecord {
  readonly stage: number;
  readonly won: boolean;
  readonly you: number;
  readonly bot: number;
}

/** A run in progress, kept in the profile so it survives closing the app. */
export interface RunSave {
  equipment?: EquipmentSnapshot | undefined;
  workshopEligible?: boolean;
  workshopActs?: number;
  workshopActHits?: number;
  /** A started encounter remains committed across app closure. */
  attempt?: { stage: number } | undefined;
  draftRoll?: number;
  /** Missing format/version means a pre-expansion nine-match save. */
  format?: RunFormat;
  actOffset?: number;
  version?: number;
  credits?: number;
  route?: 'safe' | 'risk';
  bankedActs?: number;
  seed: string;
  pressure: number;
  /** Index of the next encounter; format determines its finite or continuing range. */
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

export function createRun(
  seed: string,
  pressure: number,
  now = Date.now(),
  format?: RunFormat
): RunSave {
  const level = Math.max(0, Math.min(MAX_PRESSURE, Math.round(pressure)));
  return {
    ...(format ? { format, version: 2, credits: 0, route: 'safe' as const, bankedActs: 0 } : {}),
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
  readonly courtFamily?: string;
  readonly personality?: Personality;
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
  if (save.version === 2) {
    const act = actIndex(save, stage);
    const band = Math.min(
      4,
      Math.floor(save.pressure / 10) + Math.floor(act / 3) + (save.route === 'risk' ? 1 : 0)
    );
    const r = recipe(save.seed, stage + (save.route === 'risk' ? 7 : 0), band);
    const bossStage = (stage - (save.actOffset ?? 0)) % actLength(save) === actLength(save) - 1;
    const boss = bossStage
      ? EXPANSION_BOSS_IDS[(act + save.pressure) % EXPANSION_BOSS_IDS.length]!
      : null;
    const definition = boss ? bossById(boss) : undefined;
    const order = ['rookie', 'amateur', 'pro', 'elite', 'legend'];
    const bot =
      definition && order.indexOf(definition.bot) > order.indexOf(r.bot) ? definition.bot : r.bot;
    return {
      stage,
      act,
      boss,
      ...(!boss ? { courtFamily: r.courtFamily } : {}),
      personality: r.personality,
      bot,
      winScore: boss ? Math.max(5, r.winScore) : r.winScore,
      modifiers: definition?.modifiers ?? r.modifiers,
      courtName: definition?.spec.name ?? r.courtName
    };
  }
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
  // The courts that existed the day the run began, in UTC so every device
  // and the server agree: an update never reshuffles a run in progress.
  const started = new Date(Number.isFinite(save.startedAt) ? save.startedAt : 0);
  const preset = hazard ? pickOne(random, presetsOn(started.toISOString().slice(0, 10))) : null;
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
  const extra = Math.max(0, Math.min(45, pressure - 5));
  modifiers.playerPaddleScale *= 1 - extra * 0.00375;
  modifiers.botPaddleScale *= 1 + extra * 0.002;
  const band = Math.min(4, Math.floor(pressure / 10));
  modifiers.maxSpeedScale *= 1 + band * 0.03;
  modifiers.speedPerHitScale *= 1 + band * 0.06 + extra * 0.003;
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
  const random =
    (save.draftRoll ?? 0) > 0
      ? seeded('draft', save.seed, stage, save.draftRoll!)
      : seeded('draft', save.seed, stage);
  const available = (save.version === 2 ? [...BOONS, ...RELICS] : LEGACY_BOONS).filter((boon) =>
    boonAvailable(boon, save.boons)
  );
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
  if (picks.length === 0) picks.push(boonById('repair-credit')!);
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
    results: [...source.results, { stage: source.stage, won, you, bot }].slice(-RUN_HISTORY),
    offer: null,
    attempt: undefined,
    draftRoll: 0
  };
  if (won) {
    const stage = source.stage + 1;
    save.stage = stage;
    if (stage >= runLength(source)) {
      save.finished = true;
      save.won = true;
      return { save, ended: true, cleared: true, heartLost: false };
    }
    if (source.version === 2)
      save.credits = Math.min(9, (source.credits ?? 0) + (source.route === 'risk' ? 2 : 1));
    save.offer = draftFor(save, source.stage);
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
    if (boon.id === 'repair-credit') save.credits = Math.min(9, (save.credits ?? 0) + 1);
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
