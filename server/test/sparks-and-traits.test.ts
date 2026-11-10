import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BALANCE } from '../../src/core/balance/config';
import { STAGES } from '../../src/core/campaign/journey';
import { EXPANSION_BOSS_IDS, EXPANSION_WORLDS } from '../../src/core/campaign/expansion';
import { ARENA_PRESETS, arenaPreset, presetsOn } from '../../src/core/modes/arenas';
import { bossById } from '../../src/core/modes/bosses';
import { challengeById, FEATURED_CHALLENGES } from '../../src/core/modes/challenges';
import { validArena } from '../../src/core/modes/recipes';
import {
  campaignRules,
  challengeRules,
  objectiveMet,
  practiceRules,
  quickMatchRules
} from '../../src/core/modes/rules';
import { SPARK_COURTS } from '../../src/core/modes/sparkCourts';
import { starGoalMet } from '../../src/core/modes/stars';
import type { BossSpec, MatchRules } from '../../src/core/modes/types';
import { createProfile } from '../../src/core/profile/defaults';
import { createRun, encounterFor } from '../../src/core/run/run';
import { createTalentSave } from '../../src/core/talents/save';
import { resolveLoadout } from '../../src/core/talents/effects';
import { validateMatch } from '../../server/src/domain/matchValidation';
import { activeTraits, updateBossTraits } from '../../src/game/bossTraits';
import { BALL_R, FIELD_H, FIXED_DT } from '../../src/game/constants';
import { collideCourse, gateOpening } from '../../src/game/course';
import type { GameAudio } from '../../src/game/audio';
import { bossReturned, checkBossPhase, collideArena, rescaleArena } from '../../src/game/arena';
import { publishResult, startMatch } from '../../src/game/match';
import { encounterPracticeRules } from '../../src/core/modes/encounterPractice';
import { stepBall } from '../../src/game/physics';
import { step } from '../../src/game/simulation';
import { collectSparks, fireReturn, tryWard, updateSparks } from '../../src/game/sparks';
import { rallyCeiling } from '../../src/game/talents';
import { createWorld, placePaddles, type World } from '../../src/game/world';
import { matchSubmission } from './helpers';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;

function worldWith(rules: MatchRules): World {
  const world = createWorld(silent, 0);
  world.view.w = 1000;
  placePaddles(world);
  startMatch(world, rules);
  world.match.status = 'play';
  return world;
}

function sparkCourt(id = 'spark-circuit'): World {
  return worldWith(quickMatchRules('pro', { arenaId: id }));
}

function bossMatch(spec: BossSpec, arena = bossById('railwarden')!.modifiers.arena): World {
  const base = quickMatchRules('pro');
  return worldWith({
    ...base,
    winScore: 5,
    modifiers: { ...base.modifiers, ...(arena ? { arena } : {}) },
    boss: spec
  });
}

/** Put the ball just short of a point, heading a given way, last touched by `owner`. */
function aim(world: World, x: number, y: number, vx: number, vy: number, owner: 'you' | 'bot') {
  const { ball } = world;
  ball.x = x;
  ball.y = y;
  ball.px = x - vx * FIXED_DT;
  ball.py = y - vy * FIXED_DT;
  ball.vx = vx;
  ball.vy = vy;
  ball.speed = Math.hypot(vx, vy);
  ball.owner = owner;
}

describe('sparks', () => {
  it('appear only on spark courts, in midfield, during live play, and the same way for a seed', () => {
    const plain = worldWith(quickMatchRules('pro'));
    updateSparks(plain, 30);
    assert.equal(plain.arena.sparks.orbs.length, 0);

    const placed = () => {
      const world = sparkCourt();
      world.random = (() => {
        let s = 7;
        return () => (s = (s * 16807) % 2147483647) / 2147483647;
      })();
      world.match.status = 'serve';
      updateSparks(world, 10);
      assert.equal(world.arena.sparks.orbs.length, 0, 'never while the serve is held');
      world.match.status = 'play';
      for (let i = 0; i < 20; i++) updateSparks(world, 0.5);
      return world.arena.sparks.orbs.map((o) => [o.kind, Math.round(o.x), Math.round(o.y)]);
    };
    const first = placed();
    assert.ok(first.length >= 1 && first.length <= 2);
    assert.deepEqual(placed(), first);
    for (const [, x, y] of first as [string, number, number][]) {
      assert.ok(x >= 360 && x <= 640, 'midfield only');
      assert.ok(y >= FIELD_H * 0.14 && y <= FIELD_H * 0.86);
    }
  });

  it('go to the side that touched the ball last, and size effects expire', () => {
    const world = sparkCourt();
    const half = world.player.half;
    const botHalf = world.bot.half;
    world.arena.sparks.orbs.push({ kind: 'wide', x: 500, y: 300, age: 1 });
    aim(world, 500, 300, 600, 0, 'you');
    collectSparks(world);
    assert.equal(world.arena.course.events.you.sparks, 1);
    updateSparks(world, FIXED_DT);
    assert.ok(Math.abs(world.player.half - half * BALANCE.sparks.wideScale) < 1e-6);

    world.arena.sparks.orbs.push({ kind: 'hex', x: 500, y: 300, age: 1 });
    aim(world, 500, 300, -600, 0, 'bot');
    collectSparks(world);
    assert.equal(world.arena.course.events.bot.sparks, 1);
    updateSparks(world, FIXED_DT);
    assert.ok(world.player.half < half * BALANCE.sparks.wideScale - 1, 'the bot hexed the player');
    assert.equal(world.bot.half, botHalf);

    updateSparks(world, BALANCE.sparks.wideTime + 1);
    assert.ok(Math.abs(world.player.half - half) < 1e-6, 'everything wears off');
  });

  it('a resized court keeps its sparks in midfield and its warden on its line', () => {
    const world = bossMatch(
      {
        id: 'test',
        name: 'Test',
        title: 'Test',
        hue: 40,
        traits: { warden: { x: 0.7, half: 30, speed: 200 } },
        phases: []
      },
      arenaPreset('spark-garden')!.arena
    );
    for (let i = 0; i < 20; i++) updateSparks(world, 0.5);
    const orb = world.arena.sparks.orbs[0]!;
    const fraction = orb.x / world.view.w;
    world.arena.warden!.y = 200;
    world.view.w = 750;
    rescaleArena(world);
    assert.ok(Math.abs(orb.x / 750 - fraction) < 1e-9);
    assert.equal(world.arena.warden!.x, 750 * 0.7);
    assert.equal(world.arena.warden!.y, 200, 'it keeps its place across the court');
  });

  it('a spark still popping in cannot be taken', () => {
    const world = sparkCourt();
    world.arena.sparks.orbs.push({ kind: 'fire', x: 500, y: 300, age: 0.1 });
    aim(world, 500, 300, 600, 0, 'you');
    collectSparks(world);
    assert.equal(world.arena.sparks.orbs.length, 1);
  });

  it('Fire charges one return, within the hard speed limit, and is spent', () => {
    const world = sparkCourt();
    world.arena.sparks.hold.you.fire = 1;
    aim(world, 100, 300, 700, 50, 'you');
    const before = world.ball.speed;
    assert.equal(fireReturn(world, 'you', 100, 300), true);
    assert.ok(world.ball.speed > before);
    assert.ok(
      world.ball.speed <=
        Math.min(BALANCE.ball.hardMax, rallyCeiling(world) * BALANCE.sparks.fireCeiling) + 1e-6
    );
    assert.ok(Math.abs(Math.hypot(world.ball.vx, world.ball.vy) - world.ball.speed) < 1e-6);
    assert.ok(world.ball.heft >= BALANCE.sparks.fireHeft);
    assert.equal(fireReturn(world, 'you', 100, 300), false, 'one return only');
    world.arena.sparks.hold.bot.fire = 1;
    aim(world, 900, 300, -BALANCE.ball.hardMax, 0, 'bot');
    fireReturn(world, 'bot', 900, 300);
    assert.ok(world.ball.speed <= BALANCE.ball.hardMax + 1e-6);
  });

  it('Ward turns one ball back at its own line, after the build has had its chance', () => {
    const world = sparkCourt();
    world.arena.sparks.hold.you.ward = 1;
    aim(world, BALL_R + 1, 300, -800, 100, 'bot');
    world.player.y = 50;
    world.player.target = 50;
    stepBall(world, FIXED_DT);
    assert.ok(world.ball.vx > 0, 'turned back');
    assert.equal(world.ball.owner, 'you');
    assert.equal(world.arena.sparks.hold.you.ward, 0);
    assert.equal(world.match.score.bot, 0);
    assert.equal(world.talents.stats.shieldSaves, 0, 'a court save, never a talent save');
    assert.equal(tryWard(world, 'you'), false);

    world.arena.sparks.hold.bot.ward = 1;
    aim(world, world.view.w - BALL_R - 1, 300, 800, 0, 'you');
    world.bot.y = 550;
    stepBall(world, FIXED_DT);
    assert.ok(world.ball.vx < 0, 'the far line has a ward too');
    assert.equal(world.match.score.you, 0);
  });

  it('a Reckless side, which nothing may save, collects Fire instead of a Ward', () => {
    const world = sparkCourt();
    const save = createTalentSave();
    save.ranks = { 'heavy-impact': 3, 'critical-strike': 3, 'power-strike': 1, reckless: 1 };
    world.loadout = resolveLoadout(save, 50);
    assert.equal(world.loadout.effects.unsaved, true);
    world.arena.sparks.orbs.push({ kind: 'ward', x: 500, y: 300, age: 1 });
    aim(world, 500, 300, 600, 0, 'you');
    collectSparks(world);
    assert.equal(world.arena.sparks.hold.you.ward, 0);
    assert.equal(world.arena.sparks.hold.you.fire, 1);
  });

  it('court evidence, star goals and objectives count sparks, and the server checks the court', () => {
    const won = {
      won: true,
      scoreYou: 3,
      scoreBot: 1,
      bestRally: 9,
      flicks: 0,
      seconds: 80,
      hits: 20
    };
    const court = { banks: 0, switches: 0, breaks: 0, gates: 0, sparks: 2 };
    assert.equal(starGoalMet({ id: 'sparks', value: 2 }, { ...won, court }), true);
    assert.equal(starGoalMet({ id: 'sparks', value: 3 }, { ...won, court }), false);
    const duel = challengeRules(challengeById('spark-duel')!);
    assert.equal(
      objectiveMet(duel.objective, { ...won, court: { ...court, sparks: 3 } } as never),
      true
    );

    const profile = createProfile();
    const now = Date.now();
    const plain = validateMatch(matchSubmission({ court: { ...court, sparks: 1 } }), {
      profile,
      now,
      recentPlaySeconds: 0
    });
    assert.equal(plain.ok, false, 'no sparks on an open court');
    const sparked = validateMatch(
      matchSubmission({ options: { arenaId: 'spark-garden' }, court: { ...court, sparks: 4 } }),
      { profile, now, recentPlaySeconds: 0 }
    );
    assert.equal(sparked.ok, true);
    const older = validateMatch(
      matchSubmission({ court: { banks: 0, switches: 0, breaks: 0, gates: 0 } }),
      { profile, now, recentPlaySeconds: 0 }
    );
    assert.equal(older.ok, true, 'a client from before sparks sends no count at all');
  });

  it('spark courts validate, join the Daily only from the day after they shipped, and play cleanly', () => {
    for (const court of SPARK_COURTS) {
      assert.ok(validArena(court.arena), court.id);
      assert.ok(arenaPreset(court.id));
    }
    assert.equal(
      presetsOn('2026-11-10').some((p) => p.arena.sparks),
      false
    );
    assert.equal(presetsOn('2026-11-11').filter((p) => p.arena.sparks).length, SPARK_COURTS.length);
    assert.equal(
      new Set(ARENA_PRESETS.map((p) => p.name)).size,
      ARENA_PRESETS.length,
      'every court has its own name'
    );
    for (const court of SPARK_COURTS) {
      const world = sparkCourt(court.id);
      for (let i = 0; i < 120 * 40; i++) {
        if (world.match.status === 'play') world.player.target = world.ball.y;
        step(world, FIXED_DT);
        assert.ok(
          [world.ball.x, world.ball.y, world.player.half, world.bot.half].every(Number.isFinite)
        );
        assert.ok(world.arena.sparks.orbs.length <= 2);
      }
    }
  });
});

describe('boss traits', () => {
  const plainBoss = (traits: BossSpec['traits'], phases: BossSpec['phases'] = []): BossSpec => ({
    id: 'test',
    name: 'Test',
    title: 'Test',
    hue: 40,
    ...(traits ? { traits } : {}),
    phases
  });

  it('the warden turns a player return back from the front, once per return, never the boss return', () => {
    const world = bossMatch(plainBoss({ warden: { x: 0.7, half: 40, speed: 300 } }));
    const warden = world.arena.warden!;
    assert.ok(warden);
    world.match.rally = 3;
    warden.y = 300;
    aim(world, 690, 300, 700, 0, 'you');
    world.ball.x = 694;
    collideArena(world);
    assert.ok(world.ball.vx < 0, 'turned back');
    assert.equal(world.match.rally, 3, 'not counted as a return');
    assert.equal(world.ball.owner, 'you');
    aim(world, 690, 300, 700, 0, 'you');
    world.ball.x = 694;
    collideArena(world);
    assert.ok(world.ball.vx > 0, 'spent until the player returns again');
    aim(world, 712, 300, -700, 0, 'bot');
    world.ball.x = 706;
    warden.spent = false;
    collideArena(world);
    assert.ok(world.ball.vx < 0, 'the boss return passes behind it');
  });

  it('the warden only commits once the ball is past the centre line, at its own speed', () => {
    const world = bossMatch(plainBoss({ warden: { x: 0.7, half: 40, speed: 300 } }));
    const warden = world.arena.warden!;
    warden.y = 300;
    aim(world, 300, 100, 600, 0, 'you');
    updateBossTraits(world, 0.1);
    assert.ok(Math.abs(warden.y - 300) <= 300 * 0.1 + 1e-6);
    aim(world, 560, 100, 600, 0, 'you');
    const before = warden.y;
    updateBossTraits(world, 0.1);
    assert.ok(warden.y < before, 'heads for the crossing');
    assert.ok(before - warden.y <= 30 + 1e-6);
  });

  it('surge and stutter act on the boss return at the centre line and stay inside the limits', () => {
    const surge = bossMatch(plainBoss({ surge: 1.2 }));
    aim(surge, 520, 300, -800, 0, 'bot');
    surge.arena.bossFlight = true;
    surge.ball.x = 504;
    surge.ball.px = 504;
    stepBall(surge, FIXED_DT);
    assert.ok(surge.ball.speed > 800);
    assert.ok(
      surge.ball.speed <=
        Math.min(BALANCE.ball.hardMax, rallyCeiling(surge) * BALANCE.bossTraits.surgeCeiling) + 1e-6
    );

    const stutter = bossMatch(plainBoss({ stutter: 0.3 }));
    aim(stutter, 504, 300, -800, 0, 'bot');
    stutter.arena.bossFlight = true;
    stepBall(stutter, FIXED_DT);
    assert.ok(stutter.ball.speed < 800 * 0.5, 'checked up');
    assert.ok(stutter.ball.speed >= BALANCE.ball.hardMin);
    for (let i = 0; i < 0.31 / FIXED_DT; i++) updateBossTraits(stutter, FIXED_DT);
    assert.ok(stutter.ball.speed >= 800, 'snaps back on');

    const player = bossMatch(plainBoss({ surge: 1.2 }));
    aim(player, 504, 300, -800, 0, 'you');
    stepBall(player, FIXED_DT);
    assert.equal(player.ball.speed, 800, 'never the player return');
  });

  it('the mason rebuilds broken structures, and gust and lockdown answer each boss return', () => {
    const mason = bossMatch(plainBoss({ mason: 2 }), arenaPreset('deflector-ruins-1')!.arena);
    mason.arena.course.rails[0] = 0;
    for (let i = 0; i < 2.05 / FIXED_DT; i++) updateBossTraits(mason, FIXED_DT);
    assert.equal(mason.arena.course.rails[0], 3);

    const gust = bossMatch(plainBoss({ gust: true }), arenaPreset('crosswind-lock-1')!.arena);
    gust.arena.windTimer = 5;
    bossReturned(gust);
    assert.ok(gust.arena.windTimer <= 0.8, 'the wind turns after the usual warning');

    const lock = bossMatch(plainBoss({ lockdown: true }), arenaPreset('switchyard-1')!.arena);
    lock.arena.course.openUntil[0] = lock.arena.time + 3;
    const gate = lock.arena.spec!.gates![0]!;
    assert.equal(gateOpening(gate, lock.arena.time, lock.arena.course.openUntil[0]).gap, 1);
    bossReturned(lock);
    assert.ok(lock.arena.course.openUntil[0]! <= lock.arena.time, 'the switch-held gate shuts');
  });

  it('phases add traits on top of the boss own, and bring the warden when they name one', () => {
    const spec = plainBoss({ stutter: 0.2 }, [
      { at: 2, label: 'Two', traits: { warden: { x: 0.72, half: 30, speed: 200 } } },
      { at: 4, label: 'Four', traits: { surge: 1.1 } }
    ]);
    const world = bossMatch(spec);
    assert.equal(world.arena.warden, null);
    world.match.score.you = 2;
    checkBossPhase(world);
    assert.ok(world.arena.warden);
    assert.equal(activeTraits(world).stutter, 0.2);
    world.match.score.you = 4;
    checkBossPhase(world);
    assert.deepEqual(Object.keys(activeTraits(world)).sort(), ['stutter', 'surge', 'warden']);
  });

  it('rehearsing a reached phase brings the same traits and warden as the live fight', () => {
    for (const id of EXPANSION_BOSS_IDS) {
      const source = campaignRules(STAGES.find((s) => s.boss === id && s.world >= 6)!);
      for (const reached of [0, 2, 4]) {
        const live = worldWith(source);
        for (let point = 1; point <= reached; point++) {
          live.match.score.you = point;
          checkBossPhase(live);
        }
        publishResult(live);
        const practice = worldWith(encounterPracticeRules(source, live.match.result!)!);
        assert.deepEqual(activeTraits(practice), activeTraits(live), `${id} at ${reached}`);
        assert.equal(practice.arena.warden?.half, live.arena.warden?.half);
        assert.equal(practice.arena.warden?.speed, live.arena.warden?.speed);
        // Practice's isolated phase drill reaches the same traits.
        const drill = worldWith(
          practiceRules('pro', 'normal', { bossId: id, bossPhase: live.arena.phase })
        );
        assert.deepEqual(activeTraits(drill), activeTraits(live), `${id} drill ${reached}`);
      }
    }
  });

  it('every signature boss plays to a result without a broken ball or a stalled point', () => {
    for (const id of EXPANSION_BOSS_IDS) {
      const stage = STAGES.find((s) => s.boss === id && s.world >= 6)!;
      const world = worldWith(campaignRules(stage));
      let idle = 0;
      let hits = 0;
      for (let i = 0; i < 120 * 60 && world.match.status !== 'over'; i++) {
        if (world.match.status === 'play') world.player.target = world.ball.y;
        step(world, FIXED_DT);
        assert.ok(
          [world.ball.x, world.ball.y, world.ball.vx, world.ball.vy].every(Number.isFinite),
          id
        );
        idle = world.match.hits !== hits ? 0 : idle + FIXED_DT;
        hits = world.match.hits;
        assert.ok(idle < 60, `${id} stalled`);
      }
    }
  });
});

describe('Journey worlds 6 to 30', () => {
  it('each world has its own boss, named for what it does, and no boss repeats', () => {
    assert.equal(EXPANSION_WORLDS.length, 25);
    const bosses = EXPANSION_WORLDS.map((w) => w.stages[23]!.boss);
    assert.equal(new Set(bosses).size, 25);
    assert.deepEqual(bosses, [...EXPANSION_BOSS_IDS]);
    for (const id of EXPANSION_BOSS_IDS) {
      const boss = bossById(id)!;
      assert.ok(boss, id);
      assert.ok(
        !ARENA_PRESETS.some((court) => court.blurb === boss.spec.title),
        `${id} has a title of its own, not a court blurb`
      );
      for (const phase of boss.spec.phases) assert.doesNotMatch(phase.label, /opens$|^Final route/);
      const signature =
        boss.spec.traits || boss.spec.rhythm || boss.spec.swerve || boss.modifiers.arena?.sparks;
      assert.ok(signature, `${id} has a signature behaviour`);
    }
  });

  it('stage names read as places, and the core chain carries no hidden handicap', () => {
    for (const world of EXPANSION_WORLDS)
      for (const stage of world.stages) {
        assert.doesNotMatch(stage.name, /^(Core|Branch|Trial) \d/, stage.id);
        assert.doesNotMatch(stage.name, / \d$/, stage.id);
        if (stage.index < 8) {
          assert.equal(stage.modifiers.startScore, undefined, stage.id);
          assert.equal(stage.modifiers.shrinkPerHit, undefined, stage.id);
          assert.equal(stage.modifiers.playerPaddleScale, undefined, stage.id);
        }
        // Five points inside a minute is a goal nobody reaches.
        if (stage.winScore > 3) assert.ok(!stage.goals.some((g) => g.id === 'fast'), stage.id);
        // A court goal the court cannot give is never set.
        for (const goal of stage.goals) {
          const arena = stage.boss ? bossById(stage.boss)!.modifiers.arena : stage.modifiers.arena;
          if (goal.id === 'sparks') assert.ok(arena?.sparks, stage.id);
          if (goal.id === 'switches') assert.ok(arena?.switches?.length, stage.id);
          if (goal.id === 'gates') assert.ok(arena?.gates?.length, stage.id);
        }
      }
  });

  it('eight core stages lead to the boss; branches and trials never gate it', () => {
    for (const world of EXPANSION_WORLDS) {
      const boss = world.stages[23]!;
      assert.deepEqual(boss.prerequisites, [`w${world.id}-8`]);
      for (const stage of world.stages.slice(8, 23))
        assert.deepEqual(stage.prerequisites, [`w${world.id}-8`]);
    }
  });

  it('a gate crossing counts only while the gate is narrowed', () => {
    const world = worldWith(quickMatchRules('pro', { arenaId: 'gatehouse-1' }));
    const gate = world.arena.spec!.gates![0]!;
    const x = gate.x * world.view.w;
    const cross = () => {
      const opening = gateOpening(gate, world.arena.time, world.arena.course.openUntil[0]);
      aim(world, x + 2, opening.center * FIELD_H, 700, 0, 'you');
      world.ball.px = x - 2;
      collideCourse(world);
    };
    world.arena.time = gate.period * 0.2;
    cross();
    assert.equal(world.arena.course.events.you.gates, 1);
    world.arena.time = gate.period * 0.95;
    assert.equal(gateOpening(gate, world.arena.time).gap, 1);
    cross();
    assert.equal(world.arena.course.events.you.gates, 1, 'the full-width release beat is no feat');
  });
});

describe('Gauntlet bosses', () => {
  it('a run meets its bosses in its own order and never the same one twice', () => {
    for (const seed of ['a', 'b', 'c', 'weekly-2026-45']) {
      const run = {
        ...createRun(seed, 0, Date.parse('2026-11-10T00:00:00Z'), 'endless'),
        pressure: 10
      };
      const bosses: string[] = [];
      for (let stage = 0; stage < 120; stage++) {
        const encounter = encounterFor(run, stage);
        if (encounter.boss) bosses.push(encounter.boss);
      }
      const deep = bosses.slice(0, EXPANSION_BOSS_IDS.length + 2);
      assert.equal(new Set(deep).size, deep.length, `${seed}: ${deep.join(',')}`);
    }
    const sprint = createRun('sprint', 0, Date.parse('2026-11-10T00:00:00Z'), 'sprint');
    const early = Array.from({ length: 9 }, (_, i) => encounterFor(sprint, i).boss).filter(Boolean);
    assert.equal(
      new Set(early).size,
      early.length,
      `a Sprint never meets one boss twice: ${early.join(',')}`
    );
  });

  it('featured challenges hold their boss to the challenge opponent', () => {
    for (const challenge of FEATURED_CHALLENGES) {
      const rules = challengeRules(challenge);
      if (!challenge.boss) continue;
      assert.ok(rules.boss);
      for (const phase of rules.boss.phases)
        if (phase.bot) assert.equal(phase.bot, challenge.bot, challenge.id);
    }
  });
});
