import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  COMPONENTS,
  kitOf,
  sameKit,
  surfaceResponse,
  snapshotOf
} from '../../src/core/equipment/catalog';
import { NEUTRAL_KIT, type PaddleKit } from '../../src/core/equipment/types';
import {
  workshopActionOn,
  workshopOf,
  applyWorkshopReward,
  WORKSHOP_CONTRACTS
} from '../../src/core/equipment/workshop';
import {
  encounterIdentity,
  withEquipmentRules,
  fixedDailyKit
} from '../../src/core/equipment/policy';
import { createProfile } from '../../src/core/profile/defaults';
import { progressOf, cloneProgress } from '../../src/core/profile/progress';
import {
  quickMatchRules,
  dailyRules,
  challengeRulesById,
  runRules,
  tournamentRules
} from '../../src/core/modes/rules';
import { startRunOn } from '../../src/core/run/ops';
import { createRun } from '../../src/core/run/run';
import { actLength } from '../../src/core/run/formats';
import { createTournament } from '../../src/core/tournament/bracket';
import { applyMatchResult } from '../../src/core/progression/apply';
import { BALANCE } from '../../src/core/balance/config';
import { createWorld } from '../../src/game/world';
import { startMatch, beginServe } from '../../src/game/match';
import { stepBall } from '../../src/game/physics';
import { playerLength, previewReturn } from '../../src/game/talents';
import { forecast } from '../../src/game/trajectory';
import { returnPace } from '../../src/game/returnPace';
import { combatant } from '../../src/game/combatant';
import { benchmarkBuild } from '../../scripts/sim-builds';
import { BOONS } from '../../src/core/run/boons';
import { withBoons } from '../../src/core/talents/effects';
import { mergeProfiles, sanitizeClaim } from '../src/domain/claim';
import { PROFILE_VERSION } from '../../src/core/profile/schema';
import { BALL_R, PADDLE_W, FIXED_DT } from '../../src/game/constants';
import type { GameAudio } from '../../src/game/audio';
import type { MatchResult } from '../../src/core/modes/types';
import type { SyncOp, SyncPushResponse } from '../../shared/protocol';
import { auth, makeServer, matchSubmission, register, type TestServer } from './helpers';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;
function contact(kit: PaddleKit, raw = 0, velocity = 0, side: 'you' | 'bot' = 'you', speed = 600) {
  const world = createWorld(silent, 0);
  startMatch(world, {
    ...quickMatchRules('pro'),
    equipment: { version: 1, kit },
    opponentEquipment: kit
  });
  world.random = () => 1;
  world.match.status = 'play';
  const paddle = side === 'you' ? world.player : world.bot;
  const dir = side === 'you' ? 1 : -1;
  paddle.vy = velocity;
  Object.assign(world.ball, {
    x: paddle.x + dir * (PADDLE_W / 2 + BALL_R + 1),
    y: paddle.y + paddle.half * raw,
    speed,
    vx: -dir * speed,
    vy: 0
  });
  return { world, paddle, hit: () => stepBall(world, FIXED_DT) };
}
function result(patch: Partial<MatchResult> = {}): MatchResult {
  return { ...matchSubmission(), ranked: true, botRank: 3, flicks: 0, objective: null, ...patch };
}

describe('paddle material physics', () => {
  for (const side of ['you', 'bot'] as const) {
    it(`neutral ${side} return preserves ordinary growth and angle`, () => {
      const c = contact({ ...NEUTRAL_KIT }, 0.5, 0, side);
      const growth = c.world.tuning.speedPerHit;
      c.hit();
      assert.equal(c.world.ball.speed, 600 * growth);
      assert.ok(c.world.ball.vx * (side === 'you' ? 1 : -1) > 0);
      assert.ok(Math.abs(Math.atan2(c.world.ball.vy, Math.abs(c.world.ball.vx))) <= 1.15);
    });
    it(`Springsteel ${side} improves only an ordinary clean centre`, () => {
      const neutral = contact({ ...NEUTRAL_KIT }, 0, 0, side),
        steel = contact({ ...NEUTRAL_KIT, core: 'springsteel' }, 0, 0, side);
      neutral.hit();
      steel.hit();
      assert.ok(
        Math.abs(
          steel.world.ball.speed - neutral.world.ball.speed - 600 * BALANCE.equipment.steelGrowth
        ) < 1e-8
      );
      const edge = contact({ ...NEUTRAL_KIT, core: 'springsteel' }, 0.75, 0, side);
      edge.hit();
      assert.equal(edge.world.ball.speed, neutral.world.ball.speed);
    });
  }
  it('rubber trades stationary placement for moving grip without changing flick classification', () => {
    const standard = surfaceResponse({ ...NEUTRAL_KIT }, 0.65, 0.65);
    const rubber = surfaceResponse({ ...NEUTRAL_KIT, surface: 'rubber' }, 0.65, 0.65);
    assert.ok(rubber.off < standard.off);
    assert.ok(rubber.grip > standard.grip);
    for (const surface of ['balanced-surface', 'rubber']) {
      const c = contact({ ...NEUTRAL_KIT, surface }, 0.65, 700);
      c.hit();
      assert.equal(c.world.match.flicks, 1);
    }
  });
  it('ceramic and split responses remain continuous and reach their endpoints', () => {
    const kit = { ...NEUTRAL_KIT, surface: 'ceramic' };
    assert.equal(surfaceResponse(kit, 0.08, 0.08).off, 0);
    assert.ok(surfaceResponse(kit, 0.0800001, 0.0800001).off < 1e-6);
    assert.equal(surfaceResponse(kit, 1, 1).off, 1);
    for (const seam of [0.3, 0.7]) {
      const split = { ...NEUTRAL_KIT, surface: 'split' };
      assert.ok(
        Math.abs(
          surfaceResponse(split, seam - 1e-6, seam - 1e-6).off -
            surfaceResponse(split, seam + 1e-6, seam + 1e-6).off
        ) < 1e-4
      );
    }
  });
  it('Cork removes only tracked incoming surge', () => {
    const a = contact({ ...NEUTRAL_KIT }),
      b = contact({ ...NEUTRAL_KIT, core: 'cork' });
    a.hit();
    b.hit();
    assert.equal(a.world.ball.speed, b.world.ball.speed);
    const boosted = contact({ ...NEUTRAL_KIT, core: 'cork' });
    boosted.world.botTalents.surge = 100;
    const plain = 500 * boosted.world.tuning.speedPerHit;
    boosted.hit();
    assert.ok(boosted.world.ball.speed >= plain);
    assert.equal(boosted.paddle.material.stats.absorbed, 1);
    assert.ok(boosted.world.botTalents.surge >= 0);
  });
  it('gel releases on a later contact, stays bounded and resets at serve', () => {
    const c = contact({ ...NEUTRAL_KIT, core: 'memory-gel' });
    c.world.botTalents.surge = 100;
    c.hit();
    assert.ok(
      c.paddle.material.stored > 0 && c.paddle.material.stored <= BALANCE.equipment.gelStore
    );
    assert.equal(c.paddle.material.stats.releases, 0);
    const stored = c.paddle.material.stored;
    c.world.ball.x = c.paddle.x + PADDLE_W / 2 + BALL_R + 1;
    c.world.ball.y = c.paddle.y;
    c.world.ball.speed = 600;
    c.world.ball.vx = -600;
    c.world.ball.vy = 0;
    c.world.talents.surge = 0;
    c.world.botTalents.surge = 0;
    c.hit();
    assert.equal(c.paddle.material.stats.releases, 1);
    assert.equal(c.paddle.material.stored, 0);
    assert.ok(c.world.ball.speed > 600 * c.world.tuning.speedPerHit);
    c.paddle.material.stored = stored;
    c.paddle.material.switchCharge = true;
    beginServe(c.world, 1);
    assert.equal(c.paddle.material.stored, 0);
    assert.equal(c.paddle.material.switchCharge, false);
  });
  it('Copper requires a switch event on the owner side, consumes one charge and cannot stack with gel', () => {
    const c = contact({ ...NEUTRAL_KIT, insert: 'copper' });
    c.hit();
    assert.equal(c.paddle.material.stats.releases, 0);
    const charged = contact({ ...NEUTRAL_KIT, insert: 'copper' });
    charged.world.arena.course.events.you.switches = 1;
    charged.hit();
    assert.equal(charged.paddle.material.stats.releases, 1);
    assert.equal(charged.paddle.material.switchCharge, false);
    const opponent = contact({ ...NEUTRAL_KIT, insert: 'copper' });
    opponent.world.arena.course.events.bot.switches = 1;
    opponent.hit();
    assert.equal(opponent.paddle.material.stats.releases, 0);
    assert.equal(
      kitOf({ ...NEUTRAL_KIT, core: 'memory-gel', insert: 'copper' }).insert,
      'empty-insert'
    );
  });
  it('frames share the ordinary length cap and preserve rally pressure', () => {
    const c = contact({ ...NEUTRAL_KIT, frame: 'extended' });
    c.world.loadout = { ...c.world.loadout, effects: { ...c.world.loadout.effects, length: 0.3 } };
    assert.ok(Math.abs(playerLength(c.world) - 0.3) < 1e-12);
    c.world.match.rally = 44;
    assert.ok(playerLength(c.world) < 0);
  });
  it('all supported kits are bounded and previews and forecasts leave live state untouched', () => {
    let cases = 0;
    for (const core of COMPONENTS.filter((p) => p.slot === 'core'))
      for (const surface of COMPONENTS.filter((p) => p.slot === 'surface'))
        for (const frame of ['balanced-frame', 'extended', 'compact'])
          for (const tuning of ['standard', 'firm', 'grip'] as const) {
            const c = contact(
              { ...NEUTRAL_KIT, core: core.id, surface: surface.id, frame, tuning },
              0.75,
              900,
              'you',
              1700
            );
            const before = structuredClone({
              talents: c.world.talents,
              material: c.paddle.material,
              ball: c.world.ball
            });
            const random = c.world.random;
            previewReturn(c.world, 0.75);
            forecast(c.world, c.world.bot.x);
            assert.deepEqual(
              { talents: c.world.talents, material: c.paddle.material, ball: c.world.ball },
              before
            );
            assert.equal(c.world.random, random);
            c.hit();
            assert.ok(
              c.world.ball.speed <= BALANCE.ball.hardMax &&
                c.world.ball.speed >= BALANCE.ball.hardMin
            );
            assert.ok(Math.abs(Math.atan2(c.world.ball.vy, Math.abs(c.world.ball.vx))) <= 1.15);
            cases++;
          }
    assert.equal(cases, 216);
  });
  it('stateful outgoing pace previews equal actual returns on both sides without spending charge', () => {
    for (const side of ['you', 'bot'] as const)
      for (const core of ['balanced-core', 'springsteel', 'cork', 'memory-gel']) {
        const c = contact({ ...NEUTRAL_KIT, core, surface: 'rubber' }, 0.7, 700, side);
        c.paddle.material.stored = core === 'memory-gel' ? 30 : 0;
        combatant(c.world, side === 'you' ? 'bot' : 'you').talents.surge = 100;
        const before = structuredClone(c.paddle.material);
        const pace = returnPace(
          c.world,
          c.paddle,
          previewReturn(combatant(c.world, side), 0.7),
          0.7
        );
        assert.deepEqual(c.paddle.material, before);
        c.hit();
        assert.ok(Math.abs(pace.speed - c.world.ball.speed) < 1e-8);
      }
  });
  it('materials compose with low and capped branch builds, saturated boons and empowered contacts', () => {
    const boons = Object.fromEntries(BOONS.filter((b) => !b.instant).map((b) => [b.id, b.maxRank]));
    for (const level of [1, 50])
      for (const branch of ['power', 'control', 'defense'] as const) {
        for (const side of ['you', 'bot'] as const)
          for (const core of ['balanced-core', 'springsteel', 'cork', 'memory-gel'])
            for (const surface of COMPONENTS.filter((p) => p.slot === 'surface')) {
              const c = contact(
                { ...NEUTRAL_KIT, core, surface: surface.id, frame: 'extended', tuning: 'grip' },
                0.7,
                2000,
                side,
                1700
              );
              const actor = combatant(c.world, side);
              if (side === 'you') c.world.loadout = withBoons(benchmarkBuild(branch, level), boons);
              else c.world.botLoadout = withBoons(benchmarkBuild(branch, level), boons);
              actor.talents.overload = 2;
              actor.talents.guardWindow = 1;
              const preview = previewReturn(actor, 0.7);
              assert.ok(preview.spin <= BALANCE.equipment.overallSpinMax);
              c.hit();
              assert.ok(c.world.ball.speed <= BALANCE.ball.hardMax);
              assert.ok(Math.abs(Math.atan2(c.world.ball.vy, Math.abs(c.world.ball.vx))) <= 1.15);
              assert.equal(actor.talents.overload, 1);
            }
      }
  });
  it('replays restore material charge and contact position from each recorded frame', () => {
    const c = contact({ ...NEUTRAL_KIT, core: 'memory-gel' });
    for (let i = 0; i < 60; i++) {
      c.paddle.material.stored = 24;
      c.paddle.material.switchCharge = true;
      c.paddle.hitY = 12;
      c.world.replay.record(c.world);
      c.world.replay.record(c.world);
    }
    c.paddle.material.stored = 0;
    c.paddle.material.switchCharge = false;
    c.paddle.hitY = 0;
    c.world.replay.begin(c.world);
    c.world.replay.play(c.world, 0);
    assert.equal(c.paddle.material.stored, 24);
    assert.equal(c.paddle.material.switchCharge, true);
    assert.equal(c.paddle.hitY, 12);
  });
});

describe('Workshop progression and mode policies', () => {
  it('repairs legacy saves, clones state and bounds counts and presets', () => {
    const p = progressOf({});
    assert.deepEqual(p.workshop.equipped, NEUTRAL_KIT);
    const repaired = workshopOf({
      marks: Infinity,
      owned: ['unknown'],
      presets: Array(20).fill(null)
    });
    assert.equal(repaired.marks, 0);
    assert.equal(repaired.presets.length, 3);
    const clone = cloneProgress(p);
    clone.workshop.equipped.core = 'cork';
    assert.equal(p.workshop.equipped.core, 'balanced-core');
  });
  it('comparison grant and crafting are finite and loans never confer ownership', () => {
    let p = createProfile();
    p = workshopActionOn(p, { type: 'compare', kit: { ...NEUTRAL_KIT } })!;
    assert.equal(p.progress.workshop.marks, 0);
    p = workshopActionOn(p, { type: 'compare', kit: { ...NEUTRAL_KIT, surface: 'rubber' } })!;
    assert.equal(p.progress.workshop.marks, 12);
    assert.equal(p.progress.workshop.owned.includes('rubber'), false);
    p = workshopActionOn(p, { type: 'compare', kit: { ...NEUTRAL_KIT, surface: 'rubber' } })!;
    assert.equal(p.progress.workshop.marks, 12);
    p = workshopActionOn(p, { type: 'craft', component: 'rubber' })!;
    assert.equal(p.progress.workshop.marks, 0);
    assert.equal(workshopActionOn(p, { type: 'craft', component: 'rubber' }), null);
    assert.equal(workshopActionOn(p, { type: 'craft', component: 'memory-gel' }), null);
  });
  it('eligible losses train contracts and practice and survival pay no Marks', () => {
    const p = createProfile();
    const r = result({
      won: false,
      material: { centres: 8, moving: 6, edges: 6, absorbed: 0, releases: 0 }
    });
    const reward = applyWorkshopReward(p, r, null);
    assert.equal(reward.marks, 2);
    assert.equal(p.progress.workshop.contracts.centre, 8);
    for (const mode of ['practice', 'endless', 'versus'] as const)
      assert.equal(
        applyWorkshopReward(p, result({ mode, ranked: mode === 'endless' }), null).marks,
        0
      );
    assert.equal(applyWorkshopReward(p, result({ hits: 2 }), null).marks, 0);
  });
  it('runs and cups pin kits while Daily cards supply equal equipment', () => {
    const p = createProfile();
    p.progress.workshop.equipped = { ...NEUTRAL_KIT, surface: 'rubber' };
    const runProfile = startRunOn(p, 'test', 0, Date.now(), 'endless')!;
    p.progress.workshop.equipped.surface = 'ceramic';
    assert.equal(
      withEquipmentRules(runProfile, runRules(runProfile.progress.run!)).equipment!.kit.surface,
      'rubber'
    );
    assert.deepEqual(fixedDailyKit('2026-10-07'), fixedDailyKit('a2-2026-10-07'));
    assert.deepEqual(
      withEquipmentRules(p, dailyRules('2026-10-07')).equipment!.kit,
      fixedDailyKit('2026-10-07')
    );
    p.tournament = createTournament(0);
    p.tournament.equipment = { version: 1, kit: { ...NEUTRAL_KIT, core: 'cork' } };
    assert.equal(withEquipmentRules(p, tournamentRules(p.tournament)).equipment!.kit.core, 'cork');
    const challenge = challengeRulesById('tiny-paddle');
    if (challenge) assert.deepEqual(withEquipmentRules(p, challenge).equipment!.kit, NEUTRAL_KIT);
  });
  it('new Endless categories preserve historical neutral records', () => {
    const p = createProfile();
    p.progress.endlessRecords.open = { rally: 30, waves: 0 };
    const r = result({
      mode: 'endless',
      bestRally: 60,
      equipment: { version: 1, kit: { ...NEUTRAL_KIT, core: 'cork' } }
    });
    const next = applyMatchResult(p, r).profile;
    assert.equal(next.progress.endlessRecords.open!.rally, 30);
    assert.equal(next.progress.workshop.endless['workshop-open']!.rally, 60);
  });
  it('act awards count earlier contacts and service swaps require an eligible boundary', () => {
    const p = createProfile(),
      run = createRun('workshop-act', 0, Date.now(), 'expedition');
    p.progress.run = run;
    run.equipment = { version: 1, kit: { ...NEUTRAL_KIT } };
    run.stage = actLength(run);
    run.workshopActHits = 3;
    run.credits = 4;
    const advance = { save: run, ended: false, cleared: false, heartLost: false };
    assert.equal(applyWorkshopReward(p, result({ mode: 'run', hits: 0 }), advance).marks, 4);
    assert.equal(run.workshopActHits, 0);
    assert.equal(run.workshopActs, 1);
    assert.equal(
      applyWorkshopReward(p, result({ mode: 'run', hits: 0 }), { ...advance, ended: true }).marks,
      0
    );
    const service = workshopActionOn(p, { type: 'service', kit: { ...NEUTRAL_KIT } });
    assert.equal(service!.progress.run!.credits, 2);
    run.stage++;
    assert.equal(workshopActionOn(p, { type: 'service', kit: { ...NEUTRAL_KIT } }), null);
  });
  it('guest adoption is bounded and older claims cannot overwrite banked Workshop state', () => {
    const p = createProfile();
    p.stats.matches = 10;
    p.stats.wins = 10;
    p.stats.playSeconds = 900;
    p.stats.rallyHits = 300;
    Object.assign(p.progress.workshop, {
      introduced: true,
      marks: 9999,
      owned: COMPONENTS.map((c) => c.id),
      contracts: Object.fromEntries(WORKSHOP_CONTRACTS.map((c) => [c.id, c.target])),
      surfaces: ['rubber', 'ceramic']
    });
    const sanitized = sanitizeClaim({
      schemaVersion: PROFILE_VERSION,
      saveId: p.id,
      updatedAt: Date.now(),
      profile: p
    });
    assert.ok(sanitized);
    assert.ok(sanitized.profile.progress.workshop.marks <= 94);
    const cloud = createProfile();
    cloud.progress.workshop.introduced = true;
    cloud.progress.workshop.owned.push('rubber');
    cloud.progress.workshop.marks = 7;
    const merged = mergeProfiles(cloud, sanitized.profile);
    assert.equal(merged.progress.workshop.marks, 7);
    assert.deepEqual(merged.progress.workshop.owned, cloud.progress.workshop.owned);
    const again = mergeProfiles(merged, createProfile());
    assert.equal(again.progress.workshop.marks, 7);
    assert.equal(snapshotOf({ version: 2, kit: NEUTRAL_KIT })!.version, 2);
  });
});

describe('Workshop account operations', () => {
  let server: TestServer;
  before(async () => {
    server = await makeServer();
  });
  after(async () => {
    await server.close();
  });
  let seq = 0;
  async function push(token: string, ops: SyncOp[]) {
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: auth(token),
      payload: { baseVersion: 0, ops }
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json<SyncPushResponse>();
  }
  const action = (payload: Extract<SyncOp, { kind: 'workshop.action' }>['payload']): SyncOp => ({
    kind: 'workshop.action',
    opId: `workshop-test-${++seq}`,
    payload
  });
  it('ordered comparisons, duplicate crafting and accepted starting builds round trip', async () => {
    const user = await register(server.app);
    const rubber = { ...NEUTRAL_KIT, surface: 'rubber' };
    const craft = action({ type: 'craft', component: 'rubber' });
    const initial = await push(user.accessToken, [
      action({ type: 'compare', kit: { ...NEUTRAL_KIT } }),
      action({ type: 'compare', kit: rubber }),
      craft,
      action({ type: 'equip', kit: rubber })
    ]);
    assert.ok(initial.results.every((r) => r.status === 'applied'));
    assert.equal(initial.profile.progress!.workshop.marks, 0);
    const duplicate = await push(user.accessToken, [craft]);
    assert.equal(duplicate.results[0]!.status, 'duplicate');
    const submission = matchSubmission({
      equipment: { version: 1, kit: rubber, attemptId: 'attempt-test-1' },
      material: { centres: 8, moving: 5, edges: 3, absorbed: 0, releases: 0 }
    });
    const played = await push(user.accessToken, [
      {
        kind: 'match.prepare',
        opId: 'prepare-test-1',
        payload: {
          id: 'attempt-test-1',
          equipment: submission.equipment!,
          identity: encounterIdentity(submission)
        }
      },
      action({ type: 'equip', kit: { ...NEUTRAL_KIT } }),
      { kind: 'match', opId: 'match-test-1', payload: submission }
    ]);
    assert.equal(played.results[2]!.status, 'applied', JSON.stringify(played.results));
    assert.equal(played.profile.progress!.workshop.marks, 4);
    assert.equal(played.results[2]!.summary!.workshop!.marks, 4);
    const again = await push(user.accessToken, [
      { kind: 'match', opId: 'retry-test-1', payload: submission }
    ]);
    assert.equal(again.results[0]!.status, 'duplicate');
    assert.equal(again.profile.progress!.workshop.marks, 4);
  });
  it('rejected offline crafts cannot authorize dependent equipped matches', async () => {
    const user = await register(server.app),
      kit = { ...NEUTRAL_KIT, core: 'memory-gel' };
    const submission = matchSubmission({
      equipment: { version: 1, kit, attemptId: 'attempt-rejected-1' }
    });
    const rejected = await push(user.accessToken, [
      action({ type: 'craft', component: 'memory-gel' }),
      {
        kind: 'match.prepare',
        opId: 'prepare-rejected-1',
        payload: {
          id: 'attempt-rejected-1',
          equipment: submission.equipment!,
          identity: encounterIdentity(submission)
        }
      },
      { kind: 'match', opId: 'match-rejected-1', payload: submission }
    ]);
    assert.ok(rejected.results.every((r) => r.status === 'rejected'));
    assert.equal(rejected.profile.progress!.workshop.marks, 0);
    assert.equal(sameKit(rejected.profile.progress!.workshop.equipped, { ...NEUTRAL_KIT }), true);
  });
  it('rejects mismatched encounters, impossible counters and concurrent purchases without extra spending', async () => {
    const user = await register(server.app);
    const kit = { ...NEUTRAL_KIT, surface: 'rubber' };
    await push(user.accessToken, [
      action({ type: 'compare', kit: { ...NEUTRAL_KIT } }),
      action({ type: 'compare', kit })
    ]);
    const buys = await Promise.all([
      push(user.accessToken, [action({ type: 'craft', component: 'rubber' })]),
      push(user.accessToken, [action({ type: 'craft', component: 'rubber' })])
    ]);
    assert.equal(buys.filter((r) => r.results[0]!.status === 'applied').length, 1);
    assert.ok(buys.every((r) => r.profile.progress!.workshop.marks === 0));
    const submission = matchSubmission({
      equipment: { version: 1, kit, attemptId: 'attempt-bounds-1' }
    });
    await push(user.accessToken, [
      {
        kind: 'match.prepare',
        opId: 'prepare-bounds-1',
        payload: {
          id: 'attempt-bounds-1',
          equipment: submission.equipment!,
          identity: encounterIdentity(submission)
        }
      }
    ]);
    for (const payload of [
      { ...submission, clientMatchId: 'bounds-bad-1', options: { arenaId: 'gatehouse-1' } },
      {
        ...submission,
        clientMatchId: 'bounds-bad-2',
        material: { centres: submission.hits + 1, moving: 0, edges: 0, absorbed: 0, releases: 0 }
      },
      {
        ...submission,
        clientMatchId: 'bounds-bad-3',
        material: { centres: 1, moving: 0, edges: 0, absorbed: 1, releases: 0 }
      }
    ]) {
      const rejected = await push(user.accessToken, [
        { kind: 'match', opId: payload.clientMatchId, payload }
      ]);
      assert.equal(rejected.results[0]!.status, 'rejected');
      assert.equal(rejected.profile.progress!.workshop.marks, 0);
    }
    const cup = await push(user.accessToken, [
      action({ type: 'equip', kit }),
      { kind: 'tournament.start', opId: 'cup-bounds-1', payload: { tier: 0 } }
    ]);
    assert.ok(cup.results.every((r) => r.status === 'applied'));
    assert.deepEqual(cup.profile.tournament!.equipment, { version: 1, kit });
    const rules = tournamentRules(cup.profile.tournament!);
    const missing = matchSubmission({
      mode: 'tournament',
      botId: rules.bot.id,
      tournamentTier: 0,
      tournamentRound: 0
    });
    const legacy = await push(user.accessToken, [
      { kind: 'match', opId: 'cup-missing-equipment-1', payload: missing }
    ]);
    assert.equal(legacy.results[0]!.status, 'rejected');
    assert.match(legacy.results[0]!.reason!, /starting paddle snapshot/);
    // Changing the personal paddle cannot change an already started cup.
    let profile = (
      await push(user.accessToken, [action({ type: 'equip', kit: { ...NEUTRAL_KIT } })])
    ).profile;
    for (let round = 0; round < 3; round++) {
      const current = tournamentRules(profile.tournament!);
      const submission = matchSubmission({
        mode: 'tournament',
        botId: current.bot.id,
        scoreYou: current.winScore,
        scoreBot: 1,
        tournamentTier: 0,
        tournamentRound: round,
        equipment: { version: 1, kit, attemptId: `cup-pinned-${round}` },
        material: { centres: 4, moving: 3, edges: 2, absorbed: 0, releases: 0 }
      });
      const played = await push(user.accessToken, [
        {
          kind: 'match.prepare',
          opId: `cup-prepare-${round}`,
          payload: {
            id: submission.equipment!.attemptId!,
            equipment: submission.equipment!,
            identity: encounterIdentity(submission)
          }
        },
        { kind: 'match', opId: `cup-result-${round}`, payload: submission }
      ]);
      assert.ok(
        played.results.every((r) => r.status === 'applied'),
        JSON.stringify(played.results)
      );
      profile = played.profile;
      assert.deepEqual((profile.tournament ?? profile.lastTournament)!.equipment, {
        version: 1,
        kit
      });
    }
    assert.equal(profile.lastTournament!.champion, true);
  });
});
