import { COURT_HEIGHT, MIN_COURT_WIDTH } from './geometry';
import { EXPANSION_COURTS } from './expansionCourts';
import { seeded } from '../util/random';
import type { BotLevelId } from '../bots/types';
import type { ArenaSpec, MatchModifiers } from './types';

export const CONTENT_VERSION = 2;
export const PERSONALITIES = [
  'anchor',
  'aggressor',
  'banker',
  'curver',
  'disruptor',
  'opportunist'
] as const;
export type Personality = (typeof PERSONALITIES)[number];
export const SCHOOL_SCOUT: Record<Personality, string> = {
  anchor: 'Safe contacts and a steadier guard. Draw it wide, then reverse the shot.',
  aggressor: 'Early charges and pressure toward your exposed edge. Keep a recovery skill ready.',
  banker: 'Steeper wall banks and an Anchor charge. Read the wall route before committing.',
  curver: 'Late bending returns and Redirect angles. Delay your final correction.',
  disruptor: 'Switch routes and Relay recovery. Watch the linked gate and save a dash.',
  opportunist: 'Alternates placement against your observed movement. Vary your recovery position.'
};

/** Seeded geometry and one compatible extra rule, under the same budgets. */
function variedCourt(base: ArenaSpec, random: () => number, band: number): ArenaSpec {
  const shift = () => (random() - 0.5) * 0.025;
  let arena: ArenaSpec = {
    ...base,
    ...(base.rails
      ? {
          rails: base.rails.map((r) => ({
            ...r,
            ax: r.ax + shift(),
            bx: r.bx + shift(),
            ay: r.ay + shift(),
            by: r.by + shift()
          }))
        }
      : {}),
    ...(base.gates
      ? {
          gates: base.gates.map((g) => ({
            ...g,
            center: g.center + shift(),
            period: g.period + random() * 0.9
          }))
        }
      : {}),
    ...(base.wind
      ? {
          wind: {
            ...base.wind,
            period: base.wind.period + random() * 0.8,
            strength: Math.min(400, base.wind.strength + random() * 15)
          }
        }
      : {}),
    ...(base.well
      ? {
          well: {
            ...base.well,
            x: base.well.x + shift(),
            y: base.well.y + shift(),
            strength: Math.min(400, base.well.strength + random() * 15)
          }
        }
      : {})
  };
  if (band >= 2 && random() < 0.5) {
    const families = [
      arena.rails?.length,
      arena.gates?.length,
      arena.switches?.length,
      arena.zones?.length,
      arena.bumpers?.length,
      arena.wind,
      arena.well,
      arena.bricks,
      arena.portals?.length
    ].filter(Boolean).length;
    if (families < 3 && !arena.portals?.length) {
      const extras: Partial<ArenaSpec>[] = [];
      if (!arena.zones?.length)
        extras.push({
          zones: [
            { x: 0.33, y: 0.12, w: 0.12, h: 0.17, scale: 1.08 },
            { x: 0.55, y: 0.71, w: 0.12, h: 0.17, scale: 1.08 }
          ]
        });
      if (arena.rails?.length && !arena.wind && !arena.well)
        extras.push({ wind: { strength: 180 + random() * 80, period: 7 + random(), shear: true } });
      if (arena.gates?.length && !arena.bumpers?.length && !arena.rails?.length && !arena.bricks)
        extras.push({
          bumpers: [
            { x: 0.35, y: 0.23, r: 20 },
            { x: 0.65, y: 0.77, r: 20 }
          ]
        });
      if (extras.length) arena = { ...arena, ...extras[Math.floor(random() * extras.length)] };
    }
  }
  return validArena(arena) ? arena : base;
}

export function recipe(seed: string, depth: number, band: number) {
  const random = seeded('recipe-v2', seed, depth);
  // A stride through curated templates prevents immediate exact repeats.
  const candidate =
    EXPANSION_COURTS[(depth * 13 + Math.floor(random() * 3)) % EXPANSION_COURTS.length]!;
  const court = validArena(candidate.arena) ? candidate : EXPANSION_COURTS[0]!;
  const strength = Math.min(4, Math.max(0, band));
  const arena = variedCourt(court.arena, random, strength);
  const bots: readonly BotLevelId[] = ['amateur', 'pro', 'elite', 'legend', 'legend'];
  const modifiers: Partial<MatchModifiers> = {
    arena,
    serveSpeedScale: 1 + strength * 0.035,
    maxSpeedScale: 1 + strength * 0.025,
    speedPerHitScale: 1 + strength * 0.06,
    ...(strength >= 2 && depth % 6 === 0 ? { playerPaddleScale: 0.9 } : {}),
    ...(strength >= 3 && depth % 6 === 1 ? { startScore: { you: 0, bot: 1 } } : {}),
    ...(strength >= 3 && depth % 6 === 2 ? { shrinkPerHit: 0.006 } : {}),
    ...(depth % 6 === 3 ? { speedPerHitScale: 0.9 } : {})
  };
  return {
    winScore: strength >= 3 && depth % 6 === 4 ? 7 : depth % 6 === 5 ? 5 : 3,
    courtFamily: court.id.replace(/-\d+$/, ''),
    courtName: court.name,
    blurb: `${court.blurb}. Keep a recovery skill ready for the return`,
    bot: bots[strength]!,
    personality: PERSONALITIES[(depth + Math.floor(random() * 6)) % 6]!,
    modifiers
  };
}

/** Authoring validation before a recipe is made available to the engine. */
export function validArena(arena: ArenaSpec): boolean {
  const inside = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
  const positive = (v: number) => Number.isFinite(v) && v > 0;
  const families = [
    arena.bumpers?.length,
    arena.wind,
    arena.well,
    arena.portals?.length,
    arena.bricks,
    arena.rails?.length,
    arena.gates?.length,
    arena.switches?.length,
    arena.zones?.length
  ].filter(Boolean).length;
  if (
    families > 3 ||
    (arena.gates?.length ?? 0) > 2 ||
    (arena.rails?.length ?? 0) > 4 ||
    (arena.switches?.length ?? 0) > 4 ||
    (arena.zones?.length ?? 0) > 2 ||
    (arena.bumpers?.length ?? 0) > 4
  )
    return false;
  for (const r of arena.rails ?? []) {
    if (
      ![r.ax, r.ay, r.bx, r.by].every(inside) ||
      Math.min(r.ax, r.bx) < 0.3 ||
      Math.max(r.ax, r.bx) > 0.7 ||
      Math.hypot((r.bx - r.ax) * MIN_COURT_WIDTH, (r.by - r.ay) * COURT_HEIGHT) < 24 ||
      (r.hp !== undefined && (!Number.isInteger(r.hp) || r.hp < 1 || r.hp > 6))
    )
      return false;
    // No reflecting surface through the initial serve corridor.
    const dx = (r.bx - r.ax) * MIN_COURT_WIDTH,
      dy = (r.by - r.ay) * COURT_HEIGHT;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((0.5 - r.ax) * MIN_COURT_WIDTH * dx + (0.5 - r.ay) * COURT_HEIGHT * dy) /
          (dx * dx + dy * dy)
      )
    );
    if (
      Math.hypot((r.ax - 0.5) * MIN_COURT_WIDTH + t * dx, (r.ay - 0.5) * COURT_HEIGHT + t * dy) < 32
    )
      return false;
  }
  for (const g of arena.gates ?? []) {
    if (
      ![g.x, g.center, g.gap].every(inside) ||
      g.x < 0.3 ||
      g.x > 0.7 ||
      g.gap < 0.24 ||
      !positive(g.period) ||
      g.period < 4 ||
      !Number.isFinite(g.amplitude ?? 0) ||
      g.center - (g.amplitude ?? 0) - g.gap / 2 < 0 ||
      g.center + (g.amplitude ?? 0) + g.gap / 2 > 1
    )
      return false;
  }
  for (const s of arena.switches ?? [])
    if (
      !inside(s.x) ||
      !inside(s.y) ||
      !positive(s.r) ||
      s.r > 26 ||
      !Number.isInteger(s.gate) ||
      s.gate < 0 ||
      s.gate >= (arena.gates?.length ?? 0)
    )
      return false;
  for (const z of arena.zones ?? [])
    if (
      ![z.x, z.y, z.w, z.h].every(inside) ||
      z.x + z.w > 1 ||
      z.y + z.h > 1 ||
      !positive(z.scale) ||
      z.scale < 0.85 ||
      z.scale > 1.2
    )
      return false;
  for (const b of arena.bumpers ?? [])
    if (
      !inside(b.x) ||
      !inside(b.y) ||
      b.x < 0.3 ||
      b.x > 0.7 ||
      !positive(b.r) ||
      b.r > 40 ||
      (b.slide && (!positive(b.slide.period) || b.slide.amplitude > 120))
    )
      return false;
  for (const p of arena.portals ?? [])
    if (
      ![p.a.x, p.a.y, p.b.x, p.b.y].every(inside) ||
      Math.min(p.a.x, p.b.x) < 0.3 ||
      Math.max(p.a.x, p.b.x) > 0.7 ||
      !positive(p.r) ||
      p.r > 30 ||
      Math.hypot((p.a.x - p.b.x) * MIN_COURT_WIDTH, (p.a.y - p.b.y) * COURT_HEIGHT) < p.r * 3
    )
      return false;
  if (
    arena.bricks &&
    (!Number.isInteger(arena.bricks.rows) || arena.bricks.rows < 2 || arena.bricks.rows > 8)
  )
    return false;
  if (
    arena.wind &&
    (!Number.isFinite(arena.wind.strength) ||
      Math.abs(arena.wind.strength) > 400 ||
      !positive(arena.wind.period))
  )
    return false;
  if (
    arena.well &&
    (![arena.well.x, arena.well.y].every(inside) ||
      !Number.isFinite(arena.well.strength) ||
      Math.abs(arena.well.strength) > 400 ||
      (arena.well.pulsePeriod !== undefined && arena.well.pulsePeriod < 4))
  )
    return false;
  return true;
}
