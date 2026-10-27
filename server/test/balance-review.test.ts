import assert from 'node:assert/strict';
import { it } from 'node:test';
import { dailySpec } from '../../src/core/daily/daily';
import { botProfile } from '../../src/core/bots/levels';
import { mirroredCourt } from '../../src/core/modes/couch';
import { endlessRules, runRules, tournamentRules } from '../../src/core/modes/rules';
import { waveRecipe } from '../../src/core/modes/sessions';
import { createRun } from '../../src/core/run/run';
import { createTournament, roundsFor, TOURNAMENT_TIERS } from '../../src/core/tournament/bracket';
import { advanceWave, startMatch } from '../../src/game/match';
import { createWorld } from '../../src/game/world';
import type { GameAudio } from '../../src/game/audio';

it('waves remove expired court penalties while preserving lives, contacts and cooldowns', () => {
  const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;
  const world = createWorld(silent, 0);
  const options = { waves: true };
  startMatch(world, endlessRules(options));
  const waveGrowth = world.tuning.speedPerHit;
  world.match.lives = 2;
  for (let depth = 1; depth <= 24; depth++) {
    world.match.status = 'play';
    world.match.hits += 12;
    world.talents.slots[0]!.cooldown = 7;
    assert.equal(advanceWave(world), true);
    const expected = waveRecipe(options, depth).modifiers;
    assert.equal(
      world.rules.modifiers.playerPaddleScale,
      expected.playerPaddleScale ?? 1,
      `wave ${depth}`
    );
    assert.equal(world.tuning.shrinkPerHit, expected.shrinkPerHit ?? 0, `wave ${depth}`);
    assert.equal(world.tuning.speedPerHit, waveGrowth);
    assert.equal(world.match.lives, 2);
    assert.equal(world.match.hits, depth * 12);
    assert.equal(world.talents.slots[0]!.cooldown, 7);
  }
});

it('low-pressure Gauntlet bosses grow with the act instead of jumping from Amateur to Legend', () => {
  for (const format of ['sprint', 'expedition', 'endless'] as const) {
    const run = createRun('balance-review', 0, 0, format);
    const length = format === 'sprint' ? 3 : 6;
    for (let act = 0; act < 3; act++) {
      const opening = runRules({ ...run, stage: act * length });
      const boss = runRules({ ...run, stage: (act + 1) * length - 1 });
      assert.equal(opening.bot.rank, act + 2);
      const ranks = [
        boss.bot.rank,
        ...boss.boss!.phases.map((p) => (p.bot ? botProfile(p.bot).rank : boss.bot.rank))
      ];
      assert.ok(Math.max(...ranks) <= opening.bot.rank + 1, `${format} act ${act + 1}`);
      assert.ok(boss.bot.rank >= opening.bot.rank);
    }
    const expert = runRules({ ...run, pressure: 50, stage: length - 1 });
    assert.equal(expert.bot.id, 'legend');
  }
});

it('Daily goals are distinct and achievable even when the card starts a point down', () => {
  for (let n = 0; n < 730; n++) {
    const key = new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);
    const spec = dailySpec(key);
    assert.notEqual(spec.goals[0].id, spec.goals[1].id, key);
    for (const goal of spec.goals) {
      const deficit = spec.modifiers.startScore?.bot ?? 0;
      if (goal.id === 'shutout') assert.equal(deficit, 0, key);
      if (goal.id === 'margin') assert.ok(spec.winScore - deficit >= goal.value, key);
    }
    assert.deepEqual(dailySpec(`a2-${key}`).goals, spec.goals);
  }
});

it('long tournaments distribute opponent tiers across the bracket and preserve classic cups', () => {
  for (const tier of TOURNAMENT_TIERS) {
    for (const format of ['classic', 'marathon', 'ladder'] as const) {
      const save = createTournament(tier.id, 0, format);
      const rounds = roundsFor(save);
      const bots = rounds.map((_, round) => tournamentRules({ ...save, round }).bot.id);
      if (format === 'classic') assert.deepEqual(bots, tier.opponents);
      else {
        assert.equal(bots[0], tier.opponents[0]);
        assert.equal(bots[1], tier.opponents[0]);
        assert.equal(bots[Math.floor(rounds.length / 2)], tier.opponents[1]);
        assert.equal(bots.at(-1), tier.opponents.at(-1));
      }
    }
  }
});

it('a mirrored central gate has equally reachable switches on both sides', () => {
  const court = mirroredCourt({
    gates: [{ x: 0.5, center: 0.5, gap: 0.3, period: 6 }],
    switches: [
      { x: 0.35, y: 0.2, r: 18, gate: 0 },
      { x: 0.5, y: 0.8, r: 18, gate: 0 }
    ]
  });
  assert.equal(court.gates!.length, 1);
  assert.equal(court.switches!.length, 3);
  for (const s of court.switches!) {
    assert.equal(s.gate, 0);
    assert.ok(
      court.switches!.some((other) => Math.abs(other.x - (1 - s.x)) < 1e-9 && other.y === s.y)
    );
  }
});
