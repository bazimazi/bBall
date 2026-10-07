import type { ArenaSpec } from '../modes/types';
import type { Stage, JourneyWorld } from './journey';
import { EXPANSION_COURTS } from '../modes/expansionCourts';
import { recipe, PERSONALITIES } from '../modes/recipes';
import type { BotLevelId } from '../bots/types';

const NAMES = [
  'Bankworks',
  'Shifting Rails',
  'Crosswind Lock',
  'Timing Grounds',
  'The Gatekeeper',
  'Switchyard',
  'Siege Relay',
  'Pulse Garden',
  'Charge Circuit',
  'The Architect',
  'Anchor Hall',
  'Aggressor Foundry',
  'Curver Basin',
  'Disruptor Ring',
  'Rival Summit',
  'Portal Labyrinth',
  'Deflector Ruins',
  'Storm Circuit',
  'Fracture Crown',
  'Twin Routes',
  'Legend Trials',
  'Resource Crucible',
  'False Opening',
  'Dominion Relay',
  'The Sovereign'
] as const;
export const EXPANSION_BOSS_IDS = [
  'gatekeeper',
  'architect',
  'duelist',
  'sovereign',
  'railwarden',
  'stormcaller',
  'switchmaster',
  'breacher',
  'pulsekeeper',
  'conductor',
  'anchorite',
  'firebrand',
  'banker',
  'curator',
  'disruptor',
  'riftkeeper',
  'ruinlord',
  'fracture'
] as const;

export const EXPANSION_WORLDS: readonly JourneyWorld[] = NAMES.map((name, n) => {
  const id = n + 6,
    arc = Math.floor(n / 5);
  const bots: readonly BotLevelId[] = ['pro', 'pro', 'elite', 'elite', 'legend'];
  const stages: Stage[] = Array.from({ length: 24 }, (_, i) => {
    const court = EXPANSION_COURTS[(n * 7 + i) % EXPANSION_COURTS.length]!;
    const arena: ArenaSpec = court.arena;
    const teaching = i < 3;
    const boss = i === 23 ? EXPANSION_BOSS_IDS[n % 18]! : undefined;
    const type = i < 12 ? 'Core' : i < 20 ? 'Branch' : i < 23 ? 'Trial' : 'Boss';
    const mods = recipe(`world-${id}`, i, Math.min(4, arc + (i >= 20 ? 1 : 0))).modifiers;
    return {
      id: `w${id}-${i + 1}`,
      world: id,
      index: i,
      courtFamily: court.id.replace(/-\d+$/, ''),
      name: boss
        ? boss.replace(
            /(^|-)(\w)/g,
            (_, space: string, c: string) => `${space ? ' ' : ''}${c.toUpperCase()}`
          )
        : `${type} ${i + 1} · ${court.name}`,
      blurb: `${court.blurb}. ${teaching ? 'Learn the route before combining skills.' : i >= 20 ? 'Mastery trial: read the court and punish the opponent’s recovery.' : 'Choose your route and preserve a skill for the return.'}`,
      personality: PERSONALITIES[(n + i) % 6]!,
      bot: bots[arc]!,
      winScore: boss ? 5 : i >= 20 ? 5 : 3,
      modifiers: {
        ...mods,
        arena: court.arena,
        ...(teaching ? { serveSpeedScale: 0.9 } : {}),
        ...(i >= 20 ? { playerPaddleScale: 0.88 } : {})
      },
      goals: [
        boss
          ? { id: 'margin', value: 2 }
          : arena.switches?.length
            ? { id: 'switches', value: 1 }
            : arena.rails?.some((r) => r.hp)
              ? { id: 'breaks', value: 1 }
              : arena.rails?.length
                ? { id: 'banks', value: 2 }
                : arena.gates?.length
                  ? { id: 'gates', value: 2 }
                  : { id: 'margin', value: 2 },
        i % 3 === 0
          ? { id: 'flicks', value: 3 + arc }
          : i % 3 === 1
            ? { id: 'rally', value: 12 + arc * 2 }
            : { id: 'fast', value: 140 }
      ],
      ...(boss ? { boss } : {}),
      // The first twelve stages form the core route. Side branches never gate the boss.
      prerequisites: i === 0 ? [] : i === 23 ? [`w${id}-12`] : [`w${id}-${Math.min(i, 12)}`]
    };
  });
  return {
    id,
    name,
    theme: [
      'Precision Circuit',
      'Reactive Courts',
      'Rival Schools',
      'Fractured Worlds',
      'Apex Dominion'
    ][arc]!,
    hue: (171 + n * 31) % 360,
    starsToOpen: 0,
    stages
  };
});

export function frontierStage(sector: number, index: number): Stage {
  const depth = (sector - 1) * 20 + index;
  const r = recipe('journey-frontier-v2', depth, Math.min(4, Math.floor((sector - 1) / 3) + 2));
  const boss =
    index % 5 === 4 ? EXPANSION_BOSS_IDS[(sector + Math.floor(index / 5)) % 18]! : undefined;
  return {
    id: `f2-${sector}-${index + 1}`,
    world: 30 + sector,
    index,
    courtFamily: r.courtFamily,
    name: boss ? `Frontier · ${boss}` : r.courtName,
    blurb: r.blurb,
    personality: r.personality,
    bot: r.bot,
    winScore: boss ? Math.max(5, r.winScore) : r.winScore,
    modifiers: r.modifiers,
    goals: [
      { id: 'margin', value: 2 },
      { id: 'flicks', value: 5 }
    ],
    ...(boss ? { boss } : {})
  };
}
