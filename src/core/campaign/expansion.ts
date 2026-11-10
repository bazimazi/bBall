import type { ArenaSpec, SparkKind } from '../modes/types';
import type { Stage, JourneyWorld } from './journey';
import type { StarGoal } from '../modes/stars';
import { EXPANSION_COURTS } from '../modes/expansionCourts';
import { SPARK_COURTS } from '../modes/sparkCourts';
import { recipe, PERSONALITIES, type Personality } from '../modes/recipes';
import { AUTHORED_BOSSES } from '../modes/authoredBosses';

/**
 * Journey worlds 6 to 30.
 *
 * Each world is a chapter built around one idea, and its boss is the idea at
 * full strength: the world's courts come from a pool chosen for that idea,
 * its opponents keep one school, and the boss at the end carries a signature
 * behaviour named in the world's theme. The stages themselves are generated
 * from that recipe - 24 a world is too many to hand-write - but nothing about
 * a world is random: the same world plays the same way for everyone.
 *
 * Structure, per world:
 *  - 8 core stages in a chain. The first three teach: a slower serve, a
 *    smaller opponent build, and no handicap on the player.
 *  - 12 optional branches, open once the eighth core stage is clear. Some
 *    sprinkle sparks onto the world's courts; others carry a declared
 *    handicap. None of them gates anything.
 *  - 3 mastery trials: first to five on a shorter paddle.
 *  - The boss, open once the core chain is clear.
 */

interface WorldPlan {
  readonly name: string;
  /** The idea the world is built around, shown on its map. */
  readonly theme: string;
  readonly boss: string;
  /** The school every core stage, trial and the boss plays. */
  readonly school: Personality;
  /** Court templates, in the order the core chain introduces them. */
  readonly families: readonly string[];
  /** Whole courts placed at the front of the pool, before the families. */
  readonly courts?: readonly string[];
}

const PLANS: readonly WorldPlan[] = [
  {
    name: 'Spark Garden',
    theme: 'Sparks: aim through them',
    boss: 'curator',
    school: 'opportunist',
    courts: [
      'spark-garden',
      'lantern-posts',
      'spark-rift',
      'spark-gale',
      'ember-forge',
      'spark-circuit'
    ],
    families: ['bankworks', 'rail-slalom']
  },
  {
    name: 'Shifting Rails',
    theme: 'A warden to bank round',
    boss: 'railwarden',
    school: 'anchor',
    families: ['rail-slalom', 'bankworks', 'rift-bank']
  },
  {
    name: 'Crosswind Lock',
    theme: 'A wind that answers the bot',
    boss: 'stormcaller',
    school: 'curver',
    families: ['crosswind-lock', 'gatehouse', 'storm-circuit']
  },
  {
    name: 'Timing Grounds',
    theme: 'Returns that hold their breath',
    boss: 'pulsekeeper',
    school: 'disruptor',
    families: ['phase-crossing', 'gatehouse', 'switchyard']
  },
  {
    name: 'The Gatekeeper',
    theme: 'A guard that rises and falls',
    boss: 'gatekeeper',
    school: 'anchor',
    families: ['gatehouse', 'phase-crossing', 'crosswind-lock']
  },
  {
    name: 'Switchyard',
    theme: 'Gates that shut on you',
    boss: 'switchmaster',
    school: 'disruptor',
    families: ['switchyard', 'siege-relay', 'gatehouse']
  },
  {
    name: 'Siege Relay',
    theme: 'Walls that rebuild',
    boss: 'breacher',
    school: 'aggressor',
    families: ['siege-relay', 'deflector-ruins', 'switchyard']
  },
  {
    name: 'Charge Circuit',
    theme: 'Returns that gather pace',
    boss: 'firebrand',
    school: 'aggressor',
    families: ['charge-circuit', 'storm-circuit', 'pulse-forge']
  },
  {
    name: 'Bankworks',
    theme: 'Banks with interest',
    boss: 'banker',
    school: 'banker',
    families: ['bankworks', 'deflector-ruins', 'rail-slalom']
  },
  {
    name: 'The Architect',
    theme: 'Bank round the guard',
    boss: 'architect',
    school: 'banker',
    families: ['bankworks', 'rift-bank', 'rail-slalom']
  },
  {
    name: 'Anchor Hall',
    theme: 'A stone paddle and its warden',
    boss: 'anchorite',
    school: 'anchor',
    families: ['deflector-ruins', 'bankworks', 'gatehouse']
  },
  {
    name: 'Aggressor Foundry',
    theme: 'Hammer and anvil',
    boss: 'forgemaster',
    school: 'aggressor',
    families: ['siege-relay', 'pulse-forge', 'charge-circuit']
  },
  {
    name: 'Curver Basin',
    theme: 'Returns that bend twice',
    boss: 'cyclone',
    school: 'curver',
    families: ['storm-circuit', 'pulse-forge', 'crosswind-lock']
  },
  {
    name: 'Disruptor Ring',
    theme: 'Pace and line, changed at once',
    boss: 'disruptor',
    school: 'disruptor',
    families: ['switchyard', 'phase-crossing', 'gatehouse']
  },
  {
    name: 'Rival Summit',
    theme: 'Every school, one duel',
    boss: 'duelist',
    school: 'opportunist',
    families: ['bankworks', 'gatehouse', 'charge-circuit', 'rift-bank']
  },
  {
    name: 'Portal Labyrinth',
    theme: 'Rifts round a warden',
    boss: 'riftkeeper',
    school: 'opportunist',
    courts: ['spark-rift'],
    families: ['rift-bank', 'rail-slalom', 'switchyard']
  },
  {
    name: 'Deflector Ruins',
    theme: 'Ruins that rise again',
    boss: 'ruinlord',
    school: 'anchor',
    families: ['deflector-ruins', 'pulse-forge', 'bankworks']
  },
  {
    name: 'Storm Circuit',
    theme: 'A gust on every strike',
    boss: 'squall',
    school: 'curver',
    courts: ['spark-gale'],
    families: ['storm-circuit', 'crosswind-lock', 'charge-circuit']
  },
  {
    name: 'Fracture Crown',
    theme: 'A court that breaks into new shapes',
    boss: 'fracture',
    school: 'disruptor',
    families: ['deflector-ruins', 'phase-crossing', 'siege-relay']
  },
  {
    name: 'Twin Routes',
    theme: 'Two paddles to thread',
    boss: 'twins',
    school: 'opportunist',
    families: ['rift-bank', 'rail-slalom', 'bankworks']
  },
  {
    name: 'Tempo Halls',
    theme: 'A hold, then a rush',
    boss: 'conductor',
    school: 'curver',
    families: ['phase-crossing', 'storm-circuit', 'charge-circuit']
  },
  {
    name: 'Spark Crucible',
    theme: 'Every spark at once',
    boss: 'alchemist',
    school: 'aggressor',
    courts: [
      'spark-circuit',
      'ember-forge',
      'spark-garden',
      'lantern-posts',
      'spark-gale',
      'spark-rift'
    ],
    families: ['siege-relay', 'charge-circuit']
  },
  {
    name: 'False Opening',
    theme: 'Lanes that close behind you',
    boss: 'mirage',
    school: 'disruptor',
    families: ['gatehouse', 'switchyard', 'phase-crossing']
  },
  {
    name: 'Dominion Relay',
    theme: 'A warden and a lockdown',
    boss: 'regent',
    school: 'anchor',
    families: ['switchyard', 'siege-relay', 'rail-slalom']
  },
  {
    name: 'The Sovereign',
    theme: 'Every lesson, one crown',
    boss: 'sovereign',
    school: 'opportunist',
    courts: ['spark-circuit'],
    families: ['crosswind-lock', 'deflector-ruins', 'switchyard', 'bankworks']
  }
];

/** World by world, the boss at the end of each: no world shares its boss. */
export const EXPANSION_BOSS_IDS: readonly string[] = PLANS.map((plan) => plan.boss);

/** Core stages per world: the chain that leads to the boss. */
export const CORE_STAGES = 8;

/**
 * An expansion boss's display name, resolved here rather than through the
 * boss catalogue, which itself reads this module's boss ids.
 */
export function expansionBossName(id: string): string {
  return (
    AUTHORED_BOSSES.find((boss) => boss.spec.id === id)?.spec.name ??
    id.replace(/(^|-)(\w)/g, (_, dash: string, c: string) => `${dash ? ' ' : ''}${c.toUpperCase()}`)
  );
}

/** A boss stage plays on the boss's own court, so its card describes the fight. */
function bossBlurb(id: string): string {
  const title = AUTHORED_BOSSES.find((boss) => boss.spec.id === id)?.spec.title;
  return `${title ?? expansionBossName(id)}. Each phase sharpens it as you score: keep a skill for the last one`;
}

interface PoolCourt {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly arena: ArenaSpec;
}

const ALL_COURTS: readonly PoolCourt[] = [...EXPANSION_COURTS, ...SPARK_COURTS];

/** The world's courts in the order its stages meet them: whole courts first, then each variant tier of every family. */
function pool(plan: WorldPlan): readonly PoolCourt[] {
  const courts: PoolCourt[] = [];
  for (const id of plan.courts ?? []) courts.push(ALL_COURTS.find((c) => c.id === id)!);
  for (let variant = 1; variant <= 4; variant++)
    for (const family of plan.families) {
      const found = EXPANSION_COURTS.find((c) => c.id === `${family}-${variant}`);
      if (found) courts.push(found);
    }
  return courts;
}

/** Sparks an optional branch sprinkles onto its court, by which of the four spiced branches it is. */
const SPICE: readonly (readonly SparkKind[])[] = [
  ['wide', 'fire'],
  ['ward', 'hex'],
  ['fire', 'hex'],
  ['wide', 'ward']
];

/** The court-specific star: whatever the court asks of the player. */
function courtGoal(arena: ArenaSpec): StarGoal {
  if (arena.sparks) return { id: 'sparks', value: 2 };
  if (arena.switches?.length) return { id: 'switches', value: 2 };
  if (arena.rails?.some((r) => r.hp)) return { id: 'breaks', value: 1 };
  if (arena.rails?.length) return { id: 'banks', value: 3 };
  // Counted only through a narrowed gap, never the full-width release beat.
  if (arena.gates?.length) return { id: 'gates', value: 3 };
  return { id: 'margin', value: 2 };
}

/** Handicaps a recipe may add. The core chain never carries one; branches may. */
function withoutHandicaps<
  T extends { playerPaddleScale?: number; startScore?: unknown; shrinkPerHit?: number }
>(mods: T): T {
  const { playerPaddleScale: _p, startScore: _s, shrinkPerHit: _h, ...rest } = mods;
  void _p;
  void _s;
  void _h;
  return rest as T;
}

export const EXPANSION_WORLDS: readonly JourneyWorld[] = PLANS.map((plan, n) => {
  const id = n + 6,
    arc = Math.floor(n / 5);
  const courts = pool(plan);
  const school = PERSONALITIES.indexOf(plan.school);
  const bossName = expansionBossName(plan.boss);
  const stages: Stage[] = Array.from({ length: 24 }, (_, i) => {
    const boss = i === 23 ? plan.boss : undefined;
    const core = i < CORE_STAGES;
    const trial = i >= 20 && i < 23;
    const teaching = i < 3;
    // Cores walk the pool in order; branches start where the cores stopped;
    // trials take the toughest variants at the end of it.
    const court = trial
      ? courts[courts.length - (23 - i)]!
      : courts[(core ? i : CORE_STAGES + (i - CORE_STAGES) * 5) % courts.length]!;
    const branch = !core && !trial && !boss;
    const spiced = branch && !court.arena.sparks && (i - CORE_STAGES) % 3 === 1;
    const arena: ArenaSpec = spiced
      ? { ...court.arena, sparks: { kinds: SPICE[Math.floor((i - CORE_STAGES) / 3)]!, every: 6 } }
      : court.arena;
    const recipeMods = recipe(`world-${id}`, i, Math.min(4, arc + (i >= 20 ? 1 : 0))).modifiers;
    const mods = branch ? recipeMods : withoutHandicaps(recipeMods);
    const winScore = boss || trial ? 5 : 3;
    const role = boss ? '' : trial ? ' · Trial' : spiced ? ' · Sparks' : branch ? ' · Detour' : '';
    const purpose = teaching
      ? 'Learn the court before combining skills'
      : trial
        ? 'Mastery trial: a shorter paddle, first to five'
        : spiced
          ? 'Sparks join the court: aim your returns through them'
          : branch
            ? 'An optional road: nothing waits on it'
            : bossName.startsWith('The ')
              ? `Every return here is practice for ${bossName}`
              : `Every return here is practice for the ${bossName}`;
    return {
      id: `w${id}-${i + 1}`,
      world: id,
      index: i,
      courtFamily: court.id.replace(/-\d+$/, ''),
      name: boss ? expansionBossName(boss) : `${court.name}${role}`,
      // A boss fights on its own court, so its card describes the fight
      // rather than this stage's court - and it is not a mastery trial.
      blurb: boss ? bossBlurb(boss) : `${court.blurb}. ${purpose}`,
      // The world keeps its school; branches meet the others.
      personality: PERSONALITIES[branch ? (school + i) % 6 : school]!,
      bot: 'pro',
      winScore,
      modifiers: {
        ...mods,
        arena,
        ...(teaching ? { serveSpeedScale: 0.9 } : {}),
        // Mastery trials shorten the paddle; the boss is a fight of its own.
        ...(trial ? { playerPaddleScale: 0.88 } : {})
      },
      goals: [
        boss ? { id: 'margin', value: 2 } : courtGoal(arena),
        boss
          ? { id: 'flicks', value: 4 }
          : i % 3 === 0
            ? { id: 'flicks', value: 3 }
            : i % 3 === 1 || winScore > 3
              ? { id: 'rally', value: 12 + Math.min(2, arc) * 2 }
              : { id: 'fast', value: 75 }
      ],
      ...(boss ? { boss } : {}),
      // The core chain leads to the boss. Branches and trials never gate it.
      prerequisites: i === 0 ? [] : core ? [`w${id}-${i}`] : [`w${id}-${CORE_STAGES}`]
    };
  });
  return {
    id,
    name: plan.name,
    theme: plan.theme,
    hue: (171 + n * 31) % 360,
    starsToOpen: 0,
    stages
  };
});

export function frontierStage(sector: number, index: number): Stage {
  const depth = (sector - 1) * 20 + index;
  const r = recipe('journey-frontier-v2', depth, Math.min(2, Math.floor((sector - 1) / 30) + 1));
  const boss =
    index % 5 === 4
      ? EXPANSION_BOSS_IDS[(sector * 4 + Math.floor(index / 5)) % EXPANSION_BOSS_IDS.length]!
      : undefined;
  return {
    id: `f2-${sector}-${index + 1}`,
    world: 30 + sector,
    index,
    courtFamily: r.courtFamily,
    name: boss ? expansionBossName(boss) : r.courtName,
    blurb: boss ? bossBlurb(boss) : r.blurb,
    personality: r.personality,
    bot: r.bot,
    winScore: boss ? Math.max(5, r.winScore) : r.winScore,
    modifiers: r.modifiers,
    goals: [
      { id: 'margin', value: 2 },
      { id: 'flicks', value: 3 }
    ],
    ...(boss ? { boss } : {})
  };
}
