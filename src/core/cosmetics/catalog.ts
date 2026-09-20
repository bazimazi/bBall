/**
 * Cosmetics only. Nothing in this file touches physics, paddle size, ball
 * speed or bot behaviour - unlocks change how the game looks, never how it
 * plays, so a level 1 player and a level 30 player play the same game.
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

export interface BallCosmetic extends Cosmetic {
  readonly kind: 'ball';
  readonly fill: string;
  readonly glow: number;
  readonly ring: number;
}

export interface PaddleCosmetic extends Cosmetic {
  readonly kind: 'paddle';
  /** Corner radius as a fraction of half the paddle width. 1 is a capsule. */
  readonly round: number;
  readonly glow: number;
}

export interface TrailCosmetic extends Cosmetic {
  readonly kind: 'trail';
  readonly alpha: number;
  readonly width: number;
}

export interface ArenaCosmetic extends Cosmetic {
  readonly kind: 'arena';
  readonly bgHue: number;
  readonly courtTop: string;
  readonly courtBottom: string;
  readonly lineAlpha: number;
  readonly dash: readonly [number, number];
}

export const ACCENTS: readonly AccentCosmetic[] = [
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
  }
];

export const BALLS: readonly BallCosmetic[] = [
  {
    id: 'ball-classic',
    kind: 'ball',
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
    name: 'Void',
    fill: '#0a0d18',
    glow: 1.3,
    ring: 2.4,
    unlock: { type: 'level', level: 14 },
    swatch: ['#0a0d18', '#5c6cff']
  }
];

export const PADDLES: readonly PaddleCosmetic[] = [
  {
    id: 'paddle-capsule',
    kind: 'paddle',
    name: 'Capsule',
    round: 1,
    glow: 1,
    unlock: { type: 'default' },
    swatch: ['#4ff0d6', '#1d5f57']
  },
  {
    id: 'paddle-blade',
    kind: 'paddle',
    name: 'Blade',
    round: 0.25,
    glow: 0.8,
    unlock: { type: 'level', level: 6 },
    swatch: ['#4ff0d6', '#153b38']
  },
  {
    id: 'paddle-halo',
    kind: 'paddle',
    name: 'Halo',
    round: 1,
    glow: 1.9,
    unlock: { type: 'achievement', id: 'challenge-master' },
    swatch: ['#8ffff0', '#2bc5ad']
  }
];

export const TRAILS: readonly TrailCosmetic[] = [
  {
    id: 'trail-comet',
    kind: 'trail',
    name: 'Comet',
    alpha: 1,
    width: 1,
    unlock: { type: 'default' },
    swatch: ['#ffffff', '#4ff0d6']
  },
  {
    id: 'trail-ribbon',
    kind: 'trail',
    name: 'Ribbon',
    alpha: 1.3,
    width: 0.52,
    unlock: { type: 'level', level: 5 },
    swatch: ['#ffffff', '#a88bff']
  },
  {
    id: 'trail-ember',
    kind: 'trail',
    name: 'Ember',
    alpha: 1.5,
    width: 1.35,
    unlock: { type: 'achievement', id: 'endless-60' },
    swatch: ['#ffb545', '#ff5c8a']
  }
];

export const ARENAS: readonly ArenaCosmetic[] = [
  {
    id: 'arena-midnight',
    kind: 'arena',
    name: 'Midnight',
    bgHue: 205,
    courtTop: '#0c1121',
    courtBottom: '#070a14',
    lineAlpha: 0.1,
    dash: [9, 13],
    unlock: { type: 'default' },
    swatch: ['#0c1121', '#1b2440']
  },
  {
    id: 'arena-dusk',
    kind: 'arena',
    name: 'Dusk',
    bgHue: 286,
    courtTop: '#160f26',
    courtBottom: '#0a0714',
    lineAlpha: 0.13,
    dash: [4, 10],
    unlock: { type: 'level', level: 7 },
    swatch: ['#160f26', '#3a2568']
  },
  {
    id: 'arena-grid',
    kind: 'arena',
    name: 'Grid',
    bgHue: 178,
    courtTop: '#07161a',
    courtBottom: '#040c0f',
    lineAlpha: 0.22,
    dash: [2, 8],
    unlock: { type: 'achievement', id: 'cup-champion' },
    swatch: ['#07161a', '#0f4a52']
  },
  {
    id: 'arena-ember',
    kind: 'arena',
    name: 'Ember',
    bgHue: 18,
    courtTop: '#1d0e0c',
    courtBottom: '#0d0605',
    lineAlpha: 0.14,
    dash: [9, 13],
    unlock: { type: 'level', level: 12 },
    swatch: ['#1d0e0c', '#5c2018']
  }
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
