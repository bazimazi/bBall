import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createProfile } from '../../src/core/profile/defaults';
import { cloneProgress } from '../../src/core/profile/progress';
import { validateProfile } from '../../src/core/profile/schema';
import { LOOT_MODES, MAX_LOOT, RESEARCH_IDS } from '../../src/core/loot/catalog';
import { createLoot, lootOf, lootBalance, licensedAbilities } from '../../src/core/loot/state';
import { lootActionOn, specializationBuilds, type LootAction } from '../../src/core/loot/ops';
import { applyLootReward } from '../../src/core/loot/rewards';
import { applyMatchResult } from '../../src/core/progression/apply';
import { xpToReach } from '../../src/core/progression/levels';
import {
  buyTalent,
  reconcile,
  createTalentSave,
  refundTalentRank,
  equipAbility,
  respec
} from '../../src/core/talents/save';
import { talentBuildOn } from '../../src/core/talents/builds';
import { resolveLoadout } from '../../src/core/talents/effects';
import { withAttempt } from '../../src/core/equipment/workshop';
import { encounterIdentity } from '../../src/core/equipment/policy';
import { NEUTRAL_KIT } from '../../src/core/equipment/types';
import { createWorld } from '../../src/game/world';
import { startMatch, publishResult } from '../../src/game/match';
import { switchRuntime, resetRuntime, updateRuntime } from '../../src/game/talents';
import { fireAbility } from '../../src/game/abilities';
import { quickMatchRules, challengeRulesById } from '../../src/core/modes/rules';
import type { GameAudio } from '../../src/game/audio';
import type { MatchResult } from '../../src/core/modes/types';
import { sanitizeClaim, mergeProfiles } from '../src/domain/claim';
import { validateMatch } from '../src/domain/matchValidation';
import { cloudToProfile } from '../../src/core/profile/cloud';
import { loadProfile, saveProfile } from '../src/repositories/profiles';
import type { SyncOp, SyncPushResponse } from '../../shared/protocol';
import { makeServer, register, auth, matchSubmission } from './helpers';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;
const result = (patch: Partial<MatchResult> = {}): MatchResult => ({
  ...matchSubmission(),
  ranked: true,
  botRank: 2,
  flicks: 0,
  objective: null,
  ...patch
});
function funded() {
  const profile = createProfile();
  profile.xp = xpToReach(50);
  profile.talents = reconcile(profile.talents, 50);
  profile.progress.loot.earned = { shards: 500, threads: 100, cores: 30 };
  return profile;
}

describe('Resonance loot economy', () => {
  it('migrates old saves without a grant, repairs malformed loot and isolates clones', () => {
    const old = createProfile();
    const raw = JSON.parse(JSON.stringify(old));
    delete raw.progress.loot;
    assert.deepEqual(validateProfile(raw)!.progress.loot, createLoot());
    const fixed = lootOf({
      earned: { shards: Infinity, threads: -5, cores: MAX_LOOT * 2 },
      unlocked: [...RESEARCH_IDS, 'unknown'],
      circuit: ['quick', 'quick', 'versus', 'campaign', 'daily'],
      specializations: [NaN, -1, 500]
    });
    assert.deepEqual(fixed.earned, { shards: 0, threads: 0, cores: MAX_LOOT });
    assert.deepEqual(fixed.unlocked, []);
    assert.deepEqual(fixed.circuit, ['quick', 'campaign']);
    const source = funded(),
      clone = cloneProgress(source.progress);
    clone.loot.earned.shards = 0;
    clone.loot.seenModes.push('quick');
    assert.equal(source.progress.loot.earned.shards, 500);
    assert.deepEqual(source.progress.loot.seenModes, []);
  });
  it('rewards all seven ranked modes, including meaningful losses, but no ineligible attempts', () => {
    for (const mode of LOOT_MODES) {
      const p = createProfile();
      const earned = applyLootReward(
        p,
        result({ mode, won: false, objectiveMet: false }),
        false,
        0
      );
      assert.equal(earned.items.shards, 8);
      assert.ok(earned.items.threads >= 2);
      assert.equal(earned.items.cores, 0);
    }
    for (const patch of [
      { ranked: false },
      { abandoned: true },
      { seconds: 14 },
      { hits: 1 },
      { mode: 'versus' as const },
      { mode: 'practice' as const }
    ]) {
      const p = createProfile();
      assert.deepEqual(applyLootReward(p, result(patch), true, 3).items, {
        shards: 0,
        threads: 0,
        cores: 0
      });
      assert.deepEqual(p.progress.loot, createLoot());
    }
  });
  it('pays a repeatable circuit only after three distinct modes and exposes an easy path to cores', () => {
    const p = createProfile();
    const play = (mode: MatchResult['mode']) =>
      applyLootReward(p, result({ mode, won: false, objectiveMet: false }), false, 0);
    play('quick');
    play('quick');
    play('campaign');
    assert.equal(p.progress.loot.earned.cores, 0);
    assert.equal(play('challenge').circuitCompleted, true);
    assert.equal(p.progress.loot.earned.cores, 1);
    assert.deepEqual(p.progress.loot.circuit, []);
    assert.equal(play('quick').discovery, false);
    play('campaign');
    play('challenge');
    assert.equal(p.progress.loot.circuits, 2);
    assert.equal(p.progress.loot.earned.cores, 2);
  });
  it('gives Elite, wave, and first trial rewards with bounded balances and no repeated first clears', () => {
    const p = createProfile();
    assert.equal(applyLootReward(p, result({ botRank: 3 }), false, 0).items.cores, 0);
    assert.equal(applyLootReward(p, result({ botRank: 4 }), false, 0).items.cores, 1);
    assert.equal(
      applyLootReward(p, result({ mode: 'endless', won: false, waves: 3 }), false, 0).items.cores,
      1
    );
    const trial = result({ mode: 'challenge', challengeId: 'resonance-velocity', botRank: 4 });
    const first = applyMatchResult(p, trial),
      repeat = applyMatchResult(first.profile, trial);
    assert.equal(first.loot.firstClear, true);
    assert.equal(repeat.loot.firstClear, false);
    assert.ok(first.loot.items.shards > repeat.loot.items.shards);
    p.progress.loot.earned.shards = MAX_LOOT - 1;
    assert.equal(applyLootReward(p, result(), false, 0).items.shards, 1);
    assert.equal(p.progress.loot.earned.shards, MAX_LOOT);
  });
  it('rejects insufficient funds, missing prerequisites and repeat purchases without altering the source', () => {
    assert.equal(lootActionOn(createProfile(), { type: 'research', id: 'pulse-brake' }), null);
    const p = funded(),
      before = JSON.stringify(p);
    assert.equal(lootActionOn(p, { type: 'research', id: 'triple-spec' }), null);
    const paid = lootActionOn(p, { type: 'research', id: 'dual-spec' })!;
    assert.equal(JSON.stringify(p), before);
    assert.equal(lootBalance(paid.progress.loot).shards, 470);
    assert.equal(lootActionOn(paid, { type: 'research', id: 'dual-spec' }), null);
    assert.ok(lootActionOn(paid, { type: 'research', id: 'triple-spec' }));
  });
  it('licenses skills from paid research, survives resets, and ignores forged licenses in raw saves', () => {
    const paid = lootActionOn(funded(), { type: 'research', id: 'pulse-brake' })!;
    assert.deepEqual(paid.talents.licensed, ['pulse-brake']);
    assert.ok(resolveLoadout(paid.talents, 50).equipped.includes('pulse-brake'));
    assert.ok(equipAbility(paid.talents, 50, 1, 'pulse-brake'));
    assert.deepEqual(respec(paid.talents, 50).licensed, ['pulse-brake']);
    assert.deepEqual(validateProfile(paid)!.talents.licensed, ['pulse-brake']);
    const forged = createProfile();
    forged.talents.licensed = ['phase-lens'];
    forged.talents.equipped[0] = 'phase-lens';
    assert.equal(validateProfile(forged)!.talents.equipped[0], null);
  });
  it('refunds one rank with its real cost, refuses dependent refunds and checks expected rank', () => {
    let p = lootActionOn(funded(), { type: 'research', id: 'precision-refund' })!;
    p.talents = buyTalent(p.talents, 50, 'heavy-impact')!;
    const before = p.talents.points;
    assert.equal(
      lootActionOn(p, { type: 'refund', talent: 'heavy-impact', expectedRank: 2 }),
      null
    );
    p = lootActionOn(p, { type: 'refund', talent: 'heavy-impact', expectedRank: 1 })!;
    assert.equal(p.talents.points, before + 1);
    let save = reconcile(createTalentSave(), 50);
    for (let i = 0; i < 3; i++) save = buyTalent(save, 50, 'heavy-impact')!;
    for (let i = 0; i < 2; i++) save = buyTalent(save, 50, 'critical-strike')!;
    save = buyTalent(save, 50, 'power-strike')!;
    save = buyTalent(save, 50, 'overdrive')!;
    assert.equal(refundTalentRank(save, 50, 'power-strike'), null);
    assert.equal(refundTalentRank(save, 50, 'unknown' as 'heavy-impact'), null);
  });
  it('pins only available unique presets and snapshots legal research-enabled builds', () => {
    let p = lootActionOn(funded(), { type: 'research', id: 'dual-spec' })!;
    p = lootActionOn(p, { type: 'research', id: 'pulse-brake' })!;
    p = talentBuildOn(p, 0, 'save', 'Recovery')!;
    p = talentBuildOn(p, 1, 'save', 'Control')!;
    p = lootActionOn(p, { type: 'pin', specialization: 0, preset: 0 })!;
    assert.equal(lootActionOn(p, { type: 'pin', specialization: 1, preset: 0 }), null);
    assert.equal(lootActionOn(p, { type: 'pin', specialization: 2, preset: 1 }), null);
    assert.equal(lootActionOn(p, { type: 'pin', specialization: 1, preset: 7 }), null);
    p = lootActionOn(p, { type: 'pin', specialization: 1, preset: 1 })!;
    const builds = specializationBuilds(p);
    assert.deepEqual(
      builds.map((entry) => entry.name),
      ['Recovery', 'Control']
    );
    assert.ok(builds[0]!.talents.equipped.includes('pulse-brake'));
    builds[0]!.talents.equipped[0] = null;
    assert.equal(p.talents.presets![0]!.equipped[0], 'pulse-brake');
  });
  it('clamps guest loot to supported play and merges paid unlocks without adding spendable wallets', () => {
    const forged = funded();
    assert.deepEqual(sanitizeClaim(forged)!.profile.progress.loot.earned, createLoot().earned);
    let a = lootActionOn(funded(), { type: 'research', id: 'pulse-brake' })!;
    let b = lootActionOn(funded(), { type: 'research', id: 'dual-spec' })!;
    for (const p of [a, b]) {
      p.stats.matches = 30;
      p.stats.wins = 20;
      p.stats.playSeconds = 3000;
      p.stats.rallyHits = 1000;
    }
    a = sanitizeClaim(a)!.profile;
    b = sanitizeClaim(b)!.profile;
    const merged = mergeProfiles(a, b),
      balance = lootBalance(merged.progress.loot);
    assert.ok(merged.progress.loot.unlocked.includes('pulse-brake'));
    assert.ok(merged.progress.loot.unlocked.includes('dual-spec'));
    for (const item of ['shards', 'threads', 'cores'] as const)
      assert.equal(
        balance[item],
        Math.max(lootBalance(a.progress.loot)[item], lootBalance(b.progress.loot)[item])
      );
    assert.deepEqual(mergeProfiles(merged, b).progress.loot, merged.progress.loot);
    assert.deepEqual(merged.talents.licensed, licensedAbilities(merged.progress.loot));
  });
});

describe('research skill physics and switching', () => {
  it('requires a live incoming ball and changes physics identically under Full and Calm effects', () => {
    for (const ability of ['pulse-brake', 'phase-lens'] as const) {
      const samples = [1, 0.25].map((motion) => {
        const world = createWorld(silent, motion);
        world.baseLoadout = resolveLoadout(
          { ...createTalentSave(), licensed: [ability], equipped: [ability] },
          50
        );
        startMatch(world, quickMatchRules('elite'));
        assert.equal(fireAbility(world, 0), false);
        assert.equal(world.talents.slots[0]!.cooldown, 0);
        world.match.status = 'play';
        world.ball.vx = 500;
        world.ball.vy = 400;
        world.ball.speed = Math.hypot(500, 400);
        assert.equal(fireAbility(world, 0), false);
        assert.equal(world.talents.stats.abilitiesUsed, 0);
        world.ball.vx = -500;
        world.botTalents.swerveDir = 1;
        assert.equal(fireAbility(world, 0), true);
        assert.equal(fireAbility(world, 0), false);
        if (ability === 'pulse-brake')
          assert.ok(Math.abs(world.ball.speed - Math.hypot(500, 400) * 0.72) < 1e-8);
        else {
          assert.ok(Math.abs(Math.atan2(world.ball.vy, -world.ball.vx)) <= 0.3);
          assert.equal(world.botTalents.swerveDir, 0);
        }
        assert.ok(Math.abs(Math.hypot(world.ball.vx, world.ball.vy) - world.ball.speed) < 1e-8);
        return [world.ball.vx, world.ball.vy, world.ball.speed, world.talents.slots[0]!.cooldown];
      });
      assert.deepEqual(samples[0], samples[1]);
    }
  });
  it('preserves benched cooldowns, match statistics and spent defenses across repeated switches', () => {
    const world = createWorld(silent, 1);
    const a = resolveLoadout(
      {
        ...createTalentSave(),
        ranks: { shield: 2, 'second-chance': 1 },
        licensed: ['pulse-brake'],
        equipped: ['pulse-brake']
      },
      50
    );
    const b = resolveLoadout(createTalentSave(), 50);
    world.baseLoadout = a;
    startMatch(world, quickMatchRules('elite'));
    world.talents.slots[0]!.cooldown = 10;
    world.talents.slots[0]!.lockout = 0.5;
    world.talents.shield = 0;
    world.talents.shieldTimer = 7;
    world.talents.secondChances = 0;
    world.talents.stats.secondChances = 1;
    world.talents.stats.abilitiesUsed = 9;
    world.talents.zenithRefunds = 0;
    assert.equal(switchRuntime(world, b), true);
    updateRuntime(world, 1);
    assert.equal(switchRuntime(world, a), true);
    assert.equal(world.talents.slots[0]!.cooldown, 9);
    assert.equal(world.talents.slots[0]!.lockout, 0);
    assert.equal(world.talents.shield, 0);
    assert.equal(world.talents.shieldTimer, 7);
    assert.equal(world.talents.secondChances, 0);
    assert.equal(world.talents.zenithRefunds, 0);
    assert.equal(world.talents.stats.abilitiesUsed, 9);
    world.match.status = 'play';
    assert.equal(switchRuntime(world, b), false);
    world.match.status = 'paused';
    world.match.resumeTo = 'play';
    assert.equal(switchRuntime(world, b), false);
    world.match.resumeTo = 'serve';
    assert.equal(switchRuntime(world, b), true);
    world.rules = { ...world.rules, fixedBuild: true };
    assert.equal(switchRuntime(world, a), false);
    resetRuntime(world);
    assert.deepEqual(world.talents.benchedSlots, {});
  });
  it('keeps shield debt through smaller builds and restores charges only through actual recharge', () => {
    const world = createWorld(silent, 1);
    const large = resolveLoadout({ ...createTalentSave(), ranks: { shield: 3 } }, 50);
    const small = resolveLoadout({ ...createTalentSave(), ranks: { shield: 1 } }, 50);
    world.baseLoadout = large;
    startMatch(world, quickMatchRules('elite'));
    world.talents.shield = 0;
    world.talents.shieldTimer = 7;
    const debt = world.talents.shieldMax;
    assert.ok(debt > small.effects.shieldCharges);
    switchRuntime(world, small);
    switchRuntime(world, large);
    assert.equal(world.talents.shield, 0);
    switchRuntime(world, small);
    updateRuntime(world, 7);
    assert.equal(world.talents.shieldDebt, debt - 1);
    switchRuntime(world, large);
    assert.equal(world.talents.shield, 1);
    assert.equal(world.talents.shieldTimer, small.effects.shieldRecharge);
  });
  it('keeps mastery on the starting build despite switching and later profile updates', () => {
    const world = createWorld(silent, 1);
    const start = resolveLoadout({ ...createTalentSave(), ranks: { 'heavy-impact': 3 } }, 50);
    const alternate = resolveLoadout({ ...createTalentSave(), ranks: { 'long-reach': 3 } }, 50);
    world.baseLoadout = start;
    startMatch(world, quickMatchRules('elite'));
    world.match.winner = 'you';
    publishResult(world);
    const original = world.match.result!.mastery;
    switchRuntime(world, alternate);
    world.specializationsUsed.push(0);
    world.baseLoadout = alternate;
    world.match.overShown = false;
    publishResult(world);
    assert.deepEqual(world.match.result!.mastery, original);
  });
  it('accepts only research trials and builds that the account actually prepared', () => {
    const p = funded(),
      rules = challengeRulesById('resonance-velocity')!;
    const trial = matchSubmission({
      mode: 'challenge',
      challengeId: rules.challengeId,
      botId: rules.bot.id
    });
    const locked = validateMatch(trial, { profile: p, now: Date.now(), recentPlaySeconds: 0 });
    assert.equal(locked.ok, false);
    if (!locked.ok) assert.equal(locked.code, 'locked-research');
    const base = matchSubmission({
      equipment: { version: 1, kit: { ...NEUTRAL_KIT }, attemptId: 'loot-attempt-1' },
      specializationsUsed: [0],
      talent: { ...matchSubmission().talent, abilitiesUsed: 1 }
    });
    const spec = {
      ...createTalentSave(),
      licensed: ['pulse-brake' as const],
      equipped: ['pulse-brake' as const]
    };
    const prepared = withAttempt(p, 'loot-attempt-1', {
      equipment: base.equipment!,
      identity: encounterIdentity(base),
      xp: p.xp,
      talents: p.talents,
      specializations: [spec]
    });
    assert.equal(
      validateMatch(base, { profile: prepared, now: Date.now(), recentPlaySeconds: 0 }).ok,
      true
    );
    for (const used of [[1], [0, 0], [NaN]]) {
      const verdict = validateMatch(
        { ...base, specializationsUsed: used },
        { profile: prepared, now: Date.now(), recentPlaySeconds: 0 }
      );
      assert.equal(verdict.ok, false);
      if (!verdict.ok) assert.equal(verdict.code, 'invalid-specialization');
    }
  });
});

describe('loot account operations', () => {
  it('derives match loot, serializes competing purchases, persists licenses, and rejects forged payloads', async () => {
    const server = await makeServer();
    try {
      const user = await register(server.app);
      let sequence = 0;
      const action = (payload: LootAction): SyncOp => ({
        kind: 'loot.action',
        opId: `loot-action-${++sequence}`,
        payload
      });
      async function push(ops: SyncOp[]): Promise<SyncPushResponse> {
        const response = await server.app.inject({
          method: 'POST',
          url: '/v1/sync/push',
          headers: auth(user.accessToken),
          payload: { baseVersion: 0, ops }
        });
        assert.equal(response.statusCode, 200, response.body);
        return response.json();
      }
      const refusal = await push([action({ type: 'research', id: 'pulse-brake' })]);
      assert.equal(refusal.results[0]!.status, 'rejected');
      const submission = matchSubmission({ botId: 'elite' });
      const earned = await push([{ kind: 'match', opId: 'loot-match-first', payload: submission }]);
      assert.equal(earned.results[0]!.summary!.loot!.items.shards, 10);
      const duplicate = await push([
        { kind: 'match', opId: 'loot-match-retry', payload: submission }
      ]);
      assert.equal(duplicate.results[0]!.status, 'duplicate');
      assert.deepEqual(duplicate.profile.progress!.loot, earned.profile.progress!.loot);
      for (let i = 0; i < 4; i++)
        await push([
          { kind: 'match', opId: `loot-match-${i}`, payload: matchSubmission({ botId: 'elite' }) }
        ]);
      // Quick alone yields only discovery threads; challenge play supplies the remaining threads.
      await push([
        {
          kind: 'match',
          opId: 'loot-challenge-1',
          payload: matchSubmission({
            mode: 'challenge',
            challengeId: 'needle',
            botId: 'amateur',
            scoreYou: 3,
            scoreBot: 1
          })
        }
      ]);
      const operation = action({ type: 'research', id: 'pulse-brake' });
      const both = await Promise.all([
        push([operation]),
        push([action({ type: 'research', id: 'pulse-brake' })])
      ]);
      assert.equal(both.filter((item) => item.results[0]!.status === 'applied').length, 1);
      const retried = await push([operation]);
      assert.equal(
        retried.results[0]!.status,
        both[0]!.results[0]!.status === 'applied' ? 'duplicate' : 'rejected'
      );
      assert.deepEqual(retried.profile.progress!.loot.unlocked, ['pulse-brake']);
      assert.deepEqual(cloudToProfile(retried.profile).talents.licensed, ['pulse-brake']);
      assert.deepEqual(retried.profile.talents.licensed, ['pulse-brake']);
      assert.ok(retried.profile.talents.equipped.includes('pulse-brake'));
      const before = lootBalance(retried.profile.progress!.loot);
      const again = await push([action({ type: 'research', id: 'pulse-brake' })]);
      assert.deepEqual(lootBalance(again.profile.progress!.loot), before);
      const forged = await server.app.inject({
        method: 'POST',
        url: '/v1/sync/push',
        headers: auth(user.accessToken),
        payload: {
          baseVersion: 0,
          ops: [
            {
              kind: 'loot.action',
              opId: 'loot-forged-1',
              payload: { type: 'research', id: 'phase-lens', earned: { shards: 999 } }
            }
          ]
        }
      });
      assert.equal(forged.statusCode, 422);
    } finally {
      await server.close();
    }
  });
  it('reloads research ownership from SQLite and freezes pinned skills before later preset edits', async () => {
    const server = await makeServer();
    try {
      const user = await register(server.app);
      const aggregate = loadProfile(server.db, user.userId)!;
      // Seed earned play only; all subsequent operations use the real HTTP/sync path.
      saveProfile(server.db, { ...aggregate, profile: { ...funded(), id: aggregate.profile.id } });
      let sequence = 0;
      async function push(ops: Omit<SyncOp, 'opId'>[]) {
        const response = await server.app.inject({
          method: 'POST',
          url: '/v1/sync/push',
          headers: auth(user.accessToken),
          payload: {
            baseVersion: 0,
            ops: ops.map((op) => ({ ...op, opId: `loot-snapshot-${++sequence}` }))
          }
        });
        assert.equal(response.statusCode, 200, response.body);
        return response.json<SyncPushResponse>();
      }
      const purchased = await push(
        ['dual-spec', 'board-switch', 'pulse-brake', 'phase-lens'].map((id) => ({
          kind: 'loot.action',
          payload: { type: 'research', id }
        })) as Omit<SyncOp, 'opId'>[]
      );
      assert.ok(purchased.results.every((result) => result.status === 'applied'));
      assert.deepEqual(purchased.profile.talents.licensed, ['pulse-brake', 'phase-lens']);
      const equipped = await push([
        { kind: 'ability.equip', payload: { slot: 0, abilityId: 'pulse-brake' } },
        { kind: 'talent.build', payload: { slot: 0, action: 'save', name: 'Recovery' } }
      ]);
      assert.ok(equipped.results.every((result) => result.status === 'applied'));
      const quiet = await push([
        { kind: 'ability.equip', payload: { slot: 0, abilityId: null } },
        { kind: 'ability.equip', payload: { slot: 1, abilityId: null } },
        { kind: 'talent.build', payload: { slot: 1, action: 'save', name: 'Quiet' } },
        { kind: 'loot.action', payload: { type: 'pin', specialization: 0, preset: 0 } },
        { kind: 'loot.action', payload: { type: 'pin', specialization: 1, preset: 1 } }
      ]);
      assert.ok(quiet.results.every((result) => result.status === 'applied'));
      const submission = matchSubmission({
        equipment: { version: 1, kit: { ...NEUTRAL_KIT }, attemptId: 'loot-snapshot-attempt' },
        specializationsUsed: [0],
        talent: { ...matchSubmission().talent, abilitiesUsed: 1 }
      });
      const prepared = await push([
        {
          kind: 'match.prepare',
          payload: {
            id: 'loot-snapshot-attempt',
            equipment: submission.equipment!,
            identity: encounterIdentity(submission)
          }
        }
      ]);
      assert.equal(prepared.results[0]!.status, 'applied');
      assert.ok(
        loadProfile(server.db, user.userId)!.profile.progress.workshop.attempts[
          'loot-snapshot-attempt'
        ]!.specializations![0]!.equipped.includes('pulse-brake')
      );
      await push([
        { kind: 'talent.build', payload: { slot: 0, action: 'save', name: 'Changed later' } }
      ]);
      const invalid = await push([
        { kind: 'match', payload: { ...submission, specializationsUsed: [2] } }
      ]);
      assert.equal(invalid.results[0]!.status, 'rejected');
      const accepted = await push([{ kind: 'match', payload: submission }]);
      assert.equal(accepted.results[0]!.status, 'applied', JSON.stringify(accepted.results));
      assert.equal(accepted.profile.talents.presets![0]!.name, 'Changed later');
      assert.equal(
        loadProfile(server.db, user.userId)!.profile.progress.workshop.attempts[
          'loot-snapshot-attempt'
        ],
        undefined
      );
    } finally {
      await server.close();
    }
  });
});
