import { BALANCE, paddleSpeedForLevel } from '../balance/config';
import { TALENTS } from './catalog';
import { branchSpend, dominantBranch } from './save';
import { activeSynergies, type SynergyDef } from './synergy';
import type { AbilityId, TalentEffects, TalentId, TalentSave } from './types';

export { branchSpend, dominantBranch };

/**
 * Turning a saved build into numbers.
 *
 * This is the only place ranks become effects. It runs when the player
 * changes their build, not per frame, and it is pure - the same save always
 * resolves to the same bag, which is what makes a build shareable and a
 * balance change a one-line edit in {@link BALANCE}.
 *
 * Order matters: ranks, then Versatility (which reads the shape of the
 * build), then synergies, then the caps. Caps come last so no combination,
 * however exotic, can leave the ranges the simulation is tested against.
 */

const E = BALANCE.effects;

export interface ResolvedLoadout {
  readonly effects: TalentEffects;
  /** Equipped abilities, already filtered to ones the build actually owns. */
  readonly equipped: readonly (AbilityId | null)[];
  readonly synergies: readonly SynergyDef[];
  /** Paddle speed from player level alone, before talents or buffs. */
  readonly basePaddleSpeed: number;
  /** Paddle speed with the always-on talent bonuses folded in. */
  readonly paddleSpeed: number;
  readonly level: number;
}

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

function baseEffects(): TalentEffects {
  return {
    paddleMul: 1,
    edgeBoost: 0,
    edgeSeconds: E.swiftRecovery.seconds,

    hitGrowth: 0,
    critChance: 0,
    critGrowth: E.criticalStrike.growth,
    momentumPerReturn: 0,
    momentumCap: 0,
    stabilise: 0,
    spinMul: 1,
    angleMul: 1,

    resiliencePerFive: 0,
    resilienceCap: 0,
    adrenalineAt: E.adrenaline.threshold,
    adrenalinePaddle: 0,
    adrenalineSeconds: E.adrenaline.seconds,
    clutchPaddle: 0,
    clutchGrowth: 0,
    flowFrom: E.flowState.from,
    flowPaddle: 0,
    flowCap: 0,
    flowAngle: 0,
    flowRecharge: 0,

    shieldCharges: 0,
    shieldRecharge: E.shield.rechargeSeconds,
    shieldSaveSpeed: E.shield.saveSpeed,
    secondChances: 0,
    guardGrantsShield: false,

    cooldownMul: 1,
    powerStrikeSpeed: E.powerStrike.speed,
    powerStrikeWindow: E.powerStrike.window,
    powerStrikeCooldown: E.powerStrike.cooldown,
    powerStrikePaddle: 0,
    powerStrikePaddleSeconds: 0,
    dashDistance: E.dash.distance,
    dashCooldown: E.dash.cooldown,
    dashSeconds: E.dash.seconds,
    guardWindow: E.perfectGuard.baseWindow,
    guardPaddle: E.perfectGuard.basePaddle,
    guardSeconds: E.perfectGuard.seconds,
    guardCooldown: E.perfectGuard.cooldown,

    // Capstones resolve to their catalogue values but stay inert until the
    // talent is owned - `overloadHits` of 0 is what "not learned" means.
    overloadHits: 0,
    overloadCooldown: E.overload.cooldown,
    slipstreamSeconds: E.slipstream.seconds,
    slipstreamPaddle: 0,
    slipstreamGrow: 0,
    slipstreamCooldown: E.slipstream.cooldown,
    aegisSeconds: E.aegis.seconds,
    aegisSaves: E.aegis.saves,
    aegisCooldown: E.aegis.cooldown,
    zenithSeconds: E.zenith.seconds,
    zenithPaddle: 0,
    zenithRecharge: E.zenith.recharge,
    zenithCooldown: E.zenith.cooldown,
    echoSeconds: E.echo.seconds,
    echoRecharge: E.echo.recharge,
    echoCooldown: E.echo.cooldown,

    xpMul: 1,
    drivePerReturn: 0,
    driveCap: 0
  };
}

function rankOf(save: TalentSave, id: TalentId): number {
  return Math.max(0, save.ranks[id] ?? 0);
}

/** Apply every owned rank. Nothing here caps: that happens once, at the end. */
function applyRanks(effects: TalentEffects, save: TalentSave): void {
  const r = (id: TalentId) => rankOf(save, id);

  // -- power --------------------------------------------------------------
  const overdrive = r('overdrive');
  if (r('power-strike') > 0) {
    effects.powerStrikeSpeed += overdrive * E.overdrive.speed;
    effects.powerStrikeCooldown += overdrive * E.overdrive.cooldown;
  }
  effects.hitGrowth += r('heavy-impact') * E.heavyImpact.growth;
  effects.critChance += r('critical-strike') * E.criticalStrike.chance;

  const momentum = r('momentum');
  effects.momentumPerReturn += momentum * E.momentum.perReturn;
  effects.momentumCap += momentum * E.momentum.cap;

  // -- control ------------------------------------------------------------
  effects.paddleMul *= 1 + r('quick-hands') * E.quickHands.paddle;
  effects.edgeBoost += r('swift-recovery') * E.swiftRecovery.edgeBoost;

  const precision = r('precision');
  effects.angleMul *= 1 + precision * E.precision.angle;
  effects.spinMul *= 1 + precision * E.precision.spin;

  const guard = r('perfect-guard');
  if (guard > 0) {
    effects.guardWindow += (guard - 1) * E.perfectGuard.window;
    effects.guardPaddle += (guard - 1) * E.perfectGuard.paddle;
  }

  // -- defense ------------------------------------------------------------
  effects.shieldCharges += r('shield') * E.shield.charges;
  effects.secondChances += r('second-chance') * E.secondChance.uses;

  const stabilizer = r('stabilizer');
  effects.stabilise += stabilizer * E.stabilizer.pull;
  effects.spinMul *= 1 + stabilizer * E.stabilizer.spin;

  const resilience = r('resilience');
  effects.resiliencePerFive += resilience * E.resilience.perFive;
  effects.resilienceCap += resilience * E.resilience.cap;

  // -- momentum -----------------------------------------------------------
  const combo = r('combo-drive');
  effects.drivePerReturn += combo * E.comboDrive.xpPerReturn;
  effects.driveCap += combo * E.comboDrive.cap;

  const adrenaline = r('adrenaline');
  effects.adrenalinePaddle = Math.min(E.adrenaline.cap, adrenaline * E.adrenaline.paddle);

  const clutch = r('clutch');
  effects.clutchPaddle += clutch * E.clutch.paddle;
  effects.clutchGrowth += clutch * E.clutch.growth;

  const flow = r('flow-state');
  effects.flowPaddle += flow * E.flowState.paddle;
  effects.flowCap += flow * E.flowState.cap;
  effects.flowAngle += flow * E.flowState.angle;
  effects.flowRecharge += flow * E.flowState.recharge;

  // -- utility ------------------------------------------------------------
  effects.cooldownMul *= 1 + r('cooldown-mastery') * E.cooldownMastery.cooldown;
  effects.xpMul *= 1 + r('experience-boost') * E.experienceBoost.xp;

  // -- capstones ----------------------------------------------------------
  if (r('overload') > 0) effects.overloadHits = E.overload.hits;
  if (r('slipstream') > 0) {
    effects.slipstreamPaddle = E.slipstream.paddle;
    effects.slipstreamGrow = E.slipstream.grow;
  }
  if (r('zenith') > 0) effects.zenithPaddle = E.zenith.paddle;
}

/** Versatility: a small bonus to whatever the build already cares about. */
function applyVersatility(effects: TalentEffects, save: TalentSave): void {
  const rank = rankOf(save, 'versatility');
  if (rank === 0) return;
  const branch = dominantBranch(save);
  if (!branch) return;
  const bonus = rank * E.versatility.bonus;

  switch (branch) {
    case 'power':
      effects.critChance += bonus;
      break;
    case 'control':
      effects.paddleMul *= 1 + bonus;
      break;
    case 'defense':
      effects.stabilise += bonus * 2;
      break;
    case 'momentum':
      effects.driveCap += bonus;
      break;
    case 'utility':
      effects.cooldownMul *= 1 - bonus;
      break;
  }
}

/** The one place a resolved bag is allowed to leave its ranges. It cannot. */
function applyCaps(effects: TalentEffects): void {
  const { talents, rewards } = BALANCE;

  effects.paddleMul = clamp(effects.paddleMul, 1, talents.maxPaddleMul);
  effects.cooldownMul = clamp(effects.cooldownMul, talents.minCooldownMul, 1);
  effects.critChance = clamp(effects.critChance, 0, E.criticalStrike.chanceCap);
  effects.stabilise = clamp(effects.stabilise, 0, 0.85);
  effects.spinMul = clamp(effects.spinMul, 0.25, 1);
  effects.angleMul = clamp(effects.angleMul, 1, 1.25);
  effects.xpMul = clamp(effects.xpMul, 1, rewards.maxXpMul);
  effects.driveCap = clamp(effects.driveCap, 0, 0.3);
  effects.flowRecharge = clamp(effects.flowRecharge, 0, 0.6);
  effects.edgeBoost = clamp(effects.edgeBoost, 0, 0.6);

  // Abilities: cooldown mastery and synergies fold in here, never below a
  // floor - an ability that is always available stops being a decision.
  effects.powerStrikeCooldown = Math.max(2, effects.powerStrikeCooldown * effects.cooldownMul);
  effects.dashCooldown = Math.max(1.5, effects.dashCooldown * effects.cooldownMul);
  effects.guardCooldown = Math.max(2, effects.guardCooldown * effects.cooldownMul);

  // A capstone floors far higher than an ordinary skill: even a build built
  // entirely around cooldowns cannot make one of these a rotation.
  const ultimate = (span: number) => Math.max(14, span * effects.cooldownMul);
  effects.overloadCooldown = ultimate(effects.overloadCooldown);
  effects.slipstreamCooldown = ultimate(effects.slipstreamCooldown);
  effects.aegisCooldown = ultimate(effects.aegisCooldown);
  effects.zenithCooldown = ultimate(effects.zenithCooldown);
  effects.echoCooldown = ultimate(effects.echoCooldown);

  effects.slipstreamPaddle = clamp(effects.slipstreamPaddle, 0, 1);
  effects.slipstreamGrow = clamp(effects.slipstreamGrow, 0, 0.6);
  effects.zenithPaddle = clamp(effects.zenithPaddle, 0, 0.6);

  // A charged return is still a return: it may never outrun the hard ceiling,
  // which the physics also enforces against the live ball.
  effects.powerStrikeSpeed = clamp(effects.powerStrikeSpeed, 0, 0.6);
  effects.dashDistance = clamp(effects.dashDistance, 0, 220);
  effects.guardWindow = clamp(effects.guardWindow, 0.1, 0.6);
  effects.shieldSaveSpeed = clamp(effects.shieldSaveSpeed, 0.6, 1);
}

/** Drop any equipped ability the build no longer owns. */
function usableEquipped(save: TalentSave): (AbilityId | null)[] {
  return save.equipped.map((id) => {
    if (!id) return null;
    const talent = TALENTS.find((entry) => entry.ability === id);
    return talent && rankOf(save, talent.id) > 0 ? id : null;
  });
}

export function resolveLoadout(save: TalentSave, level: number): ResolvedLoadout {
  const effects = baseEffects();
  applyRanks(effects, save);
  applyVersatility(effects, save);

  const equipped = usableEquipped(save);
  const synergies = activeSynergies(save.ranks, equipped);
  const magnitude = 1 + rankOf(save, 'talent-synergy') * E.talentSynergy.magnitude;
  for (const synergy of synergies) synergy.apply(effects, magnitude);

  if (synergies.length > 0) {
    effects.paddleMul *=
      1 + synergies.length * rankOf(save, 'talent-synergy') * E.talentSynergy.paddlePerSynergy;
  }

  applyCaps(effects);

  const basePaddleSpeed = paddleSpeedForLevel(level);
  return {
    effects,
    equipped,
    synergies,
    basePaddleSpeed,
    paddleSpeed: Math.min(BALANCE.paddle.max, basePaddleSpeed * effects.paddleMul),
    level
  };
}
