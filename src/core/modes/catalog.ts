import type { ModeId } from './types';

export interface ModeInfo {
  readonly id: ModeId;
  readonly name: string;
  /** One short line. If it needs two, the mode is too complicated. */
  readonly blurb: string;
  /** Does picking this mode need a difficulty choice first? */
  readonly picksBot: boolean;
  readonly ranked: boolean;
}

export const MODES: readonly ModeInfo[] = [
  {
    id: 'quick',
    name: 'Quick Match',
    blurb: 'First to 5. The classic duel.',
    picksBot: true,
    ranked: true
  },
  {
    id: 'endless',
    name: 'Endless',
    blurb: 'Three lives. Build the longest rally.',
    picksBot: false,
    ranked: true
  },
  {
    id: 'challenge',
    name: 'Challenge',
    blurb: 'Short matches with a twist.',
    picksBot: false,
    ranked: true
  },
  {
    id: 'tournament',
    name: 'Tournament',
    blurb: 'Three rounds, one trophy.',
    picksBot: false,
    ranked: true
  },
  {
    id: 'practice',
    name: 'Practice',
    blurb: 'Any bot, no stakes, no XP.',
    picksBot: true,
    ranked: false
  }
];

const BY_ID = new Map(MODES.map((mode) => [mode.id, mode]));

export function modeInfo(id: ModeId): ModeInfo {
  return BY_ID.get(id) ?? MODES[0]!;
}

export function isModeId(value: unknown): value is ModeId {
  return typeof value === 'string' && BY_ID.has(value as ModeId);
}
