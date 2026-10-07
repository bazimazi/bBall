import { withSoakRandom } from '../../scripts/sim-options';
import { step } from '../../src/game/simulation';
import { mirroredCourt, couchOptions } from '../../src/core/modes/couch';
import { versusRules } from '../../src/core/modes/rules';
import {
  advanceSeries,
  seriesComplete,
  waveRecipe,
  type MatchSeries
} from '../../src/core/modes/sessions';
import { stepPractice, practiceLanding } from '../../src/game/practice';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createProfile } from '../../src/core/profile/defaults';
import { progressOf } from '../../src/core/profile/progress';
import {
  JOURNEY,
  STAGES,
  LEGACY_STAGES,
  stageById,
  stageOpen,
  nextFrontierStage,
  nextAfter,
  totalStars,
  worldById
} from '../../src/core/campaign/journey';
import { ARENA_PRESETS } from '../../src/core/modes/arenas';
import { BOSSES } from '../../src/core/modes/bosses';
import { CHALLENGES, contractChallenge } from '../../src/core/modes/challenges';
import { recipe, validArena } from '../../src/core/modes/recipes';
import { BOONS, RELICS, boonAvailable } from '../../src/core/run/boons';
import {
  advanceRun,
  createRun,
  draftFor,
  encounterFor,
  pickBoon,
  applyPressure
} from '../../src/core/run/run';
import { runActionOn } from '../../src/core/run/ops';
import { atBoundary } from '../../src/core/run/formats';
import { TALENTS } from '../../src/core/talents/catalog';
import { NEW_ACTIVES } from '../../src/core/talents/expansion';
import { createTalentSave, earnedPoints } from '../../src/core/talents/save';
import { resolveLoadout, withBoons } from '../../src/core/talents/effects';
import { EMPTY_MATCH_STATS } from '../../src/core/talents/types';
import {
  advanceTournament,
  createTournament,
  roundsFor,
  TOURNAMENT_TIERS
} from '../../src/core/tournament/bracket';
import {
  campaignRules,
  dailyRules,
  quickMatchRules,
  runRules,
  tournamentRules
} from '../../src/core/modes/rules';
import { NEUTRAL_MODIFIERS, type MatchResult } from '../../src/core/modes/types';
import { dailyIdentity, weeklySeed } from '../../src/core/daily/daily';
import { applyMatchResult } from '../../src/core/progression/apply';
import { levelFromXp, xpToReach } from '../../src/core/progression/levels';
import { combatant } from '../../src/game/combatant';
import { forecast } from '../../src/game/trajectory';
import { createCourse, collideCourse, gateOpening, reflectSegment } from '../../src/game/course';
import { fireAbility } from '../../src/game/abilities';
import { playerReturn, resetRuntime, updateRuntime, rallyPressure } from '../../src/game/talents';
import { createWorld, placePaddles, createBrain } from '../../src/game/world';
import { advanceWave, scorePoint, startMatch } from '../../src/game/match';
import { checkBossPhase } from '../../src/game/arena';
import { driveAi } from '../../src/game/ai';
import { stepBall } from '../../src/game/physics';
import { updateArena } from '../../src/game/arena';
import { FIXED_DT, BALL_R, PADDLE_W } from '../../src/game/constants';
import { BALANCE } from '../../src/core/balance/config';
import { talentBuildOn, masterCardLoadout } from '../../src/core/talents/builds';
import { spentPoints, respec } from '../../src/core/talents/save';
import { trainMastery } from '../../src/core/progression/mastery';
import { benchmarkBuild } from '../../scripts/sim-builds';
import { endlessRules, practiceRules } from '../../src/core/modes/rules';
import { botProfile } from '../../src/core/bots/levels';
import { seeded } from '../../src/core/util/random';
import { mergeProfiles } from '../src/domain/claim';
import { validateMatch } from '../src/domain/matchValidation';
import { makeServer, register, auth, matchSubmission, recordMatch } from './helpers';
import type { GameAudio } from '../../src/game/audio';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;
function world() {
  const w = createWorld(silent, 0);
  w.view.w = 1000;
  placePaddles(w);
  startMatch(w, quickMatchRules('legend'));
  w.match.status = 'play';
  return w;
}
function result(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    mode: 'campaign',
    ranked: true,
    botId: 'legend',
    botRank: 5,
    won: true,
    scoreYou: 5,
    scoreBot: 0,
    bestRally: 30,
    hits: 30,
    flicks: 5,
    seconds: 120,
    livesLeft: 0,
    objective: null,
    objectiveMet: true,
    talent: { ...EMPTY_MATCH_STATS },
    shutout: true,
    comeback: false,
    abandoned: false,
    ...overrides
  };
}

it('catalogs have stable legacy IDs and the complete expansion quantities', () => {
  assert.equal(JOURNEY.length, 30);
  assert.equal(STAGES.length, 630);
  assert.equal(LEGACY_STAGES.length, 30);
  assert.equal(ARENA_PRESETS.length, 60);
  assert.equal(BOSSES.length, 25);
  assert.equal(CHALLENGES.length, 120);
  assert.equal(TALENTS.length, 64);
  assert.equal(TOURNAMENT_TIERS.length, 10);
  assert.equal(BOONS.length, 72);
  assert.equal(BOONS.filter((b) => b.family === 'duo').length, 24);
  assert.equal(RELICS.length, 24);
  for (const list of [STAGES, ARENA_PRESETS, CHALLENGES, TALENTS, BOONS, RELICS])
    assert.equal(new Set(list.map((s) => s.id)).size, list.length);
  assert.equal(
    new Set(ARENA_PRESETS.map((c) => JSON.stringify(c.arena))).size,
    60,
    'layouts have real geometry or timing differences'
  );
});
it('recipes validate geometry, leave a serve corridor and diversify within budgets', () => {
  for (const c of ARENA_PRESETS.slice(14)) assert.ok(validArena(c.arena), c.id);
  assert.equal(validArena({ gates: [{ x: 0.5, center: 0.5, gap: NaN, period: 7 }] }), false);
  assert.equal(validArena({ rails: [{ ax: 0.5, ay: 0.3, bx: 0.5, by: 0.7 }] }), false);
  const signatures = new Set<string>();
  for (let i = 0; i < 10000; i++) {
    const a = recipe('repeatable', i, 4);
    assert.deepEqual(a, recipe('repeatable', i, 4));
    assert.ok(validArena(a.modifiers.arena!));
    signatures.add(JSON.stringify([a.courtName, a.personality, a.winScore, a.modifiers]));
  }
  assert.ok(signatures.size > 100);
});
it('side branches are optional and cleared legacy saves immediately expose Frontier', () => {
  const progress = Object.fromEntries(LEGACY_STAGES.map((s) => [s.id, 7]));
  assert.equal(totalStars(progress), 90);
  assert.ok(stageOpen(progress, stageById('w6-1')!));
  for (let i = 1; i <= 12; i++) progress[`w6-${i}`] = 1;
  assert.ok(stageOpen(progress, stageById('w6-24')!));
  assert.ok(stageOpen(progress, stageById('ascendant-w6-1')!));
  assert.equal(nextFrontierStage(progress).id, 'f2-1-1');
});
it('Frontier checkpoints remain bounded and replay cannot re-award deleted stars', () => {
  let p = createProfile();
  p.progress.journey = Object.fromEntries(LEGACY_STAGES.map((s) => [s.id, 7]));
  for (let i = 1; i <= 20; i++) p = applyMatchResult(p, result({ stageId: `f2-1-${i}` })).profile;
  assert.equal(p.progress.journey['frontier-v2'], 1);
  assert.equal(Object.keys(p.progress.journey).filter((id) => id.startsWith('f2-')).length, 0);
  assert.equal(nextFrontierStage(progressOf(p.progress).journey).id, 'f2-2-1');
  assert.equal(applyMatchResult(p, result({ stageId: 'f2-1-20' })).newStars, 0);
});
it('endless runs survive 1,000 wins, saturation, serialization and more than 50 drafts', () => {
  let run = createRun('long-run', 50, 1, 'endless');
  for (let i = 0; i < 1000; i++) {
    const step = advanceRun(run, true, 5, 0);
    assert.equal(step.ended, false);
    run = step.save;
    assert.ok(run.offer?.length);
    const picked = pickBoon(run, run.offer![0]!);
    assert.ok(picked);
    run = picked;
    assert.ok(run.results.length <= 40);
    assert.ok(Object.values(run.boons).every((rank) => Number.isFinite(rank)));
  }
  assert.equal(run.stage, 1000);
  assert.equal(progressOf({ run }).run?.stage, 1000);
  assert.equal(run.finished, false);
  const full = {
    ...run,
    boons: Object.fromEntries(BOONS.filter((b) => !b.instant).map((b) => [b.id, b.maxRank]))
  };
  for (const relic of RELICS.slice(0, 3)) full.boons[relic.id] = 1;
  assert.deepEqual(draftFor(full, 1000), ['repair-credit']);
  assert.equal(boonAvailable(RELICS[3]!, full.boons), false);
});
it('legacy run saves retain nine encounters and their original draft pool', () => {
  const legacy = createRun('legacy', 0, 1);
  assert.equal(legacy.version, undefined);
  for (const id of draftFor(legacy, 0))
    assert.ok(!id.startsWith('relic-') && !id.startsWith('duo-'));
  let run = legacy;
  for (let i = 0; i < 9; i++) {
    run = advanceRun(run, true, 3, 0).save;
    if (run.offer) run = pickBoon(run, run.offer[0]!)!;
  }
  assert.ok(run.finished && run.won);
});
it('all 50 Pressure ranks change a real rule without exceeding hard physics caps', () => {
  const seen = new Set<string>();
  for (let p = 0; p <= 50; p++) {
    const m = { ...NEUTRAL_MODIFIERS, startScore: { you: 0, bot: 0 } };
    applyPressure(m, p);
    seen.add(JSON.stringify([m, p >= 2, p >= 3, p >= 4]));
  }
  assert.equal(seen.size, 51);
  const loadout = withBoons(
    resolveLoadout(createTalentSave(), 50),
    Object.fromEntries(BOONS.map((b) => [b.id, b.maxRank]))
  );
  assert.ok(loadout.effects.guardCooldown >= 2);
  assert.ok(loadout.effects.dashCooldown >= 1.5);
  assert.ok(loadout.effects.shieldCharges <= 3);
  assert.ok(loadout.effects.tempo <= 1);
});
it('act services, banking and sprint continuation use real six-match boundaries', () => {
  let p = createProfile();
  const finite = createRun('continue', 0, 1, 'sprint');
  p.progress.lastRun = { ...finite, stage: 9, finished: true, won: true };
  p = runActionOn(p, 'continue')!;
  assert.equal(p.progress.run?.stage, 9);
  assert.ok(atBoundary(p.progress.run!));
  assert.equal(encounterFor(p.progress.run!, 14).boss !== null, true);
  assert.equal(encounterFor(p.progress.run!, 11).boss, null);
  p.progress.run!.credits = 6;
  p.progress.run!.hearts = 1;
  p = runActionOn(p, 'repair')!;
  assert.equal(p.progress.run!.hearts, 2);
  assert.equal(p.progress.run!.credits, 3);
  p.progress.run!.stage = 10;
  assert.equal(runActionOn(p, 'bank'), null);
  p.progress.run!.stage = 15;
  p = runActionOn(p, 'bank')!;
  assert.equal(p.progress.run, null);
  assert.equal(p.progress.lastRun!.stage, 15);
});
it('new skill timers perform contact effects and obey shared recast and cooldown rules', () => {
  for (const id of NEW_ACTIVES) {
    const w = world();
    const save = createTalentSave();
    save.ranks[id] = 1;
    save.equipped[0] = id;
    w.loadout = resolveLoadout(save, 50);
    resetRuntime(w);
    assert.equal(fireAbility(w, 0), true);
    assert.equal(fireAbility(w, 0), false);
    assert.ok(w.talents.tactics[id]! > 0);
    if (id === 'redirect') {
      assert.ok(Math.abs(playerReturn(w, 0).off) >= 0.72);
      assert.equal(w.talents.tactics.redirect, 0);
    }
    if (id === 'reserve') {
      updateRuntime(w, 3.1);
      assert.ok(playerReturn(w, 0).growth > w.tuning.speedPerHit);
      assert.equal(w.talents.tactics.reserve, 0);
    }
    if (id === 'rebound') {
      w.talents.slots[1]!.id = 'dash';
      w.talents.slots[1]!.cooldown = 5;
      playerReturn(w, 0);
      assert.equal(w.talents.slots[1]!.cooldown, 4);
    }
    updateRuntime(w, 10);
    assert.equal(w.talents.tactics[id], 0);
  }
});
it('banks, double structure damage and switch relay recovery come from collision events', () => {
  const w = world();
  w.arena.spec = { rails: [{ ax: 0.5, ay: 0.1, bx: 0.5, by: 0.4, hp: 2 }] };
  w.arena.course = createCourse(w.arena.spec);
  w.talents.tactics.breach = 5;
  w.talents.tactics.anchor = 5;
  Object.assign(w.ball, {
    px: 480,
    py: 140,
    x: 520,
    y: 140,
    vx: 1000,
    vy: 0,
    speed: 1000,
    owner: 'you'
  });
  collideCourse(w);
  assert.equal(w.arena.course.events.you.banks, 1);
  assert.equal(w.arena.course.events.you.breaks, 1);
  assert.equal(w.arena.course.rails[0], 0);
  assert.equal(w.talents.primed, 1);
  w.arena.spec = {
    gates: [{ x: 0.6, center: 0.5, gap: 0.3, period: 7 }],
    switches: [{ x: 0.4, y: 0.3, r: 20, gate: 0 }]
  };
  w.arena.course = createCourse(w.arena.spec);
  w.talents.tactics.relay = 6;
  w.talents.slots[0]!.id = 'dash';
  w.talents.slots[0]!.cooldown = 5;
  Object.assign(w.ball, { px: 400, py: 180, x: 400, y: 180, owner: 'you' });
  collideCourse(w);
  assert.equal(w.arena.course.events.you.switches, 1);
  assert.equal(w.talents.slots[0]!.cooldown, 3);
  assert.ok(w.arena.course.openUntil[0]! > 0);
});
it('swept rails catch fast travel and occupied phase openings cannot close onto a ball', () => {
  const to = { x: 600, y: 150 },
    v = { x: 1720, y: 0 };
  assert.ok(
    reflectSegment({ ax: 500, ay: 50, bx: 500, by: 250, rail: 0 }, { x: 400, y: 150 }, to, v)
  );
  assert.ok(v.x < 0);
  assert.ok(to.x < 500);
  const w = world();
  w.arena.spec = { gates: [{ x: 0.5, center: 0.5, gap: 0.3, period: 6, phased: true }] };
  w.arena.course = createCourse(w.arena.spec);
  w.arena.course.time = 2.99;
  w.arena.time = 3.01;
  Object.assign(w.ball, { px: 500, py: 100, x: 501, y: 100, vx: 500, vy: 0 });
  collideCourse(w);
  assert.ok(w.arena.course.openUntil[0]! > 3.01);
});
it('forecast copies destructible courts, switches, skill timers and recovery state', () => {
  const w = world();
  w.arena.spec = ARENA_PRESETS.find((p) => p.id === 'siege-relay-1')!.arena;
  w.arena.course = createCourse(w.arena.spec);
  Object.assign(w.ball, {
    px: 400,
    py: 100,
    x: 400,
    y: 100,
    vx: 800,
    vy: 100,
    speed: Math.hypot(800, 100),
    owner: 'you'
  });
  w.talents.tactics.relay = 6;
  const before = JSON.stringify([w.ball, w.arena, w.talents, w.botTalents, w.botBrain]);
  assert.ok(Number.isFinite(forecast(w, w.bot.x)));
  assert.equal(JSON.stringify([w.ball, w.arena, w.talents, w.botTalents, w.botBrain]), before);
});
it('opponent skills use their own timers and do not count as player casts', () => {
  const w = world();
  const actor = combatant(w, 'bot');
  assert.ok(actor.talents.slots.filter((s) => s.id).length >= 3);
  assert.equal(fireAbility(actor, 0), true);
  assert.equal(w.talents.stats.abilitiesUsed, 0);
  assert.equal(w.botTalents.stats.abilitiesUsed, 1);
  assert.equal(fireAbility(actor, 0), false);
});
it('boss phase transitions change courts and preserve spent enemy cooldowns', () => {
  const w = world();
  const stage = stageById('w6-24')!;
  startMatch(w, runRules({ ...createRun('boss', 0, 1, 'endless'), stage: 5 }));
  const id = w.botTalents.slots[0]!.id;
  w.botTalents.slots[0]!.cooldown = 5;
  const old = w.arena.spec;
  w.match.score.you = 2;
  checkBossPhase(w);
  assert.notDeepEqual(w.arena.spec, old);
  assert.equal(w.botTalents.slots.find((s) => s.id === id)?.cooldown, 5);
  assert.equal(w.arena.phase, 1);
  assert.ok(stage.boss);
});
it('the brain uses observed motion without reading the next player input', () => {
  const a = world(),
    b = world();
  for (const w of [a, b]) {
    w.random = seeded('same');
    Object.assign(w.ball, {
      x: 500,
      y: 360,
      px: 500,
      py: 360,
      vx: 900,
      vy: 200,
      speed: Math.hypot(900, 200)
    });
  }
  a.player.target = 50;
  b.player.target = 650;
  driveAi(a, a.bot, createBrain(botProfile('legend')), 1 / 120);
  driveAi(b, b.bot, createBrain(botProfile('legend')), 1 / 120);
  assert.equal(a.bot.target, b.bot.target);
});
it('rally pressure is symmetric, capped and resets without changing practice', () => {
  const w = world();
  w.match.rally = 100;
  assert.equal(rallyPressure(w), 0.4);
  assert.equal(rallyPressure(combatant(w, 'bot')), 0.4);
  w.match.rally = 0;
  assert.equal(rallyPressure(w), 0);
  w.match.rally = 100;
  w.rules = { ...w.rules, ranked: false };
  assert.equal(rallyPressure(w), 0);
});
it('marathon and infinite championship seasons reward only their actual finals', () => {
  let cup = createTournament(9, 1, 'marathon');
  for (let i = 0; i < 6; i++) {
    cup = advanceTournament(cup, { you: 3, bot: 0, won: true });
    assert.equal(cup.finished, false);
  }
  cup = advanceTournament(cup, { you: 5, bot: 0, won: true });
  assert.ok(cup.champion && cup.finished);
  cup = createTournament(9, 1, 'ladder');
  for (let i = 0; i < 60; i++) cup = advanceTournament(cup, { you: 5, bot: 0, won: true });
  assert.equal(cup.finished, false);
  assert.equal(cup.season, 10);
  assert.equal(cup.results.length, 0);
  assert.equal(roundsFor(cup).length, 6);
  const p = createProfile();
  p.tournament = createTournament(0, 1, 'marathon');
  const early = applyMatchResult(
    p,
    result({
      mode: 'tournament',
      tournamentRound: 2,
      tournamentTier: 0,
      tournamentFormat: 'marathon'
    })
  );
  assert.ok(!early.award.lines.some((l) => l.label === 'Champion'));
  assert.equal(tournamentRules(cup).tournamentFormat, 'ladder');
});
it('Master Daily is independent, archive has no rewards, and week seeds are stable', () => {
  const day = '2026-10-07';
  assert.equal(dailyRules(`m2-${day}`).bot.id, 'legend');
  assert.equal(dailyIdentity(`a2-${day}`).day, day);
  assert.equal(dailyRules(`a2-${day}`).ranked, false);
  const p = createProfile();
  const next = applyMatchResult(p, result({ mode: 'daily', dailyKey: `m2-${day}` })).profile;
  assert.equal(next.progress.daily.clears, 0);
  assert.equal(next.progress.dailyMaster.clears, 1);
  assert.equal(weeklySeed('2026-10-07'), weeklySeed('2026-10-11'));
  assert.notEqual(weeklySeed('2026-10-07'), weeklySeed('2026-10-12'));
});
it('mastery levels continue beyond the former guard while talent points remain fixed', () => {
  assert.equal(levelFromXp(xpToReach(10050)).level, 10050);
  assert.equal(earnedPoints(10050), earnedPoints(50));
});
it('cloud merges use maximum Frontier sectors, not bitwise OR, and retain Master records', () => {
  const a = createProfile(),
    b = createProfile();
  a.progress.journey['frontier-v2'] = 5;
  b.progress.journey['frontier-v2'] = 6;
  b.progress.contracts = 8;
  b.progress.dailyMaster.clears = 3;
  const merged = mergeProfiles(a, b);
  assert.equal(merged.progress.journey['frontier-v2'], 6);
  assert.equal(merged.progress.contracts, 8);
  assert.equal(merged.progress.dailyMaster.clears, 3);
});
it('mastery variants never downgrade Legend and keep boss difficulty modifiers', () => {
  const base = STAGES.find((s) => s.bot === 'legend' && s.boss)!;
  const veteran = stageById(`veteran-${base.id}`)!,
    ascendant = stageById(`ascendant-${base.id}`)!;
  assert.equal(veteran.bot, 'legend');
  assert.equal(ascendant.bot, 'legend');
  assert.equal(
    campaignRules(ascendant).modifiers.playerPaddleScale,
    ascendant.modifiers.playerPaddleScale
  );
  assert.equal(
    campaignRules(ascendant).modifiers.serveSpeedScale,
    ascendant.modifiers.serveSpeedScale
  );
  assert.equal(worldById(1_000_000_029)?.stages[19]?.id, 'f2-999999999-20');
  const progress = Object.fromEntries(LEGACY_STAGES.map((s) => [s.id, 7]));
  progress['veteran-w1-1'] = 1;
  assert.equal(nextAfter(progress, stageById('veteran-w1-1')!)?.id, 'veteran-w1-2');
});
it('every timed gate has a full-width release beat even for shallow shots', () => {
  for (const preset of ARENA_PRESETS)
    for (const gate of preset.arena.gates ?? []) {
      const openings = Array.from({ length: 120 }, (_, i) =>
        gateOpening(gate, (gate.period * i) / 120)
      );
      assert.ok(
        openings.some((o) => o.gap === 1),
        preset.id
      );
      assert.ok(openings.every((o) => o.seconds >= 0));
    }
});
it('committed attempts survive repair and restart exactly once per accepted action', () => {
  let p = createProfile();
  p.progress.run = createRun('committed', 0, 1, 'endless');
  p = runActionOn(p, 'commit')!;
  assert.deepEqual(p.progress.run?.attempt, { stage: 0 });
  assert.equal(runActionOn(p, 'commit'), null);
  assert.equal(runActionOn(p, 'risk'), null);
  p.progress = progressOf(JSON.parse(JSON.stringify(p.progress)));
  assert.equal(p.progress.run?.attempt?.stage, 0);
  p = runActionOn(p, 'restart')!;
  assert.equal(p.progress.run?.hearts, 2);
  assert.equal(p.progress.run?.attempt, undefined);
  assert.equal(runActionOn(p, 'restart'), null);
  assert.equal(p.progress.run?.seed, 'committed');
  p = runActionOn(p, 'commit')!;
  p = runActionOn(p, 'restart')!;
  p = runActionOn(p, 'commit')!;
  p = runActionOn(p, 'restart')!;
  assert.equal(p.progress.run, null);
  assert.equal(p.progress.lastRun?.hearts, 0);
  assert.equal(p.progress.runRecords.runs, 1);
});
it('draft rerolls, boon upgrades and relic recycling compete for bounded credits', () => {
  let p = createProfile();
  const initial = createRun('services', 0, 1, 'endless');
  initial.credits = 6;
  p.progress.run = advanceRun(initial, true, 3, 0).save;
  p = runActionOn(p, 'reroll')!;
  assert.equal(p.progress.run?.draftRoll, 1);
  assert.equal(p.progress.run?.credits, 5);
  assert.ok(p.progress.run?.offer?.length);
  p.progress.run!.offer = null;
  p.progress.run!.stage = 6;
  const regular = BOONS.find((b) => !b.instant && b.family !== 'duo' && b.maxRank > 1)!;
  p.progress.run!.boons[regular.id] = 1;
  p.progress.run!.boons[RELICS[0]!.id] = 1;
  p = runActionOn(p, `upgrade:${regular.id}`)!;
  assert.equal(p.progress.run?.boons[regular.id], 2);
  assert.equal(p.progress.run?.credits, 3);
  const before = JSON.stringify(p);
  assert.equal(runActionOn(p, `recycle:${regular.id}`), null);
  assert.equal(JSON.stringify(p), before);
  p = runActionOn(p, `recycle:${RELICS[0]!.id}`)!;
  assert.equal(p.progress.run?.boons[RELICS[0]!.id], undefined);
  assert.equal(p.progress.run?.credits, 5);
});
it('server rejects impossible court counters and locked generated contracts', () => {
  const p = createProfile();
  const now = Date.now();
  const invalid = validateMatch(
    matchSubmission({ court: { banks: 1, breaks: 0, switches: 0, gates: 0 } }),
    { profile: p, now, recentPlaySeconds: 0 }
  );
  assert.equal(invalid.ok, false);
  const challenge = contractChallenge(2);
  const locked = validateMatch(
    matchSubmission({ mode: 'challenge', challengeId: challenge.id, botId: challenge.bot }),
    { profile: p, now, recentPlaySeconds: 0 }
  );
  assert.equal(locked.ok, false);
});
it('all generated destruction objectives fit the court structure capacity', () => {
  for (const c of [
    ...CHALLENGES,
    ...Array.from({ length: 1000 }, (_, i) => contractChallenge(i + 1))
  ]) {
    const a = c.modifiers.arena;
    if (c.objective.id !== 'breaks' || !a) continue;
    const capacity =
      (a.rails?.filter((r) => r.hp).length ?? 0) +
      (a.bricks ? a.bricks.rows * (a.bricks.sides === 'both' ? 2 : 1) : 0);
    assert.ok(c.objective.value <= capacity, c.id);
  }
});
it('the shared forecast follows actual bank-shot travel without changing paused predictions', () => {
  const w = world();
  w.loadout = { ...w.loadout, effects: { ...w.loadout.effects, bankShot: 0.25 } };
  Object.assign(w.ball, {
    x: 300,
    y: 550,
    px: 300,
    py: 550,
    vx: 600,
    vy: 300,
    speed: Math.hypot(600, 300),
    owner: 'you'
  });
  const expected = forecast(w, 800);
  w.match.status = 'paused';
  assert.equal(forecast(w, 800), expected);
  w.match.status = 'play';
  let actual: number | undefined;
  for (let i = 0; i < 360; i++) {
    updateArena(w, FIXED_DT);
    stepBall(w, FIXED_DT);
    if (w.ball.px < 800 && w.ball.x >= 800) {
      const t = (800 - w.ball.px) / (w.ball.x - w.ball.px);
      actual = w.ball.py + (w.ball.y - w.ball.py) * t;
      break;
    }
  }
  assert.ok(actual !== undefined);
  assert.ok(Math.abs(actual - expected) < 1, `${actual} vs ${expected}`);
});
it('enemy return bonuses bleed under the same rule when the player answers', () => {
  const w = world();
  w.ball.speed = 600;
  w.botTalents.surge = 100;
  Object.assign(w.ball, {
    x: w.player.x + PADDLE_W / 2 + BALL_R + 1,
    y: w.player.y,
    vx: -600,
    vy: 0
  });
  stepBall(w, FIXED_DT);
  assert.ok(
    Math.abs(
      w.ball.speed -
        (500 * w.tuning.speedPerHit + 100 * w.tuning.speedPerHit * (1 - BALANCE.ball.surgeBleed))
    ) < 1e-6
  );
  assert.ok(Math.abs(w.talents.surge) < 1e-9);
});
it('saved builds are cloud-shaped, preserve lifetime stats and cannot grant an illegal tree', () => {
  let p = createProfile();
  p.xp = xpToReach(50);
  const legal = benchmarkBuild('control', 50);
  assert.ok(legal.equipped.some(Boolean));
  p.talents.ranks = { 'power-strike': 1 };
  p = talentBuildOn(p, 0, 'save', 'Power')!;
  p.talents = respec(p.talents, 50);
  assert.equal(p.talents.presets?.[0]?.name, 'Power');
  p = talentBuildOn(p, 0, 'load')!;
  assert.equal(p.talents.ranks['power-strike'], 1);
  assert.ok(spentPoints(p.talents) <= earnedPoints(50));
  p.talents.presets![1] = {
    name: 'Illegal',
    ranks: Object.fromEntries(TALENTS.map((t) => [t.id, t.maxRank])),
    equipped: []
  };
  assert.equal(talentBuildOn(p, 1, 'load'), null);
  assert.equal(talentBuildOn(p, 8, 'save'), null);
});
it('Master Daily uses the same temporary build and Practice isolates boss phases without rewards', () => {
  const a = world(),
    b = world();
  a.baseLoadout = resolveLoadout(createTalentSave(), 1);
  b.baseLoadout = benchmarkBuild('power', 50);
  const rules = dailyRules('m2-2026-10-07');
  startMatch(a, rules);
  startMatch(b, rules);
  assert.deepEqual(a.loadout, b.loadout);
  assert.deepEqual(a.loadout, masterCardLoadout());
  const boss = BOSSES[7]!,
    phase = boss.spec.phases[1]!;
  const drill = practiceRules('rookie', 'relaxed', { bossId: boss.spec.id, bossPhase: 2 });
  assert.equal(drill.ranked, false);
  assert.equal(drill.boss?.phases.length, 0);
  assert.equal(drill.bot.id, phase.bot);
  assert.deepEqual(drill.modifiers.arena, phase.arena);
  assert.equal(drill.arenaIntensity, phase.intensity);
  assert.ok(drill.modifiers.serveSpeedScale < (boss.modifiers.serveSpeedScale ?? 1));
});
it('mastery rewards relevant actions against advanced opponents and stays compact across merges', () => {
  const tracks: Record<string, number> = {};
  const clear = result({
    mastery: { school: 'banker', court: 'bankworks', build: 'power' },
    court: { banks: 20, gates: 0, switches: 0, breaks: 0 },
    flicks: 50
  });
  trainMastery(tracks, { ...clear, botRank: 1 });
  assert.equal(Object.keys(tracks).length, 0);
  trainMastery(tracks, clear);
  assert.equal(tracks.flick, 8);
  assert.equal(tracks['court-bankworks'], 5);
  assert.equal(tracks['school-banker'], 3);
  const p = createProfile();
  p.progress.mastery = tracks;
  assert.deepEqual(progressOf(JSON.parse(JSON.stringify(p.progress))).mastery, tracks);
  const q = createProfile();
  q.progress.mastery = { 'school-banker': 9 };
  assert.equal(mergeProfiles(p, q).progress.mastery['school-banker'], 9);
});
it('new run formats and route actions round-trip through sync with idempotent retries', async () => {
  const server = await makeServer();
  try {
    const user = await register(server.app);
    const headers = auth(user.accessToken);
    const send = async (baseVersion: number, ops: unknown[]) =>
      server.app.inject({
        method: 'POST',
        url: '/v1/sync/push',
        headers,
        payload: { baseVersion, ops }
      });
    const started = await send(0, [
      {
        kind: 'run.start',
        opId: 'expand-start',
        payload: { seed: 'expand-http', pressure: 0, format: 'endless' }
      }
    ]);
    assert.equal(started.statusCode, 200, started.body);
    const body = started.json();
    assert.equal(body.profile.progress.run.format, 'endless');
    const route = await send(body.profile.version, [
      { kind: 'run.action', opId: 'expand-risk', payload: { action: 'risk' } }
    ]);
    assert.equal(route.statusCode, 200, route.body);
    const changed = route.json();
    assert.equal(changed.profile.progress.run.route, 'risk');
    const replay = await send(changed.profile.version, [
      { kind: 'run.action', opId: 'expand-risk', payload: { action: 'risk' } }
    ]);
    assert.equal(replay.statusCode, 200, replay.body);
    assert.equal(replay.json().profile.version, changed.profile.version);
    const committed = await send(changed.profile.version, [
      { kind: 'run.action', opId: 'expand-commit', payload: { action: 'commit' } }
    ]);
    assert.equal(committed.statusCode, 200, committed.body);
    assert.equal(committed.json().profile.progress.run.attempt.stage, 0);
    const rules = runRules(committed.json().profile.progress.run);
    const recorded = await recordMatch(
      server.app,
      user.accessToken,
      matchSubmission({
        mode: 'run',
        botId: rules.bot.id,
        runStage: 0,
        scoreYou: rules.winScore,
        scoreBot: 0,
        shutout: true,
        playedAt: server.time()
      })
    );
    assert.equal(recorded.profile.progress?.run?.stage, 1);
    assert.ok(recorded.profile.progress?.run?.offer?.length);
    assert.equal(recorded.profile.progress?.run?.attempt, undefined);
    const builds = await send(recorded.profile.version, [
      {
        kind: 'talent.build',
        opId: 'expand-save-build',
        payload: { slot: 0, action: 'save', name: 'Cloud build' }
      },
      { kind: 'talent.build', opId: 'expand-load-build', payload: { slot: 0, action: 'load' } }
    ]);
    assert.equal(builds.statusCode, 200, builds.body);
    assert.equal(builds.json().profile.talents.presets[0].name, 'Cloud build');
    const duplicate = await send(builds.json().profile.version, [
      { kind: 'talent.build', opId: 'expand-load-build', payload: { slot: 0, action: 'load' } }
    ]);
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.json().profile.version, builds.json().profile.version);
  } finally {
    await server.close();
  }
});
it('cloud cups persist marathon rounds and ladder seasons without closing the next defense', async () => {
  const server = await makeServer({ ACCESS_TOKEN_TTL_SECONDS: '3600' });
  try {
    const user = await register(server.app),
      headers = auth(user.accessToken);
    let started = await server.app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers,
      payload: {
        baseVersion: 0,
        ops: [
          { kind: 'tournament.start', opId: 'long-cup', payload: { tier: 0, format: 'marathon' } }
        ]
      }
    });
    assert.equal(started.statusCode, 200, started.body);
    let profile = started.json().profile;
    assert.equal(profile.tournament.format, 'marathon');
    for (let i = 0; i < 7; i++) {
      const rules = tournamentRules(profile.tournament);
      server.advance(120000);
      const match = await recordMatch(
        server.app,
        user.accessToken,
        matchSubmission({
          mode: 'tournament',
          botId: rules.bot.id,
          tournamentRound: i,
          tournamentTier: 0,
          scoreYou: rules.winScore,
          scoreBot: 0,
          shutout: true,
          seconds: 120,
          playedAt: server.time()
        })
      );
      profile = match.profile;
      assert.equal(!!profile.tournament, i < 6);
    }
    assert.equal(profile.stats.cupsWon, 1);
    assert.equal(profile.lastTournament.round, 7);
    assert.equal(profile.lastTournament.format, 'marathon');
    started = await server.app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers,
      payload: {
        baseVersion: profile.version,
        ops: [
          { kind: 'tournament.start', opId: 'ladder-cup', payload: { tier: 0, format: 'ladder' } }
        ]
      }
    });
    assert.equal(started.statusCode, 200, started.body);
    profile = started.json().profile;
    for (let i = 0; i < 12; i++) {
      const rules = tournamentRules(profile.tournament);
      server.advance(120000);
      const match = await recordMatch(
        server.app,
        user.accessToken,
        matchSubmission({
          mode: 'tournament',
          botId: rules.bot.id,
          tournamentRound: i % 6,
          tournamentTier: 0,
          scoreYou: rules.winScore,
          scoreBot: 0,
          shutout: true,
          seconds: 120,
          playedAt: server.time()
        })
      );
      profile = match.profile;
      assert.ok(profile.tournament);
      assert.equal(profile.tournament.format, 'ladder');
      assert.equal(profile.tournament.season, Math.floor((i + 1) / 6));
    }
    assert.equal(profile.stats.cupsWon, 3);
    assert.equal(profile.lastTournament.season, 1);
    assert.equal(profile.lastTournament.round, 6);
    assert.equal(profile.tournament.round, 0);
    assert.equal(profile.tournament.season, 2);
  } finally {
    await server.close();
  }
});

it('wave survival changes safe courts after twelve returns and retains lives and total contacts', () => {
  const world = createWorld(silent, 1);
  world.view.w = 750;
  placePaddles(world);
  startMatch(world, endlessRules({ waves: true }));
  const first = JSON.stringify(world.arena.spec);
  world.match.status = 'play';
  world.match.hits = 11;
  assert.equal(advanceWave(world), false);
  world.match.hits = 12;
  world.match.rally = 24;
  world.arena.course.events.you.banks = 3;
  assert.equal(advanceWave(world), true);
  assert.equal(world.match.waveDepth, 1);
  assert.equal(world.match.status, 'serve');
  assert.equal(world.match.lives, 3);
  assert.equal(world.match.bestThisMatch, 24);
  assert.equal(world.arena.course.events.you.banks, 3);
  assert.notEqual(JSON.stringify(world.arena.spec), first);
  assert.deepEqual(waveRecipe({ waves: true }, 2000), waveRecipe({ waves: true }, 2000));
  world.match.status = 'play';
  scorePoint(world, 'bot');
  assert.equal(world.match.lives, 2);
  assert.equal(world.match.waveDepth, 1);
});
it('series ends when either side secures a majority and cannot accumulate games afterwards', () => {
  let series: MatchSeries = { length: 5, games: 0, you: 0, foe: 0 };
  for (const won of [true, false, true, false, true]) series = advanceSeries(series, won);
  assert.equal(seriesComplete(series), true);
  assert.equal(series.games, 5);
  assert.equal(series.you, 3);
  assert.equal(advanceSeries(series, false), series);
});
it('Practice stepping advances exactly a tenth of a second while preserving pause and read-only estimates', () => {
  const world = createWorld(silent, 1);
  world.view.w = 750;
  placePaddles(world);
  startMatch(world, practiceRules('pro'));
  world.match.status = 'paused';
  world.match.resumeTo = 'play';
  world.ball.vx = -400;
  world.ball.vy = 70;
  world.ball.speed = 410;
  const before = JSON.stringify(world.ball);
  assert.match(practiceLanding(world)!, /Your landing estimate/);
  assert.equal(JSON.stringify(world.ball), before);
  const elapsed = world.match.elapsed;
  assert.equal(stepPractice(world), true);
  assert.equal(world.match.status, 'paused');
  assert.ok(Math.abs(world.match.elapsed - elapsed - 0.1) < 1e-9);
  world.rules = quickMatchRules('pro');
  assert.equal(stepPractice(world), false);
});
it('separate course and wave records survive repair without expanding the record key set', () => {
  const profile = createProfile();
  const base = {
    mode: 'endless' as const,
    ranked: true,
    botId: 'wall' as const,
    botRank: 0,
    won: false,
    scoreYou: 0,
    scoreBot: 0,
    bestRally: 24,
    hits: 24,
    seconds: 120,
    livesLeft: 0,
    objectiveMet: true,
    objective: null,
    talent: { ...EMPTY_MATCH_STATS },
    flicks: 0,
    shutout: false,
    comeback: false,
    abandoned: false
  };
  const wave = applyMatchResult(profile, { ...base, options: { waves: true }, waves: 2 }).profile;
  const court = applyMatchResult(wave, {
    ...base,
    options: { arenaId: 'bankworks-1' },
    bestRally: 30
  }).profile;
  assert.deepEqual(progressOf(court.progress).endlessRecords, {
    waves: { rally: 24, waves: 2 },
    'bankworks-1': { rally: 30, waves: 0 }
  });
  assert.equal(
    progressOf({
      ...court.progress,
      endlessRecords: { ...court.progress.endlessRecords, bogus: { rally: 100, waves: 100 } }
    }).endlessRecords.bogus,
    undefined
  );
  const submission = {
    ...matchSubmission(),
    mode: 'endless' as const,
    botId: 'wall' as const,
    won: false,
    scoreYou: 0,
    scoreBot: 0,
    bestRally: 24,
    hits: 24,
    seconds: 120,
    livesLeft: 0,
    shutout: false,
    options: { waves: true },
    waves: 3
  };
  assert.equal(
    validateMatch(submission, { profile, recentPlaySeconds: 0, now: Date.now() }).ok,
    false
  );
  const accepted = validateMatch(
    { ...submission, waves: 2, court: { banks: 2, switches: 1, gates: 1, breaks: 1 } },
    { profile, recentPlaySeconds: 0, now: Date.now() }
  );
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.result.waves, 2);
});

it('couch rules pair hazards, apply equal constraints and never award XP', () => {
  const source = ARENA_PRESETS.find((a) => a.id === 'switchyard-1')!.arena;
  const court = mirroredCourt(source);
  assert.ok(validArena(court));
  for (const gate of court.gates!)
    assert.ok(court.gates!.some((other) => Math.abs(other.x - (1 - gate.x)) < 1e-9));
  const rules = versusRules(5, {
    arenaId: 'switchyard-1',
    mirror: true,
    duel: 'precision',
    series: 5
  });
  assert.equal(rules.ranked, false);
  assert.equal(rules.modifiers.playerPaddleScale, 0.8);
  assert.equal(rules.modifiers.botPaddleScale, 0.8);
  assert.deepEqual(
    couchOptions({
      arenaId: 'unknown',
      series: 999,
      duel: 'cheat',
      mirror: true,
      contract: 'mythic'
    }),
    { mirror: true }
  );
});

it('marked pace zones respect the encounter ceiling and preserve existing charged pace', () => {
  const w = world();
  w.rules = {
    ...w.rules,
    modifiers: {
      ...w.rules.modifiers,
      arena: { zones: [{ x: 0.3, y: 0.2, w: 0.2, h: 0.3, scale: 1.2 }] }
    }
  };
  startMatch(w, w.rules);
  w.tuning.maxSpeed = 850;
  w.match.status = 'play';
  Object.assign(w.ball, {
    x: w.view.w * 0.4,
    y: 180,
    px: w.view.w * 0.39,
    py: 180,
    vx: 800,
    vy: 0,
    speed: 800
  });
  collideCourse(w);
  assert.equal(w.ball.speed, 850);
  assert.equal(w.ball.vx, 850);
  w.arena.course.zoneLock = 0;
  Object.assign(w.ball, { vx: 1200, speed: 1200 });
  collideCourse(w);
  assert.equal(w.ball.speed, 1200);
  assert.equal(w.ball.vx, 1200);
});

it('the reproduced wide mirrored bank pocket opens before a rally can stall', () => {
  withSoakRandom('bball-couch-release', 'mirrored bankworks-4', 0, () => {
    const w = createWorld(silent, 1);
    w.view.w = 1290;
    placePaddles(w);
    w.grid.resize(w.view.w);
    const arena = mirroredCourt(ARENA_PRESETS.find((c) => c.id === 'bankworks-4')!.arena);
    assert.ok(arena.rails!.every((r) => r.hp && r.hp <= 6));
    const rules = quickMatchRules('pro');
    startMatch(w, { ...rules, modifiers: { ...rules.modifiers, arena } });
    w.random = seeded('soak-combat', 'bball-couch-release', 'mirrored bankworks-4', 0);
    const brain = createBrain(botProfile('pro'));
    for (let i = 0; i < 120 * 90 && w.match.points === 0; i++) {
      if (w.match.status === 'play') {
        const y = w.player.y;
        driveAi(w, w.player, brain, FIXED_DT);
        w.player.y = y;
      }
      step(w, FIXED_DT);
    }
    assert.ok(w.match.points > 0, 'A point resolves on the formerly trapped route.');
  });
});
