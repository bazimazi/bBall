/**
 * Every balance number the game plays by, in one place.
 *
 * The guiding rule, and the reason this file exists at all:
 *
 *   Difficulty makes the ball harder to handle.
 *   Progression makes the player's paddle more capable.
 *   Talents decide how the player handles that difficulty.
 *
 * Those three are kept strictly apart. `ball` is scaled by the opponent's
 * rank and by mode modifiers - never by the player's level. `paddle` is
 * scaled by the player's level and their talents - never by the opponent.
 * Nothing outside this file may hard-code a speed, a cooldown or a cap.
 */

/** Ball-speed scaling per opponent rank (1..5). Difficulty lives here. */
export interface RankScale {
  /** Serve speed multiplier. */
  readonly serve: number;
  /** Ceiling multiplier. */
  readonly max: number;
  /** Multiplier on the *growth above 1* applied per return. */
  readonly growth: number;
}

export const BALANCE = {
  /**
   * The player's paddle. Deliberately unhurried at level 1 so a first match
   * is about reading the ball rather than out-running it, and comfortably
   * quicker than every opponent by the time the ladder gets steep.
   */
  paddle: {
    /** Field units per second at level 1. Above every bot's own speed. */
    base: 960,
    /** Added per player level, until `max` is reached at level 53. */
    perLevel: 20,
    /** Level, talents and ordinary buffs may never push past this. */
    max: 2000,
    /**
     * The ceiling while an ultimate is running.
     *
     * Without it an ultimate's speed bonus would be invisible: a deep build
     * already sits on `max`, so anything added on top would clamp straight
     * back to it. A capstone is allowed past the everyday ceiling, briefly,
     * and this is the only thing in the game that may go there.
     */
    burst: 2900,
    /** Keyboard travel, as a fraction of the current paddle speed. */
    keyboardShare: 0.7,
    /** Field units from a wall that still counts as "at the edge". */
    edgeBand: 26
  },

  /**
   * The ball. Slow and readable out of the box; the ladder makes it faster,
   * and only the ladder does.
   */
  ball: {
    /** Serve speed against a rank-3 opponent, before mode modifiers. */
    serve: 430,
    max: 1060,
    /** Speed multiplier applied on every return. */
    growth: 1.042,
    /** Serve speed added per point played, up to ten points in. */
    perPoint: 15,
    /** Index 0 is rank 1. Difficulty, expressed purely as ball speed. */
    rank: [
      { serve: 0.88, max: 0.86, growth: 0.7 },
      { serve: 0.96, max: 0.95, growth: 0.85 },
      { serve: 1.05, max: 1.06, growth: 1 },
      { serve: 1.13, max: 1.16, growth: 1.15 },
      { serve: 1.2, max: 1.26, growth: 1.3 }
    ] as readonly RankScale[],
    /** Absolute ceiling. No modifier, talent or ability may exceed it. */
    hardMax: 1720,
    /** Absolute floor, so a defensive build can never stall the ball. */
    hardMin: 240,
    /**
     * How much of the pace a Power build *added* comes off again when the
     * opponent returns it.
     *
     * Without this, extra ball speed is symmetric - it comes straight back at
     * the player who put it there - and investing in Power makes the game
     * harder for its owner than for the opponent. Bleeding most of it off on
     * the way back makes pace an attack rather than a shared punishment,
     * which is the whole point of the branch.
     */
    surgeBleed: 0.6
  },

  /** Talent-point economy and the shape of the tree. */
  talents: {
    pointsPerLevel: 1,
    /**
     * The last level that pays a talent point.
     *
     * Levelling itself never stops, but power from it does: 49 points against
     * a tree that costs 86 keeps a build a set of choices rather than a
     * checklist, however long someone plays.
     */
    pointsUntilLevel: 50,
    /**
     * Points that must already sit in a branch before its next row of
     * talents opens. Depth is bought with commitment to one branch rather
     * than with player level, so the grid itself explains the gate.
     */
    pointsPerTier: 2,
    /**
     * Equipped active abilities: two to start, and one more at each level
     * listed. Extra slots are spaced far apart on purpose - carrying every
     * skill you own is meant to be a late reward, not the default.
     */
    slots: { base: 2, extraAtLevels: [15, 30, 50] as readonly number[], max: 5 },
    /** Respec is free: builds are meant to be tried, not committed to. */
    respecFree: true,
    /** Floor on the combined cooldown multiplier. Stops infinite loops. */
    minCooldownMul: 0.45,
    /** Ceiling on every paddle-speed source multiplied together. */
    maxPaddleMul: 1.6,
    /** Ceiling on the ball-speed growth a single return may reach. */
    maxHitGrowth: 1.2
  },

  /**
   * Per-rank talent magnitudes. Every value is "per rank" unless the name
   * says otherwise, and every one of them is capped somewhere above.
   */
  effects: {
    // -- power ------------------------------------------------------------
    powerStrike: { speed: 0.22, window: 4, cooldown: 9 },
    overdrive: { speed: 0.08, cooldown: -0.9 },
    heavyImpact: { growth: 0.014 },
    /**
     * `angle` widens the contact offset on a heavy return, so power lands
     * the ball further from the opponent rather than only faster. Speed
     * alone barely troubles a composed bot; speed plus angle wins points,
     * which is what makes the branch worth investing in.
     */
    criticalStrike: {
      chance: 0.08,
      /** A crit's own bonus, before ranks. Overload crits with this alone. */
      growth: 0.1,
      /** Added to `growth` per rank: a deeper investment hits harder, too. */
      growthPerRank: 0.04,
      /** Above three ranks' worth, so Versatility still buys crit chance. */
      chanceCap: 0.3,
      angle: 0.16
    },
    momentum: { perReturn: 0.005, cap: 0.05 },

    // -- control ----------------------------------------------------------
    quickHands: { paddle: 0.035 },
    /** `seconds` is per rank as well: rank two holds the boost twice as long. */
    swiftRecovery: { edgeBoost: 0.22, seconds: 0.5 },
    precision: { angle: 0.05, spin: -0.12 },
    dash: { distance: 110, cooldown: 5, seconds: 0.12 },
    perfectGuard: {
      baseWindow: 0.25,
      window: 0.06,
      basePaddle: 0.14,
      paddle: 0.06,
      seconds: 3,
      /** Added to `seconds` per rank past the first. */
      secondsStep: 0.75,
      cooldown: 8
    },

    // -- defense ----------------------------------------------------------
    /** `rechargeStep` is added per rank past the first, so charges return sooner. */
    shield: { charges: 1, rechargeSeconds: 48, rechargeStep: -8, minRecharge: 24, saveSpeed: 0.92 },
    secondChance: { uses: 1 },
    stabilizer: { pull: 0.2, spin: -0.12 },
    resilience: { perFive: 0.016, cap: 0.07 },

    // -- momentum ---------------------------------------------------------
    comboDrive: { xpPerReturn: 0.005, cap: 0.07 },
    /** `secondsStep` is added per rank past the first: longer, as well as stronger. */
    adrenaline: { threshold: 6, paddle: 0.07, seconds: 3.25, secondsStep: 0.75, cap: 0.21 },
    clutch: { paddle: 0.12, growth: -0.015 },
    flowState: {
      from: 6,
      /** Returns past `from` that Flow State keeps counting. */
      stacks: 10,
      paddle: 0.004,
      cap: 0.06,
      /**
       * Placement, not just pace. Paddle speed alone stops mattering once a
       * build is deep - a wider deliberate angle is what still wins points,
       * and it is what gives the Momentum branch teeth of its own.
       */
      angle: 0.005,
      recharge: 0.1
    },

    // -- utility ----------------------------------------------------------
    cooldownMastery: { cooldown: -0.1 },
    experienceBoost: { xp: 0.05 },
    talentSynergy: { magnitude: 0.5, paddlePerSynergy: 0.02 },
    versatility: { bonus: 0.035 },

    /*
     * The capstones.
     *
     * One per branch, at the bottom of its grid, behind eight points of
     * commitment and costing four more - roughly half a maxed-out player's
     * entire budget for a single talent. They are priced to be the reason a
     * build goes deep rather than wide, so each one has to change a rally
     * rather than nudge a number: long cooldowns, short windows, obvious
     * effects.
     */
    /**
     * Charged, critical, and driven into a corner: `minAngle` is the floor on
     * how far off centre an Overload return leaves, so the opponent has to
     * cross the court for every one of them.
     *
     * Two things were tried and measured first. Raw extra pace did nothing
     * against a composed bot, and pace that the opponent could not bleed off
     * was actively *worse* than the plain ability - the player has to handle
     * the fast ball on the way back too. Placement is what wins points here.
     */
    overload: { hits: 4, minAngle: 0.62, angle: 0.35, cooldown: 30 },
    slipstream: { seconds: 7, paddle: 0.6, grow: 0.4, cooldown: 30 },
    /**
     * Bounded twice over: a window *and* a count. Six seconds of saving
     * everything measured at nearly twenty points of win rate over an
     * already-strong defensive build - far past what a capstone should buy.
     */
    aegis: { saves: 2, seconds: 8, cooldown: 40 },
    /**
     * `refunds` is per *match*, not per casting. Re-castable insurance every
     * thirty-five seconds measured at more than twice the baseline win rate -
     * the same trap Aegis fell into. The window is repeatable; the safety net
     * is not.
     */
    zenith: { seconds: 8, paddle: 0.35, recharge: 2, refunds: 1, cooldown: 35 },
    echo: { seconds: 6, recharge: 2.5, cooldown: 45 }
  },

  /** What a finished match is allowed to add on top of the base XP rules. */
  rewards: {
    /** Hard ceiling on every XP multiplier a build can stack. */
    maxXpMul: 1.25
  }
} as const;

/** Ball scaling for an opponent of `rank`, clamped into the table. */
export function rankScale(rank: number): RankScale {
  const table = BALANCE.ball.rank;
  const index = Math.min(table.length, Math.max(1, Math.round(rank))) - 1;
  return table[index] ?? table[2]!;
}

/** The player's paddle speed from level alone, before any talent. */
export function paddleSpeedForLevel(level: number): number {
  const steps = Math.max(0, Math.round(level) - 1);
  return Math.min(BALANCE.paddle.max, BALANCE.paddle.base + steps * BALANCE.paddle.perLevel);
}

/** How many active abilities the player may equip at `level`. */
export function abilitySlotsForLevel(level: number): number {
  const { base, extraAtLevels, max } = BALANCE.talents.slots;
  const extra = extraAtLevels.filter((at) => level >= at).length;
  return Math.min(max, base + extra);
}

/** The level that opens the next slot, or null once they are all open. */
export function nextSlotLevel(level: number): number | null {
  const { extraAtLevels } = BALANCE.talents.slots;
  return extraAtLevels.find((at) => level < at) ?? null;
}
