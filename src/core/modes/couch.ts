import type { ArenaSpec, MatchOptions } from './types';
import { arenaPreset } from './arenas';

/** Pair a bounded selection of obstacles about midfield for equal goal coverage. */
export function mirroredCourt(arena: ArenaSpec): ArenaSpec {
  const rails = arena.rails?.slice(0, 2),
    gate = arena.gates?.[0],
    zones = arena.zones?.slice(0, 1),
    posts = arena.bumpers?.slice(0, 2),
    portal = arena.portals?.[0];
  const switches = gate ? arena.switches?.filter((s) => s.gate === 0).slice(0, 2) : undefined;
  return {
    ...arena,
    ...(rails
      ? {
          rails: rails.flatMap((r) => [
            { ...r, hp: r.hp ?? 3 },
            { ...r, hp: r.hp ?? 3, ax: 1 - r.ax, bx: 1 - r.bx }
          ])
        }
      : {}),
    ...(gate ? { gates: gate.x === 0.5 ? [gate] : [gate, { ...gate, x: 1 - gate.x }] } : {}),
    ...(switches
      ? {
          switches: switches.flatMap((s) =>
            gate?.x === 0.5 ? [s] : [s, { ...s, x: 1 - s.x, gate: 1 }]
          )
        }
      : {}),
    ...(zones ? { zones: zones.flatMap((z) => [z, { ...z, x: 1 - z.x - z.w }]) } : {}),
    ...(posts
      ? {
          bumpers: posts.flatMap((b) =>
            b.x === 0.5 && !b.orbit
              ? [b]
              : [
                  b,
                  {
                    ...b,
                    x: 1 - b.x,
                    ...(b.orbit
                      ? {
                          orbit: {
                            ...b.orbit,
                            speed: -b.orbit.speed,
                            phase: Math.PI - b.orbit.phase
                          }
                        }
                      : {})
                  }
                ]
          )
        }
      : {}),
    ...(portal
      ? { portals: [{ ...portal, a: portal.a, b: { ...portal.a, x: 1 - portal.a.x } }] }
      : {}),
    ...(arena.well ? { well: { ...arena.well, x: 0.5 } } : {}),
    ...(arena.bricks ? { bricks: { ...arena.bricks, sides: 'both' } } : {})
  };
}
export function couchOptions(value: unknown): MatchOptions {
  const source = (typeof value === 'object' && value !== null ? value : {}) as MatchOptions;
  return {
    ...(source.arenaId && arenaPreset(source.arenaId) ? { arenaId: source.arenaId } : {}),
    ...(source.series === 3 || source.series === 5 ? { series: source.series } : {}),
    ...(source.mirror === true ? { mirror: true } : {}),
    ...(source.duel === 'speed' || source.duel === 'precision' ? { duel: source.duel } : {})
  };
}
