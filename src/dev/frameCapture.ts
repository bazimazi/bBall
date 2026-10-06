export interface FrameSample {
  timestampMs: number;
  /** Engine update and snapshot publication; excludes later React work. */
  updateMs: number;
  /** Canvas command submission; excludes raster/compositing/presentation. */
  drawMs: number;
  steps: number;
  phase: string;
}

export interface DiagnosticMatchEvent {
  kind: 'started' | 'abandoned';
  mode: string;
  stageId: string | null;
  bot: string;
  ranked: boolean;
  scoreYou: number;
  scoreBot: number;
  seconds: number;
  hits: number;
  bestRally: number;
}

export type CaptureEnd =
  'manual' | 'duration' | 'hidden' | 'context-changed' | 'sample-limit' | 'disposed';
export const MAX_CAPTURE_SAMPLES = 30_000;

export function distribution(values: readonly number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank percentiles. Preserve raw samples so another method can be used.
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]!;
  const middle = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    median: sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2,
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted[sorted.length - 1]!
  };
}

export class FrameCapture {
  readonly frames: (FrameSample & { intervalMs: number | null })[] = [];
  private previous: number | null = null;
  invalidSamples = 0;
  readonly label: string;
  readonly refreshHz: number;
  readonly seconds: number;
  readonly startedAtMs: number;

  constructor(label: string, refreshHz: number, seconds: number, startedAtMs: number) {
    if (!label.trim() || label.length > 100)
      throw new Error('Use a scenario label of 1–100 characters.');
    if (!Number.isFinite(refreshHz) || refreshHz < 30 || refreshHz > 360)
      throw new Error('Enter the expected display refresh rate, from 30 to 360 Hz.');
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 120)
      throw new Error('Capture duration must be from 1 to 120 seconds.');
    if (!Number.isFinite(startedAtMs) || startedAtMs < 0) throw new Error('Invalid capture clock.');
    this.label = label;
    this.refreshHz = refreshHz;
    this.seconds = seconds;
    this.startedAtMs = startedAtMs;
  }

  add(frame: FrameSample): CaptureEnd | null {
    if (this.frames.length >= MAX_CAPTURE_SAMPLES) return 'sample-limit';
    if (
      !Number.isFinite(frame.timestampMs) ||
      frame.timestampMs < this.startedAtMs ||
      (this.previous !== null && frame.timestampMs <= this.previous) ||
      !Number.isFinite(frame.updateMs) ||
      frame.updateMs < 0 ||
      !Number.isFinite(frame.drawMs) ||
      frame.drawMs < 0
    ) {
      this.invalidSamples++;
      return null;
    }
    const intervalMs = this.previous === null ? null : frame.timestampMs - this.previous;
    this.previous = frame.timestampMs;
    this.frames.push({ ...frame, intervalMs });
    if (this.frames.length >= MAX_CAPTURE_SAMPLES) return 'sample-limit';
    return frame.timestampMs - this.startedAtMs >= this.seconds * 1000 ? 'duration' : null;
  }

  report(endedAtMs: number, reason: CaptureEnd) {
    const phases = [...new Set(this.frames.map((frame) => frame.phase))];
    const budgetMs = 1000 / this.refreshHz;
    const summarize = (frames: typeof this.frames) => {
      const intervals = frames.flatMap((frame) =>
        frame.intervalMs === null ? [] : [frame.intervalMs]
      );
      return {
        samples: frames.length,
        sampledIntervalMs: intervals.reduce((sum, interval) => sum + interval, 0),
        frameIntervalMs: distribution(intervals),
        engineUpdateMs: distribution(frames.map((frame) => frame.updateMs)),
        canvasSubmissionMs: distribution(frames.map((frame) => frame.drawMs)),
        lateIntervals: intervals.filter((interval) => interval > budgetMs * 1.5).length,
        estimatedMissedRefreshSlots: intervals.reduce(
          (sum, interval) => sum + Math.max(0, Math.round(interval / budgetMs) - 1),
          0
        )
      };
    };
    return {
      label: this.label,
      expectedRefreshHz: this.refreshHz,
      requestedSeconds: this.seconds,
      startedAtMs: this.startedAtMs,
      endedAtMs,
      reason,
      invalidSamples: this.invalidSamples,
      summary: summarize(this.frames),
      byPhase: Object.fromEntries(
        phases.map((phase) => [
          phase,
          summarize(this.frames.filter((frame) => frame.phase === phase))
        ])
      ),
      frames: this.frames.map((frame) => ({ ...frame }))
    };
  }
}
