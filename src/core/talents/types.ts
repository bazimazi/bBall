import type { ExpansionTalentId } from './expansion';
/**
 * The talent system's vocabulary.
 *
 * Talents are *data*: a catalogue entry describes what a rank costs and what
 * it changes, and nothing else. Resolving a saved build into numbers happens
 * once, in `effects.ts`; the simulation only ever reads the resolved bag, and
 * the UI only ever reads the catalogue. Neither knows about the other.
 */

export const BRANCHES = ['power', 'control', 'defense', 'momentum', 'utility'] as const;
export type BranchId = (typeof BRANCHES)[number];

export const ABILITIES = [
  'power-strike',
  'dash',
  'perfect-guard',
  // The capstones. One per branch, and every one of them is an active.
  'overload',
  'slipstream',
  'aegis',
  'zenith',
  'echo',
  'redirect',
  'anchor',
  'breach',
  'relay',
  'reserve',
  'rebound'
] as const;
export type AbilityId = (typeof ABILITIES)[number];

export interface Branch {
  readonly id: BranchId;
  readonly name: string;
  /** One line. If it needs two, the branch is doing too much. */
  readonly blurb: string;
  /** Hue used for the branch's accents, so builds read at a glance. */
  readonly hue: number;
  /** The talent whose glyph stands for the branch in its header. */
  readonly crest: TalentId;
}

/** A prerequisite: `rank` points already invested in another talent. */
export interface TalentRequirement {
  readonly talent: TalentId;
  readonly rank: number;
}

export interface TalentDef {
  readonly id: TalentId;
  readonly branch: BranchId;
  readonly name: string;
  /** One short line for the row. */
  readonly blurb: string;
  readonly maxRank: number;
  /** Point cost of each rank, index 0 being the first. */
  readonly costs: readonly number[];
  /**
   * Position in the branch's grid. `tier` is the row, and it is also the
   * gate: a tier only opens once `tier * BALANCE.talents.pointsPerTier`
   * points sit in that branch. `column` is 0..{@link BRANCH_COLUMNS}-1.
   */
  readonly tier: number;
  readonly column: number;
  readonly requires: readonly TalentRequirement[];
  /** The active ability this talent unlocks, when it unlocks one. */
  readonly ability?: AbilityId;
  /**
   * What the talent is worth *at* `rank`, in the player's words.
   *
   * Always the running total, never the step one point adds: the screen puts
   * the owned rank's line directly above the next rank's, and two lines that
   * print the same per-rank number make a rank-3 talent look identical to a
   * rank-1 one.
   */
  rankText(rank: number): string;
}

export type TalentId =
  | ExpansionTalentId
  // power
  | 'heavy-impact'
  | 'power-strike'
  | 'critical-strike'
  | 'bank-shot'
  | 'overdrive'
  | 'momentum'
  | 'reckless'
  | 'edge-pressure'
  | 'overload'
  // control
  | 'long-reach'
  | 'foresight'
  | 'precision'
  | 'dash'
  | 'swerve'
  | 'blink-strike'
  | 'perfect-guard'
  | 'time-slip'
  | 'slipstream'
  // defense
  | 'bastion'
  | 'shield'
  | 'clutch'
  | 'fortify'
  | 'counterstrike'
  | 'second-chance'
  | 'rally-armor'
  | 'aegis'
  // momentum
  | 'hot-hand'
  | 'combo-drive'
  | 'adrenaline'
  | 'flow-state'
  | 'unbroken'
  | 'fast-start'
  | 'zenith'
  // utility
  | 'tempo'
  | 'cooldown-mastery'
  | 'afterglow'
  | 'versatility'
  | 'talent-synergy'
  | 'chain-casting'
  | 'echo';

/** Lifetime talent numbers, kept for the profile screen. */
export interface TalentStats {
  /** Talent points ever granted, including the ones since spent. */
  pointsEarned: number;
  respecs: number;
  abilitiesUsed: number;
  powerStrikes: number;
  dashes: number;
  perfectGuards: number;
  crits: number;
  shieldSaves: number;
  secondChances: number;
  /** Capstone abilities fired, all time. */
  ultimates: number;
  bestDrive: number;
}

/** What one finished match contributed. Pure data, published by the engine. */
export interface TalentMatchStats {
  readonly abilitiesUsed: number;
  readonly powerStrikes: number;
  readonly dashes: number;
  readonly perfectGuards: number;
  readonly crits: number;
  readonly shieldSaves: number;
  readonly secondChances: number;
  readonly ultimates: number;
  readonly bestDrive: number;
}

export const EMPTY_MATCH_STATS: TalentMatchStats = {
  abilitiesUsed: 0,
  powerStrikes: 0,
  dashes: 0,
  perfectGuards: 0,
  crits: 0,
  shieldSaves: 0,
  secondChances: 0,
  ultimates: 0,
  bestDrive: 0
};

/** The saved build. Lives inside the player profile. */
export interface TalentPreset {
  name: string;
  ranks: Partial<Record<TalentId, number>>;
  equipped: (AbilityId | null)[];
}
export interface TalentSave {
  presets?: (TalentPreset | null)[];
  /** Unspent points. Recomputed from level and spend on every load. */
  points: number;
  /** Talent id -> rank owned. Absent means rank 0. */
  ranks: Partial<Record<TalentId, number>>;
  /** Equipped abilities, one per slot. `null` is an empty slot. */
  equipped: (AbilityId | null)[];
  stats: TalentStats;
}

/**
 * A build resolved into plain numbers.
 *
 * Everything the simulation needs, pre-multiplied and pre-capped. The engine
 * reads fields; it never looks up a talent, and never multiplies two of these
 * together without a cap from {@link BALANCE}.
 *
 * Nothing here is a flat paddle-speed bonus. Measured against every bot, the
 * paddle is already faster than the court is tall, so speed stopped deciding
 * points long before the tree ran out of it. What does decide a point is
 * *reach* (a longer paddle, a dash), *the read* (knowing where the ball will
 * arrive), *placement* (angle, corners, a late break) and *saves* - so that is
 * what every field below buys.
 */
export interface TalentEffects {
  // reach ----------------------------------------------------------------
  /** Always-on change to the paddle's length, as a fraction. Can be negative. */
  length: number;
  /** Combo Drive: length per step of drive, the returns a step takes, and the most steps. */
  comboLength: number;
  comboEvery: number;
  comboSteps: number;
  /** Clutch: extra length, and ball pace taken off each return, one point from losing. */
  clutchLength: number;
  clutchGrowth: number;
  /** Clutch: how much slower the ball's clock runs in the player's half, one point from losing. */
  clutchSlow: number;
  /** Afterglow: extra length for a moment after any skill is used. */
  afterglowLength: number;
  afterglowSeconds: number;
  /** Foresight: 0 off, 1 marks the arrival once the ball is in your half, 2 draws the whole path. */
  foresight: number;

  // placement ------------------------------------------------------------
  /**
   * Heavy Impact: how much harder than its speed says the player's every
   * return is for the opponent to read. Charged and critical returns add
   * their own on top.
   */
  heft: number;
  critChance: number;
  /** Minimum actual paddle contact offset that guarantees a charged critical. 0 disables it. */
  edgePressure: number;
  critGrowth: number;
  /** How much harder to read a critical return is. Reckless doubles it. */
  critHeft: number;
  /** Momentum: every n-th return of a rally leaves charged. 0 is off. */
  momentumEvery: number;
  /** Multiplier on how much paddle motion drags the return off line. */
  spinMul: number;
  /** Multiplier on the usable bounce-angle range - deliberate placement. */
  angleMul: number;
  /** Swerve: sideways acceleration on the player's returns past the centre line, in units/s². */
  swerve: number;
  /** Bank Shot: how much steeper a player's return leaves a wall. */
  bankShot: number;
  /** Hot Hand: returns charged at the start of a rally after a won point. 0 is off. */
  hotHand: number;
  /** Hot Hand's top rank: those returns are critical as well. */
  hotHandCrit: boolean;
  /** Counterstrike: 0 off; otherwise a saved ball leaves cornered, with this much extra pace. */
  counterPace: number;

  // rallies --------------------------------------------------------------
  /** Rally length at which flow starts. */
  flowFrom: number;
  /** Usable return angle gained per stack of flow. */
  flowAngle: number;
  /** Extra cooldown recovery rate at full flow. */
  flowRecharge: number;
  /** How much harder to read the player's returns get per stack of flow. */
  flowHeft: number;
  /** Adrenaline: every n returns on a drive banks one spare save. 0 is off. */
  adrenalineEvery: number;
  /** Unbroken: the share of the drive a conceded point leaves standing. */
  driveKeep: number;

  // defence --------------------------------------------------------------
  /** Bastion: units from each wall where a ball reaching the player's line is turned back. */
  bastion: number;
  /**
   * Reckless: nothing saves this player. Shield, Bastion, Adrenaline, Aegis,
   * Second Chance and Zenith's refund all stand down.
   */
  unsaved: boolean;
  shieldCharges: number;
  shieldRecharge: number;
  /** Seconds of shield recovery earned by an actual paddle return. */
  shieldTempo: number;
  shieldSaveSpeed: number;
  secondChances: number;
  /** Bulwark: a perfect guard also hands back a shield charge. */
  guardGrantsShield: boolean;

  // abilities ------------------------------------------------------------
  cooldownMul: number;
  /** Tempo: seconds every cooldown loses whenever the player returns the ball. */
  tempo: number;
  /** Extra cooldown seconds earned by a return during Afterglow. */
  afterglowTempo: number;
  /** Cooldown seconds earned by a successful Perfect Guard. */
  parryTempo: number;
  /** Passive recovery from Conduit, independent of Flow State. */
  recharge: number;
  /** Cooldown refund to other skills when alternating casts. */
  castTempo: number;
  /** Skill slots on top of the ones level has opened. */
  extraSlots: number;
  powerStrikeSpeed: number;
  powerStrikeWindow: number;
  powerStrikeCooldown: number;
  /** Returns one Power Strike charges: two once Overdrive is maxed. */
  powerStrikeHits: number;
  /** Blitz: a charged return is a critical one, too. */
  chargedCrits: boolean;
  dashDistance: number;
  dashCooldown: number;
  dashSeconds: number;
  /** Blink Strike: seconds after a dash in which a return leaves charged. 0 is off. */
  blinkSeconds: number;
  /** Blink Strike's top rank: that return is critical as well. */
  blinkCrit: boolean;
  /** Incoming ball slowdown during the dash follow-up window. */
  dashSlow: number;
  guardWindow: number;
  /** Units past the paddle's ends that a Perfect Guard still reaches. */
  guardReach: number;
  guardCooldown: number;

  // capstones -------------------------------------------------------------
  /** Returns that Overload charges. 0 when the talent is not owned. */
  overloadHits: number;
  overloadCooldown: number;
  slipstreamSeconds: number;
  slipstreamPaddle: number;
  /** Fraction the paddle lengthens by while Slipstream runs. */
  slipstreamGrow: number;
  slipstreamCooldown: number;
  aegisSeconds: number;
  /** Balls Aegis saves before its window is spent. */
  aegisSaves: number;
  aegisCooldown: number;
  zenithSeconds: number;
  /** Fraction the paddle lengthens by while Zenith runs. 0 when not owned. */
  zenithGrow: number;
  /** Extra cooldown recovery rate while Zenith or Echo is running. */
  zenithRecharge: number;
  zenithCooldown: number;
  echoSeconds: number;
  echoRecharge: number;
  echoCooldown: number;
}
