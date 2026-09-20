import type { ResolvedTheme } from '../core/cosmetics/theme';
import type { Side } from './types';

/** Fallback hues, used before a theme is resolved. */
export const HUE = { you: 171, bot: 342, hot: 34 } as const;

export const CANVAS_FONT = '-apple-system, system-ui, "Segoe UI", Roboto, sans-serif';

export const INK = 'rgba(238,242,255,';
export const BACKDROP = '#06080f';

/** The hue a side is drawn in, under the equipped theme. */
export function sideHue(theme: ResolvedTheme, side: Side): number {
  return side === 'you' ? theme.youHue : theme.botHue;
}

/** Blend a hue towards the "hot" hue, taking the short way round. */
export function heatHue(base: number, heat: number, hot: number = HUE.hot): number {
  let d = hot - base;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  let h = base + d * heat;
  if (h < 0) h += 360;
  return h % 360;
}

export function hsla(h: number, s: number, l: number, a: number): string {
  return `hsla(${h.toFixed(0)},${s}%,${l}%,${a})`;
}
