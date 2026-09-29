import type { ArenaSpec } from './types';

/**
 * Named courts, shared by every mode that builds a court from a menu rather
 * than by hand: the daily challenge rolls one, a run rolls one per match.
 * Campaign stages describe their own, because a stage is a lesson and each
 * lesson needs its court exactly so.
 */
export interface ArenaPreset {
  readonly id: string;
  readonly name: string;
  /** One line for the card that introduces it. */
  readonly blurb: string;
  readonly arena: ArenaSpec;
}

export const ARENA_PRESETS: readonly ArenaPreset[] = [
  {
    id: 'post',
    name: 'Centre Post',
    blurb: 'A bumper stands on the centre spot',
    arena: { bumpers: [{ x: 0.5, y: 0.5, r: 32 }] }
  },
  {
    id: 'twin-posts',
    name: 'Twin Posts',
    blurb: 'Two bumpers split the middle',
    arena: {
      bumpers: [
        { x: 0.5, y: 0.28, r: 26 },
        { x: 0.5, y: 0.72, r: 26 }
      ]
    }
  },
  {
    id: 'carousel',
    name: 'Carousel',
    blurb: 'Two bumpers circle the centre',
    arena: {
      bumpers: [
        { x: 0.5, y: 0.5, r: 24, orbit: { radius: 115, speed: 1, phase: 0 } },
        { x: 0.5, y: 0.5, r: 24, orbit: { radius: 115, speed: 1, phase: Math.PI } }
      ]
    }
  },
  {
    id: 'crosswind',
    name: 'Crosswind',
    blurb: 'Wind across the court, turning every few seconds',
    arena: { wind: { strength: 330, period: 5 } }
  },
  {
    id: 'well',
    name: 'Gravity Well',
    blurb: 'The centre pulls the ball towards it',
    arena: { well: { x: 0.5, y: 0.5, strength: 440 } }
  },
  {
    id: 'bricks',
    name: 'Brickwork',
    blurb: 'A brick wall guards each goal',
    arena: { bricks: { rows: 6, sides: 'both' } }
  },
  {
    id: 'slalom',
    name: 'Slalom',
    blurb: 'Three bumpers, staggered down the court',
    arena: {
      bumpers: [
        { x: 0.38, y: 0.26, r: 22 },
        { x: 0.5, y: 0.5, r: 22 },
        { x: 0.62, y: 0.74, r: 22 }
      ]
    }
  }
];

const BY_ID = new Map(ARENA_PRESETS.map((preset) => [preset.id, preset]));

export function arenaPreset(id: string): ArenaPreset | undefined {
  return BY_ID.get(id);
}
