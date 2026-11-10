import type { ArenaSpec } from './types';

/**
 * Courts built around sparks. Each pairs the pickups with one hazard that
 * changes how you reach them - posts to bank round, a wind that carries the
 * ball onto them, portals that move them closer - so a spark is a target to
 * aim for rather than a prize that happens to the ball.
 *
 * They join the Daily rotation from `since`, which is after every day that
 * has already been played, so no existing Daily changes.
 */
export const SPARK_COURTS: readonly {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly arena: ArenaSpec;
  readonly since: string;
}[] = [
  {
    id: 'spark-garden',
    name: 'Spark Garden',
    blurb: 'An open court where sparks bloom: aim your returns through them',
    since: '2026-11-11',
    arena: { sparks: { kinds: ['wide', 'fire'], every: 5, max: 2 } }
  },
  {
    id: 'lantern-posts',
    name: 'Lantern Posts',
    blurb: 'Two posts guard the sparks between them. Ward yourself, hex the bot',
    since: '2026-11-11',
    arena: {
      bumpers: [
        { x: 0.5, y: 0.28, r: 24 },
        { x: 0.5, y: 0.72, r: 24 }
      ],
      sparks: { kinds: ['ward', 'hex'], every: 6 }
    }
  },
  {
    id: 'ember-forge',
    name: 'Ember Forge',
    blurb: 'Fire sparks between two walls that rebuild every point',
    since: '2026-11-11',
    arena: {
      bricks: { rows: 3, sides: 'both', regrow: true },
      sparks: { kinds: ['fire'], every: 5 }
    }
  },
  {
    id: 'spark-rift',
    name: 'Spark Rift',
    blurb: 'A rift carries the ball across the court and onto the sparks',
    since: '2026-11-11',
    arena: {
      portals: [{ a: { x: 0.4, y: 0.2 }, b: { x: 0.6, y: 0.8 }, r: 24 }],
      sparks: { kinds: ['wide', 'hex'], every: 6 }
    }
  },
  {
    id: 'spark-gale',
    name: 'Spark Gale',
    blurb: 'A turning wind blows the ball onto sparks, or away from them',
    since: '2026-11-11',
    arena: {
      wind: { strength: 220, period: 6 },
      sparks: { kinds: ['fire', 'ward'], every: 5 }
    }
  },
  {
    id: 'spark-circuit',
    name: 'Spark Circuit',
    blurb: 'Every kind of spark, two at a time, between charged lanes',
    since: '2026-11-11',
    arena: {
      zones: [
        { x: 0.34, y: 0.12, w: 0.12, h: 0.18, scale: 1.08 },
        { x: 0.54, y: 0.7, w: 0.12, h: 0.18, scale: 1.08 }
      ],
      sparks: { kinds: ['wide', 'fire', 'ward', 'hex'], every: 4, max: 2 }
    }
  }
];
