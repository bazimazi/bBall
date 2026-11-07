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

/** Ball-speed scaling per opponent rank (1..6). Difficulty lives here. */
export interface RankScale {
  /** Serve speed multiplier. */
  readonly serve: number;
  /** Ceiling multiplier. */
  readonly max: number;
  /** Multiplier on the *growth above 1* applied per return. */
  readonly growth: number;
}

export const BALANCE = {
  equipment: {
    steelBand: 0.25,
    steelGrowth: 0.04,
    steelGrip: 0.9,
    corkBleed: 0.8,
    corkAttack: 0.9,
    gelBleed: 0.8,
    gelAttack: 0.85,
    gelStore: 80,
    gelRelease: 0.5,
    copperGrowth: 0.04,
    copperPassive: 0.75,
    copperGrip: 0.96,
    rubberGrip: 1.2,
    rubberOffset: 0.94,
    ceramicBand: 0.08,
    ceramicGrip: 0.8,
    graphiteCentre: 0.85,
    graphiteEdge: 1.25,
    wovenAngle: 0.88,
    splitStart: 0.3,
    splitEnd: 0.7,
    frameReach: 0.06,
    extendedGrip: 0.88,
    compactOffset: 1.06,
    minGrip: 0.7,
    maxGrip: 1.35,
    overallSpinMax: 3,
    firmGrowth: 0.015,
    firmGrip: 0.92,
    tuningGrip: 1.08,
    tuningOffset: 0.96,
    benchPace: 430,
    benchAttackPace: 760,
    benchSurge: 120,
    spinInfluence: 0.26,
    starterMarks: 12,
    recipeMarks: 12,
    winMarks: 4,
    lossMarks: 2,
    maxMarks: 9999,
    minHits: 3,
    maxAttempts: 20
  },
  /** Optional slower ball in unranked Practice; paddle response is unchanged. */
  practice: { relaxed: { serveScale: 0.72, maxScale: 0.72, growthScale: 0.7 } },
  /** Optional first-rally lesson. These values never enter ranked rules. */
  tutorial: {
    serve: 270,
    max: 360,
    growth: 1,
    returnPreview: 0.8,
    placement: 0.65,
    angleThreshold: 0.45
  },
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
    /**
     * Keyboard travel, as a fraction of the current paddle speed. At 0.7 a
     * level-1 keyboard player moved slower than the Amateur bot, and lost to
     * a Pro their mouse-playing self beat; a key held down is already a
     * coarser tool than a pointer.
     */
    keyboardShare: 0.9,
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
      { serve: 1.2, max: 1.26, growth: 1.3 },
      { serve: 1.28, max: 1.36, growth: 1.45 }
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
     * a tree that costs more than twice that keeps a build a set of choices rather than a
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
    /**
     * Seconds that must pass between two uses of the same skill, whatever is
     * hurrying its cooldown along. Tempo, Echo and Zenith all shorten a
     * cooldown faster than time does; this is the one number none of them can
     * get under, and the server's cast ceiling is built from it.
     */
    minRecast: 1.5,
    /**
     * Ceiling on how much longer - or shorter - talents may make the paddle
     * outside an ultimate. Length is the stat that saves points most directly,
     * so it is the one that needs a lid most. An ultimate may go past it, up
     * to the paddle's own hard limit.
     */
    maxLength: 0.3,
    minLength: -0.15,
    /** Ceiling on the ball-speed growth a single return may reach. */
    maxHitGrowth: 1.2
  },

  /**
   * Per-rank talent magnitudes. Every value is "per rank" unless the name
   * says otherwise, and every one of them is capped somewhere above.
   *
   * Tuned against a headless run of the real engine: each talent was played
   * alone, for thousands of points against two opponents, and kept only if
   * its point share moved by more than the noise. The bands it was tuned to
   * are roughly +2 points of point share per talent point for an ordinary
   * talent, and +8 to +12 for an ultimate with its path.
   */
  effects: {
    // -- power ------------------------------------------------------------
    /**
     * `minAngle` is the floor on how far off centre a charged return leaves.
     * Pace alone barely troubles a composed opponent - it is pace sent
     * somewhere awkward that wins the point.
     */
    powerStrike: { speed: 0.25, window: 4, cooldown: 8, minAngle: 0.62, stretch: 0.3, heft: 0.25 },
    /** Rank two also charges the return after, so one press buys two. */
    overdrive: { speed: 0.06, cooldown: -1.5 },
    /**
     * Heft: how much wider the opponent's read of every player return goes.
     *
     * This used to be pace, and pace measured as nothing - raised growth,
     * then a raised ceiling, then a ball allowed past the ceiling. A bot's
     * error is dominated by its read, not by the ball's speed, so "a heavy
     * ball" is modelled as what it does to the read.
     */
    heavyImpact: { heft: 0.12 },
    criticalStrike: {
      chance: 0.15,
      /** A crit's own bonus, before ranks. Overload crits with this alone. */
      growth: 0.1,
      /** Added to `growth` per rank: a deeper investment hits harder, too. */
      growthPerRank: 0.04,
      /** Above three ranks' worth, so Reckless still buys crit chance. */
      chanceCap: 0.6,
      /** A critical return is driven at least this far off centre. */
      minAngle: 0.62,
      angle: 0.16,
      heft: 0.45
    },
    /** A return off a wall leaves this much steeper, per rank. */
    bankShot: { angle: 0.04 },
    /** Every `start - rank * step`-th return of a rally leaves charged. */
    momentum: { start: 7, step: 2 },
    /**
     * The keystone: more crits, heavier crits - and no saves of any kind to
     * pay for them. A shorter paddle was tried first; length is worth so much
     * that it cancelled the whole bonus, and a keystone that nets to nothing
     * is not a decision.
     */
    reckless: { chance: 0.25, growth: 0.15, heft: 0.3 },

    // -- control ----------------------------------------------------------
    longReach: { length: 0.05 },
    precision: { angle: 0.07, spin: -0.12 },
    /**
     * Field units a return breaks by, per rank, once it is `from` of the way
     * across - far enough over that a bot has taken its last look and a person
     * has committed. Small on purpose: a break nobody can see coming is worth
     * far more than its size suggests. Aimed away from the opponent's paddle,
     * sixteen units a rank won nearly every point; this is the measured size.
     */
    swerve: { shift: 5, from: 0.84 },
    dash: { distance: 110, cooldown: 6, seconds: 0.12 },
    /** Seconds after a dash in which a return leaves charged, and what each rank takes off the dash. */
    blinkStrike: { seconds: 1.2, cooldown: -1.5 },
    /**
     * A parry. A ball arriving inside the window is returned even when it
     * would have cleared the paddle by up to `reach` units, and it goes back
     * charged. It used to flatten and slow the return instead - which made
     * the one skill about reading the ball measurably worse than not owning
     * it.
     */
    perfectGuard: {
      baseWindow: 0.25,
      window: 0.05,
      baseReach: 10,
      reach: 15,
      cooldown: 8,
      /** Added to `cooldown` per rank past the first. */
      cooldownStep: -1
    },

    // -- defense ----------------------------------------------------------
    /**
     * Units from each wall where Bastion turns a ball back at the line:
     * `reach` at rank one and `step` more at rank two. Worth far more to a
     * person, who misjudges wall bounces, than to a bot: at 90 and 140 units a
     * human-model player gained ten points of point share per talent point.
     * It goes back at full pace, `minAngle` off centre and `heft` heavy.
     */
    bastion: { reach: 50, step: 30, minAngle: 0.5, heft: 0.3 },
    /**
     * `rechargeStep` is added per rank past the first, so charges return
     * sooner. A charge used to come back every 48 seconds, which made a
     * two-point talent worth more than most ultimates.
     */
    shield: {
      charges: 1,
      rechargeSeconds: 130,
      rechargeStep: -30,
      minRecharge: 50,
      saveSpeed: 0.92
    },
    /** `slow` is time, not pace: the ball's clock in the player's half, one point from losing. */
    clutch: { length: 0.2, growth: -0.015, slow: 0.1 },
    /** Fraction off each shield charge's recharge, per rank. */
    fortify: { recharge: 0.25 },
    /**
     * Saves are rare, so a talent that only improved the ball each save sends
     * back measured as nothing; `primed` turns the save into an attack that
     * lasts. An extra Shield charge was tried too, and out-measured Shield's
     * own second rank for a human player.
     */
    counterstrike: { pace: 0.25, minAngle: 0.6, heft: 0.6, primed: 3 },
    /** Uses per match. One measured as less than a point of point share per talent point. */
    secondChance: { uses: 2 },

    // -- momentum ---------------------------------------------------------
    /** Returns charged at the start of the rally after a won point, and what rank two adds. */
    hotHand: { returns: 4, step: 2 },
    comboDrive: { every: 5, length: 0.03, steps: 3 },
    /**
     * Every `start - rank * step` returns on a drive bank one spare save.
     * A save is worth far more to a person than to a bot: banked every twenty
     * returns, one point here out-measured three in Long Reach for a
     * human-model player.
     */
    adrenaline: { start: 52, step: 8 },
    flowState: {
      from: 2,
      /** Returns past `from` that Flow State keeps counting. */
      stacks: 8,
      /**
       * Placement, not pace. A wider deliberate angle is what still wins
       * points once a rally is long, so that is what flow builds.
       */
      angle: 0.01,
      recharge: 0.1,
      /** Heft per stack: a long rally wears the opponent's read down. */
      heft: 0.012
    },
    unbroken: { keep: 0.5 },

    // -- utility ----------------------------------------------------------
    tempo: { perReturn: 0.5 },
    cooldownMastery: { cooldown: -0.1 },
    /**
     * With three skills equipped a skill is used every few seconds, so this
     * is close to always on: at 10% a rank, two points out-measured three in
     * Long Reach.
     */
    afterglow: { length: 0.08, seconds: 3 },
    versatility: { slots: 1 },
    talentSynergy: { magnitude: 0.5, lengthPerSynergy: 0.025 },
    combinations: { parryTempo: 1, afterglowTempo: 0.35, blinkWindow: 0.3, conduitRecharge: 0.15 },
    edgePressure: { threshold: 0.9, thresholdStep: -0.1 },
    /** Seconds of Dash cooldown each Blink Strike return gives back, per rank. */
    timeSlip: { refund: 1.25 },
    rallyArmor: { perReturn: 1.5 },
    fastStart: { flowStep: 1, comboStep: 1 },
    chainCasting: { refund: 0.75 },
    /** `overflowRecharge`: Versatility once level alone has opened every slot - two points, so worth two of Cooldown Mastery. */
    rankRewards: { strikeWindow: 0.5, afterglowSeconds: 1, overflowRecharge: 0.2 },

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
    /**
     * Length is the half of this that wins points; the speed is there so the
     * longer paddle still feels light. Speed on its own measured as nothing.
     */
    slipstream: { seconds: 8, paddle: 0.6, grow: 0.5, cooldown: 25 },
    /**
     * Bounded twice over: a window *and* a count. Six seconds of saving
     * everything measured at nearly twenty points of win rate over an
     * already-strong defensive build - far past what a capstone should buy.
     */
    aegis: { saves: 2, seconds: 6, cooldown: 38 },
    /**
     * `refunds` is per *match*, not per casting. Re-castable insurance every
     * thirty-five seconds measured at more than twice the baseline win rate -
     * the same trap Aegis fell into. The window is repeatable; the safety net
     * is not.
     */
    zenith: { seconds: 8, grow: 0.3, recharge: 2, refunds: 1, cooldown: 35 },
    echo: { seconds: 6, recharge: 4, cooldown: 35 }
  },

  /**
   * Talent points an opponent's build carries in the content a developed
   * build reaches - see `core/bots/builds.ts`. Bot brains top out at
   * Legend; these are what keep the later Journey, cups, the Gauntlet and the
   * contracts a contest. Tuned against a human-model player.
   */
  opponents: {
    max: 49,
    /**
     * The share of a content build the Champion still brings. Its brain is
     * already the difficulty; a full build and the late pace on top of it
     * measured as unwinnable for every player.
     */
    championShare: 0,
    /** Expansion world 6, plus this much per world after it. */
    journey: 8,
    journeyStep: 1,
    /** Added for a world's trials and boss; taken off its three teaching stages. */
    trial: 4,
    boss: 4,
    teaching: 4,
    /** Frontier sector 1, plus this much per sector. */
    frontier: 8,
    frontierStep: 0.8,
    /** Gauntlet: per act, and per level of Pressure. */
    runAct: 1,
    runPressure: 0.5,
    /** Cups: per level a tier unlocks above `cupFrom`. Bronze to Gold stay plain. */
    cupFrom: 15,
    cupLevel: 0.3,
    /**
     * Contracts. Mythic already plays the Champion on its own reduced reach,
     * larger opponent and longer game; any build on top measured as
     * unwinnable even for an expert player.
     */
    master: 0,
    mythic: 0
  },

  /**
   * Content pace - see `core/modes/pace.ts`. Multipliers on serve, ceiling
   * and per-return growth together, on top of the opponent's rank. Tuned
   * against a human-model player; the ball's hard ceiling still applies.
   */
  pace: {
    max: 1.45,
    /** Per Journey world after the fifth. */
    journeyStep: 0.012,
    /** Frontier sector 1, plus this much per sector. */
    frontier: 1,
    frontierStep: 0.01,
    /** Gauntlet: per act, and per level of Pressure. */
    runAct: 0.03,
    runPressure: 0.003,
    /** Cups: per level a tier opens above `cupFrom`. */
    cupFrom: 15,
    cupLevel: 0.006,
    master: 1.05,
    mythic: 1
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

/**
 * How many active abilities the player may equip at `level`. `bonus` is the
 * slots a build buys on top (Versatility); the hard maximum still holds.
 */
export function abilitySlotsForLevel(level: number, bonus = 0): number {
  const { base, extraAtLevels, max } = BALANCE.talents.slots;
  const extra = extraAtLevels.filter((at) => level >= at).length;
  return Math.min(max, base + extra + Math.max(0, bonus));
}

/** The level that opens the next slot, or null once they are all open. */
export function nextSlotLevel(level: number): number | null {
  const { extraAtLevels } = BALANCE.talents.slots;
  return extraAtLevels.find((at) => level < at) ?? null;
}
