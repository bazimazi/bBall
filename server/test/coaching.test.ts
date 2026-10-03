import assert from 'node:assert/strict';
import { it } from 'node:test';
import { coachingFor } from '../../src/core/modes/coaching';
import { CHALLENGES } from '../../src/core/modes/challenges';
import { challengeRules, objectiveMet, quickMatchRules } from '../../src/core/modes/rules';
import { starsEarned, type StarGoal } from '../../src/core/modes/stars';
import type { MatchResult } from '../../src/core/modes/types';
import { EMPTY_MATCH_STATS } from '../../src/core/talents/types';
import type { GameAudio } from '../../src/game/audio';
import { FIXED_DT, FIELD_H } from '../../src/game/constants';
import { publishResult, startMatch } from '../../src/game/match';
import { step } from '../../src/game/simulation';
import { createWorld, placePaddles } from '../../src/game/world';

function result(patch: Partial<MatchResult> = {}): MatchResult {
  const match: MatchResult = {
    mode: 'quick',
    ranked: true,
    botId: 'rookie',
    botRank: 1,
    won: false,
    scoreYou: patch.won ? 5 : 2,
    scoreBot: patch.won ? 2 : 5,
    bestRally: 8,
    hits: 12,
    seconds: 71,
    livesLeft: 0,
    objectiveMet: false,
    objective: null,
    talent: EMPTY_MATCH_STATS,
    flicks: 0,
    shutout: false,
    comeback: false,
    abandoned: false,
    ...patch
  };
  return { ...match, objectiveMet: objectiveMet(match.objective, match) };
}

it('a real no-return loss offers the lesson without changing its result or world', () => {
  const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;
  const world = createWorld(silent, 1);
  world.view.w = 1000;
  placePaddles(world);
  world.replays = false;
  startMatch(world, quickMatchRules('rookie'));
  for (let point = 0; point < 5; point++) {
    world.match.status = 'play';
    world.fx.freeze = 0;
    world.player.y = world.player.target = 90;
    Object.assign(world.ball, {
      x: world.player.x + 100,
      y: FIELD_H / 2,
      vx: -world.tuning.serveSpeed,
      vy: 0,
      speed: world.tuning.serveSpeed
    });
    for (let i = 0; i < 500 && world.match.status === 'play'; i++) step(world, FIXED_DT);
  }
  assert.equal(world.match.status, 'over');
  publishResult(world);
  const finished = Object.freeze(world.match.result!);
  const before = JSON.stringify({ match: world.match, ball: world.ball, tuning: world.tuning });
  const coaching = coachingFor(finished);
  assert.equal(coaching?.id, 'first-return');
  assert.equal(coaching?.help, 'lesson');
  assert.match(coaching!.evidence, /No paddle returns/);
  assert.equal(
    JSON.stringify({ match: world.match, ball: world.ball, tuning: world.tuning }),
    before
  );
});

it('wins, abandoned matches, versus and cleared challenges do not get loss coaching', () => {
  assert.equal(coachingFor(result({ won: true, scoreYou: 5, scoreBot: 2 })), null);
  assert.equal(coachingFor(result({ abandoned: true })), null);
  assert.equal(coachingFor(result({ mode: 'versus' })), null);
  for (const challenge of CHALLENGES) {
    const rules = challengeRules(challenge);
    const complete = result({
      mode: 'challenge',
      objective: rules.objective,
      won: true,
      scoreBot: 0,
      bestRally: 30,
      seconds: 30
    });
    assert.equal(complete.objectiveMet, true);
    assert.equal(coachingFor(complete), null);
  }
  const rallyClear = result({
    mode: 'challenge',
    won: false,
    objective: { id: 'rally', label: 'Reach a 12 rally', value: 12 },
    bestRally: 12
  });
  assert.equal(rallyClear.objectiveMet, true);
  assert.equal(coachingFor(rallyClear), null, 'rally challenge success does not require a win');
});

it('a missed rally challenge uses its one-rally target rather than total returns or the winner', () => {
  for (const won of [false, true]) {
    const played = result({
      mode: 'challenge',
      won,
      hits: 50,
      bestRally: 11,
      objective: { id: 'rally', label: 'Reach a 12 rally', value: 12 }
    });
    const coaching = coachingFor(played);
    assert.equal(coaching?.id, 'challenge-rally');
    assert.match(coaching!.evidence, /11 hits; the target was 12/);
    assert.match(coaching!.tip, /both paddles in one rally; a win is not required/);
    assert.equal(coaching?.help, 'guide');
  }
});

it('a timed challenge distinguishes a late win from a loss at the exact time boundary', () => {
  const objective = { id: 'quick-win', label: 'Win within 70s', value: 70 } as const;
  for (const seconds of [69, 70])
    assert.equal(coachingFor(result({ mode: 'challenge', objective, won: true, seconds })), null);
  const lateWin = coachingFor(result({ mode: 'challenge', objective, won: true, seconds: 71 }));
  assert.equal(lateWin?.id, 'challenge-time');
  assert.match(lateWin!.evidence, /won in 71 seconds; the limit was 70 seconds/);
  const loss = coachingFor(result({ mode: 'challenge', objective, seconds: 60 }));
  assert.equal(loss?.id, 'placement', 'a loss inside the limit needs a win before speed coaching');
});

it('shutout coaching reports points conceded and does not invent a miss cause', () => {
  const objective = { id: 'shutout', label: 'Win 3-0', value: 0 } as const;
  assert.equal(coachingFor(result({ mode: 'challenge', objective, won: true, scoreBot: 0 })), null);
  for (const scoreBot of [1, 2]) {
    const coaching = coachingFor(result({ mode: 'challenge', objective, won: true, scoreBot }));
    assert.equal(coaching?.id, 'challenge-shutout');
    assert.match(coaching!.evidence, new RegExp(`${scoreBot} point${scoreBot === 1 ? ';' : 's;'}`));
    assert.doesNotMatch(coaching!.tip, /you missed because|too late|too slow/i);
  }
});

it('reached Journey and Daily count targets still need a win, agreeing with final star rules', () => {
  const goals: StarGoal[] = [
    { id: 'rally', value: 8 },
    { id: 'flicks', value: 2 },
    { id: 'returns', value: 12 }
  ];
  for (const mode of ['campaign', 'daily'] as const) {
    for (const goal of goals) {
      const played = result({ mode, flicks: 2 });
      const pair: [StarGoal, StarGoal] = [goal, { id: 'fast', value: 90 }];
      assert.equal(starsEarned(pair, played), 0);
      const coaching = coachingFor(played, pair);
      assert.equal(coaching?.id, 'star-needs-win');
      assert.match(coaching!.tip, /target and a win in the same match/);
      assert.match(coaching!.evidence, new RegExp(`target was ${goal.value}`));
    }
  }
  const unmet = coachingFor(result({ mode: 'campaign' }), [{ id: 'rally', value: 9 }]);
  assert.equal(unmet?.id, 'placement');
});

it('Endless guidance focuses on keeping a shared rally alive even when flicks were used', () => {
  const coaching = coachingFor(result({ mode: 'endless', flicks: 3, bestRally: 17 }));
  assert.equal(coaching?.id, 'endless-rally');
  assert.match(coaching!.evidence, /17 hits, with 12 returns across the run/);
  assert.match(coaching!.tip, /one hit longer/);
  assert.doesNotMatch(coaching!.tip, /win|shorten|end rallies/i);
  assert.equal(coachingFor(result({ mode: 'endless', hits: 0 }))?.id, 'first-return');
});

it('ordinary losses use actual returns and flicks with singular labels and no skill-use diagnosis', () => {
  const oneReturn = Object.freeze(result({ hits: 1, bestRally: 2 }));
  const before = JSON.stringify(oneReturn);
  const placement = coachingFor(oneReturn);
  assert.equal(placement?.id, 'placement');
  assert.match(placement!.evidence, /1 return;/);
  const flick = coachingFor(result({ flicks: 1 }));
  assert.equal(flick?.id, 'mix-placement');
  assert.match(flick!.evidence, /1 flick and your longest rally was 8 hits/);
  assert.doesNotMatch(flick!.tip, /skill|ability|accuracy|reaction/i);
  assert.equal(JSON.stringify(oneReturn), before);
});
