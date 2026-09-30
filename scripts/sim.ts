/**
 * A headless soak of the real engine: a bot plays the player's paddle
 * against every Journey stage, boss, challenge, court and daily, and the
 * numbers that decide whether a court is fair come out the other end - win
 * rate, rally length, match length - along with anything that should never
 * happen: a ball gone NaN, a point that never ends, a closing replay that
 * never hands over to the result.
 *
 *   npx tsx scripts/sim.ts [matches-per-case] [player-bot]
 */

import { botProfile } from '../src/core/bots/levels';
import type { BotLevelId } from '../src/core/bots/types';
import { STAGES } from '../src/core/campaign/journey';
import { dailySpec } from '../src/core/daily/daily';
import { ARENA_PRESETS } from '../src/core/modes/arenas';
import { CHALLENGES } from '../src/core/modes/challenges';
import {
  campaignRules,
  challengeRules,
  dailyRules,
  quickMatchRules
} from '../src/core/modes/rules';
import type { MatchRules } from '../src/core/modes/types';
import { driveAi } from '../src/game/ai';
import type { GameAudio } from '../src/game/audio';
import { FIXED_DT } from '../src/game/constants';
import { publishResult, startMatch } from '../src/game/match';
import { step } from '../src/game/simulation';
import { createBrain, createWorld, placePaddles } from '../src/game/world';

// The engine only ever calls methods on its audio; a stand-in that accepts
// any call and answers 0 is all a headless run needs.
const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;

const matches = Number(process.argv[2] ?? 40);
const playerBot = (process.argv[3] ?? 'pro') as BotLevelId;

interface Tally {
  wins: number;
  rallies: number;
  points: number;
  longest: number;
  seconds: number;
  stalls: number;
  broken: number;
  /** Matches whose closing replay never reached the celebration. */
  replays: number;
}

function play(rules: MatchRules): Tally {
  const tally: Tally = {
    wins: 0,
    rallies: 0,
    points: 0,
    longest: 0,
    seconds: 0,
    stalls: 0,
    broken: 0,
    replays: 0
  };
  for (let m = 0; m < matches; m++) {
    const world = createWorld(silent, 1);
    world.view.w = 1000;
    placePaddles(world);
    world.grid.resize(world.view.w);
    const brain = createBrain(botProfile(playerBot));
    startMatch(world, rules);
    let pointTime = 0;
    let lastPoints = 0;
    for (let i = 0; i < 120 * 60 * 20; i++) {
      if (world.match.status === 'play') {
        const y = world.player.y;
        driveAi(world, world.player, brain, FIXED_DT);
        world.player.y = y;
      }
      step(world, FIXED_DT);
      const { ball, match } = world;
      if (!Number.isFinite(ball.x) || !Number.isFinite(ball.y) || !Number.isFinite(ball.vx)) {
        tally.broken++;
        break;
      }
      const points = match.score.you + match.score.bot;
      if (points !== lastPoints) {
        lastPoints = points;
        pointTime = 0;
      } else if (match.status === 'play') {
        pointTime += FIXED_DT;
        if (pointTime > 90) {
          tally.stalls++;
          break;
        }
      }
      if (match.status === 'over') {
        // Let the closing replay run, the way the engine would, and make
        // sure it ends in the celebration with the world still sane.
        let steps = 0;
        while (!world.fx.celebrated && steps < 120 * 20) {
          step(world, FIXED_DT);
          steps++;
        }
        if (!world.fx.celebrated || !Number.isFinite(world.ball.x)) tally.replays++;
        publishResult(world);
        break;
      }
    }
    const result = world.match.result;
    if (!result) continue;
    if (result.won) tally.wins++;
    tally.points += result.scoreYou + result.scoreBot;
    tally.rallies += result.hits;
    tally.longest = Math.max(tally.longest, result.bestRally);
    tally.seconds += result.seconds;
  }
  return tally;
}

function report(name: string, rules: MatchRules): void {
  const t = play(rules);
  const n = Math.max(1, matches);
  const line = [
    name.padEnd(28),
    `win ${String(Math.round((t.wins / n) * 100)).padStart(3)}%`,
    `returns/pt ${(t.rallies / Math.max(1, t.points)).toFixed(1).padStart(5)}`,
    `best ${String(t.longest).padStart(3)}`,
    `avg ${(t.seconds / n).toFixed(0).padStart(4)}s`,
    t.stalls ? `STALLS ${t.stalls}` : '',
    t.broken ? `BROKEN ${t.broken}` : '',
    t.replays ? `REPLAY ${t.replays}` : ''
  ];
  console.log(line.join('  '));
}

console.log(`player brain: ${playerBot}, ${matches} matches per case\n`);
for (const bot of ['rookie', 'amateur', 'pro', 'elite', 'legend'] as const) {
  report(`quick vs ${bot}`, quickMatchRules(bot));
}
console.log('');
for (const stage of STAGES) report(`${stage.id} ${stage.name}`, campaignRules(stage));
console.log('');
for (const challenge of CHALLENGES)
  report(`challenge ${challenge.name}`, challengeRules(challenge));
console.log('');
for (const preset of ARENA_PRESETS) {
  const base = quickMatchRules('pro');
  report(`court ${preset.name}`, {
    ...base,
    modifiers: { ...base.modifiers, arena: preset.arena }
  });
}
console.log('');
for (let d = 0; d < 6; d++) {
  const key = `2026-10-${String(d + 1).padStart(2, '0')}`;
  report(`daily ${key} ${dailySpec(key).title}`, dailyRules(key));
}
