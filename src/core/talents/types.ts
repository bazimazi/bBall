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

export const ABILITIES = ['power-strike', 'dash', 'perfect-guard'] as const;
export type AbilityId = (typeof ABILITIES)[number];

export interface Branch {
  readonly id: BranchId;
  readonly name: string;
  /** One line. If it needs two, the branch is doing too much. */
  readonly blurb: string;
  /** Hue used for the branch's accents, so builds read at a glance. */
  readonly hue: number;
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
  /** Player level needed before the first rank may be bought. */
  readonly minLevel: number;
  readonly requires: readonly TalentRequirement[];
  /** The active ability this talent unlocks, when it unlocks one. */
  readonly ability?: AbilityId;
  /**
   * What rank `rank` does, in the player's words. Rendered as the "next
   * rank" preview, so it must describe the rank rather than the total.
   */
  rankText(rank: number): string;
}

export type TalentId =
  // power
  | 'power-strike'
  | 'overdrive'
  | 'heavy-impact'
  | 'critical-strike'
  | 'momentum'
  // control
  | 'quick-hands'
  | 'swift-recovery'
  | 'precision'
  | 'dash'
  | 'perfect-guard'
  // defense
  | 'shield'
  | 'second-chance'
  | 'stabilizer'
  | 'resilience'
  // momentum
  | 'combo-drive'
  | 'adrenaline'
  | 'clutch'
  | 'flow-state'
  // utility
  | 'cooldown-mastery'
  | 'experience-boost'
  | 'talent-synergy'
  | 'versatility';

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
  bestDrive: 0
};

/** The saved build. Lives inside the player profile. */
export interface TalentSave {
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
 */
export interface TalentEffects {
  // paddle ---------------------------------------------------------------
  /** Always-on paddle speed multiplier. */
  paddleMul: number;
  /** Extra multiplier while recovering off a wall. */
  edgeBoost: number;
  edgeSeconds: number;

  // returns --------------------------------------------------------------
  /** Added to the ball's per-return growth on the player's hits. */
  hitGrowth: number;
  critChance: number;
  critGrowth: number;
  /** Growth added per consecutive return within one rally, and its cap. */
  momentumPerReturn: number;
  momentumCap: number;
  /** 0..1: how far a wide, weak hit is pulled back towards a clean angle. */
  stabilise: number;
  /** Multiplier on how much paddle motion drags the return off line. */
  spinMul: number;
  /** Multiplier on the usable bounce-angle range - deliberate placement. */
  angleMul: number;

  // rally scaling --------------------------------------------------------
  /** Paddle bonus per five returns in the current rally, and its cap. */
  resiliencePerFive: number;
  resilienceCap: number;
  /** Returns since the last conceded point needed for adrenaline. */
  adrenalineAt: number;
  adrenalinePaddle: number;
  adrenalineSeconds: number;
  /** Paddle bonus once the player is a point from losing. */
  clutchPaddle: number;
  clutchGrowth: number;
  /** Rally length at which flow starts, and what each return past it adds. */
  flowFrom: number;
  flowPaddle: number;
  flowCap: number;
  /** Extra cooldown recovery rate at full flow. */
  flowRecharge: number;

  // defence --------------------------------------------------------------
  shieldCharges: number;
  shieldRecharge: number;
  shieldSaveSpeed: number;
  secondChances: number;
  /** Bulwark: a perfect guard also hands back a shield charge. */
  guardGrantsShield: boolean;

  // abilities ------------------------------------------------------------
  cooldownMul: number;
  powerStrikeSpeed: number;
  powerStrikeWindow: number;
  powerStrikeCooldown: number;
  /** Blitz: a power strike also quickens the paddle for a moment. */
  powerStrikePaddle: number;
  powerStrikePaddleSeconds: number;
  dashDistance: number;
  dashCooldown: number;
  dashSeconds: number;
  guardWindow: number;
  guardPaddle: number;
  guardSeconds: number;
  guardCooldown: number;

  // rewards --------------------------------------------------------------
  xpMul: number;
  /** Extra XP multiplier per return of the best drive, and its cap. */
  drivePerReturn: number;
  driveCap: number;
}
