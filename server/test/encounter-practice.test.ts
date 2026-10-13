import assert from 'node:assert/strict';
import { it } from 'node:test';
import { encounterPracticeRules } from '../../src/core/modes/encounterPractice';
import {
  campaignRules,
  dailyRules,
  endlessRules,
  practiceRules,
  quickMatchRules,
  runRules,
  tournamentRules,
  versusRules,
  challengeRulesById
} from '../../src/core/modes/rules';
import { stageById } from '../../src/core/campaign/journey';
import { createRun } from '../../src/core/run/run';
import { createTournament } from '../../src/core/tournament/bracket';
import { withEquipmentRules } from '../../src/core/equipment/policy';
import { NEUTRAL_KIT } from '../../src/core/equipment/types';
import { createProfile } from '../../src/core/profile/defaults';
import { applyMatchResult } from '../../src/core/progression/apply';
import { createWorld, tuningFor } from '../../src/game/world';
import { startMatch, publishResult, scorePoint } from '../../src/game/match';
import { checkBossPhase } from '../../src/game/arena';
import type { GameAudio } from '../../src/game/audio';
import { DEFAULT_LOADOUT, switchRuntime } from '../../src/game/talents';
import { withBoons } from '../../src/core/talents/effects';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;
it('rehearsals keep the played specialization and boon effects after the profile build changes', () => {
  const world = createWorld(silent, 0);
  const source = runRules({
    ...createRun('played-build', 0, 0, 'sprint'),
    boons: { reach: 2 }
  });
  startMatch(world, source);
  const selected = {
    ...DEFAULT_LOADOUT,
    level: 20,
    paddleSpeed: 700,
    effects: { ...DEFAULT_LOADOUT.effects, length: 0.12, shieldCharges: 1 }
  };
  const played = withBoons(selected, source.boons!);
  assert.equal(switchRuntime(world, played), true);
  publishResult(world);
  const rules = encounterPracticeRules(source, world.match.result!, world.loadout)!;
  world.baseLoadout = { ...DEFAULT_LOADOUT, level: 21, paddleSpeed: 900 };
  startMatch(world, rules);
  assert.deepEqual(world.loadout, played);
  assert.equal(world.loadout.effects.length, played.effects.length, 'boons are applied once');
  assert.equal(world.loadout.effects.shieldCharges, 1);
  assert.equal(world.loadout.paddleSpeed, 700);
  startMatch(world, { ...source, practiceLoadout: played });
  assert.deepEqual(
    world.loadout,
    withBoons(world.baseLoadout, source.boons!),
    'ranked matches ignore a rehearsal build override'
  );
});
it('rehearsals retain encounter rules and kits but cannot pay rewards or advance a session', () => {
  const profile = createProfile();
  for (const source of [
    quickMatchRules('legend', { contract: 'mythic', series: 3, personality: 'curver' }),
    campaignRules(stageById('w6-3')!),
    dailyRules('m2-2026-10-13'),
    challengeRulesById('melting')!,
    tournamentRules(createTournament(0, 0, 'marathon')),
    runRules({ ...createRun('rehearsal', 0, 0, 'sprint'), boons: { reach: 2 } })
  ]) {
    const world = createWorld(silent, 0);
    const ranked = withEquipmentRules(profile, source);
    startMatch(world, ranked);
    publishResult(world);
    const before = JSON.stringify(ranked);
    const drill = encounterPracticeRules(ranked, world.match.result!)!;
    assert.equal(drill.mode, 'practice');
    assert.equal(drill.ranked, false);
    assert.equal(drill.winScore, 3);
    assert.equal(drill.options, undefined);
    assert.equal(drill.dailyKey, undefined);
    assert.equal(drill.runStage, undefined);
    assert.equal(drill.equipment?.attemptId, undefined);
    assert.deepEqual(drill.equipment?.kit, ranked.equipment?.kit);
    assert.deepEqual(drill.boons, ranked.boons);
    assert.deepEqual(tuningFor(drill), tuningFor(ranked));
    assert.equal(JSON.stringify(ranked), before);
    startMatch(world, drill);
    for (let i = 0; i < 3; i++) scorePoint(world, 'you');
    assert.equal(world.match.status, 'over');
    publishResult(world);
    assert.equal(applyMatchResult(profile, world.match.result!).profile, profile);
  }
});

it('a boss rehearsal matches the live reached court, brain, bend and base ball pace', () => {
  const source = campaignRules(stageById('w6-24')!);
  for (const reached of [0, 2, 4]) {
    const live = createWorld(silent, 0);
    startMatch(live, source);
    for (let point = 1; point <= reached; point++) {
      live.match.score.you = point;
      checkBossPhase(live);
    }
    publishResult(live);
    const rules = encounterPracticeRules(source, live.match.result!)!;
    const practice = createWorld(silent, 0);
    startMatch(practice, rules);
    assert.deepEqual(practice.arena.spec, live.arena.spec);
    assert.equal(practice.arena.intensity, live.arena.intensity);
    assert.equal(practice.arena.bossSwerve, live.arena.bossSwerve);
    assert.deepEqual(practice.botBrain.profile, live.botBrain.profile);
    assert.deepEqual(practice.tuning, live.tuning);
    assert.equal(checkBossPhase(practice), false, 'the selected phase stays isolated');
  }
  const opening = tuningFor(practiceRules('rookie', 'normal', { bossId: 'colossus' }));
  const later = practiceRules('rookie', 'normal', { bossId: 'colossus', bossPhase: 1 });
  assert.equal(later.bot.id, 'pro');
  assert.deepEqual(tuningFor(later), opening);
  assert.deepEqual(
    tuningFor({ ...source, practiceBallRank: 1 }),
    tuningFor(source),
    'ranked rules ignore practice overrides'
  );
});

it('rehearsals preserve explicit opponent kits only in unranked play', () => {
  const profile = createProfile();
  const kit = { ...NEUTRAL_KIT, core: 'cork' as const };
  assert.deepEqual(
    withEquipmentRules(profile, { ...practiceRules('rookie'), opponentEquipment: kit })
      .opponentEquipment,
    kit
  );
  assert.deepEqual(
    withEquipmentRules(profile, { ...quickMatchRules('rookie'), opponentEquipment: kit })
      .opponentEquipment,
    NEUTRAL_KIT
  );
  for (const rules of [practiceRules('rookie'), endlessRules(), versusRules()]) {
    const world = createWorld(silent, 0);
    startMatch(world, rules);
    publishResult(world);
    assert.equal(encounterPracticeRules(rules, world.match.result!), null);
  }
});
