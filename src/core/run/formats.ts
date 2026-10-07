export const RUN_FORMATS = ['sprint', 'expedition', 'endless'] as const;
export type RunFormat = (typeof RUN_FORMATS)[number];
export const RUN_HISTORY = 40;
export const MAX_RUN_DEPTH = Number.MAX_SAFE_INTEGER - 100;
export function runLength(run: { format?: RunFormat }): number {
  return run.format === 'endless' ? Infinity : run.format === 'expedition' ? 36 : 9;
}
export function actLength(run: { format?: RunFormat }): number {
  return !run.format || run.format === 'sprint' ? 3 : 6;
}
export function runPosition(run: { stage: number; format?: RunFormat }): string {
  return run.format === 'endless'
    ? `depth ${run.stage + 1}`
    : `match ${run.stage + 1} of ${runLength(run)}`;
}

export function actIndex(
  run: { stage: number; format?: RunFormat; actOffset?: number },
  stage = run.stage
): number {
  return Math.floor((stage - (run.actOffset ?? 0)) / actLength(run));
}
export function atBoundary(run: {
  stage: number;
  format?: RunFormat;
  actOffset?: number;
}): boolean {
  return (run.stage - (run.actOffset ?? 0)) % actLength(run) === 0;
}
