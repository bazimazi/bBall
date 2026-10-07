import { mirroredCourt } from '../src/core/modes/couch';
import { benchmarkBuild, benchmarkSkills } from './sim-builds';
import { createRun } from '../src/core/run/run';
import { runRules } from '../src/core/modes/rules';
import { frontierStage, EXPANSION_WORLDS } from '../src/core/campaign/expansion';
/**
 * A headless soak of the real engine: a bot plays the player's paddle
 * against every Journey stage, boss, challenge, court and daily, and the
 * descriptive bot results come out the other end - win rate, rally length,
 * match length - along with anything that should never
 * happen: a ball gone NaN, a point that never ends, a closing replay that
 * never hands over to the result.
 *
 *   npx tsx scripts/sim.ts [matches-per-case] [player-bot]
 *     --seed bball-soak-v1 --width 750 --group journey --output report.json
 * Bot results are stability evidence, not human difficulty or enjoyment.
 */

import { botProfile } from '../src/core/bots/levels';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { STAGES } from '../src/core/campaign/journey';
import { dailySpec } from '../src/core/daily/daily';
import { ARENA_PRESETS } from '../src/core/modes/arenas';
import { CHALLENGES } from '../src/core/modes/challenges';
import {
  campaignRules,
  challengeRules,
  dailyRules,
  quickMatchRules,
  endlessRules
} from '../src/core/modes/rules';
import type { MatchRules } from '../src/core/modes/types';
import { driveAi } from '../src/game/ai';
import type { GameAudio } from '../src/game/audio';
import { FIXED_DT } from '../src/game/constants';
import { publishResult, startMatch } from '../src/game/match';
import { step } from '../src/game/simulation';
import { createBrain, createWorld, placePaddles } from '../src/game/world';
import { simulationOptions, withSoakRandom } from './sim-options';
import { seeded } from '../src/core/util/random';
import { NEUTRAL_KIT } from '../src/core/equipment/types';
import { kitName } from '../src/core/equipment/catalog';
import { combatant } from '../src/game/combatant';
import { resetRuntime } from '../src/game/talents';

// The engine only ever calls methods on its audio; a stand-in that accepts
// any call and answers 0 is all a headless run needs.
const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;

const options = simulationOptions(process.argv.slice(2));
const { matches, playerBot } = options;

interface Tally {
  completed: number;
  wins: number;
  rallies: number;
  points: number;
  longest: number;
  seconds: number;
  stalls: number;
  broken: number;
  /** Matches whose closing replay never reached the celebration. */
  replays: number;
  timedOut: number;
}

function play(name: string, rules: MatchRules): Tally {
  const tally: Tally = {
    completed: 0,
    wins: 0,
    rallies: 0,
    points: 0,
    longest: 0,
    seconds: 0,
    stalls: 0,
    broken: 0,
    replays: 0,
    timedOut: 0
  };
  for (let m = 0; m < matches; m++) {
    withSoakRandom(options.seed, name, m, () => {
      const world = createWorld(silent, 1);
      world.view.w = options.width;
      placePaddles(world);
      world.grid.resize(world.view.w);
      const brain = createBrain(botProfile(playerBot));
      if (options.build) world.baseLoadout = benchmarkBuild(options.build, options.level ?? 50);
      startMatch(world, rules);
      if (options.group === 'workshop') {
        // Equal talent effects and movement budgets isolate equipment choices.
        world.loadout = { ...world.loadout, paddleSpeed: botProfile(playerBot).speed };
        world.botLoadout = world.loadout;
        resetRuntime(world);
        resetRuntime(combatant(world, 'bot'));
      }
      world.random = seeded('soak-combat', options.seed, name, m);
      let pointTime = 0;
      let lastPoints = 0;
      let failed = false;
      for (let i = 0; i < 120 * 60 * 20; i++) {
        if (world.match.status === 'play') {
          const y = world.player.y;
          driveAi(world, world.player, brain, FIXED_DT);
          world.player.y = y;
          if (options.build) {
            benchmarkSkills(world, options.policy ?? 'balanced');
            if (options.group === 'workshop')
              benchmarkSkills(combatant(world, 'bot'), options.policy ?? 'balanced');
          }
        }
        step(world, FIXED_DT);
        const { ball, match } = world;
        if (
          ![ball.x, ball.y, ball.vx, ball.vy, world.player.y, world.bot.y].every(Number.isFinite)
        ) {
          tally.broken++;
          failed = true;
          break;
        }
        const points =
          match.maxLives > 0
            ? match.waveDepth + match.maxLives - match.lives
            : match.score.you + match.score.bot;
        if (points !== lastPoints) {
          lastPoints = points;
          pointTime = 0;
        } else if (match.status === 'play') {
          pointTime += FIXED_DT;
          if (pointTime > 90) {
            tally.stalls++;
            failed = true;
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
          if (
            !world.fx.celebrated ||
            ![world.ball.x, world.ball.y, world.ball.vx, world.ball.vy].every(Number.isFinite)
          )
            tally.replays++;
          publishResult(world);
          break;
        }
      }
      const result = world.match.result;
      if (!result) {
        if (!failed) tally.timedOut++;
        return;
      }
      tally.completed++;
      if (result.won) tally.wins++;
      tally.points += result.scoreYou + result.scoreBot;
      tally.rallies += result.hits;
      tally.longest = Math.max(tally.longest, result.bestRally);
      tally.seconds += result.seconds;
    });
  }
  return tally;
}

const cases: ({ name: string } & Tally)[] = [];
function report(name: string, rules: MatchRules): void {
  const t = play(name, rules);
  cases.push({ name, ...t });
  const n = Math.max(1, t.completed);
  const line = [
    name.padEnd(28),
    `win ${String(Math.round((t.wins / n) * 100)).padStart(3)}%`,
    `returns/pt ${(t.rallies / Math.max(1, t.points)).toFixed(1).padStart(5)}`,
    `best ${String(t.longest).padStart(3)}`,
    `avg ${(t.seconds / n).toFixed(0).padStart(4)}s`,
    t.stalls ? `STALLS ${t.stalls}` : '',
    t.broken ? `BROKEN ${t.broken}` : '',
    t.replays ? `REPLAY ${t.replays}` : '',
    t.timedOut ? `TIMEOUT ${t.timedOut}` : '',
    t.completed !== matches ? `completed ${t.completed}/${matches}` : ''
  ];
  console.log(line.join('  '));
}

console.log(
  `player brain: ${playerBot}, ${matches} matches per case, width ${options.width}, seed ${options.seed}\n`
);
if (options.group === 'all' || options.group === 'quick') {
  for (const bot of ['rookie', 'amateur', 'pro', 'elite', 'legend'] as const) {
    report(`quick vs ${bot}`, quickMatchRules(bot));
  }
}
console.log('');
if (options.group === 'all' || options.group === 'journey') {
  for (const stage of STAGES) report(`${stage.id} ${stage.name}`, campaignRules(stage));
}
if (options.group === 'all') {
  console.log('');
  for (const challenge of CHALLENGES)
    report(`challenge ${challenge.name}`, challengeRules(challenge));
  console.log('');
  for (let d = 0; d < 6; d++) {
    const key = `2026-10-${String(d + 1).padStart(2, '0')}`;
    report(`daily ${key} ${dailySpec(key).title}`, dailyRules(key));
  }
}
if (options.group === 'all' || options.group === 'courts' || options.group === 'expansion') {
  for (const preset of options.group === 'expansion' ? ARENA_PRESETS.slice(14) : ARENA_PRESETS) {
    const base = quickMatchRules('pro');
    report(`court ${preset.id}`, {
      ...base,
      modifiers: { ...base.modifiers, arena: preset.arena }
    });
  }
}
if (options.group === 'couch') {
  for (const preset of ARENA_PRESETS) {
    const base = quickMatchRules('pro');
    report(`mirrored ${preset.id}`, {
      ...base,
      modifiers: { ...base.modifiers, arena: mirroredCourt(preset.arena) }
    });
  }
}
if (options.group === 'waves') {
  for (const arenaId of ['bankworks-1', 'gatehouse-1', 'storm-circuit-1', 'rift-bank-1'])
    report(`waves ${arenaId}`, endlessRules({ waves: true, arenaId }));
}
if (options.group === 'expansion') {
  for (const sector of [1, 100, 10000])
    for (const index of [0, 4, 19])
      report(`frontier ${sector}-${index}`, campaignRules(frontierStage(sector, index)));
  for (const pressure of [0, 25, 50])
    for (const stage of [0, 5, 35, 999])
      report(
        `run P${pressure} depth ${stage}`,
        runRules({ ...createRun(`soak-run-${pressure}`, pressure, 1, 'endless'), stage })
      );
  for (const chapter of EXPANSION_WORLDS)
    report(`boss ${chapter.id}`, campaignRules(chapter.stages[23]!));
}
if (options.group === 'workshop') {
  const kits = ['balanced-core', 'springsteel', 'cork'].flatMap((core) =>
    ['balanced-surface', 'rubber', 'ceramic'].map((surface) => ({ ...NEUTRAL_KIT, core, surface }))
  );
  for (const [i, kit] of kits.entries())
    for (const [j, rival] of kits.entries()) {
      report(`workshop ${i}/${j} ${kitName(kit)} vs ${kitName(rival)}`, {
        ...quickMatchRules(playerBot),
        equipment: { version: 1, kit },
        opponentEquipment: rival
      });
    }
  for (const [i, kit] of [
    {
      ...NEUTRAL_KIT,
      core: 'memory-gel',
      surface: 'split',
      frame: 'extended',
      tuning: 'grip' as const
    },
    { ...NEUTRAL_KIT, surface: 'graphite', frame: 'compact', insert: 'copper' },
    { ...NEUTRAL_KIT, core: 'springsteel', surface: 'woven', tuning: 'firm' as const }
  ].entries())
    for (const preset of ARENA_PRESETS.filter((a) =>
      ['gatehouse-1', 'storm-circuit-1', 'rift-bank-1'].includes(a.id)
    )) {
      for (const reverse of [false, true])
        report(`advanced ${i} ${preset.id} side ${reverse ? 'bot' : 'you'}`, {
          ...quickMatchRules(playerBot, { arenaId: preset.id }),
          equipment: { version: 1, kit: reverse ? { ...NEUTRAL_KIT } : kit },
          opponentEquipment: reverse ? kit : { ...NEUTRAL_KIT }
        });
    }
  const review = kits.map((kit, i) => {
    const rates = kits
      .map((_, j) => {
        const left = cases.find((c) => c.name.startsWith(`workshop ${i}/${j} `))!;
        const right = cases.find((c) => c.name.startsWith(`workshop ${j}/${i} `))!;
        return (
          (left.wins + right.completed - right.wins) / Math.max(1, left.completed + right.completed)
        );
      })
      .filter((_, j) => i !== j);
    return {
      kit: kitName(kit),
      comparisonsAbove60: rates.filter((rate) => rate > 0.6).length,
      rates
    };
  });
  console.log(`Mirrored diagnostic (small bot samples): ${JSON.stringify(review)}`);
}
const alerts = cases.reduce(
  (count, tally) => count + tally.stalls + tally.broken + tally.replays + tally.timedOut,
  0
);
console.log(
  `\n${cases.length * matches} matches requested; ${cases.reduce((n, tally) => n + tally.completed, 0)} completed; ${alerts} stability alerts.`
);
if (options.output) {
  const path = resolve(options.output);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        format: 'bball-soak-1',
        evidence: 'bot stability; not human balance or rendering performance',
        options,
        cases,
        alerts
      },
      null,
      2
    ) + '\n'
  );
  console.log(`Report: ${path}`);
}
if (alerts) process.exitCode = 1;
