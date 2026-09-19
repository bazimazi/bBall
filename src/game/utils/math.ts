export function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Frame-rate independent exponential decay: `value * decay(rate, dt)` loses
 * the same fraction per second whatever the step size.
 */
export function decay(rate: number, dt: number): number {
  return Math.pow(rate, dt);
}
