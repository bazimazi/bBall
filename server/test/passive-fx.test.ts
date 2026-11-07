import assert from 'node:assert/strict';
import { it } from 'node:test';
import { BALANCE } from '../../src/core/balance/config';
import { botProfile } from '../../src/core/bots/levels';
import { quickMatchRules } from '../../src/core/modes/rules';
import { resolveLoadout } from '../../src/core/talents/effects';
import { createTalentSave } from '../../src/core/talents/save';
import type { TalentSave } from '../../src/core/talents/types';
import { abilityViews, fireAbility } from '../../src/game/abilities';
import { driveAi } from '../../src/game/ai';
import type { GameAudio } from '../../src/game/audio';
import { combatant } from '../../src/game/combatant';
import { BALL_R, FIELD_H, FIXED_DT, MAX_BOUNCE_ANGLE, PADDLE_W } from '../../src/game/constants';
import { launchBall, startMatch } from '../../src/game/match';
import { talentHue, wideFx } from '../../src/game/passiveFx';
import { passiveViews } from '../../src/game/passives';
import { drawCourtMarks, drawHeft, drawPaddleMarks } from '../../src/game/render/passiveMarks';
import { drawCasts } from '../../src/game/render/abilityFx';
import { applyGraphicsIntensity } from '../../src/game/render/graphics';
import { step } from '../../src/game/simulation';
import {
  nextCharged,
  playerReturn,
  previewReturn,
  resetRuntime,
  swerveBall,
  tryBastion,
  tryShield,
  trySecondChance,
  updateRuntime,
  wonPoint
} from '../../src/game/talents';
import { forecast } from '../../src/game/trajectory';
import { createBrain, createWorld, placePaddles, type World } from '../../src/game/world';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;

function build(ranks: TalentSave['ranks'], equipped: TalentSave['equipped'] = []): World {
  const world = createWorld(silent, 1);
  world.loadout = resolveLoadout({ ...createTalentSave(), ranks, equipped }, 50);
  world.match.status = 'play';
  world.match.winScore = 5;
  resetRuntime(world);
  return world;
}

const alive = (world: World, kind?: string) =>
  world.casts.items.filter((cast) => cast.alive && (!kind || cast.kind === kind)).length;
const words = (world: World) => world.popups.items.filter((p) => p.alive).map((p) => p.text);

/** A context that counts what would have been drawn, and draws nothing. */
function countingContext() {
  const counts = { stroke: 0, fill: 0, fillRect: 0 };
  const ctx = new Proxy(
    {},
    {
      get: (_, key) => {
        if (key === 'stroke') return () => counts.stroke++;
        if (key === 'fill') return () => counts.fill++;
        if (key === 'fillRect') return () => counts.fillRect++;
        if (key === 'createRadialGradient' || key === 'createLinearGradient')
          return () => ({ addColorStop() {} });
        return () => {};
      },
      set: () => true
    }
  ) as CanvasRenderingContext2D;
  return { ctx, counts, total: () => counts.stroke + counts.fill + counts.fillRect };
}

it('a passive-heavy build plays identically at every graphics budget', () => {
  const ranks: TalentSave['ranks'] = {
    'heavy-impact': 3,
    'critical-strike': 3,
    'bank-shot': 2,
    momentum: 2,
    'long-reach': 3,
    precision: 3,
    swerve: 2,
    bastion: 2,
    shield: 2,
    fortify: 2,
    'rally-armor': 2,
    'hot-hand': 2,
    'combo-drive': 3,
    adrenaline: 2,
    'flow-state': 3,
    'fast-start': 2,
    tempo: 2,
    'power-strike': 1
  };
  // Calm is left out on purpose: it shortens hit-stop, which is timing.
  function run(level: 'high' | 'balanced' | 'low', motion: number) {
    const world = createWorld(silent, motion);
    placePaddles(world);
    applyGraphicsIntensity(world, level);
    world.baseLoadout = resolveLoadout(
      { ...createTalentSave(), ranks, equipped: ['power-strike'] },
      50
    );
    startMatch(world, { ...quickMatchRules('elite'), seed: 'passive-fx-regression' });
    launchBall(world);
    // A bot pilots the player's paddle off the seeded gameplay stream, so the
    // rally - and every passive in it - plays out the same way each run.
    const brain = createBrain(botProfile('pro'));
    for (let i = 0; i < 120 * 90 && world.match.status !== 'over'; i++) {
      if (world.match.status === 'play') {
        const y = world.player.y;
        driveAi(world, world.player, brain, FIXED_DT);
        world.player.y = y;
        fireAbility(world, 0);
      }
      step(world, FIXED_DT);
    }
    return {
      ball: world.ball,
      player: world.player,
      bot: world.bot,
      match: world.match,
      talents: world.talents,
      botTalents: world.botTalents
    };
  }
  const high = run('high', 1);
  assert.ok(high.match.hits > 10, 'the seeded match actually rallied');
  assert.ok(Object.keys(high.talents.procs).length >= 4, 'and its passives paid out');
  assert.deepEqual(run('balanced', 1), high);
  assert.deepEqual(run('low', 1), high);
});

it('a rolled critical is named on the court and counted, without changing how often it rolls', () => {
  const world = build({ 'critical-strike': 3 });
  let rolls = 0;
  world.random = () => {
    rolls++;
    return 0;
  };
  const shot = playerReturn(world, 0);
  assert.equal(shot.crit, true);
  assert.equal(shot.source, 'critical-strike');
  assert.equal(rolls, 1);
  assert.equal(world.talents.procs['critical-strike'], 1);

  // A certain critical never takes the roll, exactly as before.
  const edge = build({ momentum: 1, 'edge-pressure': 1, 'critical-strike': 1 });
  let edgeRolls = 0;
  edge.random = () => {
    edgeRolls++;
    return 0;
  };
  const edged = playerReturn(edge, 0.99);
  assert.equal(edged.crit && edged.charged, true);
  assert.equal(edged.source, 'edge-pressure');
  assert.equal(edgeRolls, 0);
});

it('Momentum lights the paddle face before the return it will charge, then names it', () => {
  const world = build({ momentum: 2 });
  const every = world.loadout.effects.momentumEvery;
  for (let i = 1; i < every - 1; i++) playerReturn(world, 0);
  assert.equal(nextCharged(world), null);
  playerReturn(world, 0);
  assert.equal(nextCharged(world), 'momentum', 'the face is lit for the beat return');
  const momentum = passiveViews(world).find((view) => view.id === 'momentum');
  assert.equal(momentum?.state, 'ready');
  assert.equal(momentum?.value, 1);
  const shot = playerReturn(world, 0);
  assert.equal(shot.charged, true);
  assert.equal(shot.source, 'momentum');
  assert.equal(nextCharged(world), null);
});

it('Hot Hand and Counterstrike each claim the charges they put in hand', () => {
  const world = build({ 'hot-hand': 1, shield: 1, counterstrike: 1 });
  wonPoint(world);
  assert.equal(world.talents.primedBy, 'hot-hand');
  assert.equal(nextCharged(world), 'hot-hand');
  assert.equal(passiveViews(world).find((view) => view.id === 'hot-hand')?.state, 'active');
  assert.equal(playerReturn(world, 0).source, 'hot-hand');
  // Spend the rest; the claim clears with the last one.
  while (world.talents.primed > 0) playerReturn(world, 0);
  assert.equal(world.talents.primedBy, null);

  world.ball.vx = -600;
  assert.equal(tryShield(world), true);
  assert.equal(world.talents.primedBy, 'counterstrike');
  assert.ok(words(world).includes('COUNTERSTRIKE'));
  assert.equal(playerReturn(world, 0).source, 'counterstrike');
  assert.equal(world.talents.procs.counterstrike, 1);
});

it('a skill that charged the return keeps its own animation and is never re-named', () => {
  const world = build({ 'power-strike': 1, momentum: 2 }, ['power-strike']);
  world.talents.rallyReturns = world.loadout.effects.momentumEvery - 1;
  assert.equal(fireAbility(world, 0), true);
  const shot = playerReturn(world, 0);
  assert.equal(shot.charged, true);
  assert.equal(shot.source, null);
  assert.equal(world.talents.procs.momentum, 1, 'the beat still counts');
});

it('Tempo, Chain Casting and Time Slip mark the cooldowns they wind back, in their own colour', () => {
  const world = build(
    { tempo: 2, 'chain-casting': 2, dash: 1, 'blink-strike': 1, 'time-slip': 2, echo: 1 },
    ['dash', 'echo']
  );
  const [dash, echo] = world.talents.slots;
  dash!.cooldown = 5;
  echo!.cooldown = 40;
  playerReturn(world, 0);
  const tempo = 2 * BALANCE.effects.tempo.perReturn;
  assert.equal(dash!.rewindId, 1);
  assert.equal(dash!.rewound, tempo);
  assert.equal(dash!.rewoundBy, 'tempo');
  assert.equal(echo!.rewound, tempo / 2, 'an ultimate is wound back by half');
  const view = abilityViews(world).find((entry) => entry.id === 'dash')!;
  assert.equal(view.rewindId, 1);
  assert.equal(view.rewindHue, talentHue('tempo'));

  // A ready slot has nothing to give back, so it is not marked.
  dash!.cooldown = 0;
  playerReturn(world, 0);
  assert.equal(dash!.rewindId, 1);

  // Time Slip, on the return a dash rescued.
  dash!.cooldown = 3;
  world.talents.blink = 0.5;
  playerReturn(world, 0);
  assert.equal(dash!.rewoundBy, 'time-slip');
  assert.equal(world.talents.procs['time-slip'], 1);

  // Chain Casting, on a cast of another skill.
  dash!.cooldown = 4;
  dash!.lockout = 0;
  echo!.cooldown = 0;
  echo!.lockout = 0;
  const before = dash!.rewindId;
  assert.equal(fireAbility(world, 1), true);
  assert.equal(dash!.rewindId, before + 1);
  assert.equal(dash!.rewoundBy, 'chain-casting');
});

it('a hurried cooldown reports its rate, and an ultimate is never hurried', () => {
  const world = build({ 'flow-state': 3, 'power-strike': 1, zenith: 1 }, [
    'power-strike',
    'zenith'
  ]);
  const [strike, zenith] = world.talents.slots;
  strike!.cooldown = 6;
  zenith!.cooldown = 30;
  assert.equal(abilityViews(world)[0]!.rate, 1);
  world.talents.rallyReturns = 30;
  const full = 1 + world.loadout.effects.flowRecharge;
  assert.equal(abilityViews(world)[0]!.rate, Math.round(full * 10) / 10);
  world.talents.zenith = 2;
  const views = abilityViews(world);
  assert.ok(views[0]!.rate > full, 'Zenith hurries an ordinary skill');
  assert.equal(views[1]!.rate, Math.round(full * 10) / 10, 'but not an ultimate');
  // The rate shown is the rate applied.
  const left = strike!.cooldown;
  updateRuntime(world, 0.1);
  assert.ok(Math.abs(left - strike!.cooldown - 0.1 * views[0]!.rate) < 0.01);
});

it('Shield shows its recharge on the court and in the HUD, and announces a charge coming back', () => {
  const world = build({ shield: 1 });
  let chip = passiveViews(world).find((view) => view.id === 'shield')!;
  assert.deepEqual([chip.state, chip.value, chip.max, chip.progress], ['ready', 1, 1, 1]);

  world.ball.vx = -600;
  world.ball.y = FIELD_H / 2;
  assert.equal(tryShield(world), true);
  assert.ok(words(world).includes('SHIELD'));
  assert.equal(alive(world, 'save'), 1);
  chip = passiveViews(world).find((view) => view.id === 'shield')!;
  assert.equal(chip.state, 'building');
  assert.equal(chip.value, 0);
  assert.equal(chip.seconds, Math.ceil(world.loadout.effects.shieldRecharge));

  const court = countingContext();
  drawCourtMarks(court.ctx, world);
  assert.ok(court.counts.fillRect >= 3, 'the recharge runs along the goal line');

  updateRuntime(world, world.loadout.effects.shieldRecharge / 2);
  chip = passiveViews(world).find((view) => view.id === 'shield')!;
  assert.ok(chip.progress > 0.45 && chip.progress < 0.55);
  const procs = world.talents.procs.shield ?? 0;
  updateRuntime(world, world.loadout.effects.shieldRecharge);
  assert.equal(world.talents.shield, 1);
  assert.equal(world.talents.procs.shield, procs + 1);
  assert.equal(alive(world, 'recharge'), 1);
});

it('Adrenaline counts towards its save and says when one is banked', () => {
  const world = build({ 'combo-drive': 1, adrenaline: 2 });
  const every = world.loadout.effects.adrenalineEvery;
  for (let i = 1; i < every; i++) playerReturn(world, 0);
  let chip = passiveViews(world).find((view) => view.id === 'adrenaline')!;
  assert.equal(chip.state, 'building');
  assert.equal(chip.value, 1);
  const shot = playerReturn(world, 0);
  assert.equal(shot.banked, true);
  chip = passiveViews(world).find((view) => view.id === 'adrenaline')!;
  assert.equal(chip.state, 'ready');
  // Topping up a save already held is not a second bank.
  for (let i = 0; i < every; i++) assert.equal(playerReturn(world, 0).banked, false);
});

it('Combo Drive, Flow State and Clutch each announce their step up', () => {
  const world = build({ 'combo-drive': 2, 'flow-state': 1, clutch: 2 });
  const every = world.loadout.effects.comboEvery;
  let grew = 0;
  let flowed = 0;
  for (let i = 0; i < every * 3 + 12; i++) {
    const shot = playerReturn(world, 0);
    grew += Number(shot.grew);
    flowed += Number(shot.flowed);
  }
  assert.equal(grew, world.loadout.effects.comboSteps);
  assert.equal(flowed, 1);
  const flow = passiveViews(world).find((view) => view.id === 'flow-state')!;
  assert.equal(flow.state, 'ready');
  assert.equal(flow.value, BALANCE.effects.flowState.stacks);

  assert.equal(world.talents.clutch, false);
  world.match.score.bot = world.match.winScore - 1;
  updateRuntime(world, 1 / 120);
  assert.equal(world.talents.clutch, true);
  assert.equal(world.talents.procs.clutch, 1);
  assert.ok(words(world).includes('CLUTCH'));
  updateRuntime(world, 1 / 120);
  assert.equal(world.talents.procs.clutch, 1, 'announced once, not every step');
  assert.equal(passiveViews(world).find((view) => view.id === 'clutch')?.state, 'active');
});

it('Bastion and Second Chance name themselves where they act', () => {
  const world = build({ bastion: 1, 'second-chance': 1, clutch: 1 });
  world.view.w = 1000;
  placePaddles(world);
  Object.assign(world.ball, { x: 2, px: 8, y: 30, vx: -900, vy: -50, speed: 900, owner: 'bot' });
  assert.equal(tryBastion(world), true);
  assert.equal(alive(world, 'corner'), 1);
  assert.ok(words(world).includes('BASTION'));

  let chance = passiveViews(world).find((view) => view.id === 'second-chance')!;
  assert.equal(chance.state, 'idle', 'level on points: not behind, so it would not fire');
  world.match.score.bot = 1;
  chance = passiveViews(world).find((view) => view.id === 'second-chance')!;
  assert.equal(chance.state, 'ready', 'behind: it would fire');
  world.match.score.you = 2;
  chance = passiveViews(world).find((view) => view.id === 'second-chance')!;
  assert.equal(chance.state, 'idle', 'ahead: it would not');
  world.match.score.bot = 3;
  assert.equal(trySecondChance(world), true);
  assert.equal(alive(world, 'refund'), 1);
  assert.ok(words(world).includes('SECOND CHANCE'));
  assert.equal(passiveViews(world).find((view) => view.id === 'second-chance')?.value, 1);
});

it('Precision draws the wedge it opened only for an angle a plain paddle could not reach', () => {
  const world = build({ precision: 3 });
  wideFx(world, 60, 300, MAX_BOUNCE_ANGLE * 0.9, 'precision');
  assert.equal(alive(world, 'fan'), 0);
  wideFx(world, 60, 300, MAX_BOUNCE_ANGLE + 0.1, 'precision');
  assert.equal(alive(world, 'fan'), 1);
});

it('Swerve and Bank Shot mark the court for the player, never for a forecast or the opponent', () => {
  const world = build({ swerve: 2, 'bank-shot': 2 });
  world.view.w = 1000;
  placePaddles(world);
  const line = world.view.w * BALANCE.effects.swerve.from;

  // A read of the path must neither draw nor count anything.
  Object.assign(world.ball, {
    x: 200,
    px: 195,
    y: 40,
    vx: 700,
    vy: -500,
    speed: 860,
    owner: 'you'
  });
  forecast(world, world.bot.x - (PADDLE_W / 2 + BALL_R));
  assert.equal(alive(world), 0);
  assert.equal(world.talents.procs['bank-shot'], undefined);

  Object.assign(world.ball, { x: line + 5, px: line - 5, y: 300, vx: 800, vy: 0, speed: 800 });
  world.talents.swerveDir = 1;
  swerveBall(world);
  assert.equal(alive(world, 'swerve'), 1);
  assert.equal(world.talents.procs.swerve, 1);

  // The opponent's own break is counted for it, and drawn for nobody.
  const bot = combatant(world, 'bot');
  world.botLoadout = resolveLoadout({ ...createTalentSave(), ranks: { swerve: 1 } }, 50);
  world.casts.clear();
  const botLine = world.view.w * (1 - BALANCE.effects.swerve.from);
  Object.assign(world.ball, { x: botLine - 5, px: botLine + 5, vx: -800, vy: 0, owner: 'bot' });
  world.botTalents.swerveDir = -1;
  swerveBall(bot);
  assert.equal(world.botTalents.procs.swerve, 1);
  assert.equal(alive(world), 0);
});

it('previewing a return for the AI counts nothing and draws nothing', () => {
  const world = build({ momentum: 2, 'combo-drive': 3, adrenaline: 2, tempo: 1 });
  world.talents.rallyReturns = world.loadout.effects.momentumEvery - 1;
  previewReturn(world, 0);
  assert.deepEqual(world.talents.procs, {});
  assert.equal(alive(world), 0);
  assert.equal(
    world.popups.items.some((p) => p.alive),
    false
  );
});

it('the paddle carries its reach, edge zones, charged face and flow stacks - but not in a replay', () => {
  const world = build({ 'long-reach': 3, momentum: 1, 'edge-pressure': 2, 'flow-state': 2 });
  updateRuntime(world, 1 / 120);
  assert.ok(world.player.half > world.player.baseHalf, 'Long Reach lengthened the paddle');
  const plain = countingContext();
  drawPaddleMarks(plain.ctx, world);
  const quiet = plain.total();
  assert.ok(quiet > 0, 'reach and edge zones are always drawn');

  world.talents.rallyReturns = 12;
  world.talents.primed = 2;
  world.talents.primedBy = 'hot-hand';
  const busy = countingContext();
  drawPaddleMarks(busy.ctx, world);
  assert.ok(busy.total() > quiet, 'the charged face and the flow beads join them');

  world.replay.active = true;
  const replay = countingContext();
  drawPaddleMarks(replay.ctx, world);
  drawCourtMarks(replay.ctx, world);
  drawHeft(replay.ctx, world);
  assert.equal(replay.total(), 0);
});

it("a heavy return shimmers; a plain one and the opponent's do not", () => {
  const world = build({ 'heavy-impact': 3 });
  Object.assign(world.ball, {
    x: 400,
    y: 300,
    vx: 700,
    vy: 100,
    speed: 707,
    owner: 'you',
    heft: 0
  });
  const plain = countingContext();
  drawHeft(plain.ctx, world);
  assert.equal(plain.total(), 0);
  world.ball.heft = world.loadout.effects.heft;
  const heavy = countingContext();
  drawHeft(heavy.ctx, world);
  assert.equal(heavy.counts.stroke, 2);
  world.ball.owner = 'bot';
  const theirs = countingContext();
  drawHeft(theirs.ctx, world);
  assert.equal(theirs.total(), 0);
});

it('Reckless strips the line bare, and Clutch tints the half it slows', () => {
  const world = build({ reckless: 1, clutch: 2 });
  const bare = countingContext();
  drawCourtMarks(bare.ctx, world);
  assert.ok(bare.counts.stroke >= 1);
  world.match.score.bot = world.match.winScore - 1;
  updateRuntime(world, 1 / 120);
  const clutch = countingContext();
  drawCourtMarks(clutch.ctx, world);
  assert.ok(clutch.total() > bare.total());
});

it('every new cast draws at every graphics budget without throwing', () => {
  const world = build({ 'critical-strike': 1 });
  for (const kind of [
    'crit',
    'bank',
    'swerve',
    'fan',
    'corner',
    'save',
    'recharge',
    'refund',
    'grow'
  ] as const)
    world.casts.spawn(kind, {
      x: 40,
      y: 200,
      hue: 120,
      size: kind === 'swerve' ? -34 : 60,
      dir: 0.3
    });
  for (const cast of world.casts.items) if (cast.alive) cast.age = cast.life * 0.4;
  for (const level of ['high', 'balanced', 'low'] as const) {
    applyGraphicsIntensity(world, level);
    const drawn = countingContext();
    drawCasts(drawn.ctx, world);
    assert.ok(drawn.total() >= 9, level);
  }
});

it('no passive chip is offered in the attract demo or a two-player match', () => {
  const world = build({ shield: 1, momentum: 1, 'flow-state': 1 });
  assert.equal(passiveViews(world).length, 3);
  world.match.status = 'menu';
  assert.equal(passiveViews(world).length, 0);
  world.match.status = 'play';
  world.rules = { ...world.rules, versus: true };
  assert.equal(passiveViews(world).length, 0);
});
