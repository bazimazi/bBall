import { STORAGE_KEYS } from './constants';
import { readStored, writeStored } from './utils/storage';

const MASTER_GAIN = 0.45;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

interface Chord {
  readonly notes: readonly number[];
  readonly wave: OscillatorType;
  /** Seconds each note rings for, and the stagger between them. */
  readonly length: number;
  readonly gap: number;
  /** True to bend each note downwards - heavier, and a little menacing. */
  readonly slide?: boolean;
}

/** One chord per capstone, keyed by ability id. See {@link GameAudio.ultimate}. */
const ULTIMATE_CHORDS: Record<string, Chord> = {
  /** A snarl that falls away: four charged returns, about to be spent. */
  overload: { notes: [147, 185, 220, 294], wave: 'sawtooth', length: 0.36, gap: 0.04, slide: true },
  /** Rising and quick, the way the paddle is about to move. */
  slipstream: { notes: [294, 440, 587, 880], wave: 'triangle', length: 0.26, gap: 0.045 },
  /** Wide, flat and held - a wall going up rather than a run starting. */
  aegis: { notes: [196, 262, 330], wave: 'sine', length: 0.55, gap: 0.02 },
  /** Bright and major, arriving all at once: peak form, instantly. */
  zenith: { notes: [523, 659, 784, 1047], wave: 'triangle', length: 0.34, gap: 0.03 },
  /** Bare fifths, so the repeat underneath it is heard as a repeat. */
  echo: { notes: [262, 392, 523], wave: 'square', length: 0.24, gap: 0.07 },
  default: { notes: [196, 294, 392, 587], wave: 'sawtooth', length: 0.32, gap: 0.055 }
};

/**
 * Every sound is a short synthesised blip - no files to load, no assets to
 * ship. The context is created lazily on the first user gesture, because
 * browsers refuse to start audio before one.
 */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private mutedFlag = readStored(STORAGE_KEYS.muted, '0') === '1';

  get muted(): boolean {
    return this.mutedFlag;
  }

  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) return;
    try {
      const context = new Ctor();
      const master = context.createGain();
      master.gain.value = this.mutedFlag ? 0 : MASTER_GAIN;
      master.connect(context.destination);
      this.context = context;
      this.master = master;
    } catch {
      this.context = null;
      this.master = null;
    }
  }

  setMuted(muted: boolean): void {
    this.mutedFlag = muted;
    writeStored(STORAGE_KEYS.muted, muted ? '1' : '0');
    if (this.context && this.master) {
      const t = this.context.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(muted ? 0 : MASTER_GAIN, t, 0.02);
    }
  }

  suspend(): void {
    if (this.context?.state === 'running') void this.context.suspend();
  }

  resume(): void {
    if (this.context && !this.mutedFlag) void this.context.resume();
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
    this.master = null;
  }

  /** One short synthesised blip. */
  tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slideTo = 0,
    delay = 0
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || this.mutedFlag) return;

    const t = context.currentTime + delay;
    const osc = context.createOscillator();
    const env = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.007);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  serve(): void {
    this.tone(360, 0.07, 'sine', 0.12, 520);
  }

  hit(power: number): void {
    const f = 250 + power * 340;
    this.tone(f, 0.085, 'triangle', 0.3, f * 0.62);
    this.tone(f * 2, 0.035, 'sine', 0.08);
  }

  wall(power: number): void {
    this.tone(140 + power * 100, 0.06, 'sine', 0.18, 90);
  }

  point(won: boolean): void {
    if (won) {
      this.tone(523, 0.1, 'triangle', 0.22);
      this.tone(784, 0.16, 'triangle', 0.2, 0, 0.08);
    } else {
      this.tone(210, 0.24, 'sawtooth', 0.12, 105);
    }
  }

  combo(step: number): void {
    const base = 600 + step * 140;
    this.tone(base, 0.08, 'square', 0.09);
    this.tone(base * 1.5, 0.11, 'square', 0.08, 0, 0.06);
  }

  matchOver(won: boolean): void {
    const notes = won ? [523, 659, 784, 1047] : [440, 370, 311, 233];
    notes.forEach((note, i) => this.tone(note, 0.28, 'triangle', 0.18, 0, i * 0.1));
  }

  ui(): void {
    this.tone(640, 0.05, 'sine', 0.1);
  }

  // ------------------------------------------------------------- abilities

  /** Power Strike armed: a rising charge, so the next hit feels promised. */
  charge(): void {
    this.tone(220, 0.16, 'sawtooth', 0.12, 660);
    this.tone(440, 0.1, 'sine', 0.07, 880);
  }

  dash(): void {
    this.tone(720, 0.09, 'triangle', 0.14, 330);
  }

  /** The guard window opening - short, dry, easy to hear under a rally. */
  guard(): void {
    this.tone(980, 0.06, 'sine', 0.1, 1240);
  }

  /** A return landed inside the guard window. */
  guardHit(): void {
    this.tone(1320, 0.12, 'sine', 0.16, 1760);
    this.tone(880, 0.16, 'triangle', 0.1, 0, 0.04);
  }

  /** A charged or critical return connecting. */
  impact(charged: boolean): void {
    const base = charged ? 150 : 210;
    this.tone(base, 0.18, 'sawtooth', 0.22, base * 0.5);
    this.tone(base * 4, 0.07, 'square', 0.08);
  }

  shield(): void {
    this.tone(320, 0.14, 'sine', 0.2, 640);
    this.tone(640, 0.2, 'triangle', 0.12, 0, 0.05);
  }

  /**
   * A capstone firing. Longer and lower than anything else in the game.
   *
   * The sub-bass drop underneath is the same for all five - that is the part
   * that says "ultimate" - but the chord on top is the skill's own, so a
   * player who is watching the ball still hears *which* one went off. The
   * shapes follow the effects: Overload snarls, Aegis holds, Echo repeats.
   */
  ultimate(id: string): void {
    const chord = ULTIMATE_CHORDS[id] ?? ULTIMATE_CHORDS.default!;
    chord.notes.forEach((note, i) =>
      this.tone(note, chord.length, chord.wave, 0.14, chord.slide ? note * 0.6 : 0, i * chord.gap)
    );
    this.tone(98, 0.5, 'sine', 0.2, 60);
    // Echo is the one that answers itself - a second, quieter copy of its own
    // chord, which is exactly what the skill does to the rest of the bar.
    if (id === 'echo') {
      chord.notes.forEach((note, i) =>
        this.tone(note * 2, 0.22, 'sine', 0.06, 0, 0.32 + i * chord.gap)
      );
    }
  }

  secondChance(): void {
    this.tone(392, 0.16, 'triangle', 0.18);
    this.tone(587, 0.22, 'triangle', 0.16, 0, 0.09);
  }
}
