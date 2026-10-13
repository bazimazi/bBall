import { botProfile } from '../bots/levels';
import { NEUTRAL_KIT } from '../equipment/types';
import { arenaPreset } from './arenas';
import { seeded, pickOne } from '../util/random';
import { NEUTRAL_MODIFIERS, type MatchResult, type MatchRules } from './types';

/** Versioned, bounded code. No remote result import or claimed leaderboard. */
export function sharedCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return /^BB1-[A-Z0-9]{1,16}$/.test(code) ? code : null;
}
export function sharedChallengeRules(value: string): MatchRules | null {
  const code = sharedCode(value);
  if (!code) return null;
  const random = seeded('shared-v1', code);
  const arenaId = pickOne(random, ['post', 'twin-posts', 'slalom', 'crosswind']);
  return {
    mode: 'endless',
    ranked: false,
    sharedCode: code,
    neutralBuild: true,
    label: `Shared rally · ${code}`,
    bot: botProfile('wall'),
    lives: 3,
    winScore: 0,
    seed: code,
    modifiers: {
      ...NEUTRAL_MODIFIERS,
      startScore: { you: 0, bot: 0 },
      arena: arenaPreset(arenaId)!.arena,
      speedPerHitScale: 0.85
    },
    equipment: { version: 1, kit: { ...NEUTRAL_KIT } },
    opponentEquipment: { ...NEUTRAL_KIT },
    objective: {
      id: 'win',
      label: 'Target: 30 returns before three misses · neutral build · no rewards',
      value: 30
    }
  };
}
export function sharedResultText(code: string, result: MatchResult): string {
  return `${code}\n${result.hits}/30 returns · ${result.bestRally} best rally\nNeutral paddle · no talents · 3 lives\n${result.fieldWidth ?? 0} field units · compare the same width and game version. Local, unverified score.`;
}
