import { BOT_LEVELS } from '../src/core/bots/levels';
import type { BotLevelId } from '../src/core/bots/types';
import { seeded } from '../src/core/util/random';

export interface SimulationOptions {
  matches: number;
  playerBot: BotLevelId;
  width: number;
  seed: string;
  group: 'all' | 'journey' | 'quick';
  output: string | null;
}

export function simulationOptions(args: readonly string[]): SimulationOptions {
  const positionals: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const argument = args[i]!;
    if (!argument.startsWith('--')) {
      positionals.push(argument);
      continue;
    }
    const [name, ...inline] = argument.slice(2).split('=');
    if (!['width', 'seed', 'group', 'output'].includes(name!) || flags.has(name!))
      throw new Error(`Unknown or repeated option: --${name}`);
    const value = inline.length ? inline.join('=') : args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
    flags.set(name!, value);
  }
  if (positionals.length > 2)
    throw new Error('Use [matches-per-case] [player-bot], then named options.');
  const matches = Number(positionals[0] ?? 40);
  const playerBot = positionals[1] ?? 'pro';
  const width = Number(flags.get('width') ?? 1000);
  const seed = flags.get('seed') ?? 'bball-soak-v1';
  const group = flags.get('group') ?? 'all';
  if (!Number.isInteger(matches) || matches < 1 || matches > 1000)
    throw new Error('Matches per case must be an integer from 1 to 1000.');
  if (!Object.hasOwn(BOT_LEVELS, playerBot)) throw new Error('Unknown player bot.');
  if (!Number.isFinite(width) || width < 750 || width > 1290)
    throw new Error('Field width must be from 750 to 1290.');
  if (!seed.trim() || seed.length > 100) throw new Error('Seed must contain 1–100 characters.');
  if (!['all', 'journey', 'quick'].includes(group))
    throw new Error('Group must be all, journey or quick.');
  return {
    matches,
    playerBot: playerBot as BotLevelId,
    width,
    seed,
    group: group as SimulationOptions['group'],
    output: flags.get('output') ?? null
  };
}

/** Reproducible only inside this synchronous soak; never changes live gameplay. */
export function withSoakRandom<T>(seed: string, name: string, match: number, play: () => T): T {
  const original = Math.random;
  Math.random = seeded('experience-soak', seed, name, match);
  try {
    return play();
  } finally {
    Math.random = original;
  }
}
