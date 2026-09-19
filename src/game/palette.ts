import type { Side } from './types';

export const HUE = { you: 171, bot: 342, hot: 34 } as const;

export const CANVAS_FONT = '-apple-system, system-ui, "Segoe UI", Roboto, sans-serif';

export const INK = 'rgba(238,242,255,';
export const BACKDROP = '#06080f';

export function sideHue(side: Side): number {
  return side === 'you' ? HUE.you : HUE.bot;
}

/** Blend a hue towards the "hot" hue, taking the short way round. */
export function heatHue(base: number, heat: number): number {
  let d = HUE.hot - base;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  let h = base + d * heat;
  if (h < 0) h += 360;
  return h % 360;
}

export function hsla(h: number, s: number, l: number, a: number): string {
  return `hsla(${h.toFixed(0)},${s}%,${l}%,${a})`;
}
