import assert from 'node:assert/strict';
import { it } from 'node:test';
import { resolveLoadout, canCrit } from '../../src/core/talents/effects';
import { buyTalent, createTalentSave, reconcile, respecBranch } from '../../src/core/talents/save';
import { TALENTS, talentsOfBranch, talentById } from '../../src/core/talents/catalog';
import { BALANCE } from '../../src/core/balance/config';
import type { AbilityId, TalentSave } from '../../src/core/talents/types';
import { botProfile } from '../../src/core/bots/levels';
import { quickMatchRules } from '../../src/core/modes/rules';
import { driveAi } from '../../src/game/ai';
import { BALL_R, FIELD_H, FIXED_DT, PADDLE_W } from '../../src/game/constants';
import { startMatch } from '../../src/game/match';
import { step } from '../../src/game/simulation';
import { abilityViews, fireAbility, liveEffect } from '../../src/game/abilities';
import type { GameAudio } from '../../src/game/audio';
import {
  ballTimeScale,
  playerLength,
  playerReturn,
  resetRuntime,
  swerveBall,
  tryBastion,
  tryShield,
  updateRuntime,
  wonPoint
} from '../../src/game/talents';
import { forecast } from '../../src/game/trajectory';
import { createBrain, createWorld, placePaddles } from '../../src/game/world';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;
function build(ranks: TalentSave['ranks'], equipped: TalentSave['equipped'] = []) {
  const world = createWorld(silent, 0);
  world.loadout = resolveLoadout({ ...createTalentSave(), ranks, equipped }, 50);
  world.match.status = 'play';
  resetRuntime(world);
  return world;
}

it('Conduit accelerates recovery without requiring Flow State', () => {
  const world = build({ 'cooldown-mastery': 2, 'power-strike': 1, dash: 1 }, [
    'power-strike',
    'dash'
  ]);
  world.talents.slots[0]!.cooldown = 5;
  updateRuntime(world, 1);
  assert.equal(world.talents.slots[0]!.cooldown, 3.85);
});

it('Riposte rewards a successful parry, and Spellweaver only rewards live Afterglow', () => {
  const world = build({ 'perfect-guard': 1, tempo: 1, afterglow: 1 }, ['perfect-guard', 'echo']);
  const slot = world.talents.slots[0]!;
  slot.cooldown = 5;
  world.talents.guardWindow = 0.2;
  world.talents.afterglow = 1;
  const result = playerReturn(world, 0);
  assert.equal(result.guarded, true);
  assert.equal(slot.cooldown, 3.15);
  assert.equal(world.talents.stats.perfectGuards, 1);
  world.talents.afterglow = 0;
  playerReturn(world, 0);
  assert.equal(slot.cooldown, 2.65);
});

it('Phase Strike widens the dash follow-up window and Blink criticals are valid', () => {
  const world = build({ dash: 1, 'blink-strike': 2, afterglow: 1 }, ['dash']);
  assert.equal(world.loadout.effects.blinkSeconds, 1.5);
  assert.equal(canCrit(world.loadout.effects), true);
  assert.equal(fireAbility(world, 0), true);
  updateRuntime(world, 1.3);
  assert.equal(playerReturn(world, 0).crit, true);
  assert.equal(world.talents.blink, 0);
});

it('spending a second Shield charge preserves the recharge already earned', () => {
  const world = build({ shield: 2 });
  assert.equal(tryShield(world), true);
  updateRuntime(world, 30);
  const remaining = world.talents.shieldTimer;
  assert.equal(tryShield(world), true);
  assert.equal(world.talents.shieldTimer, remaining);
  updateRuntime(world, remaining);
  assert.equal(world.talents.shield, 1);
});

it('HUD readiness respects lockout after cooldown resets and shows Strike charges', () => {
  const world = build({ 'power-strike': 1, overdrive: 2 }, ['power-strike']);
  assert.equal(fireAbility(world, 0), true);
  world.talents.slots[0]!.cooldown = 0;
  assert.equal(abilityViews(world)[0]!.ready, false);
  assert.equal(fireAbility(world, 0), false);
  assert.equal(liveEffect(world, 'power-strike').charges, 2);
  playerReturn(world, 0);
  assert.equal(liveEffect(world, 'power-strike').charges, 1);
  updateRuntime(world, 1.5);
  assert.equal(abilityViews(world)[0]!.ready, true);
});

it('skill feedback counts accepted casts and ignores unavailable attempts', () => {
  const world = build({ 'power-strike': 1 }, ['power-strike']);
  const slot = world.talents.slots[0]!;
  assert.equal(slot.castId, 0);
  assert.equal(fireAbility(world, 4), false);
  world.match.status = 'paused';
  assert.equal(fireAbility(world, 0), false);
  assert.equal(slot.castId, 0);
  world.match.status = 'play';
  assert.equal(fireAbility(world, 0), true);
  assert.equal(abilityViews(world)[0]!.castId, 1);
  assert.equal(fireAbility(world, 0), false);
  slot.cooldown = 0;
  assert.equal(fireAbility(world, 0), false, 'Echo cannot bypass the real-time lockout');
  assert.equal(slot.castId, 1);
  updateRuntime(world, BALANCE.talents.minRecast);
  assert.equal(fireAbility(world, 0), true);
  assert.equal(abilityViews(world)[0]!.castId, 2);
});

it('Echo feedback marks only spent cooldowns and preserves their recast lockout', () => {
  const world = build({ 'power-strike': 1, dash: 1, echo: 1 }, ['power-strike', 'dash', 'echo']);
  const [strike, dash, echo] = world.talents.slots;
  assert.equal(fireAbility(world, 0), true);
  assert.equal(fireAbility(world, 2), true);
  assert.equal(strike!.cooldown, 0);
  assert.equal(strike!.lockout, BALANCE.talents.minRecast);
  assert.equal(strike!.refreshId, 1);
  assert.equal(dash!.refreshId, 0, 'an already ready skill was not refreshed');
  assert.equal(echo!.refreshId, 0, 'Echo never clears itself');
  assert.equal(world.talents.slots[4]!.refreshId, 0, 'empty slots have no feedback');
  assert.deepEqual(
    abilityViews(world).map(({ castId, refreshId }) => [castId, refreshId]),
    [
      [1, 1],
      [0, 0],
      [1, 0]
    ]
  );
  assert.equal(fireAbility(world, 2), false);
  assert.equal(strike!.refreshId, 1);
});

it('natural and return-driven recharge cannot masquerade as Echo feedback', () => {
  const world = build({ 'power-strike': 1, tempo: 2 }, ['power-strike']);
  const slot = world.talents.slots[0]!;
  fireAbility(world, 0);
  updateRuntime(world, BALANCE.talents.minRecast);
  slot.cooldown = 0.01;
  playerReturn(world, 0);
  assert.equal(slot.cooldown, 0);
  assert.equal(abilityViews(world)[0]!.refreshId, 0);
  assert.equal(fireAbility(world, 0), true);
  updateRuntime(world, slot.span);
  const view = abilityViews(world)[0]!;
  assert.equal(view.ready, true);
  assert.equal(view.refreshId, 0);
  assert.equal(view.castId, 2);
});

it('restarting a match resets skill feedback along with cooldowns', () => {
  const world = build({ 'power-strike': 1, echo: 1 }, ['power-strike', 'echo']);
  fireAbility(world, 0);
  fireAbility(world, 1);
  resetRuntime(world);
  for (const slot of world.talents.slots) {
    assert.equal(slot.castId, 0);
    assert.equal(slot.refreshId, 0);
  }
  assert.equal(abilityViews(world)[0]!.ready, true);
  assert.equal(fireAbility(world, 0), true);
  assert.equal(abilityViews(world)[0]!.castId, 1);
});

it('return bonuses discount ultimates by half and never bypass the recast lockout', () => {
  const world = build({ 'perfect-guard': 1, tempo: 2, afterglow: 2, echo: 1 }, [
    'perfect-guard',
    'echo'
  ]);
  world.talents.afterglow = 1;
  world.talents.guardWindow = 0.2;
  world.talents.slots[0]!.cooldown = 5;
  world.talents.slots[1]!.cooldown = 5;
  world.talents.slots[0]!.lockout = 1;
  playerReturn(world, 0);
  assert.equal(world.talents.slots[0]!.cooldown, 2.65);
  assert.equal(world.talents.slots[1]!.cooldown, 3.825);
  assert.equal(world.talents.slots[0]!.lockout, 1);
});

it('stacking all combinations retains hard limits and Reckless disables saves', () => {
  const ranks = Object.fromEntries(TALENTS.map((talent) => [talent.id, talent.maxRank]));
  const world = build(ranks, ['power-strike', 'dash', 'perfect-guard', 'zenith', 'echo']);
  const effects = world.loadout.effects;
  assert.ok(effects.length <= BALANCE.talents.maxLength);
  assert.ok(effects.cooldownMul >= BALANCE.talents.minCooldownMul);
  assert.ok(effects.recharge <= 0.3);
  assert.ok(effects.parryTempo <= 2);
  assert.equal(effects.shieldCharges, 0);
  assert.equal(effects.aegisSaves, 0);
  assert.equal(effects.adrenalineEvery, 0);
  world.talents.afterglow = 1;
  world.talents.guardWindow = 0.2;
  const result = playerReturn(world, 1);
  assert.ok(result.ceiling <= BALANCE.ball.hardMax);
});

it('Power rewards real edge placement without treating a grown paddle as an edge', () => {
  const world = build({ 'edge-pressure': 2 });
  world.player.grow = 1.5;
  assert.equal(playerReturn(world, 0.7).crit, false);
  const edge = playerReturn(world, 0.8);
  assert.equal(edge.crit, true);
  assert.equal(edge.charged, true);
  assert.equal(world.talents.stats.powerStrikes, 0);
  assert.equal(canCrit(world.loadout.effects), true);
  assert.equal(build({ 'edge-pressure': 1 }).loadout.effects.edgePressure, 0.9);
});

it('Time Slip winds Dash back on each Blink Strike return, and only that return', () => {
  const world = build({ dash: 1, 'blink-strike': 1, 'time-slip': 2 }, ['dash']);
  const dash = world.talents.slots[0]!;
  assert.equal(fireAbility(world, 0), true);
  const span = dash.cooldown;
  assert.equal(span, BALANCE.effects.dash.cooldown + BALANCE.effects.blinkStrike.cooldown);
  assert.equal(playerReturn(world, 0).charged, true);
  assert.equal(dash.cooldown, span - 2 * BALANCE.effects.timeSlip.refund);
  playerReturn(world, 0);
  assert.equal(
    dash.cooldown,
    span - 2 * BALANCE.effects.timeSlip.refund,
    'a plain return refunds nothing'
  );
  assert.ok(dash.lockout > 0, 'the recast lockout still holds');
});

it('Clutch slows only incoming travel in the player half and keeps actual pace', () => {
  const world = build({ clutch: 2 });
  world.view.w = 1000;
  world.ball.x = 200;
  world.ball.vx = -500;
  world.ball.speed = 500;
  assert.equal(ballTimeScale(world), 1);
  world.match.maxLives = 3;
  world.match.lives = 1;
  assert.equal(ballTimeScale(world), 0.8);
  world.ball.x = 700;
  assert.equal(ballTimeScale(world), 1);
  world.ball.x = 200;
  world.ball.vx = 500;
  assert.equal(ballTimeScale(world), 1);
  assert.equal(world.ball.speed, 500);
});

it('Defense earns recovery on returns, never on automatic saves or while full', () => {
  const world = build({ shield: 2, 'rally-armor': 2 });
  playerReturn(world, 0);
  assert.equal(world.talents.shieldTimer, 0);
  tryShield(world);
  const start = world.talents.shieldTimer;
  playerReturn(world, 0);
  assert.equal(world.talents.shieldTimer, start - 3);
  tryShield(world);
  assert.equal(world.talents.shieldTimer, start - 3);
  world.talents.shieldTimer = 2;
  playerReturn(world, 0);
  updateRuntime(world, 0.01);
  assert.equal(world.talents.shield, 1);
  const reckless = build({ shield: 2, 'rally-armor': 2, reckless: 1 });
  assert.equal(reckless.loadout.effects.shieldTempo, 0);
  assert.equal(tryShield(reckless), false);
});

it('Momentum builds earlier without increasing its maximum reach or flow bonuses', () => {
  const ranks = { 'combo-drive': 3, 'flow-state': 3 } as const;
  const plain = build(ranks);
  const fast = build({ ...ranks, 'fast-start': 2 });
  for (let i = 0; i < 3; i++) {
    playerReturn(plain, 0);
    playerReturn(fast, 0);
  }
  assert.ok(playerLength(fast) > playerLength(plain));
  assert.equal(fast.loadout.effects.flowFrom, 0);
  const accelerated = playerReturn(fast, 0);
  const normal = playerReturn(plain, 0);
  assert.ok(accelerated.heft > normal.heft);
  for (let i = 0; i < 20; i++) {
    playerReturn(plain, 0);
    playerReturn(fast, 0);
  }
  assert.equal(playerLength(fast), playerLength(plain));
  assert.equal(playerReturn(fast, 0).heft, playerReturn(plain, 0).heft);
});

it('Chain Casting winds every other skill back on each cast, an ultimate by half', () => {
  const world = build({ 'power-strike': 1, dash: 1, 'chain-casting': 2, zenith: 1 }, [
    'power-strike',
    'dash',
    'zenith'
  ]);
  const refund = 2 * BALANCE.effects.chainCasting.refund;
  const [strike, dash, zenith] = world.talents.slots;
  zenith!.cooldown = 20;
  fireAbility(world, 0);
  assert.equal(strike!.cooldown, BALANCE.effects.powerStrike.cooldown, 'never refunds itself');
  assert.equal(dash!.cooldown, 0, 'a ready skill stays ready');
  assert.equal(zenith!.cooldown, 20 - refund / 2);
  fireAbility(world, 1);
  assert.equal(strike!.cooldown, BALANCE.effects.powerStrike.cooldown - refund);
  assert.equal(zenith!.cooldown, 20 - refund);
  assert.equal(strike!.lockout, BALANCE.talents.minRecast, 'refunds never touch the lockout');
  assert.equal(fireAbility(world, 0), false);
});

it('existing rank upgrades remain useful for charge timing, Afterglow and max-level Versatility', () => {
  assert.equal(build({ 'power-strike': 1, overdrive: 2 }).loadout.effects.powerStrikeWindow, 5);
  assert.equal(build({ afterglow: 2 }).loadout.effects.afterglowSeconds, 4);
  const save = { ...createTalentSave(), ranks: { versatility: 1 } };
  assert.equal(resolveLoadout(save, 1).slots, 3);
  assert.equal(resolveLoadout(save, 1).effects.recharge, 0);
  assert.equal(resolveLoadout(save, 50).slots, 5);
  assert.equal(
    resolveLoadout(save, 50).effects.recharge,
    BALANCE.effects.rankRewards.overflowRecharge
  );
});

it('all five new tree paths are purchasable, have unique cells and refund safely', () => {
  const branches = ['power', 'control', 'defense', 'momentum', 'utility'] as const;
  const additions = [
    'edge-pressure',
    'time-slip',
    'rally-armor',
    'fast-start',
    'chain-casting'
  ] as const;
  branches.forEach((branch, index) => {
    const talents = talentsOfBranch(branch);
    const cells = talents.map((talent) => `${talent.tier}:${talent.column}`);
    assert.equal(new Set(cells).size, cells.length);
    let save = reconcile(createTalentSave(), 50);
    for (const talent of talents.filter((entry) => entry.tier <= 3)) {
      for (let rank = 0; rank < talent.maxRank; rank++) {
        const next = buyTalent(save, 50, talent.id);
        assert.ok(next, `${talent.id} rank ${rank + 1} must be reachable`);
        save = next;
      }
    }
    assert.equal(save.ranks[additions[index]!], 2);
    const ultimate = talents.find((entry) => entry.ability && entry.tier === 4)!;
    const next = buyTalent(save, 50, ultimate.id);
    assert.ok(next);
    assert.equal(next.ranks[ultimate.id], 1);
    const reset = respecBranch(next, 50, branch);
    assert.deepEqual(reset.ranks, {});
    assert.equal(reset.points, 49);
    // The expansion does not make its new nodes mandatory for an old capstone.
    delete next.ranks[additions[index]!];
    assert.equal(reconcile(next, 50).ranks[ultimate.id], 1);
    assert.equal(talentById(additions[index]!)!.tier, 3);
  });
});

it('expanded builds complete real matches with finite physics and bounded pace', () => {
  const builds: { name: string; ranks: TalentSave['ranks']; equipped: AbilityId[] }[] = [
    {
      name: 'Power',
      ranks: {
        'heavy-impact': 3,
        'bank-shot': 2,
        momentum: 1,
        'edge-pressure': 2,
        'power-strike': 1,
        overdrive: 2,
        overload: 1
      },
      equipped: ['power-strike', 'overload']
    },
    {
      name: 'Control',
      ranks: {
        'long-reach': 2,
        foresight: 1,
        precision: 1,
        dash: 1,
        'blink-strike': 2,
        'time-slip': 2,
        'perfect-guard': 1,
        slipstream: 1
      },
      equipped: ['dash', 'perfect-guard', 'slipstream']
    },
    {
      name: 'Defense',
      ranks: { shield: 2, fortify: 2, counterstrike: 1, 'rally-armor': 2, aegis: 1 },
      equipped: ['aegis']
    },
    {
      name: 'Momentum',
      ranks: {
        'combo-drive': 3,
        adrenaline: 2,
        'flow-state': 3,
        'fast-start': 2,
        unbroken: 1,
        zenith: 1
      },
      equipped: ['zenith']
    },
    {
      name: 'Mastery',
      ranks: {
        tempo: 2,
        'cooldown-mastery': 3,
        afterglow: 2,
        'talent-synergy': 2,
        'chain-casting': 2,
        echo: 1,
        'power-strike': 1,
        'long-reach': 1,
        dash: 1
      },
      equipped: ['power-strike', 'dash', 'echo']
    }
  ];
  const originalRandom = Math.random;
  let seed = 431;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  try {
    for (const entry of builds) {
      const world = createWorld(silent, 0);
      world.view.w = 1000;
      placePaddles(world);
      world.grid.resize(world.view.w);
      const save = reconcile(
        { ...createTalentSave(), ranks: entry.ranks, equipped: entry.equipped },
        50
      );
      assert.deepEqual(save.ranks, entry.ranks, `${entry.name} build must be legal`);
      world.baseLoadout = resolveLoadout(save, 50);
      startMatch(world, quickMatchRules('elite'));
      const brain = createBrain(botProfile('pro'));
      for (let tick = 0; tick < 120 * 600 && world.match.status !== 'over'; tick++) {
        if (world.match.status === 'play') {
          const y = world.player.y;
          driveAi(world, world.player, brain, FIXED_DT);
          world.player.y = y;
          for (let slot = 0; slot < entry.equipped.length; slot++) fireAbility(world, slot);
        }
        step(world, FIXED_DT);
        assert.ok(
          [world.ball.x, world.ball.y, world.ball.vx, world.ball.vy, world.player.y].every(
            Number.isFinite
          ),
          entry.name
        );
        assert.ok(world.ball.speed <= BALANCE.ball.hardMax, entry.name);
      }
      assert.equal(world.match.status, 'over', `${entry.name} match must finish`);
      assert.ok(world.talents.stats.abilitiesUsed > 0, entry.name);
    }
  } finally {
    Math.random = originalRandom;
  }
});

it('Swerve breaks once, late, the way the ball left the paddle - and no read sees it coming', () => {
  const world = build({ swerve: 2 });
  world.view.w = 1000;
  placePaddles(world);
  const shift = 2 * BALANCE.effects.swerve.shift;
  const line = world.view.w * BALANCE.effects.swerve.from;
  const face = world.bot.x - (PADDLE_W / 2 + BALL_R);
  Object.assign(world.ball, { x: 500, px: 495, y: 300, vx: 800, vy: 0, speed: 800, owner: 'you' });
  world.talents.swerveDir = 1;

  // Before the break the path reads dead straight.
  assert.ok(Math.abs(forecast(world, face) - 300) < 1e-6);
  swerveBall(world);
  assert.equal(world.ball.vy, 0, 'nothing happens before the break line');

  Object.assign(world.ball, { px: line - 5, x: line + 5 });
  swerveBall(world);
  assert.equal(world.ball.vx, 800, 'the break never slows the ball across the court');
  assert.ok(world.ball.vy > 0, 'it breaks the way it was sent');
  const arrival = world.ball.y + (world.ball.vy * (face - world.ball.x)) / world.ball.vx;
  assert.ok(Math.abs(arrival - (300 + shift)) < 1e-6);
  assert.ok(Math.abs(world.talents.surge - (world.ball.speed - 800)) < 1e-9);
  assert.equal(world.talents.swerveDir, 0, 'one break per return');
  const vy = world.ball.vy;
  swerveBall(world);
  assert.equal(world.ball.vy, vy);
});

it('Bastion turns a corner ball back at full pace, heavy and away from the opponent', () => {
  const world = build({ bastion: 1 });
  world.view.w = 1000;
  placePaddles(world);
  world.bot.y = 120;
  Object.assign(world.ball, {
    x: 2,
    px: 8,
    y: BALANCE.effects.bastion.reach,
    vx: -900,
    vy: -50,
    speed: 900
  });
  world.ball.owner = 'bot';
  assert.equal(tryBastion(world), true);
  assert.equal(world.ball.speed, 900);
  assert.equal(world.ball.heft, BALANCE.effects.bastion.heft);
  assert.ok(world.ball.vx > 0 && world.ball.vy > 0, 'out of the corner, towards the far side');
  world.ball.y = FIELD_H / 2;
  assert.equal(tryBastion(world), false, 'the middle of the line is not walled');
});

it('Counterstrike turns a save into an attack and charges the returns after it', () => {
  const world = build({ shield: 1, counterstrike: 1 });
  assert.equal(
    world.loadout.effects.shieldCharges,
    1,
    'no extra charge: that out-measured Shield rank 2'
  );
  world.ball.vx = -600;
  assert.equal(tryShield(world), true);
  assert.equal(world.talents.primed, BALANCE.effects.counterstrike.primed);
  for (let i = 0; i < BALANCE.effects.counterstrike.primed; i++)
    assert.equal(playerReturn(world, 0).charged, true);
  assert.equal(playerReturn(world, 0).charged, false);
  const reckless = build({ shield: 1, counterstrike: 1, reckless: 1 });
  assert.equal(reckless.loadout.effects.counterPace, 0, 'Reckless still strips every save');
});

it('Second Chance carries two refunds and Hot Hand charges the next rally', () => {
  assert.equal(build({ 'second-chance': 1 }).talents.secondChances, 2);
  const world = build({ 'hot-hand': 2 });
  wonPoint(world);
  const returns = BALANCE.effects.hotHand.returns + BALANCE.effects.hotHand.step;
  for (let i = 0; i < returns; i++) {
    const shot = playerReturn(world, 0);
    assert.equal(shot.charged && shot.crit, true);
  }
  assert.equal(playerReturn(world, 0).charged, false);
});
