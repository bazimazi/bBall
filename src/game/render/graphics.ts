import type { GraphicsIntensity } from '../../core/settings/store';
import type { World } from '../world';
import { PARTICLE_MAX } from '../constants';

/** Decoration only: never changes motion comfort, resolution, input or match timing. */
export const GRAPHICS_BUDGETS = {
  high: { particles: 1, particleLimit: PARTICLE_MAX, ambient: 1, confetti: 1 },
  balanced: {
    particles: 0.5,
    particleLimit: Math.round(PARTICLE_MAX * 0.5),
    ambient: 0.5,
    confetti: 0.4
  },
  low: { particles: 0.2, particleLimit: Math.round(PARTICLE_MAX * 0.2), ambient: 0, confetti: 0 }
} as const satisfies Record<GraphicsIntensity, object>;

export function applyGraphicsIntensity(world: World, intensity: GraphicsIntensity): void {
  const budget = GRAPHICS_BUDGETS[intensity];
  world.graphicsIntensity = intensity;
  world.particles.configure(budget.particles, budget.particleLimit);
  world.confetti.density = budget.confetti;
  if (budget.confetti === 0) world.confetti.clear();
  world.grid.enabled = intensity === 'high';
  if (!world.grid.enabled) world.grid.clear();
  if (intensity === 'low') world.ghosts.clear();
}
