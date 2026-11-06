export const RUN_FORMATS = ['sprint', 'expedition', 'endless'] as const;
export type RunFormat = (typeof RUN_FORMATS)[number];
export const RUN_HISTORY = 40;
export const MAX_RUN_DEPTH = Number.MAX_SAFE_INTEGER - 100;
/**
 * Acts an Endless run must complete before it counts as a Gauntlet clear: the
 * same three-act climb a Sprint clears, at Endless' six encounters an act.
 * A run counts once - a Sprint or Expedition continued into Endless has
 * already cleared, and starts past this act.
 */
export const ENDLESS_CLEAR_ACTS = 3;
const SPRINT_LENGTH = 9;
const SPRINT_ACTS = 3;
const ENDLESS_ACT = 6;

type RunShape = { stage: number; format?: RunFormat; actOffset?: number };

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

/**
 * Acts a continued run had already climbed before its first Endless act.
 *
 * A cleared Sprint continues at stage nine, after three acts of three. Its
 * six-encounter Endless acts therefore start three stages past a multiple of
 * six - the only way an Endless run gets that offset - and without this the
 * continuation would count from Endless' second act and drop its opponents
 * back to that band. An Expedition ends on an act boundary of six and needs
 * no correction.
 */
function continuedActs(run: Omit<RunShape, 'stage'>): number {
  return run.format === 'endless' && (run.actOffset ?? 0) === SPRINT_LENGTH % ENDLESS_ACT
    ? SPRINT_ACTS - Math.floor(SPRINT_LENGTH / ENDLESS_ACT)
    : 0;
}

export function actIndex(run: RunShape, stage = run.stage): number {
  return Math.floor((stage - (run.actOffset ?? 0)) / actLength(run)) + continuedActs(run);
}
/** The first stage of `act`: the inverse of {@link actIndex}. */
export function actStart(run: Omit<RunShape, 'stage'>, act: number): number {
  return (act - continuedActs(run)) * actLength(run) + (run.actOffset ?? 0);
}
export function atBoundary(run: RunShape): boolean {
  return (run.stage - (run.actOffset ?? 0)) % actLength(run) === 0;
}

/**
 * Has this run cleared the Gauntlet? A finite run by winning its final
 * encounter; an Endless run by completing {@link ENDLESS_CLEAR_ACTS} acts, or
 * by continuing a run that had already cleared.
 */
export function runCleared(run: RunShape & { finished: boolean; won: boolean }): boolean {
  if (run.format !== 'endless') return run.finished && run.won;
  return actIndex(run) >= ENDLESS_CLEAR_ACTS;
}
