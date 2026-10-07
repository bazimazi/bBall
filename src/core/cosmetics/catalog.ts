/**
 * Cosmetics only. Nothing in this file touches physics, paddle size, ball
 * speed or bot behaviour - unlocks change how the game looks, never how it
 * plays, so a level 1 player and a level 50 player play the same game.
 */

export type CosmeticKind = 'accent' | 'ball' | 'paddle' | 'trail' | 'arena';

export type UnlockRule =
  | { readonly type: 'default' }
  | { readonly type: 'level'; readonly level: number }
  | { readonly type: 'achievement'; readonly id: string };

export interface Cosmetic {
  readonly id: string;
  readonly kind: CosmeticKind;
  readonly name: string;
  readonly unlock: UnlockRule;
  /** Two colours the UI uses to draw a swatch. */
  readonly swatch: readonly [string, string];
}

export interface AccentCosmetic extends Cosmetic {
  readonly kind: 'accent';
  readonly hue: number;
  readonly css: string;
}

/**
 * How a cosmetic is *drawn*, beyond its numbers. Every style is a different
 * picture of the same object - a pearl shimmers, a void swallows light, a
 * star turns - and none of them is any easier or harder to see in play than
 * another: the renderer keeps each one's silhouette and brightness honest.
 */
export type BallStyle = 'classic' | 'pearl' | 'nova' | 'void' | 'star' | 'comet' | 'plasma';
export type TrailStyle = 'comet' | 'ribbon' | 'ember' | 'aurora' | 'pixel';
export type PaddleStyle = 'capsule' | 'blade' | 'halo' | 'prism' | 'circuit';
/** The living part of an arena: what drifts, falls or flickers on its floor. */
export type ArenaAmbient =
  | 'stars'
  | 'motes'
  | 'data'
  | 'embers'
  | 'rain'
  | 'storm'
  | 'sparks'
  | 'gold'
  | 'bubbles'
  | 'sunset';

export interface BallCosmetic extends Cosmetic {
  readonly kind: 'ball';
  readonly style: BallStyle;
  readonly fill: string;
  readonly glow: number;
  readonly ring: number;
}

export interface PaddleCosmetic extends Cosmetic {
  readonly kind: 'paddle';
  readonly style: PaddleStyle;
  /** Corner radius as a fraction of half the paddle width. 1 is a capsule. */
  readonly round: number;
  readonly glow: number;
}

export interface TrailCosmetic extends Cosmetic {
  readonly kind: 'trail';
  readonly style: TrailStyle;
  readonly alpha: number;
  readonly width: number;
}

export interface ArenaCosmetic extends Cosmetic {
  readonly kind: 'arena';
  readonly ambient: ArenaAmbient;
  readonly bgHue: number;
  readonly courtTop: string;
  readonly courtBottom: string;
  readonly lineAlpha: number;
  readonly dash: readonly [number, number];
  /** How strongly the rippling floor grid shows, 0 for none. */
  readonly grid: number;
}

const LEGACY_ACCENTS: readonly AccentCosmetic[] = [
  {
    id: 'accent-teal',
    kind: 'accent',
    name: 'Teal',
    hue: 171,
    css: '#4ff0d6',
    unlock: { type: 'default' },
    swatch: ['#4ff0d6', '#2bc5ad']
  },
  {
    id: 'accent-violet',
    kind: 'accent',
    name: 'Violet',
    hue: 268,
    css: '#a88bff',
    unlock: { type: 'default' },
    swatch: ['#a88bff', '#7b5cf0']
  },
  {
    id: 'accent-amber',
    kind: 'accent',
    name: 'Amber',
    hue: 40,
    css: '#ffc75a',
    unlock: { type: 'default' },
    swatch: ['#ffc75a', '#e09a1f']
  },
  {
    id: 'accent-lime',
    kind: 'accent',
    name: 'Lime',
    hue: 96,
    css: '#9bf06a',
    unlock: { type: 'level', level: 4 },
    swatch: ['#9bf06a', '#5fc23a']
  },
  {
    id: 'accent-ice',
    kind: 'accent',
    name: 'Ice',
    hue: 202,
    css: '#6fd0ff',
    unlock: { type: 'level', level: 8 },
    swatch: ['#6fd0ff', '#2a9fd8']
  },
  {
    id: 'accent-gold',
    kind: 'accent',
    name: 'Champion',
    hue: 46,
    css: '#ffd966',
    unlock: { type: 'achievement', id: 'cup-gold' },
    swatch: ['#ffd966', '#c79a17']
  },
  {
    id: 'accent-dawn',
    kind: 'accent',
    name: 'Dawn',
    hue: 18,
    css: '#ff8a5c',
    unlock: { type: 'achievement', id: 'journey-w1' },
    swatch: ['#ff8a5c', '#b8452a']
  },
  {
    id: 'accent-sakura',
    kind: 'accent',
    name: 'Sakura',
    hue: 330,
    css: '#ff85c0',
    unlock: { type: 'level', level: 26 },
    swatch: ['#ff85c0', '#c2427f']
  }
];

const BASE_BALLS: readonly BallCosmetic[] = [
  {
    id: 'ball-classic',
    kind: 'ball',
    style: 'classic',
    name: 'Classic',
    fill: '#ffffff',
    glow: 1,
    ring: 1,
    unlock: { type: 'default' },
    swatch: ['#ffffff', '#b9c4e6']
  },
  {
    id: 'ball-pearl',
    kind: 'ball',
    style: 'pearl',
    name: 'Pearl',
    fill: '#f2e9ff',
    glow: 0.75,
    ring: 1.7,
    unlock: { type: 'level', level: 3 },
    swatch: ['#f2e9ff', '#c9b6ff']
  },
  {
    id: 'ball-nova',
    kind: 'ball',
    style: 'nova',
    name: 'Nova',
    fill: '#fff6d8',
    glow: 1.55,
    ring: 1.2,
    unlock: { type: 'achievement', id: 'legend-slayer' },
    swatch: ['#fff6d8', '#ffb545']
  },
  {
    id: 'ball-void',
    kind: 'ball',
    style: 'void',
    name: 'Void',
    fill: '#0a0d18',
    glow: 1.3,
    ring: 2.4,
    unlock: { type: 'level', level: 14 },
    swatch: ['#0a0d18', '#5c6cff']
  },
  {
    id: 'ball-star',
    kind: 'ball',
    style: 'star',
    name: 'Star',
    fill: '#fff3b0',
    glow: 1.4,
    ring: 2,
    unlock: { type: 'achievement', id: 'journey-stars-45' },
    swatch: ['#fff3b0', '#ffc233']
  },
  {
    id: 'ball-comet',
    kind: 'ball',
    style: 'comet',
    name: 'Comet',
    fill: '#e8fbff',
    glow: 1.85,
    ring: 1,
    unlock: { type: 'achievement', id: 'run-clear' },
    swatch: ['#e8fbff', '#5cc8ff']
  },
  {
    id: 'ball-plasma',
    kind: 'ball',
    style: 'plasma',
    name: 'Plasma',
    fill: '#eef4ff',
    glow: 1.45,
    ring: 1.5,
    unlock: { type: 'level', level: 20 },
    swatch: ['#eef4ff', '#8a6bff']
  }
];

const BASE_PADDLES: readonly PaddleCosmetic[] = [
  {
    id: 'paddle-capsule',
    kind: 'paddle',
    style: 'capsule',
    name: 'Capsule',
    round: 1,
    glow: 1,
    unlock: { type: 'default' },
    swatch: ['#4ff0d6', '#1d5f57']
  },
  {
    id: 'paddle-blade',
    kind: 'paddle',
    style: 'blade',
    name: 'Blade',
    round: 0.25,
    glow: 0.8,
    unlock: { type: 'level', level: 6 },
    swatch: ['#4ff0d6', '#153b38']
  },
  {
    id: 'paddle-halo',
    kind: 'paddle',
    style: 'halo',
    name: 'Halo',
    round: 1,
    glow: 1.9,
    unlock: { type: 'achievement', id: 'challenge-master' },
    swatch: ['#8ffff0', '#2bc5ad']
  },
  {
    id: 'paddle-prism',
    kind: 'paddle',
    style: 'prism',
    name: 'Prism',
    round: 0.6,
    glow: 2.2,
    unlock: { type: 'achievement', id: 'boss-all' },
    swatch: ['#ffffff', '#b77bff']
  },
  {
    id: 'paddle-circuit',
    kind: 'paddle',
    style: 'circuit',
    name: 'Circuit',
    round: 0.45,
    glow: 1.2,
    unlock: { type: 'level', level: 22 },
    swatch: ['#4ff0d6', '#0c2b28']
  }
];

const BASE_TRAILS: readonly TrailCosmetic[] = [
  {
    id: 'trail-comet',
    kind: 'trail',
    style: 'comet',
    name: 'Comet',
    alpha: 1,
    width: 1,
    unlock: { type: 'default' },
    swatch: ['#ffffff', '#4ff0d6']
  },
  {
    id: 'trail-ribbon',
    kind: 'trail',
    style: 'ribbon',
    name: 'Ribbon',
    alpha: 1.3,
    width: 0.52,
    unlock: { type: 'level', level: 5 },
    swatch: ['#ffffff', '#a88bff']
  },
  {
    id: 'trail-ember',
    kind: 'trail',
    style: 'ember',
    name: 'Ember',
    alpha: 1.5,
    width: 1.35,
    unlock: { type: 'achievement', id: 'endless-60' },
    swatch: ['#ffb545', '#ff5c8a']
  },
  {
    id: 'trail-aurora',
    kind: 'trail',
    style: 'aurora',
    name: 'Aurora',
    alpha: 1.4,
    width: 1.6,
    unlock: { type: 'achievement', id: 'daily-7' },
    swatch: ['#7dffb2', '#6b7bff']
  },
  {
    id: 'trail-pixel',
    kind: 'trail',
    style: 'pixel',
    name: 'Pixel',
    alpha: 1.2,
    width: 1,
    unlock: { type: 'level', level: 18 },
    swatch: ['#9bf06a', '#2bc5ad']
  }
];

const BASE_ARENAS: readonly ArenaCosmetic[] = [
  {
    id: 'arena-midnight',
    kind: 'arena',
    ambient: 'stars',
    name: 'Midnight',
    bgHue: 205,
    courtTop: '#0c1121',
    courtBottom: '#070a14',
    lineAlpha: 0.1,
    dash: [9, 13],
    grid: 0.05,
    unlock: { type: 'default' },
    swatch: ['#0c1121', '#1b2440']
  },
  {
    id: 'arena-dusk',
    kind: 'arena',
    ambient: 'motes',
    name: 'Dusk',
    bgHue: 286,
    courtTop: '#160f26',
    courtBottom: '#0a0714',
    lineAlpha: 0.13,
    dash: [4, 10],
    grid: 0.045,
    unlock: { type: 'level', level: 7 },
    swatch: ['#160f26', '#3a2568']
  },
  {
    id: 'arena-grid',
    kind: 'arena',
    ambient: 'data',
    name: 'Grid',
    bgHue: 178,
    courtTop: '#07161a',
    courtBottom: '#040c0f',
    lineAlpha: 0.22,
    dash: [2, 8],
    grid: 0.13,
    unlock: { type: 'achievement', id: 'cup-champion' },
    swatch: ['#07161a', '#0f4a52']
  },
  {
    id: 'arena-ember',
    kind: 'arena',
    ambient: 'embers',
    name: 'Ember',
    bgHue: 18,
    courtTop: '#1d0e0c',
    courtBottom: '#0d0605',
    lineAlpha: 0.14,
    dash: [9, 13],
    grid: 0.05,
    unlock: { type: 'level', level: 12 },
    swatch: ['#1d0e0c', '#5c2018']
  },
  {
    id: 'arena-alley',
    kind: 'arena',
    ambient: 'rain',
    name: 'Neon Alley',
    bgHue: 276,
    courtTop: '#150d24',
    courtBottom: '#08050f',
    lineAlpha: 0.16,
    dash: [3, 7],
    grid: 0.1,
    unlock: { type: 'achievement', id: 'journey-w2' },
    swatch: ['#150d24', '#6a2cc9']
  },
  {
    id: 'arena-storm',
    kind: 'arena',
    ambient: 'storm',
    name: 'Stormfront',
    bgHue: 200,
    courtTop: '#0a1822',
    courtBottom: '#040a10',
    lineAlpha: 0.14,
    dash: [12, 10],
    grid: 0.08,
    unlock: { type: 'achievement', id: 'journey-w3' },
    swatch: ['#0a1822', '#1f6f9c']
  },
  {
    id: 'arena-forge',
    kind: 'arena',
    ambient: 'sparks',
    name: 'Forge',
    bgHue: 14,
    courtTop: '#1f0c08',
    courtBottom: '#0c0403',
    lineAlpha: 0.15,
    dash: [6, 6],
    grid: 0.09,
    unlock: { type: 'achievement', id: 'journey-w4' },
    swatch: ['#1f0c08', '#a8401c']
  },
  {
    id: 'arena-apex',
    kind: 'arena',
    ambient: 'gold',
    name: 'Apex',
    bgHue: 44,
    courtTop: '#1a1508',
    courtBottom: '#0a0803',
    lineAlpha: 0.16,
    dash: [2, 6],
    grid: 0.11,
    unlock: { type: 'achievement', id: 'journey-w5' },
    swatch: ['#1a1508', '#c99a1f']
  },
  {
    id: 'arena-abyss',
    kind: 'arena',
    ambient: 'bubbles',
    name: 'Abyss',
    bgHue: 192,
    courtTop: '#04161f',
    courtBottom: '#01080d',
    lineAlpha: 0.12,
    dash: [6, 12],
    grid: 0.06,
    unlock: { type: 'level', level: 24 },
    swatch: ['#04161f', '#0f6f86']
  },
  {
    id: 'arena-sunset',
    kind: 'arena',
    ambient: 'sunset',
    name: 'Sunset Drive',
    bgHue: 318,
    courtTop: '#1d0a26',
    courtBottom: '#0a0412',
    lineAlpha: 0.16,
    dash: [8, 8],
    grid: 0.12,
    unlock: { type: 'level', level: 30 },
    swatch: ['#2a0f3a', '#ff5fa2']
  }
];

export const ACCENTS: readonly AccentCosmetic[] = [
  ...LEGACY_ACCENTS,
  ...Array.from({ length: 24 }, (_, i): AccentCosmetic => {
    const hue = (35 + i * 47) % 360,
      css = `hsl(${hue} 90% 66%)`;
    const milestones = [
      'journey-w10',
      'journey-w15',
      'journey-w20',
      'journey-w25',
      'journey-w30',
      'boss-expansion-all',
      'journey-expansion-stars',
      'frontier-1',
      'frontier-10',
      'frontier-100',
      'pressure-10',
      'pressure-30',
      'pressure-50'
    ];
    return {
      id: `accent-mastery-${i + 1}`,
      kind: 'accent',
      name: i < 13 ? `Circuit ${i + 1}` : `Mastery ${50 + (i - 13) * 50}`,
      hue,
      css,
      swatch: [css, `hsl(${(hue + 30) % 360} 85% 48%)`],
      unlock:
        i < 13
          ? { type: 'achievement', id: milestones[i]! }
          : { type: 'level', level: 50 + (i - 13) * 50 }
    };
  })
];

const BUILD_NAMES = ['Power', 'Control', 'Defense', 'Momentum', 'Utility'] as const;
const BUILD_IDS = ['power', 'control', 'defense', 'momentum', 'utility'] as const;
const SCHOOL_IDS = ['anchor', 'aggressor', 'banker', 'curver', 'disruptor'] as const;
export const BALLS: readonly BallCosmetic[] = [
  ...BASE_BALLS,
  ...BUILD_NAMES.map((name, i): BallCosmetic => ({
    ...BASE_BALLS[i + 1]!,
    id: `ball-mastery-${BUILD_IDS[i]}`,
    name: `${name} core`,
    glow: 1.15 + i * 0.05,
    ring: 0.2 + i * 0.08,
    unlock: { type: 'achievement', id: `track-build-${BUILD_IDS[i]}` }
  }))
];
export const PADDLES: readonly PaddleCosmetic[] = [
  ...BASE_PADDLES,
  ...BUILD_NAMES.map((name, i): PaddleCosmetic => ({
    ...BASE_PADDLES[i]!,
    id: `paddle-mastery-${BUILD_IDS[i]}`,
    name: `${name} finish`,
    round: 0.2 + i * 0.15,
    glow: 1.2 + i * 0.06,
    unlock: { type: 'achievement', id: `track-build-${BUILD_IDS[i]}` }
  }))
];
export const TRAILS: readonly TrailCosmetic[] = [
  ...BASE_TRAILS,
  ...SCHOOL_IDS.map((id, i): TrailCosmetic => ({
    ...BASE_TRAILS[i]!,
    id: `trail-mastery-${id}`,
    name: `${id[0]!.toUpperCase() + id.slice(1)} trace`,
    alpha: 1.1 + i * 0.03,
    width: 0.8 + i * 0.1,
    unlock: { type: 'achievement', id: `track-school-${id}` }
  }))
];
const COURT_IDS = [
  'bankworks',
  'gatehouse',
  'switchyard',
  'charge-circuit',
  'phase-crossing',
  'deflector-ruins',
  'crosswind-lock',
  'siege-relay',
  'storm-circuit',
  'rail-slalom',
  'rift-bank',
  'pulse-forge'
];
export const ARENAS: readonly ArenaCosmetic[] = [
  ...BASE_ARENAS,
  ...COURT_IDS.map((id, i): ArenaCosmetic => {
    const hue = (35 + i * 29) % 360;
    return {
      ...BASE_ARENAS[i % BASE_ARENAS.length]!,
      id: `arena-mastery-${id}`,
      name: `${id.replaceAll('-', ' ')} vault`,
      bgHue: hue,
      courtTop: `hsl(${hue} 40% 9%)`,
      courtBottom: `hsl(${hue} 40% 5%)`,
      grid: 0.035 + (i % 4) * 0.01,
      swatch: [`hsl(${hue} 40% 9%)`, `hsl(${hue} 80% 65%)`],
      unlock: { type: 'achievement', id: `track-court-${id}` }
    };
  })
];

export const COSMETICS: readonly Cosmetic[] = [
  ...ACCENTS,
  ...BALLS,
  ...PADDLES,
  ...TRAILS,
  ...ARENAS
];

const BY_ID = new Map<string, Cosmetic>(COSMETICS.map((item) => [item.id, item]));

export function cosmeticById(id: string): Cosmetic | undefined {
  return BY_ID.get(id);
}

export function cosmeticsOfKind(kind: CosmeticKind): readonly Cosmetic[] {
  return COSMETICS.filter((item) => item.kind === kind);
}

export const DEFAULT_EQUIPPED = {
  accent: 'accent-teal',
  ball: 'ball-classic',
  paddle: 'paddle-capsule',
  trail: 'trail-comet',
  arena: 'arena-midnight'
} as const;

export type Equipped = { -readonly [K in keyof typeof DEFAULT_EQUIPPED]: string };

export const EQUIP_SLOTS = Object.keys(DEFAULT_EQUIPPED) as (keyof Equipped)[];

/** Cosmetics that need no unlocking - always available to everyone. */
export const DEFAULT_UNLOCKS: readonly string[] = COSMETICS.filter(
  (item) => item.unlock.type === 'default'
).map((item) => item.id);

export function isUnlocked(
  cosmetic: Cosmetic,
  level: number,
  achievements: ReadonlySet<string>
): boolean {
  switch (cosmetic.unlock.type) {
    case 'default':
      return true;
    case 'level':
      return level >= cosmetic.unlock.level;
    case 'achievement':
      return achievements.has(cosmetic.unlock.id);
  }
}

export function unlockLabel(rule: UnlockRule, achievementName?: string): string {
  switch (rule.type) {
    case 'default':
      return 'Ready';
    case 'level':
      return `Level ${rule.level}`;
    case 'achievement':
      return achievementName ?? 'Achievement';
  }
}
