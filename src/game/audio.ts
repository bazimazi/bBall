import { STORAGE_KEYS } from './constants';
import { Music } from './music';
import { Synth } from './synth';
import { readStored, writeStored } from './utils/storage';

const MASTER_GAIN = 0.45;
/** Seconds the soundtrack sits ducked under a capstone. */
const ULTIMATE_DUCK = 1.3;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** The capstones' own chords, in Hz. See {@link GameAudio.ultimate}. */
/** Semitones a rally's hits climb through: a major pentatonic, capped. */
const RALLY_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19] as const;

const ULTIMATE_CHORDS: Record<string, readonly number[]> = {
  overload: [147, 185, 220, 294],
  slipstream: [294, 440, 587, 880],
  aegis: [196, 262, 330, 392],
  zenith: [523, 659, 784, 1047],
  echo: [262, 392, 523],
  default: [196, 294, 392, 587]
};

/**
 * Every sound is synthesised - blips and skills here, the soundtrack in
 * `music.ts` - so there are no files to load and no assets to ship. The
 * context is created lazily on the first user gesture, because browsers
 * refuse to start audio before one.
 *
 * The small, constant sounds (hits, walls, points) stay single blips so a
 * rally never turns to mush. Skills are layered with `Synth`: a transient for
 * the moment it lands, a body for what it is, and a reverb tail so it hangs
 * in the air a beat longer than anything the ball does.
 */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private synth: Synth | null = null;
  private music: Music | null = null;
  private mutedFlag = readStored(STORAGE_KEYS.muted, '0') === '1';

  get muted(): boolean {
    return this.mutedFlag;
  }

  /**
   * Keep the soundtrack running while `on`, faded out otherwise. Called every
   * frame; does nothing until the first gesture has unlocked the context.
   */
  updateMusic(on: boolean): void {
    if (!this.context || !this.master) return;
    this.music ??= new Music(this.context, this.master);
    // Muted, the master gain is already silent - skip the scheduling too.
    this.music.update(on && !this.mutedFlag);
  }

  /** Start the soundtrack from the top, for a fresh match. */
  restartMusic(): void {
    this.music?.restart();
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
      // A limiter at the very end: a capstone stacked on a hit stacked on the
      // music is loud, and it should be loud - not clipped.
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 8;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.2;
      limiter.connect(context.destination);

      const master = context.createGain();
      master.gain.value = this.mutedFlag ? 0 : MASTER_GAIN;
      master.connect(limiter);
      this.context = context;
      this.master = master;
      this.synth = new Synth(context, master);
    } catch {
      this.context = null;
      this.master = null;
      this.synth = null;
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
    this.synth = null;
    this.music = null;
  }

  /** The synth, or null when there is nothing to play into. */
  private get live(): Synth | null {
    return this.mutedFlag ? null : this.synth;
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
    this.live?.voice({
      freq,
      to: slideTo ? Math.max(40, slideTo) : undefined,
      type,
      gain,
      dur,
      attack: 0.007,
      delay
    });
  }

  serve(): void {
    this.tone(360, 0.07, 'sine', 0.12, 520);
  }

  /**
   * A return. The pitch climbs a pentatonic step every other hit of the
   * rally, so a long exchange audibly winds itself up and the point that ends
   * it lands from the top of the scale.
   */
  hit(power: number, rally = 0): void {
    const step = RALLY_STEPS[Math.min(RALLY_STEPS.length - 1, Math.floor(rally / 2))]!;
    const f = (250 + power * 340) * Math.pow(2, step / 12);
    this.tone(f, 0.085, 'triangle', 0.3, f * 0.62);
    this.tone(f * 2, 0.035, 'sine', 0.08);
  }

  /** A flick: the normal hit with a bright whip-crack on top. */
  flick(): void {
    const synth = this.live;
    if (!synth) return;
    synth.voice({ freq: 1400, to: 2600, type: 'sine', gain: 0.07, dur: 0.07, attack: 0.002 });
    synth.noise({
      gain: 0.06,
      dur: 0.06,
      attack: 0.002,
      filter: { type: 'highpass', freq: 4200 }
    });
  }

  /** A ball glancing off an arena bumper: a round, bell-like knock. */
  bumper(power: number): void {
    const synth = this.live;
    if (!synth) return;
    synth.bell(330 + power * 220, 0.12, 0.28, { send: 0.25 });
  }

  /** A brick shattering. */
  brick(): void {
    const synth = this.live;
    if (!synth) return;
    synth.noise({ gain: 0.1, dur: 0.12, attack: 0.002, filter: { type: 'bandpass', freq: 2400 } });
    synth.voice({ freq: 880, to: 440, type: 'square', gain: 0.05, dur: 0.08 });
  }

  /** A boss moving into its next phase: a low swell and a hit. */
  phase(): void {
    const synth = this.live;
    if (!synth) return;
    synth.stack({ freq: 98, type: 'sawtooth', gain: 0.08, dur: 0.9, attack: 0.25, send: 0.4 });
    synth.voice({ freq: 196, to: 98, type: 'triangle', gain: 0.18, dur: 0.4, delay: 0.25 });
    this.music?.duck(0.6);
  }

  /** A star earned, rising with its index. */
  star(index: number): void {
    const synth = this.live;
    if (!synth) return;
    const base = [784, 988, 1175][Math.min(2, Math.max(0, index))]!;
    synth.bell(base, 0.12, 0.6, { send: 0.35 });
    synth.bell(base * 1.5, 0.05, 0.5, { delay: 0.05, send: 0.35 });
  }

  /**
   * 0..1, peaking on each beat of the soundtrack and decaying before the
   * next - the court pulses with the song without an analyser node.
   */
  beat(): number {
    if (!this.context || !this.music || this.mutedFlag) return 0;
    return this.music.pulse(this.context.currentTime);
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
    const synth = this.live;
    if (!synth) return;
    const base = 600 + step * 140;
    synth.voice({ freq: base, type: 'square', gain: 0.08, dur: 0.08, send: 0.15 });
    synth.voice({
      freq: base * 1.5,
      type: 'square',
      gain: 0.07,
      dur: 0.12,
      delay: 0.06,
      send: 0.2
    });
    synth.voice({ freq: base * 2, type: 'sine', gain: 0.05, dur: 0.2, delay: 0.12, send: 0.35 });
  }

  matchOver(won: boolean): void {
    const notes = won ? [523, 659, 784, 1047] : [440, 370, 311, 233];
    notes.forEach((note, i) => this.tone(note, 0.28, 'triangle', 0.18, 0, i * 0.1));
  }

  ui(): void {
    this.tone(640, 0.05, 'sine', 0.1);
  }

  // ------------------------------------------------------------- abilities

  /**
   * Blink: air torn open and snapped shut. A band-passed whoosh that flies
   * across the stereo field, a falling zap riding it, and a tick on arrival.
   */
  dash(): void {
    const synth = this.live;
    if (!synth) return;
    synth.noise({
      gain: 0.22,
      dur: 0.2,
      attack: 0.03,
      filter: { type: 'bandpass', freq: 900, to: 5200, q: 1.4 },
      pan: -0.6,
      panTo: 0.6,
      send: 0.2
    });
    synth.voice({ freq: 1400, to: 320, type: 'triangle', gain: 0.14, dur: 0.14 });
    synth.voice({ freq: 2800, to: 900, type: 'sine', gain: 0.06, dur: 0.09 });
    synth.voice({ freq: 1800, type: 'square', gain: 0.05, dur: 0.03, delay: 0.14, send: 0.25 });
  }

  /**
   * Power Strike armed: something winding up and locking. A thick, filtered
   * saw climbs two octaves, and a bright click tells you it is held.
   */
  charge(): void {
    const synth = this.live;
    if (!synth) return;
    synth.stack(
      {
        freq: 110,
        to: 440,
        type: 'sawtooth',
        gain: 0.14,
        dur: 0.3,
        attack: 0.02,
        filter: { type: 'lowpass', freq: 300, to: 3200, q: 6 }
      },
      10
    );
    synth.voice({ freq: 440, to: 1760, type: 'sine', gain: 0.06, dur: 0.28 });
    synth.noise({
      gain: 0.06,
      dur: 0.28,
      attack: 0.2,
      filter: { type: 'highpass', freq: 2000, to: 8000 }
    });
    // The lock.
    synth.voice({ freq: 1760, type: 'square', gain: 0.07, dur: 0.05, delay: 0.27, send: 0.3 });
    synth.voice({ freq: 110, to: 70, type: 'sine', gain: 0.2, dur: 0.14, delay: 0.27 });
  }

  /** The guard window opening: a clean glass ping that hangs, easy to hear under a rally. */
  guard(): void {
    const synth = this.live;
    if (!synth) return;
    synth.bell(1568, 0.1, 0.5, { send: 0.45 });
    synth.voice({ freq: 980, to: 1480, type: 'sine', gain: 0.07, dur: 0.08 });
    synth.noise({ gain: 0.04, dur: 0.03, filter: { type: 'highpass', freq: 6000 } });
  }

  /** A return landed inside the guard window: the parry. Brighter and bigger than the opening. */
  guardHit(): void {
    const synth = this.live;
    if (!synth) return;
    synth.bell(2093, 0.14, 0.9, { send: 0.5 });
    synth.bell(1047, 0.1, 0.7, { send: 0.4 });
    synth.voice({ freq: 880, to: 1760, type: 'triangle', gain: 0.1, dur: 0.14 });
    synth.noise({ gain: 0.14, dur: 0.05, filter: { type: 'bandpass', freq: 4200, q: 2 } });
  }

  /**
   * A charged or critical return connecting. Charged is a cannon - a sub drop,
   * a crack and a growl. A crit is lighter and sharper, with a metallic ring.
   */
  impact(charged: boolean): void {
    const synth = this.live;
    if (!synth) return;
    if (charged) {
      synth.voice({ freq: 150, to: 38, type: 'sine', gain: 0.42, dur: 0.38 });
      synth.voice({
        freq: 180,
        to: 60,
        type: 'sawtooth',
        gain: 0.16,
        dur: 0.24,
        filter: { type: 'lowpass', freq: 1600, to: 180 }
      });
      synth.noise({
        gain: 0.26,
        dur: 0.12,
        filter: { type: 'bandpass', freq: 1400, to: 500, q: 0.9 },
        send: 0.3
      });
    } else {
      synth.voice({ freq: 220, to: 70, type: 'sine', gain: 0.3, dur: 0.2 });
      synth.noise({ gain: 0.2, dur: 0.07, filter: { type: 'highpass', freq: 2500 } });
      synth.bell(2400, 0.07, 0.35, { send: 0.3 });
    }
  }

  /**
   * A save: a force field flaring up. A resonant filter sweeps through a
   * detuned drone, with a hum underneath and a bell on top.
   */
  shield(): void {
    const synth = this.live;
    if (!synth) return;
    synth.stack({
      freq: 220,
      type: 'sawtooth',
      gain: 0.12,
      dur: 0.45,
      attack: 0.01,
      filter: { type: 'lowpass', freq: 3000, to: 300, q: 10 },
      send: 0.35
    });
    synth.voice({ freq: 110, to: 90, type: 'sine', gain: 0.2, dur: 0.4 });
    synth.voice({ freq: 440, to: 880, type: 'triangle', gain: 0.08, dur: 0.22 });
    synth.bell(1320, 0.07, 0.6, { delay: 0.04, send: 0.5 });
  }

  /** A lost point handed back: a quick rising sparkle, like time running backwards. */
  secondChance(): void {
    const synth = this.live;
    if (!synth) return;
    synth.noise({
      gain: 0.08,
      dur: 0.3,
      attack: 0.25,
      filter: { type: 'bandpass', freq: 600, to: 5000, q: 2 },
      send: 0.3
    });
    [392, 523, 659, 784, 1047].forEach((note, i) =>
      synth.voice({
        freq: note,
        type: 'triangle',
        gain: 0.1,
        dur: 0.24,
        delay: i * 0.05,
        send: 0.4
      })
    );
    synth.bell(1568, 0.07, 0.8, { delay: 0.25, send: 0.6 });
  }

  /**
   * A capstone firing. The biggest thing the game can say, and it says it
   * three ways at once.
   *
   * The *hit* is the same for all five: a sub-bass drop, a crash washing
   * through a closing filter, and the soundtrack ducking under water for a
   * moment - that is the part that says "ultimate". The *voice* on top is the
   * skill's own chord, a wide detuned stack opening up. The *signature* after
   * it follows the effect, so a player watching the ball still hears which one
   * went off: Overload charges four times, Slipstream rushes past, Aegis rings
   * and holds, Zenith sparkles upwards, Echo answers itself.
   */
  ultimate(id: string): void {
    const synth = this.live;
    if (!synth) return;
    this.music?.duck(ULTIMATE_DUCK);

    // The hit.
    synth.voice({ freq: 120, to: 30, type: 'sine', gain: 0.55, dur: 1.1, attack: 0.004 });
    synth.voice({ freq: 60, to: 34, type: 'triangle', gain: 0.25, dur: 0.9 });
    synth.noise({
      gain: 0.3,
      dur: 1.4,
      attack: 0.004,
      filter: { type: 'lowpass', freq: 9000, to: 400 },
      send: 0.6
    });
    synth.noise({ gain: 0.2, dur: 0.05, filter: { type: 'highpass', freq: 3000 } });

    // The voice.
    const chord = ULTIMATE_CHORDS[id] ?? ULTIMATE_CHORDS.default!;
    const falling = id === 'overload';
    chord.forEach((note, i) =>
      synth.stack(
        {
          freq: note,
          to: falling ? note * 0.6 : undefined,
          type: 'sawtooth',
          gain: 0.09,
          dur: 1.1,
          attack: 0.02,
          delay: i * 0.03,
          filter: { type: 'lowpass', freq: 500, to: falling ? 900 : 6000, q: 4 },
          send: 0.5
        },
        16
      )
    );

    // The signature.
    switch (id) {
      case 'overload':
        // Four charges stacking up - one per charged return it hands you.
        for (let i = 0; i < 4; i++) {
          const t = 0.18 + i * 0.1;
          synth.voice({
            freq: 220 * (1 + i * 0.25),
            to: 880,
            type: 'square',
            gain: 0.07,
            dur: 0.08,
            delay: t
          });
          synth.noise({
            gain: 0.1,
            dur: 0.06,
            delay: t,
            filter: { type: 'bandpass', freq: 1800 + i * 600, q: 3 }
          });
        }
        synth.voice({
          freq: 55,
          to: 40,
          type: 'sawtooth',
          gain: 0.14,
          dur: 0.9,
          filter: { type: 'lowpass', freq: 300 }
        });
        break;

      case 'slipstream':
        // A jet going past: a long whoosh flying left to right, pitch climbing with it.
        synth.noise({
          gain: 0.26,
          dur: 0.9,
          attack: 0.15,
          filter: { type: 'bandpass', freq: 300, to: 7000, q: 1.6 },
          pan: -0.9,
          panTo: 0.9,
          send: 0.4
        });
        synth.voice({
          freq: 300,
          to: 2400,
          type: 'triangle',
          gain: 0.08,
          dur: 0.7,
          pan: -0.7,
          panTo: 0.7
        });
        [587, 880, 1175, 1760].forEach((note, i) =>
          synth.voice({
            freq: note,
            type: 'triangle',
            gain: 0.07,
            dur: 0.18,
            delay: 0.25 + i * 0.06,
            send: 0.4
          })
        );
        break;

      case 'aegis':
        // A wall going up: a deep resonant hum that holds, and a great bell struck once.
        synth.stack({
          freq: 98,
          type: 'sawtooth',
          gain: 0.14,
          dur: 1.6,
          attack: 0.08,
          filter: { type: 'lowpass', freq: 200, to: 1400, q: 12 },
          send: 0.4
        });
        synth.bell(784, 0.16, 2.2, { delay: 0.08, send: 0.7 });
        synth.bell(1175, 0.08, 1.6, { delay: 0.12, send: 0.7 });
        break;

      case 'zenith':
        // Peak form: a bright run straight to the top, and glitter hanging after it.
        [1047, 1319, 1568, 2093, 2637].forEach((note, i) =>
          synth.voice({
            freq: note,
            type: 'triangle',
            gain: 0.08,
            dur: 0.3,
            delay: 0.1 + i * 0.045,
            send: 0.55
          })
        );
        synth.bell(3136, 0.05, 1.2, { delay: 0.35, send: 0.8 });
        synth.noise({
          gain: 0.08,
          dur: 1,
          attack: 0.2,
          delay: 0.1,
          filter: { type: 'highpass', freq: 6000, to: 10000 },
          send: 0.5
        });
        break;

      case 'echo':
        // The chord again, and again - quieter, higher, bouncing ear to ear -
        // exactly what the skill does to the rest of the bar.
        for (let repeat = 1; repeat <= 4; repeat++) {
          const level = Math.pow(0.6, repeat);
          const side = repeat % 2 === 0 ? 0.7 : -0.7;
          chord.forEach((note) =>
            synth.voice({
              freq: note * 2,
              type: 'square',
              gain: 0.07 * level,
              dur: 0.22,
              delay: repeat * 0.2,
              pan: side,
              filter: { type: 'lowpass', freq: 3000 - repeat * 500 },
              send: 0.4
            })
          );
        }
        break;
    }
  }
}
