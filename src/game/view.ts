import type { CanvasQuality } from '../core/settings/store';
import { FIELD_H, MAX_ASPECT, MIN_ASPECT } from './constants';
import type { View } from './types';
import { clamp } from './utils/math';

export function createView(): View {
  return { w: 900, h: FIELD_H, cx: 0, cy: 0, scale: 1, rotated: false, dpr: 1, vw: 0, vh: 0 };
}

function safeInset(styles: CSSStyleDeclaration, name: string): number {
  return parseFloat(styles.getPropertyValue(name)) || 0;
}

/**
 * Fit the field to the viewport and size the canvas backing store.
 *
 * Returns the factor by which the field's *length* changed, so callers can
 * keep play proportional across a resize or an orientation flip.
 */
export function layoutView(
  view: View,
  canvas: HTMLCanvasElement,
  quality: CanvasQuality = 'auto',
  automaticRatio = 1.5
): number {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const styles = getComputedStyle(document.documentElement);

  const padX = 14 + Math.max(safeInset(styles, '--safe-l'), safeInset(styles, '--safe-r'));
  const padY = 14 + Math.max(safeInset(styles, '--safe-t'), safeInset(styles, '--safe-b'));
  const availW = Math.max(120, vw - padX * 2);
  const availH = Math.max(120, vh - padY * 2);

  view.vw = vw;
  view.vh = vh;
  view.rotated = availH > availW;

  const long = Math.max(availW, availH);
  const short = Math.min(availW, availH);
  const aspect = clamp(long / short, MIN_ASPECT, MAX_ASPECT);

  const previousW = view.w;
  view.w = FIELD_H * aspect;
  view.h = FIELD_H;
  view.scale = Math.min(long / view.w, short / view.h);
  view.cx = vw / 2;
  view.cy = vh / 2;

  sizeCanvas(view, canvas, quality, automaticRatio);
  return view.w / previousW;
}

const PIXEL_RATIO_CAP: Readonly<Record<CanvasQuality, number>> = {
  auto: 2,
  high: 2.5,
  balanced: 1.5,
  low: 1
};

/** Change only the backing store, leaving field geometry and CSS input coordinates intact. */
export function sizeCanvas(
  view: View,
  canvas: HTMLCanvasElement,
  quality: CanvasQuality,
  automaticRatio = 1.5
): void {
  // Bound automatic fill cost on large/high-density screens as well as phones.
  const cap =
    quality === 'auto'
      ? Math.min(automaticRatio, Math.sqrt(2_000_000 / Math.max(1, view.vw * view.vh)), 2)
      : PIXEL_RATIO_CAP[quality];
  const dpr = clamp(window.devicePixelRatio || 1, 1, Math.max(1, cap));
  const bw = Math.round(view.vw * dpr);
  const bh = Math.round(view.vh * dpr);
  view.dpr = dpr;
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  canvas.style.width = `${view.vw}px`;
  canvas.style.height = `${view.vh}px`;
}

/** Field point -> screen x in CSS pixels (camera shake excluded). */
export function toScreenX(view: View, fx: number, fy: number): number {
  const a = (fx - view.w / 2) * view.scale;
  const b = (fy - view.h / 2) * view.scale;
  return view.cx + (view.rotated ? b : a);
}

/** Field point -> screen y in CSS pixels (camera shake excluded). */
export function toScreenY(view: View, fx: number, fy: number): number {
  const a = (fx - view.w / 2) * view.scale;
  const b = (fy - view.h / 2) * view.scale;
  return view.cy + (view.rotated ? -a : b);
}

/** Screen point in CSS pixels -> the field's long-axis coordinate. */
export function screenToFieldX(view: View, sx: number, sy: number): number {
  const ux = (sx - view.cx) / view.scale;
  const uy = (sy - view.cy) / view.scale;
  return (view.rotated ? -uy : ux) + view.w / 2;
}

/** Screen point in CSS pixels -> the field's cross-axis coordinate. */
export function screenToFieldY(view: View, sx: number, sy: number): number {
  const ux = (sx - view.cx) / view.scale;
  const uy = (sy - view.cy) / view.scale;
  return (view.rotated ? ux : uy) + view.h / 2;
}

export function applyFieldTransform(ctx: CanvasRenderingContext2D, view: View): void {
  ctx.translate(view.cx, view.cy);
  if (view.rotated) ctx.rotate(-Math.PI / 2);
  ctx.scale(view.scale, view.scale);
  ctx.translate(-view.w / 2, -view.h / 2);
}
