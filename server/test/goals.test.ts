import assert from 'node:assert/strict';
import { it } from 'node:test';
import { practiceRules } from '../../src/core/modes/rules';
import { starGoalMet, type StarGoal } from '../../src/core/modes/stars';
import type { GameAudio } from '../../src/game/audio';
import { goalViews, NO_GOALS } from '../../src/game/goals';
import { startMatch } from '../../src/game/match';
import { createWorld } from '../../src/game/world';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;

function ready(...goals: [StarGoal, StarGoal]) {
  const world = createWorld(silent, 1);
  startMatch(world, { ...practiceRules('rookie'), goals });
  return world;
}

it('live rally progress includes the current rally and requires a win for a star', () => {
  const world = ready({ id: 'rally', value: 8 }, { id: 'flicks', value: 2 });
  world.match.bestThisMatch = 3;
  world.match.rally = 8;
  world.match.flicks = 2;
  const goals = goalViews(world);
  assert.equal(goals[1]!.progress, 'Rally 8/8');
  assert.equal(goals[1]!.state, 'reached');
  assert.equal(goals[2]!.state, 'reached');
  world.match.status = 'over';
  world.match.winner = 'bot';
  assert.ok(goalViews(world).every((goal) => goal.state === 'missed'));
});

it('temporary leads stay in progress and impossible margin or shutout goals are marked missed', () => {
  const world = ready({ id: 'margin', value: 2 }, { id: 'shutout', value: 0 });
  world.match.score.you = 3;
  assert.equal(goalViews(world)[1]!.state, 'active');
  assert.equal(goalViews(world)[2]!.state, 'active');
  world.match.score.bot = 1;
  assert.equal(goalViews(world)[2]!.state, 'missed');
  world.match.score.bot = 4;
  assert.equal(goalViews(world)[1]!.state, 'missed');
  assert.equal(goalViews(world)[0]!.state, 'active', 'winning remains possible');
});

it('timed progress uses the result clock rounding at its exact boundary', () => {
  const world = ready({ id: 'fast', value: 80 }, { id: 'returns', value: 6 });
  world.match.elapsed = 80.49;
  assert.equal(goalViews(world)[1]!.state, 'active');
  assert.equal(goalViews(world)[1]!.progress, '80/80s');
  world.match.elapsed = 80.5;
  assert.equal(goalViews(world)[1]!.state, 'missed');
});

it('every finished goal agrees with the shared client and server star evaluator', () => {
  const goals: StarGoal[] = [
    { id: 'margin', value: 2 },
    { id: 'shutout', value: 0 },
    { id: 'rally', value: 8 },
    { id: 'flicks', value: 2 },
    { id: 'fast', value: 80 },
    { id: 'returns', value: 6 }
  ];
  for (const goal of goals) {
    for (const won of [true, false]) {
      const world = ready(goal, { id: 'returns', value: 100 });
      Object.assign(world.match, {
        status: 'over',
        winner: won ? 'you' : 'bot',
        score: { you: won ? 5 : 3, bot: won ? 2 : 5 },
        rally: 8,
        bestThisMatch: 6,
        flicks: 2,
        hits: 6,
        elapsed: 79.5
      });
      const met = starGoalMet(goal, {
        won,
        scoreYou: world.match.score.you,
        scoreBot: world.match.score.bot,
        bestRally: 8,
        flicks: 2,
        hits: 6,
        seconds: 80
      });
      assert.equal(goalViews(world)[1]!.state, met ? 'earned' : 'missed');
    }
  }
  const world = createWorld(silent, 1);
  assert.equal(goalViews(world), NO_GOALS);
});
