import type { ArenaSpec } from './types';

/** Curated route templates. Every template leaves a central serve corridor. */
export const COURT_THEMES = [
  [
    'bankworks',
    'Bankworks',
    'Use the angled rails to place a bank shot',
    {
      rails: [
        { ax: 0.38, ay: 0.12, bx: 0.55, by: 0.3 },
        { ax: 0.45, ay: 0.7, bx: 0.62, by: 0.88 }
      ]
    }
  ],
  [
    'gatehouse',
    'Gatehouse',
    'Read the marked moving opening',
    { gates: [{ x: 0.5, center: 0.5, gap: 0.32, period: 7, amplitude: 0.22 }] }
  ],
  [
    'switchyard',
    'Switchyard',
    'Hit a diamond to open the gate for three seconds',
    {
      gates: [{ x: 0.55, center: 0.5, gap: 0.28, period: 8, amplitude: 0.18 }],
      switches: [
        { x: 0.35, y: 0.22, r: 18, gate: 0 },
        { x: 0.65, y: 0.78, r: 18, gate: 0 }
      ]
    }
  ],
  [
    'charge-circuit',
    'Charge Circuit',
    'The marked lanes add pace, within the ball speed cap',
    {
      zones: [
        { x: 0.35, y: 0.12, w: 0.12, h: 0.18, scale: 1.1 },
        { x: 0.53, y: 0.7, w: 0.12, h: 0.18, scale: 1.1 }
      ]
    }
  ],
  [
    'phase-crossing',
    'Phase Crossing',
    'The barrier opens for half of each visible cycle',
    { gates: [{ x: 0.5, center: 0.5, gap: 0.32, period: 6, phased: true }] }
  ],
  [
    'deflector-ruins',
    'Deflector Ruins',
    'Three hits remove each reflecting surface',
    {
      rails: [
        { ax: 0.4, ay: 0.16, bx: 0.55, by: 0.33, hp: 3 },
        { ax: 0.45, ay: 0.67, bx: 0.6, by: 0.84, hp: 3 }
      ]
    }
  ],
  [
    'crosswind-lock',
    'Crosswind Lock',
    'Read the wind before attacking the moving opening',
    {
      gates: [{ x: 0.5, center: 0.5, gap: 0.36, period: 8, amplitude: 0.18 }],
      wind: { strength: 220, period: 6, shear: true }
    }
  ],
  [
    'siege-relay',
    'Siege Relay',
    'A switch opens the gate between the brick walls',
    {
      gates: [{ x: 0.5, center: 0.5, gap: 0.38, period: 8 }],
      switches: [{ x: 0.38, y: 0.2, r: 18, gate: 0 }],
      bricks: { rows: 4, sides: 'both' }
    }
  ],
  [
    'storm-circuit',
    'Storm Circuit',
    'The well curves shots through two charged lanes',
    {
      well: { x: 0.5, y: 0.5, strength: 280, pulsePeriod: 7 },
      zones: [
        { x: 0.32, y: 0.16, w: 0.12, h: 0.18, scale: 1.08 },
        { x: 0.56, y: 0.66, w: 0.12, h: 0.18, scale: 1.08 }
      ]
    }
  ],
  [
    'rail-slalom',
    'Rail Slalom',
    'Choose a rail route around the sliding post',
    {
      rails: [{ ax: 0.35, ay: 0.12, bx: 0.55, by: 0.26 }],
      bumpers: [{ x: 0.55, y: 0.55, r: 22, slide: { amplitude: 90, period: 7, phase: 0 } }]
    }
  ],
  [
    'rift-bank',
    'Rift Bank',
    'A portal and a rail offer different routes',
    {
      rails: [{ ax: 0.35, ay: 0.12, bx: 0.55, by: 0.28 }],
      portals: [{ a: { x: 0.42, y: 0.7 }, b: { x: 0.62, y: 0.3 }, r: 22 }]
    }
  ],
  [
    'pulse-forge',
    'Pulse Forge',
    'The pulsing well bends shots towards breakable rails',
    {
      well: { x: 0.5, y: 0.5, strength: 240, pulsePeriod: 8 },
      rails: [
        { ax: 0.38, ay: 0.15, bx: 0.52, by: 0.3, hp: 4 },
        { ax: 0.48, ay: 0.7, bx: 0.62, by: 0.85, hp: 4 }
      ]
    }
  ]
] as const satisfies readonly (readonly [string, string, string, ArenaSpec])[];

export const EXPANSION_COURTS = Array.from({ length: 46 }, (_, i) => {
  const [id, name, blurb, definition] = COURT_THEMES[i % COURT_THEMES.length]!;
  const base: ArenaSpec = definition;
  const variant = Math.floor(i / COURT_THEMES.length);
  const mirror = variant % 2 === 1;
  const arena: ArenaSpec = {
    ...base,
    ...(base.rails
      ? {
          rails: base.rails.map((r) => ({
            ...r,
            ax: r.ax + variant * 0.012,
            bx: r.bx - variant * 0.009,
            ay: mirror ? 1 - r.ay : r.ay,
            by: mirror ? 1 - r.by : r.by
          }))
        }
      : {}),
    ...(base.gates
      ? {
          gates: base.gates.map((g) => ({
            ...g,
            gap: Math.max(0.25, g.gap - variant * 0.02),
            period: g.period + variant
          }))
        }
      : {}),
    ...(base.zones
      ? {
          zones: base.zones.map((z) => ({
            ...z,
            x: z.x + variant * 0.012,
            w: z.w + variant * 0.006,
            scale: z.scale + variant * 0.01
          }))
        }
      : {}),
    ...(base.well
      ? {
          well: {
            ...base.well,
            strength: base.well.strength + variant * 30,
            ...(base.well.pulsePeriod ? { pulsePeriod: base.well.pulsePeriod + variant } : {})
          }
        }
      : {}),
    ...(base.portals
      ? {
          portals: base.portals.map((p) => ({
            ...p,
            a: { ...p.a, y: p.a.y - variant * 0.025 },
            b: { ...p.b, y: p.b.y + variant * 0.025 }
          }))
        }
      : {}),
    ...(base.bricks
      ? {
          bricks: { ...base.bricks, rows: base.bricks.rows + (variant % 2), armored: variant >= 2 }
        }
      : {}),
    ...(base.wind ? { wind: { ...base.wind, strength: base.wind.strength + variant * 35 } } : {}),
    ...(base.bumpers
      ? { bumpers: base.bumpers.map((b) => ({ ...b, y: mirror ? 1 - b.y : b.y })) }
      : {})
  };
  return {
    id: `${id}-${variant + 1}`,
    name: `${name}${variant ? ` ${variant + 1}` : ''}`,
    blurb,
    arena,
    since: '2026-10-08'
  };
});
