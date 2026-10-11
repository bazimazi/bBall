/** Canvas density follows sustained frame delivery, never system motion preferences. */
export class AdaptiveCanvasQuality {
  ratio = 1.5;
  private elapsed = 0;
  private frames = 0;
  private slow = 0;
  private healthy = 0;

  reset(): void {
    this.elapsed = this.frames = this.slow = this.healthy = 0;
  }

  /** Ignore interruptions; require sustained pressure and recover much more slowly. */
  sample(intervalMs: number): boolean {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 || intervalMs >= 1000) {
      this.reset();
      return false;
    }
    this.elapsed += intervalMs;
    this.frames++;
    if (intervalMs > 22) this.slow++;
    this.healthy = intervalMs <= 18 ? this.healthy + intervalMs : 0;
    if (this.elapsed >= 2000) {
      const overloaded = this.frames >= 4 && this.slow / this.frames >= 0.6;
      this.elapsed = this.frames = this.slow = 0;
      if (overloaded && this.ratio > 1) {
        this.ratio = Math.max(1, this.ratio - 0.25);
        this.reset();
        return true;
      }
    }
    if (this.healthy >= 10_000 && this.ratio < 2) {
      this.ratio = Math.min(2, this.ratio + 0.25);
      this.reset();
      return true;
    }
    return false;
  }
}
