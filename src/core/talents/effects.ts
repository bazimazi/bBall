import { abilitySlotsForLevel, BALANCE, paddleSpeedForLevel } from '../balance/config';
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
 * Order matters: ranks, then synergies, then the caps. Caps come last so no
 * combination, however exotic, can leave the ranges the simulation is tested
 * against.
 */

const E = BALANCE.effects;

export interface ResolvedLoadout {
  readonly effects: TalentEffects;
  /** Equipped abilities, already filtered to ones the build actually owns. */
  readonly equipped: readonly (AbilityId | null)[];
  readonly synergies: readonly SynergyDef[];
  /** Paddle speed from player level alone. Talents no longer add to it. */
  readonly paddleSpeed: number;
  /** Skill slots open to this build: level's, plus Versatility's. */
  readonly slots: number;
  readonly level: number;
}

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

function baseEffects(): TalentEffects {
  return {
    length: 0,
    comboLength: 0,
    comboEvery: E.comboDrive.every,
    comboSteps: E.comboDrive.steps,
    clutchLength: 0,
    clutchGrowth: 0,
    clutchSlow: 0,
    afterglowLength: 0,
    afterglowSeconds: E.afterglow.seconds,
    foresight: 0,

    heft: 0,
    critChance: 0,
    critGrowth: E.criticalStrike.growth,
    critHeft: E.criticalStrike.heft,
    momentumEvery: 0,
    spinMul: 1,
    angleMul: 1,
    swerve: 0,
    bankShot: 0,
    hotHand: 0,
    hotHandCrit: false,
    counterPace: 0,

    flowFrom: E.flowState.from,
    flowAngle: 0,
    flowRecharge: 0,
    flowHeft: 0,
    adrenalineEvery: 0,
    driveKeep: 0,

    bastion: 0,
    unsaved: false,
    shieldCharges: 0,
    shieldRecharge: E.shield.rechargeSeconds,
    shieldSaveSpeed: E.shield.saveSpeed,
    secondChances: 0,
    guardGrantsShield: false,

    cooldownMul: 1,
    tempo: 0,
    extraSlots: 0,
    powerStrikeSpeed: E.powerStrike.speed,
    powerStrikeWindow: E.powerStrike.window,
    powerStrikeCooldown: E.powerStrike.cooldown,
    powerStrikeHits: 1,
    chargedCrits: false,
    dashDistance: E.dash.distance,
    dashCooldown: E.dash.cooldown,
    dashSeconds: E.dash.seconds,
    blinkSeconds: 0,
    blinkCrit: false,
    guardWindow: E.perfectGuard.baseWindow,
    guardReach: E.perfectGuard.baseReach,
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
    zenithGrow: 0,
    zenithRecharge: E.zenith.recharge,
    zenithCooldown: E.zenith.cooldown,
    echoSeconds: E.echo.seconds,
    echoRecharge: E.echo.recharge,
    echoCooldown: E.echo.cooldown
  };
}

function rankOf(save: TalentSave, id: TalentId): number {
  return Math.max(0, save.ranks[id] ?? 0);
}

/** Apply every owned rank. Nothing here caps: that happens once, at the end. */
function applyRanks(effects: TalentEffects, save: TalentSave): void {
  const r = (id: TalentId) => rankOf(save, id);

  // -- power --------------------------------------------------------------
  effects.heft += r('heavy-impact') * E.heavyImpact.heft;

  if (r('power-strike') > 0) {
    const overdrive = r('overdrive');
    effects.powerStrikeSpeed += overdrive * E.overdrive.speed;
    effects.powerStrikeCooldown += overdrive * E.overdrive.cooldown;
    if (overdrive >= 2) effects.powerStrikeHits = 2;
  }

  // Crit chance *and* crit size scale with the rank: a maxed Critical Strike
  // lands more of them and each one is worth more.
  const crit = r('critical-strike');
  effects.critChance += crit * E.criticalStrike.chance;
  effects.critGrowth += crit * E.criticalStrike.growthPerRank;

  effects.bankShot += r('bank-shot') * E.bankShot.angle;

  const momentum = r('momentum');
  if (momentum > 0) effects.momentumEvery = E.momentum.start - momentum * E.momentum.step;

  if (r('reckless') > 0) {
    effects.critChance += E.reckless.chance;
    effects.critGrowth += E.reckless.growth;
    effects.critHeft += E.reckless.heft;
    effects.unsaved = true;
  }

  // -- control ------------------------------------------------------------
  effects.length += r('long-reach') * E.longReach.length;
  effects.foresight = r('foresight');

  const precision = r('precision');
  effects.angleMul *= 1 + precision * E.precision.angle;
  effects.spinMul *= 1 + precision * E.precision.spin;

  effects.swerve += r('swerve') * E.swerve.accel;

  const blink = r('blink-strike');
  if (blink > 0) {
    effects.blinkSeconds = E.blinkStrike.seconds;
    effects.blinkCrit = blink >= 2;
    effects.dashCooldown += blink * E.blinkStrike.cooldown;
  }

  const guard = r('perfect-guard');
  if (guard > 0) {
    effects.guardWindow += (guard - 1) * E.perfectGuard.window;
    effects.guardReach += (guard - 1) * E.perfectGuard.reach;
    effects.guardCooldown += (guard - 1) * E.perfectGuard.cooldownStep;
  }

  // -- defense ------------------------------------------------------------
  effects.bastion += r('bastion') * E.bastion.reach;

  const shield = r('shield');
  effects.shieldCharges += shield * E.shield.charges;
  // A second charge also recharges the pair faster - two charges that each
  // take a minute to come back is a talent nobody notices twice.
  if (shield > 0) effects.shieldRecharge += (shield - 1) * E.shield.rechargeStep;
  effects.shieldRecharge *= 1 - r('fortify') * E.fortify.recharge;

  const clutch = r('clutch');
  effects.clutchLength += clutch * E.clutch.length;
  effects.clutchGrowth += clutch * E.clutch.growth;
  effects.clutchSlow += clutch * E.clutch.slow;

  if (r('counterstrike') > 0) effects.counterPace = E.counterstrike.pace;
  effects.secondChances += r('second-chance') * E.secondChance.uses;

  // -- momentum -----------------------------------------------------------
  const hot = r('hot-hand');
  if (hot > 0) {
    effects.hotHand = E.hotHand.returns + (hot - 1) * E.hotHand.step;
    effects.hotHandCrit = hot >= 2;
  }
  effects.comboLength += r('combo-drive') * E.comboDrive.length;

  const adrenaline = r('adrenaline');
  if (adrenaline > 0) effects.adrenalineEvery = E.adrenaline.start - adrenaline * E.adrenaline.step;

  const flow = r('flow-state');
  effects.flowAngle += flow * E.flowState.angle;
  effects.flowRecharge += flow * E.flowState.recharge;
  effects.flowHeft += flow * E.flowState.heft;

  if (r('unbroken') > 0) effects.driveKeep = E.unbroken.keep;

  // -- utility ------------------------------------------------------------
  effects.tempo += r('tempo') * E.tempo.perReturn;
  effects.cooldownMul *= 1 + r('cooldown-mastery') * E.cooldownMastery.cooldown;
  effects.afterglowLength += r('afterglow') * E.afterglow.length;
  effects.extraSlots += r('versatility') * E.versatility.slots;

  // -- capstones ----------------------------------------------------------
  if (r('overload') > 0) effects.overloadHits = E.overload.hits;
  if (r('slipstream') > 0) {
    effects.slipstreamPaddle = E.slipstream.paddle;
    effects.slipstreamGrow = E.slipstream.grow;
  }
  if (r('zenith') > 0) effects.zenithGrow = E.zenith.grow;
}

/**
 * Reckless's price, paid last so nothing bought after it can sneak a save
 * back in: every way the build had of being rescued at its own line is gone.
 * Aegis stays equippable, but saves nothing.
 */
function applyReckless(effects: TalentEffects): void {
  if (!effects.unsaved) return;
  effects.shieldCharges = 0;
  effects.secondChances = 0;
  effects.adrenalineEvery = 0;
  effects.bastion = 0;
  effects.aegisSaves = 0;
  effects.counterPace = 0;
}

/** The one place a resolved bag is allowed to leave its ranges. It cannot. */
function applyCaps(effects: TalentEffects): void {
  const { talents } = BALANCE;

  effects.length = clamp(effects.length, talents.minLength, talents.maxLength);
  effects.cooldownMul = clamp(effects.cooldownMul, talents.minCooldownMul, 1);
  effects.critChance = clamp(effects.critChance, 0, E.criticalStrike.chanceCap);
  effects.spinMul = clamp(effects.spinMul, 0.25, 1);
  effects.angleMul = clamp(effects.angleMul, 1, 1.25);
  effects.flowRecharge = clamp(effects.flowRecharge, 0, 0.6);
  effects.heft = clamp(effects.heft, 0, 0.6);
  effects.clutchSlow = clamp(effects.clutchSlow, 0, 0.3);
  effects.bastion = clamp(effects.bastion, 0, 120);
  effects.bankShot = clamp(effects.bankShot, 0, 0.4);
  effects.swerve = clamp(effects.swerve, 0, 1000);
  effects.tempo = clamp(effects.tempo, 0, 1);
  effects.extraSlots = clamp(effects.extraSlots, 0, 1);

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
  effects.zenithGrow = clamp(effects.zenithGrow, 0, 0.5);

  // A charged return is still a return: it may never outrun the hard ceiling,
  // which the physics also enforces against the live ball.
  effects.powerStrikeSpeed = clamp(effects.powerStrikeSpeed, 0, 0.6);
  effects.dashDistance = clamp(effects.dashDistance, 0, 220);
  effects.guardWindow = clamp(effects.guardWindow, 0.1, 0.6);
  effects.guardReach = clamp(effects.guardReach, 0, 160);
  effects.shieldSaveSpeed = clamp(effects.shieldSaveSpeed, 0.6, 1);
  effects.shieldRecharge = Math.max(E.shield.minRecharge, effects.shieldRecharge);
}

/** Drop any equipped ability the build no longer owns, or has no slot for. */
function usableEquipped(save: TalentSave, slots: number): (AbilityId | null)[] {
  return save.equipped.map((id, index) => {
    if (!id || index >= slots) return null;
    const talent = TALENTS.find((entry) => entry.ability === id);
    return talent && rankOf(save, talent.id) > 0 ? id : null;
  });
}

export function resolveLoadout(save: TalentSave, level: number): ResolvedLoadout {
  const effects = baseEffects();
  applyRanks(effects, save);

  const slots = abilitySlotsForLevel(level, effects.extraSlots);
  const equipped = usableEquipped(save, slots);
  const synergies = activeSynergies(save.ranks, equipped);
  const synergy = rankOf(save, 'talent-synergy');
  const magnitude = 1 + synergy * E.talentSynergy.magnitude;
  for (const entry of synergies) entry.apply(effects, magnitude);
  effects.length += synergies.length * synergy * E.talentSynergy.lengthPerSynergy;

  applyReckless(effects);
  applyCaps(effects);

  return {
    effects,
    equipped,
    synergies,
    paddleSpeed: paddleSpeedForLevel(level),
    slots,
    level
  };
}

/**
 * Could this build have landed a critical return at all?
 *
 * Asked by the server's anti-cheat, which used to answer it with "does the
 * build own Critical Strike" - and so rejected every honest Overload match,
 * because Overload's returns are critical by definition.
 */
export function canCrit(effects: TalentEffects): boolean {
  return (
    effects.critChance > 0 ||
    effects.overloadHits > 0 ||
    effects.hotHandCrit ||
    effects.chargedCrits
  );
}

/** Could this build have saved a ball at its own line - by any means? */
export function canSave(effects: TalentEffects): boolean {
  return effects.shieldCharges > 0 || effects.adrenalineEvery > 0 || effects.aegisSaves > 0;
}
