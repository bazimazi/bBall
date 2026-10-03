import { PARTICLE_MAX } from './constants';
import type { EmitOptions, Particle } from './types';

/**
 * A fixed-size ring buffer of particles. Nothing is allocated after
 * construction, so a long match never touches the garbage collector.
 */
export class ParticleSystem {
  readonly items: Particle[] = Array.from({ length: PARTICLE_MAX }, () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    age: 0,
    life: 0,
    size: 0,
    drag: 0.94,
    color: '#fff',
    alive: false
  }));

  private head = 0;

  /** `scale` folds in the game's effects setting. */
  emit(x: number, y: number, count: number, options: EmitOptions, scale = 1): void {
    const n = Math.round(count * scale);
    for (let i = 0; i < n; i++) {
      const p = this.items[this.head]!;
      this.head = (this.head + 1) % PARTICLE_MAX;
      const angle =
        options.angle === undefined
          ? Math.random() * Math.PI * 2
          : options.angle + (Math.random() - 0.5) * (options.spread ?? Math.PI);
      const speed = options.speed * (0.25 + Math.random() * 0.75);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.age = 0;
      p.life = options.life * (0.7 + Math.random() * 0.6);
      p.size = options.size * (0.6 + Math.random() * 0.8);
      p.drag = options.drag ?? 0.93;
      p.color = options.color;
      p.alive = true;
    }
  }

  /**
   * Draw `count` particles *in* towards (x, y) from a ring `radius` out, each
   * arriving exactly at the centre as it dies - the serve gathering itself.
   */
  converge(
    x: number,
    y: number,
    count: number,
    radius: number,
    life: number,
    size: number,
    color: string,
    scale = 1
  ): void {
    const n = Math.round(count * scale);
    for (let i = 0; i < n; i++) {
      const p = this.items[this.head]!;
      this.head = (this.head + 1) % PARTICLE_MAX;
      const angle = Math.random() * Math.PI * 2;
      const reach = radius * (0.7 + Math.random() * 0.5);
      const span = life * (0.8 + Math.random() * 0.4);
      p.x = x + Math.cos(angle) * reach;
      p.y = y + Math.sin(angle) * reach;
      p.vx = (-Math.cos(angle) * reach) / span;
      p.vy = (-Math.sin(angle) * reach) / span;
      p.age = 0;
      p.life = span;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.drag = 1;
      p.color = color;
      p.alive = true;
    }
  }

  update(dt: number): void {
    for (const p of this.items) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
    }
  }

  clear(): void {
    for (const p of this.items) p.alive = false;
  }
}
