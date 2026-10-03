import { STORAGE_KEYS } from './constants';
import { AUDIO_MIX, mixBus, volumeGain } from './audioMix';
import { Music, type SongId } from './music';
import { Synth } from './synth';
import { readStored, writeStored } from './utils/storage';

const MASTER_GAIN = AUDIO_MIX.master;
/** Seconds the soundtrack sits ducked under a capstone. */
const ULTIMATE_DUCK = 0.8;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Semitones a rally's hits climb through: a major pentatonic, capped. */
const RALLY_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19] as const;

/** The capstones' own chords, in Hz. See {@link GameAudio.ultimate}. */
const ULTIMATE_CHORDS: Record<string, readonly number[]> = {
  overload: [147, 185, 220, 294],
  slipstream: [294, 440, 587, 880],
  aegis: [196, 262, 330, 392],
  zenith: [523, 659, 784, 1047],
  echo: [262, 392, 523],
  default: [196, 294, 392, 587]
};

/** Keep a panned sound off the very edge of the stereo field: it reads as a fault. */
const PAN_LIMIT = 0.75;

function panOf(pan: number): number {
  return Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, pan));
}

/**
 * Every sound is synthesised - blips and skills here, the soundtrack in
 * `music.ts` - so there are no files to load and no assets to ship. The
 * context is created lazily on the first user gesture, because browsers
 * refuse to start audio before one.
 *
 * The small, constant sounds (hits, walls, points) stay single blips so a
 * rally never turns to mush - but they sit where they happened, panned
 * across the stereo field with the ball, so a return from the far paddle
 * comes from the far side of the room. Skills are layered with `Synth`: a
 * transient for the moment it lands, a body for what it is, and a reverb tail
 * so it hangs in the air a beat longer than anything the ball does.
 *
 * The graph is three gains deep: a bus each for the effects and the music,
 * so each has its own volume, into a master that the mute button owns, into
 * a limiter.
 */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private synth: Synth | null = null;
  private music: Music | null = null;
  private mutedFlag = readStored(STORAGE_KEYS.muted, '0') === '1';
  private sfxVolume: number = AUDIO_MIX.effectsDefault;
  private musicVolume: number = AUDIO_MIX.musicDefault;
  private previewUntil = 0;

  get muted(): boolean {
    return this.mutedFlag;
  }

  /**
   * Keep the soundtrack running while `on`, faded out otherwise, and tell it
   * how hot the play is. Called every frame; does nothing until the first
   * gesture has unlocked the context.
   */
  updateMusic(on: boolean, energy = 0, tension = false): void {
    if (!this.music) return;
    this.music.setMood(energy, tension);
    // Muted, the master gain is already silent - skip the scheduling too.
    const preview = this.context !== null && this.context.currentTime < this.previewUntil;
    this.music.update((on || preview) && !this.mutedFlag && this.musicVolume > 0.001);
  }

  /**
   * Start the soundtrack from the top for a fresh match: `song` for a match
   * that has one of its own, or the next song in the rotation for `null`.
   */
  startMusic(song: SongId | null): void {
    this.previewUntil = 0;
    this.music?.choose(song);
  }

  /** A short soundtrack sample, controlled by the music slider and master mute. */
  previewMusic(): void {
    this.unlock();
    if (!this.context || this.mutedFlag || this.musicVolume <= 0) return;
    this.previewUntil = this.context.currentTime + 5;
    this.updateMusic(false);
  }

  stopPreview(): void {
    this.previewUntil = 0;
  }

  /** Each bus's level, 0..1. The mute button sits above both. */
  setVolumes(music: number, sfx: number): void {
    this.musicVolume = Number.isFinite(music) ? Math.max(0, Math.min(1, music)) : 0;
    this.sfxVolume = Number.isFinite(sfx) ? Math.max(0, Math.min(1, sfx)) : 0;
    if (!this.context) return;
    const t = this.context.currentTime;
    this.musicBus?.gain.setTargetAtTime(volumeGain(this.musicVolume), t, 0.05);
    this.sfxBus?.gain.setTargetAtTime(volumeGain(this.sfxVolume) * AUDIO_MIX.effects, t, 0.05);
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
      limiter.threshold.value = -6;
      limiter.knee.value = 3;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.2;
      limiter.connect(context.destination);

      const master = context.createGain();
      master.gain.value = this.mutedFlag ? 0 : MASTER_GAIN;
      master.connect(limiter);

      const sfxBus = context.createGain();
      sfxBus.gain.value = volumeGain(this.sfxVolume) * AUDIO_MIX.effects;
      sfxBus.connect(master);
      const musicBus = context.createGain();
      musicBus.gain.value = volumeGain(this.musicVolume);
      musicBus.connect(master);

      this.context = context;
      this.master = master;
      this.sfxBus = sfxBus;
      this.musicBus = musicBus;
      this.synth = new Synth(context, mixBus(context, sfxBus, false));
      this.music = new Music(context, mixBus(context, musicBus, true));
    } catch {
      this.context = null;
      this.master = null;
      this.sfxBus = null;
      this.musicBus = null;
      this.synth = null;
      this.music = null;
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
    this.previewUntil = 0;
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.synth = null;
    this.music = null;
  }

  /** The synth, or null when there is nothing to play into. */
  private get live(): Synth | null {
    return this.mutedFlag || this.sfxVolume <= 0.001 ? null : this.synth;
  }

  /** One short synthesised blip, `pan` across the stereo field. */
  tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slideTo = 0,
    delay = 0,
    pan = 0
  ): void {
    this.live?.voice({
      freq,
      to: slideTo ? Math.max(40, slideTo) : undefined,
      type,
      gain,
      dur,
      attack: 0.007,
      delay,
      ...(pan !== 0 ? { pan: panOf(pan) } : {})
    });
  }

  serve(pan = 0): void {
    this.tone(360, 0.07, 'sine', 0.12, 520, 0, pan * 0.4);
  }

  /**
   * A return. The pitch climbs a pentatonic step every other hit of the
   * rally, so a long exchange audibly winds itself up and the point that ends
   * it lands from the top of the scale.
   */
  hit(power: number, rally = 0, pan = 0): void {
    const step = RALLY_STEPS[Math.min(RALLY_STEPS.length - 1, Math.floor(rally / 2))]!;
    const strength = Math.max(0, Math.min(1, power));
    const f = Math.min(AUDIO_MIX.maxHitPitch, (250 + strength * 340) * Math.pow(2, step / 12));
    this.tone(f, 0.085, 'triangle', 0.34 + strength * 0.1, f * 0.62, 0, pan);
    this.tone(f * 2, 0.035, 'sine', 0.045, 0, 0, pan);
    // A little body under the hard ones, so pace is heard as well as seen.
    if (power > 0.55) this.tone(f * 0.5, 0.06, 'sine', 0.12 * power, f * 0.3, 0, pan);
  }

  /** A flick: the normal hit with a bright whip-crack on top. */
  flick(pan = 0): void {
    const synth = this.live;
    if (!synth) return;
    const p = panOf(pan);
    synth.voice({
      freq: 1400,
      to: 2600,
      type: 'sine',
      gain: 0.07,
      dur: 0.07,
      attack: 0.002,
      pan: p
    });
    synth.noise({
      gain: 0.06,
      dur: 0.06,
      attack: 0.002,
      filter: { type: 'highpass', freq: 4200 },
      pan: p
    });
  }

  /** A ball glancing off an arena bumper: a round, bell-like knock. */
  bumper(power: number, pan = 0): void {
    const synth = this.live;
    if (!synth) return;
    synth.bell(330 + power * 220, 0.12, 0.28, { send: 0.25, pan: panOf(pan) });
  }

  /** A brick shattering. */
  brick(pan = 0): void {
    const synth = this.live;
    if (!synth) return;
    const p = panOf(pan);
    synth.noise({
      gain: 0.1,
      dur: 0.12,
      attack: 0.002,
      filter: { type: 'bandpass', freq: 2400 },
      pan: p
    });
    synth.voice({ freq: 880, to: 440, type: 'square', gain: 0.05, dur: 0.08, pan: p });
    // Rubble: a few small ticks falling after the break.
    for (let i = 0; i < 3; i++) {
      synth.noise({
        gain: 0.03,
        dur: 0.03,
        delay: 0.05 + i * 0.04 + Math.random() * 0.02,
        filter: { type: 'bandpass', freq: 3200 - i * 600, q: 3 },
        pan: p
      });
    }
  }

  /**
   * A ball swallowed by one portal and spat out of the other: a falling warp
   * where it went in, a rising one where it came out.
   */
  portal(fromPan = 0, toPan = 0): void {
    const synth = this.live;
    if (!synth) return;
    synth.voice({
      freq: 900,
      to: 180,
      type: 'sine',
      gain: 0.12,
      dur: 0.14,
      pan: panOf(fromPan),
      send: 0.3
    });
    synth.voice({
      freq: 240,
      to: 1300,
      type: 'triangle',
      gain: 0.1,
      dur: 0.16,
      delay: 0.05,
      pan: panOf(toPan),
      send: 0.35
    });
    synth.noise({
      gain: 0.05,
      dur: 0.2,
      attack: 0.03,
      filter: { type: 'bandpass', freq: 600, to: 4000, q: 4 },
      pan: panOf(fromPan),
      panTo: panOf(toPan),
      send: 0.3
    });
  }

  /** A boss moving into its next phase: a low swell and a hit. */
  phase(): void {
    const synth = this.live;
    if (!synth) return;
    synth.stack({ freq: 98, type: 'sawtooth', gain: 0.08, dur: 0.9, attack: 0.25, send: 0.4 });
    synth.voice({ freq: 196, to: 98, type: 'triangle', gain: 0.12, dur: 0.4, delay: 0.25 });
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
    if (!this.context || !this.music || this.mutedFlag || this.musicVolume <= 0.001) return 0;
    return this.music.pulse(this.context.currentTime);
  }

  wall(power: number, pan = 0): void {
    this.tone(140 + power * 100, 0.07, 'triangle', 0.12, 90, 0, pan);
  }

  point(won: boolean, pan = 0): void {
    if (won) {
      this.tone(523, 0.1, 'triangle', 0.22, 0, 0, pan * 0.5);
      this.tone(784, 0.16, 'triangle', 0.2, 0, 0.08, pan * 0.5);
      this.tone(1047, 0.2, 'sine', 0.08, 0, 0.14, pan * 0.5);
    } else {
      this.tone(210, 0.24, 'triangle', 0.14, 105, 0, pan * 0.5);
    }
    // The ball going through the line: a soft thud of air where it happened.
    this.live?.noise({
      gain: 0.08,
      dur: 0.18,
      attack: 0.004,
      filter: { type: 'lowpass', freq: 900, to: 200 },
      pan: panOf(pan)
    });
  }

  /** A score orb landing in its pip. */
  pip(pan = 0): void {
    const synth = this.live;
    if (!synth) return;
    synth.bell(1568, 0.05, 0.3, { send: 0.3, pan: panOf(pan) });
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
    // ON FIRE and past it: the ball catches, with a whoosh of flame.
    if (step >= 2) this.ignite();
  }

  /** A roar of flame catching: a noise swell opening up, and a low body under it. */
  ignite(): void {
    const synth = this.live;
    if (!synth) return;
    synth.noise({
      gain: 0.12,
      dur: 0.5,
      attack: 0.06,
      filter: { type: 'bandpass', freq: 300, to: 2400, q: 0.8 },
      send: 0.25
    });
    synth.voice({
      freq: 90,
      to: 60,
      type: 'sawtooth',
      gain: 0.06,
      dur: 0.4,
      filter: { type: 'lowpass', freq: 400 }
    });
  }

  /**
   * Applause, from a crowd that is not there: dozens of short, band-passed
   * noise claps scattered over a second or two, swelling and dying away.
   * `strength` sets how many hands and how long they keep it up.
   */
  applause(strength = 1): void {
    const synth = this.live;
    if (!synth) return;
    const claps = Math.round(18 + strength * 42);
    const span = 0.9 + strength * 1.1;
    for (let i = 0; i < claps; i++) {
      // Front-loaded: the burst of a crowd reacting, then the tail.
      const u = Math.random();
      const delay = span * u * u;
      const swell = 1 - u * 0.7;
      synth.noise({
        gain: (0.02 + Math.random() * 0.03) * swell * (0.6 + strength * 0.4),
        dur: 0.018 + Math.random() * 0.03,
        attack: 0.001,
        delay,
        filter: { type: 'bandpass', freq: 900 + Math.random() * 1600, q: 1.4 },
        pan: (Math.random() * 2 - 1) * 0.8,
        send: 0.2
      });
    }
    // A soft bed of crowd under the claps.
    synth.noise({
      gain: 0.025 * strength,
      dur: span,
      attack: 0.15,
      filter: { type: 'bandpass', freq: 1200, q: 0.7 },
      send: 0.3
    });
  }

  /**
   * The match is over. A win gets a fanfare that climbs to a held chord and a
   * crowd behind it; a loss gets a falling line that closes down.
   */
  matchOver(won: boolean): void {
    const synth = this.live;
    if (!synth) return;
    if (won) {
      [523, 659, 784, 1047].forEach((note, i) =>
        this.tone(note, 0.28, 'triangle', 0.18, 0, i * 0.1)
      );
      [523, 659, 784].forEach((note) =>
        synth.stack(
          {
            freq: note,
            type: 'sawtooth',
            gain: 0.05,
            dur: 1.2,
            attack: 0.05,
            delay: 0.4,
            filter: { type: 'lowpass', freq: 2400, to: 900 },
            send: 0.45
          },
          10
        )
      );
      synth.bell(2093, 0.06, 1, { delay: 0.42, send: 0.6 });
    } else {
      [440, 370, 311, 233].forEach((note, i) =>
        this.tone(note, 0.28, 'triangle', 0.16, 0, i * 0.12)
      );
      synth.voice({
        freq: 233,
        to: 116,
        type: 'sawtooth',
        gain: 0.06,
        dur: 0.9,
        delay: 0.45,
        filter: { type: 'lowpass', freq: 1400, to: 200 },
        send: 0.3
      });
    }
  }

  /** The crowd and the confetti: a match won, after its replay if it had one. */
  celebrate(): void {
    this.applause(1);
  }

  /** Tape spooling back: the replay of the deciding point is starting. */
  rewind(): void {
    const synth = this.live;
    if (!synth) return;
    synth.noise({
      gain: 0.07,
      dur: 0.4,
      attack: 0.02,
      filter: { type: 'bandpass', freq: 5000, to: 500, q: 2 },
      send: 0.2
    });
    synth.voice({
      freq: 1600,
      to: 200,
      type: 'sawtooth',
      gain: 0.03,
      dur: 0.35,
      filter: { type: 'lowpass', freq: 2200 }
    });
    this.music?.duck(0.2);
  }

  ui(): void {
    this.tone(640, 0.05, 'sine', 0.1);
  }

  /** A menu button: a soft, dry tick, far quieter than anything in a match. */
  click(): void {
    const synth = this.live;
    if (!synth) return;
    synth.voice({ freq: 1250, to: 900, type: 'sine', gain: 0.045, dur: 0.035, attack: 0.002 });
    synth.noise({
      gain: 0.012,
      dur: 0.012,
      attack: 0.001,
      filter: { type: 'highpass', freq: 5000 }
    });
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
        filter: { type: 'lowpass', freq: 300, to: 2600, q: 2 }
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
      synth.voice({ freq: 150, to: 55, type: 'sine', gain: 0.3, dur: 0.26 });
      synth.voice({
        freq: 180,
        to: 60,
        type: 'sawtooth',
        gain: 0.16,
        dur: 0.24,
        filter: { type: 'lowpass', freq: 1600, to: 180 }
      });
      synth.noise({
        gain: 0.18,
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
      filter: { type: 'lowpass', freq: 2400, to: 300, q: 2.5 },
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
    synth.voice({ freq: 120, to: 45, type: 'sine', gain: 0.36, dur: 0.75, attack: 0.006 });
    synth.voice({ freq: 80, to: 48, type: 'triangle', gain: 0.14, dur: 0.6 });
    synth.noise({
      gain: 0.2,
      dur: 0.95,
      attack: 0.004,
      filter: { type: 'lowpass', freq: 6500, to: 600 },
      send: 0.35
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
          filter: { type: 'lowpass', freq: 500, to: falling ? 900 : 4500, q: 1.5 },
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
          filter: { type: 'lowpass', freq: 200, to: 1400, q: 2.5 },
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
