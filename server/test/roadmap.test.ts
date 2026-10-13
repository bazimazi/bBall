import assert from 'node:assert/strict';
import { it } from 'node:test';
import { techniqueRules, TECHNIQUES } from '../../src/core/modes/drills';
import { techniqueOutcome } from '../../src/game/technique';
import { createWorld, placePaddles } from '../../src/game/world';
import {
  launchBall,
  pauseMatch,
  publishResult,
  scorePoint,
  startMatch
} from '../../src/game/match';
import { FIELD_H, FIXED_DT } from '../../src/game/constants';
import { updateArena, checkBossPhase } from '../../src/game/arena';
import { stepBall } from '../../src/game/physics';
import { step } from '../../src/game/simulation';
import type { GameAudio } from '../../src/game/audio';
import { AUTHORED_BOSSES } from '../../src/core/modes/authoredBosses';
import { practiceRules } from '../../src/core/modes/rules';
import { bossBeat, updateBossRhythm } from '../../src/game/bossRhythm';
import { encounterPracticeRules } from '../../src/core/modes/encounterPractice';
import { sharedChallengeRules, sharedResultText } from '../../src/core/modes/sharedChallenge';
import { createProfile } from '../../src/core/profile/defaults';
import { applyMatchResult } from '../../src/core/progression/apply';
import { DEFAULT_LOADOUT } from '../../src/game/talents';
import {
  advanceRoute,
  loadRoutes,
  resumeRoute,
  saveRoute,
  SESSION_ROUTES
} from '../../src/core/modes/routes';
import { createRun, encounterFor } from '../../src/core/run/run';
import { routePreview } from '../../src/core/run/routePreview';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;
const worldFor = (width = 750) => {
  const world = createWorld(silent, 1);
  world.view.w = width;
  placePaddles(world);
  world.replays = false;
  return world;
};

it('all three drills have achievable shots through real collision at both court widths', () => {
  for (const width of [750, 1290])
    for (const drill of TECHNIQUES)
      for (const attempt of drill.id === 'placement' ? [0, 1] : [0]) {
        let success = false;
        for (let offset = -0.9; offset <= 0.91 && !success; offset += 0.05) {
          const world = worldFor(width);
          startMatch(world, techniqueRules(drill.id));
          world.match.points = attempt;
          world.player.y = world.player.target = FIELD_H / 2 + offset * world.player.half;
          launchBall(world);
          for (let i = 0; i < 1600 && world.match.status === 'play'; i++) {
            updateArena(world, FIXED_DT);
            stepBall(world, FIXED_DT);
            const outcome = techniqueOutcome(world);
            if (outcome !== null) {
              success = outcome;
              break;
            }
          }
        }
        assert.ok(success, `${width} ${drill.id} target ${attempt}`);
      }
});

it('drills reset feed pace and hazards, count misses, and never award progression', () => {
  const world = worldFor();
  startMatch(world, techniqueRules('bank'));
  launchBall(world);
  const feed = { x: world.ball.x, y: world.ball.y, vx: world.ball.vx, vy: world.ball.vy };
  assert.equal(world.loadout, DEFAULT_LOADOUT);
  world.arena.course.events.you.banks = 4;
  world.arena.time = 20;
  scorePoint(world, 'bot');
  launchBall(world);
  assert.deepEqual(
    { x: world.ball.x, y: world.ball.y, vx: world.ball.vx, vy: world.ball.vy },
    feed
  );
  assert.equal(world.arena.course.events.you.banks, 0);
  assert.equal(world.arena.time, 0);
  scorePoint(world, 'bot');
  scorePoint(world, 'bot');
  assert.equal(world.match.status, 'over');
  publishResult(world);
  assert.equal(world.match.result?.technique, 'bank');
  const profile = createProfile();
  assert.equal(applyMatchResult(profile, world.match.result!).profile, profile);
});

it('authored bosses announce a stable guard/recovery cycle and preserve cooldowns and player reach', () => {
  for (const boss of AUTHORED_BOSSES) {
    const world = worldFor();
    const rules = {
      ...practiceRules(boss.bot, 'normal', { bossId: boss.spec.id }),
      boss: boss.spec,
      mode: 'campaign' as const,
      ranked: true
    };
    startMatch(world, rules);
    const playerHalf = world.player.half;
    const rhythm = boss.spec.rhythm!;
    world.arena.time = rhythm.windup + 0.1;
    updateBossRhythm(world);
    const guard = world.bot.half;
    assert.equal(bossBeat(world), 'guard');
    world.botTalents.slots[0]!.cooldown = 4;
    world.arena.time = rhythm.windup + rhythm.guard + 1;
    updateBossRhythm(world);
    assert.equal(bossBeat(world), 'recovery');
    assert.ok(world.bot.half < guard * 0.8);
    assert.equal(world.botTalents.slots[0]!.cooldown, 4);
    assert.equal(world.player.half, playerHalf);
    pauseMatch(world);
    const time = world.arena.time;
    step(world, FIXED_DT);
    assert.equal(world.arena.time, time);
    const opening = world.arena.spec;
    world.match.score.you = 2;
    checkBossPhase(world);
    assert.notDeepEqual(world.arena.spec, opening);
    publishResult(world);
    const ranked = { ...rules, ranked: true };
    const drill = encounterPracticeRules(ranked, world.match.result!)!;
    assert.deepEqual(drill.boss?.rhythm, boss.spec.rhythm);
    assert.deepEqual(drill.modifiers.arena, world.arena.spec);
  }
});

it('shared codes reproduce the court and feed, reject invalid codes, end at the target, and pay nothing', () => {
  for (const bad of ['', 'BB2-ABC', 'BB1-<script>', 'BB1-' + 'X'.repeat(17)])
    assert.equal(sharedChallengeRules(bad), null);
  const rules = sharedChallengeRules(' bb1-friends ')!;
  assert.deepEqual(rules, sharedChallengeRules('BB1-FRIENDS'));
  const a = worldFor(),
    b = worldFor();
  startMatch(a, rules);
  startMatch(b, rules);
  launchBall(a);
  launchBall(b);
  assert.equal(a.ball.vx, b.ball.vx);
  assert.equal(a.loadout, DEFAULT_LOADOUT);
  a.match.hits = 30;
  a.match.rally = 60;
  step(a, FIXED_DT);
  assert.equal(a.match.status, 'over');
  assert.equal(a.match.winner, 'you');
  publishResult(a);
  assert.equal(a.match.result?.objectiveMet, true);
  assert.match(sharedResultText(rules.sharedCode!, a.match.result!), /750 field units/);
  assert.equal(a.match.result?.bestRally, 60);
  const profile = createProfile();
  assert.equal(applyMatchResult(profile, a.match.result!).profile, profile);
  startMatch(b, rules);
  for (let i = 0; i < 3; i++) scorePoint(b, 'bot');
  assert.equal(b.match.status, 'over');
  assert.equal(b.match.winner, 'bot');
});

it('routes retry a failed step, resume progress, and count voluntary replays without extra rewards', () => {
  for (const route of SESSION_ROUTES) {
    let progress = resumeRoute(route.id);
    for (const item of route.steps) {
      const world = worldFor();
      const rules = item.rules();
      startMatch(world, rules);
      publishResult(world);
      const result = world.match.result!;
      const before = progress.step;
      progress = advanceRoute(progress, rules, { ...result, won: false, objectiveMet: false });
      assert.equal(progress.step, before);
      assert.equal(advanceRoute(progress, rules, { ...result, abandoned: true }), progress);
      progress = advanceRoute(progress, rules, { ...result, won: true, objectiveMet: true });
      saveRoute('demo:route-test', progress);
      assert.deepEqual(
        loadRoutes('demo:route-test').find((p) => p.id === route.id),
        progress
      );
    }
    assert.equal(progress.step, 3);
    assert.equal(progress.completions, 1);
    assert.equal(progress.attempts, 6);
    const replay = resumeRoute(route.id, progress);
    assert.equal(replay.step, 0);
    assert.equal(replay.replays, 1);
    assert.equal(replay.completions, 1);
  }
});

it('route previews match committed encounters and expose credit caps across every Gauntlet format', () => {
  for (const format of ['sprint', 'expedition', 'endless'] as const)
    for (const pressure of [0, 20, 50]) {
      const run = { ...createRun('preview-test', pressure, 0, format), credits: 8 };
      for (const route of ['safe', 'risk'] as const) {
        const preview = routePreview(run, route);
        assert.equal(preview.encounters.length, format === 'sprint' ? 3 : 6);
        assert.equal(preview.creditRoom, 1);
        assert.equal(preview.creditsPerWin, route === 'risk' ? 2 : 1);
        assert.ok(preview.encounters.at(-1)!.boss);
        for (const encounter of preview.encounters)
          assert.deepEqual(encounter, encounterFor({ ...run, route, stage: encounter.stage }));
      }
    }
});
