/**
 * The in-match soundtrack: a small step sequencer on top of Web Audio.
 *
 * Like the effects in `audio.ts` it is synthesised on the fly - no files to
 * ship. Notes are scheduled a fraction of a second ahead on the audio clock
 * (the usual "lookahead" scheduler), driven from the engine's frame loop, so
 * timing stays tight even though frames themselves jitter.
 *
 * There are four songs, each of them nothing but data - tempo, chords, a
 * bass figure, a drum kit and the instruments that play them - read by one
 * sequencer. A boss gets the dark one, Endless the hypnotic one, and every
 * other match takes turns through the rest, so two matches in a row never
 * sound the same.
 *
 * The music also *listens*. The engine hands it an energy - how hot the
 * rally is running - and whether the match is one point from over, and the
 * song answers with layers rather than by changing tune: the band opens up
 * as a rally heats, double-time hats and a shimmer come in, a crash marks the
 * bar when it is on fire, and match point brings a heartbeat under all of it
 * and a riser into every phrase.
 */

import { AUDIO_MIX } from './audioMix';

/** How far ahead of the audio clock notes are queued. */
const LOOKAHEAD = 0.3;
/** Kept well under the effects, so a hit is always heard over the band. */
const MUSIC_GAIN = AUDIO_MIX.music;
/** The music's low-pass when nothing is muffling it: effectively open. */
const OPEN_CUTOFF = 20000;
const STEPS_PER_BAR = 16;
const BARS_PER_SECTION = 4;
/** Brightness at zero energy, and how many octaves the energy opens on top. */
const CALM_CUTOFF = 4800;
const ENERGY_OCTAVES = 2;

export type SongId = 'neon' | 'horizon' | 'pulse' | 'showdown';

interface Chord {
  /** MIDI note of the bass root. */
  readonly root: number;
  /** MIDI notes of the voicing the pad and arpeggio use. */
  readonly notes: readonly number[];
}

interface Section {
  readonly chords: readonly Chord[];
  readonly drums: boolean;
  readonly arp: boolean;
  readonly lead: boolean;
  /** Kick on the driving pattern instead of the relaxed one. */
  readonly drive: boolean;
}

interface Song {
  readonly id: SongId;
  readonly bpm: number;
  /** Fraction of a step every off-beat sixteenth is pushed late. */
  readonly swing: number;
  /** Played once at the start of every match, then {@link Song.loop} repeats. */
  readonly intro: Section;
  readonly loop: readonly Section[];
  readonly lead: {
    readonly scale: readonly number[];
    readonly wave: OscillatorType;
    readonly gain: number;
    /** Chance an off-beat eighth sounds; strong beats nearly always do. */
    readonly density: number;
  };
  readonly arp: {
    /** Indexes into the chord's notes, cycled. */
    readonly order: readonly number[];
    /** Steps between notes: 1 is sixteenths, 2 eighths. */
    readonly every: 1 | 2;
    readonly wave: OscillatorType;
    readonly gain: number;
    readonly octave: number;
    /** Low-pass on each note, for the buzzier waves. 0 leaves it open. */
    readonly cutoff: number;
  };
  readonly bass: {
    /** Sixteenth-note positions the bass plays on, and whether it jumps an octave. */
    readonly pattern: readonly (readonly [number, boolean])[];
    readonly wave: OscillatorType;
    readonly gain: number;
    readonly cutoff: number;
    /** Length of a note, in steps. */
    readonly length: number;
  };
  readonly pad: { readonly gain: number };
  readonly drums: {
    readonly kick: readonly number[];
    readonly drive: readonly number[];
    readonly snare: readonly number[];
    /** Layer a clap on every snare. */
    readonly clap: boolean;
    /** Steps an open hat rings on. */
    readonly open: readonly number[];
  };
}

// ------------------------------------------------------------------ chords

const chord = (root: number, ...notes: number[]): Chord => ({ root, notes });

// A minor, for Neon.
const Am = chord(45, 57, 60, 64);
const F = chord(41, 57, 60, 65);
const C = chord(48, 55, 60, 64);
const G = chord(43, 55, 59, 62);
const Em = chord(40, 55, 59, 64);
const Dm = chord(38, 57, 62, 65);

// C major, voiced higher and wider, for Horizon.
const hC = chord(48, 60, 64, 67);
const hG = chord(43, 59, 62, 67);
const hAm = chord(45, 60, 64, 69);
const hF = chord(41, 60, 65, 69);
const hEm = chord(40, 59, 64, 67);
const hFmaj7 = chord(41, 64, 65, 69);

// E minor, for Pulse.
const pEm = chord(40, 55, 59, 64);
const pC = chord(36, 55, 60, 64);
const pD = chord(38, 57, 62, 66);
const pBm = chord(35, 54, 59, 62);
const pAm = chord(45, 57, 60, 64);

// D harmonic minor, for Showdown - the A major is what makes it menacing.
const sDm = chord(38, 57, 62, 65);
const sBb = chord(34, 58, 62, 65);
const sGm = chord(43, 55, 58, 62);
const sA = chord(45, 57, 61, 64);
const sC = chord(36, 55, 60, 64);

const section = (
  chords: readonly Chord[],
  drums: boolean,
  arp: boolean,
  lead: boolean,
  drive: boolean
): Section => ({ chords, drums, arp, lead, drive });

// ------------------------------------------------------------------- songs

const SONGS: Readonly<Record<SongId, Song>> = {
  /** The original: minor, mid-tempo, a little wistful. */
  neon: {
    id: 'neon',
    bpm: 108,
    swing: 0,
    intro: section([Am, F, C, G], false, true, false, false),
    loop: [
      section([Am, F, C, G], true, true, false, false),
      section([Am, F, C, G], true, true, true, false),
      section([F, G, Em, Am], true, true, true, true),
      section([Dm, Am, F, G], true, false, true, true),
      section([F, G, C, Am], false, true, false, false)
    ],
    lead: {
      scale: [69, 72, 74, 76, 79, 81, 84, 86, 88],
      wave: 'square',
      gain: 0.028,
      density: 0.4
    },
    arp: { order: [0, 1, 2, 1], every: 2, wave: 'triangle', gain: 0.045, octave: 12, cutoff: 0 },
    bass: {
      pattern: [
        [0, false],
        [3, false],
        [6, true],
        [8, false],
        [10, false],
        [14, true]
      ],
      wave: 'sawtooth',
      gain: 0.16,
      cutoff: 900,
      length: 2.4
    },
    pad: { gain: 0.05 },
    drums: { kick: [0, 8, 10], drive: [0, 4, 8, 12], snare: [4, 12], clap: false, open: [] }
  },

  /** Major and open-skied: the Journey's and the daily's song. */
  horizon: {
    id: 'horizon',
    bpm: 100,
    swing: 0.12,
    intro: section([hC, hG, hAm, hFmaj7], false, true, false, false),
    loop: [
      section([hC, hG, hAm, hF], true, true, false, false),
      section([hC, hG, hAm, hF], true, true, true, false),
      section([hF, hG, hEm, hAm], true, true, true, true),
      section([hF, hG, hC, hC], true, false, true, true),
      section([hAm, hFmaj7, hC, hG], false, true, false, false)
    ],
    lead: {
      scale: [72, 74, 76, 79, 81, 84, 86, 88, 91],
      wave: 'triangle',
      gain: 0.04,
      density: 0.45
    },
    arp: { order: [0, 1, 2, 1], every: 2, wave: 'sine', gain: 0.06, octave: 12, cutoff: 0 },
    bass: {
      pattern: [
        [0, false],
        [4, false],
        [7, true],
        [8, false],
        [12, false],
        [14, true]
      ],
      wave: 'sawtooth',
      gain: 0.14,
      cutoff: 1100,
      length: 2.6
    },
    pad: { gain: 0.055 },
    drums: { kick: [0, 7, 8], drive: [0, 4, 8, 12], snare: [4, 12], clap: true, open: [6, 14] }
  },

  /** Minimal and hypnotic: sixteenth arps over four on the floor, for Endless and the Gauntlet. */
  pulse: {
    id: 'pulse',
    bpm: 118,
    swing: 0,
    intro: section([pEm, pEm, pC, pD], false, true, false, false),
    loop: [
      section([pEm, pEm, pC, pD], true, true, false, true),
      section([pEm, pEm, pC, pD], true, true, true, true),
      section([pC, pD, pBm, pEm], true, true, true, true),
      section([pAm, pC, pD, pEm], true, true, false, true),
      section([pEm, pC, pEm, pD], false, true, true, false)
    ],
    lead: {
      scale: [64, 67, 69, 71, 74, 76, 79, 81, 83],
      wave: 'triangle',
      gain: 0.034,
      density: 0.3
    },
    arp: {
      order: [0, 1, 2, 1, 0, 2, 1, 2],
      every: 1,
      wave: 'square',
      gain: 0.026,
      octave: 12,
      cutoff: 2600
    },
    bass: {
      pattern: [
        [0, false],
        [2, true],
        [4, false],
        [6, true],
        [8, false],
        [10, true],
        [12, false],
        [14, true]
      ],
      wave: 'sawtooth',
      gain: 0.13,
      cutoff: 700,
      length: 1.5
    },
    pad: { gain: 0.04 },
    drums: { kick: [0, 4, 8, 12], drive: [0, 4, 8, 12], snare: [4, 12], clap: true, open: [2, 10] }
  },

  /** Every boss walks on to this: harmonic minor, a galloping bass and no let-up. */
  showdown: {
    id: 'showdown',
    bpm: 126,
    swing: 0,
    intro: section([sDm, sDm, sBb, sA], false, true, false, false),
    loop: [
      section([sDm, sBb, sGm, sA], true, true, false, true),
      section([sDm, sBb, sGm, sA], true, true, true, true),
      section([sGm, sA, sDm, sDm], true, false, true, true),
      section([sBb, sC, sA, sA], true, true, true, true),
      section([sDm, sBb, sGm, sA], false, true, false, false)
    ],
    lead: {
      scale: [62, 64, 65, 67, 69, 70, 73, 74, 76, 77],
      wave: 'square',
      gain: 0.03,
      density: 0.5
    },
    arp: { order: [0, 2, 1, 2], every: 2, wave: 'sawtooth', gain: 0.034, octave: 12, cutoff: 1800 },
    bass: {
      pattern: [
        [0, false],
        [2, false],
        [3, false],
        [4, false],
        [6, true],
        [8, false],
        [10, false],
        [11, false],
        [12, false],
        [14, true]
      ],
      wave: 'sawtooth',
      gain: 0.15,
      cutoff: 1300,
      length: 1.3
    },
    pad: { gain: 0.045 },
    drums: { kick: [0, 8, 10], drive: [0, 4, 8, 10, 12], snare: [4, 12], clap: true, open: [14] }
  }
};

/** Songs an ordinary match takes turns through. */
const ROTATION: readonly SongId[] = ['neon', 'horizon', 'pulse'];

/** Small deterministic RNG, so a phrase sounds the same each time it comes round. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export class Music {
  private readonly bus: GainNode;
  private readonly noise: AudioBuffer;
  private song: Song = SONGS.neon;
  private step = 0;
  private nextTime = 0;
  private playing = false;
  /** The lead line for the bar being scheduled: step -> MIDI note. */
  private phrase = new Map<number, number>();
  private readonly context: AudioContext;
  /** The highest cutoff this device's sample rate can take: "fully open". */
  private readonly open: number;
  private readonly muffle: BiquadFilterNode;
  /** Opens as the rally heats: a calm song is a warmer, darker one. */
  private readonly tone: BiquadFilterNode;
  private readonly ducker: GainNode;
  /** Audio-clock times of the last few scheduled beats, for {@link pulse}. */
  private readonly beats = new Float64Array(8);
  private beatHead = 0;
  /** Smoothed 0..1 heat of the play, and where it is heading. */
  private energy = 0;
  private targetEnergy = 0;
  private tension = false;
  private lastUpdate = 0;
  private toneSet = -1;
  private duckUntil = 0;
  /** Where the rotation last stopped, so a new match never repeats the song. */
  private rotation = Math.floor(Math.random() * ROTATION.length);

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context;
    this.open = Math.min(OPEN_CUTOFF, context.sampleRate * 0.45);
    // The low-pass and the second gain are only for {@link duck}; the tone
    // filter is the energy's.
    this.muffle = context.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = this.open;
    this.tone = context.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = CALM_CUTOFF;
    this.tone.Q.value = 0.4;
    this.ducker = context.createGain();
    this.muffle.connect(this.tone);
    this.tone.connect(this.ducker);
    this.ducker.connect(destination);

    this.bus = context.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(this.muffle);

    const length = Math.floor(context.sampleRate * 1.2);
    this.noise = context.createBuffer(1, length, context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  /**
   * Pick the song for the match about to start. A boss always gets its own;
   * `null` takes the next one in the rotation, so no two ordinary matches in
   * a row share a tune.
   */
  choose(id: SongId | null): void {
    if (id) {
      this.song = SONGS[id];
    } else {
      this.rotation = (this.rotation + 1) % ROTATION.length;
      this.song = SONGS[ROTATION[this.rotation]!];
    }
    this.restart();
  }

  /**
   * How hot the play is, 0..1, and whether one point would end the match.
   * Call it every frame; the song eases towards it rather than jumping.
   */
  setMood(energy: number, tension: boolean): void {
    this.targetEnergy = Math.min(1, Math.max(0, energy));
    this.tension = tension;
  }

  /**
   * Pull the band down and under water for `hold` seconds, then let it back
   * up. An ultimate does this: for a moment the court is louder than the song.
   */
  duck(hold: number): void {
    const t = this.context.currentTime;
    this.duckUntil = Math.max(this.duckUntil, t + Math.max(0.08, hold));
    const gain = this.ducker.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(AUDIO_MIX.duckLevel, t + 0.04);
    gain.setValueAtTime(AUDIO_MIX.duckLevel, this.duckUntil);
    gain.linearRampToValueAtTime(1, this.duckUntil + AUDIO_MIX.duckRelease);

    const cutoff = this.muffle.frequency;
    cutoff.cancelScheduledValues(t);
    cutoff.setValueAtTime(cutoff.value, t);
    const muffled = Math.min(this.open, AUDIO_MIX.duckCutoff);
    cutoff.exponentialRampToValueAtTime(muffled, t + 0.06);
    cutoff.setValueAtTime(muffled, this.duckUntil);
    cutoff.exponentialRampToValueAtTime(this.open, this.duckUntil + AUDIO_MIX.duckRelease);
  }

  /** Back to the top of the song - called when a new match starts. */
  restart(): void {
    const now = this.context.currentTime;
    this.duckUntil = 0;
    this.ducker.gain.cancelScheduledValues(now);
    this.ducker.gain.setTargetAtTime(1, now, 0.04);
    this.muffle.frequency.cancelScheduledValues(now);
    this.muffle.frequency.setTargetAtTime(this.open, now, 0.04);
    this.step = 0;
    this.nextTime = 0;
    this.beats.fill(0);
    this.energy = 0;
    this.targetEnergy = 0;
    this.tension = false;
  }

  /**
   * 0..1: how close `now` is to the beat that just went by. The scheduler
   * already knows when every beat lands, so the visuals can pulse in time
   * without listening to the output at all.
   */
  pulse(now: number): number {
    if (!this.playing) return 0;
    let latest = 0;
    for (const beat of this.beats) if (beat <= now && beat > latest) latest = beat;
    if (latest <= 0) return 0;
    return Math.exp(-(now - latest) * 7);
  }

  /**
   * Fade the music in or out, and queue whatever falls inside the lookahead.
   * Call it every frame.
   */
  update(on: boolean): void {
    const now = this.context.currentTime;
    if (on !== this.playing) {
      this.playing = on;
      this.bus.gain.cancelScheduledValues(now);
      this.bus.gain.setTargetAtTime(on ? MUSIC_GAIN : 0, now, on ? 0.35 : 0.12);
    }

    // The energy eases in over a second or two and falls away faster, so a
    // rally builds the song up and a point lets it breathe out again.
    const dt = Math.min(0.25, Math.max(0, now - this.lastUpdate));
    this.lastUpdate = now;
    const rate = this.targetEnergy > this.energy ? 0.9 : 2.2;
    this.energy += (this.targetEnergy - this.energy) * Math.min(1, dt * rate);
    const cutoff = CALM_CUTOFF * Math.pow(2, this.energy * ENERGY_OCTAVES);
    if (Math.abs(cutoff - this.toneSet) > 40) {
      this.toneSet = cutoff;
      this.tone.frequency.setTargetAtTime(Math.min(this.open, cutoff), now, 0.15);
    }

    if (!on) return;

    // First bar, or the loop stalled (hidden tab, long pause): pick up from now.
    if (this.nextTime < now) this.nextTime = now + 0.06;
    const stepLength = 60 / this.song.bpm / 4;
    while (this.nextTime < now + LOOKAHEAD) {
      const late = this.step % 2 === 1 ? this.song.swing * stepLength : 0;
      this.schedule(this.step, this.nextTime + late, stepLength);
      this.nextTime += stepLength;
      this.step++;
    }
  }

  // ----------------------------------------------------------- sequencing

  private sectionAt(bar: number): { section: Section; index: number; pass: number } {
    const block = Math.floor(bar / BARS_PER_SECTION);
    if (block === 0) return { section: this.song.intro, index: -1, pass: 0 };
    const loop = this.song.loop;
    const index = (block - 1) % loop.length;
    return { section: loop[index]!, index, pass: Math.floor((block - 1) / loop.length) };
  }

  private schedule(step: number, t: number, stepLength: number): void {
    const song = this.song;
    const bar = Math.floor(step / STEPS_PER_BAR);
    const s = step % STEPS_PER_BAR;
    const { section, index, pass } = this.sectionAt(bar);
    const barInSection = bar % BARS_PER_SECTION;
    const chord = section.chords[barInSection]!;
    const barLength = stepLength * STEPS_PER_BAR;
    const energy = this.energy;
    if (s % 4 === 0) {
      this.beats[this.beatHead] = t;
      this.beatHead = (this.beatHead + 1) % this.beats.length;
    }

    if (s === 0) {
      this.pad(chord, t, barLength);
      if (section.lead) {
        this.phrase = this.writePhrase(chord, index * 17 + barInSection + (pass % 2) * 101);
      }
      // On fire: a crash to open every bar the band is playing through.
      if (energy > 0.82 && section.drums) this.crash(t, 0.1 * (energy - 0.5));
      // Match point: a riser into every phrase, so the next point feels close.
      if (this.tension && barInSection === BARS_PER_SECTION - 1) this.riser(t, barLength);
    }

    for (const [at, up] of song.bass.pattern) {
      if (at === s) {
        this.bass(chord.root + (up ? 12 : 0), t, stepLength * song.bass.length * (up ? 0.7 : 1));
      }
    }

    const arp = song.arp;
    if (section.arp && s % arp.every === 0) {
      const slot = (s / arp.every) % arp.order.length;
      const note = chord.notes[arp.order[slot]! % chord.notes.length]! + arp.octave;
      this.voice(
        midiToFreq(note),
        t,
        stepLength * 1.5 * arp.every,
        arp.wave,
        arp.gain * 1.2,
        0.005,
        arp.cutoff
      );
      // A shimmer an octave up and a step behind, once the rally is warm.
      if (energy > 0.55 && s % 2 === 0) {
        this.voice(
          midiToFreq(note + 12),
          t + stepLength,
          stepLength * 1.2,
          'sine',
          arp.gain * 0.55 * Math.min(1, (energy - 0.55) * 3),
          0.004,
          0
        );
      }
    }

    if (section.lead) {
      const note = this.phrase.get(s);
      if (note !== undefined) {
        this.voice(
          midiToFreq(note),
          t,
          stepLength * 2.6,
          song.lead.wave,
          song.lead.gain * 1.4,
          0.01,
          song.lead.wave === 'square' ? 3800 : 0
        );
      }
    }

    const kit = song.drums;
    if (section.drums) {
      // A hot rally pushes even a relaxed section onto the driving kick.
      const kicks = section.drive || energy > 0.6 ? kit.drive : kit.kick;
      if (kicks.includes(s)) this.kick(t);
      if (kit.snare.includes(s)) {
        this.snare(t);
        if (kit.clap) this.clap(t);
      }
      if (kit.open.includes(s)) this.openHat(t);
      else if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.05 : 0.025);
      // A warm rally doubles the hats up to sixteenths.
      else if (energy > 0.35) this.hat(t, 0.022 * Math.min(1, (energy - 0.35) * 2.5));
      // A little fill into the next section - a roll, when the rally is hot.
      if (barInSection === BARS_PER_SECTION - 1 && s >= (energy > 0.7 ? 10 : 13)) {
        this.snare(t, energy > 0.7 ? 0.045 + (s - 10) * 0.008 : 0.06);
      }
    } else if (s % 4 === 2) {
      this.hat(t, 0.018);
    }

    // Match point: a heartbeat under everything, lub-dub, once a bar.
    if (this.tension && (s === 0 || s === 3)) this.heartbeat(t, s === 0 ? 0.3 : 0.2);
  }

  /** A short, repeatable melodic idea for one bar, leaning on the chord's own tones. */
  private writePhrase(chord: Chord, seed: number): Map<number, number> {
    const random = mulberry32(seed + this.song.bpm);
    const { scale, density } = this.song.lead;
    const phrase = new Map<number, number>();
    const tones = new Set(chord.notes.map((note) => note % 12));
    const fits = scale.filter((note) => tones.has(note % 12));
    let position = Math.floor(random() * scale.length);
    for (let s = 0; s < STEPS_PER_BAR; s += 2) {
      // Strong beats almost always sound; off-beats only sometimes.
      if (random() > (s % 4 === 0 ? 0.85 : density)) continue;
      position = Math.max(
        0,
        Math.min(scale.length - 1, position + Math.round((random() - 0.5) * 4))
      );
      const onBeat = s % 8 === 0 && fits.length > 0;
      phrase.set(s, onBeat ? fits[Math.floor(random() * fits.length)]! : scale[position]!);
    }
    return phrase;
  }

  // ---------------------------------------------------------- instruments

  private voice(
    freq: number,
    t: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    attack: number,
    cutoff: number
  ): void {
    if (gain <= 0.0001) return;
    const osc = this.context.createOscillator();
    const env = this.context.createGain();
    const nodes: AudioNode[] = [osc, env];
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (cutoff > 0) {
      const filter = this.context.createBiquadFilter();
      nodes.push(filter);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cutoff, t);
      osc.connect(filter);
      filter.connect(env);
    } else {
      osc.connect(env);
    }
    env.connect(this.bus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    osc.onended = () => nodes.forEach((node) => node.disconnect());
  }

  private pad(chord: Chord, t: number, dur: number): void {
    const gain = this.song.pad.gain;
    for (const note of chord.notes) {
      // Two slightly detuned voices per note make it breathe instead of buzz.
      this.voice(midiToFreq(note) * 0.998, t, dur * 1.05, 'sine', gain, 0.4, 0);
      this.voice(midiToFreq(note) * 1.002, t, dur * 1.05, 'triangle', gain * 0.5, 0.4, 0);
    }
  }

  private bass(note: number, t: number, dur: number): void {
    const spec = this.song.bass;
    const osc = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const env = this.context.createGain();
    osc.type = spec.wave;
    osc.frequency.setValueAtTime(midiToFreq(note), t);
    filter.type = 'lowpass';
    // A hot rally lets a little more of the growl through.
    filter.frequency.setValueAtTime(spec.cutoff * (1 + this.energy * 0.6), t);
    filter.frequency.exponentialRampToValueAtTime(220, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(spec.gain * 0.85, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter);
    filter.connect(env);
    env.connect(this.bus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    osc.onended = () => [osc, filter, env].forEach((node) => node.disconnect());
  }

  private kick(t: number): void {
    const osc = this.context.createOscillator();
    const env = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.26, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(env);
    env.connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.25);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  /** A soft, low double thump - the match-point heartbeat. */
  private heartbeat(t: number, gain: number): void {
    const osc = this.context.createOscillator();
    const env = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(env);
    env.connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.32);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  private noiseHit(
    t: number,
    dur: number,
    gain: number,
    type: BiquadFilterType,
    freq: number,
    to = 0
  ): void {
    // Too quiet to hear, and an exponential ramp cannot start from nothing.
    if (gain < 0.0005) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const env = this.context.createGain();
    source.buffer = this.noise;
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (to > 0) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.002, dur * 0.5));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    source.connect(filter);
    filter.connect(env);
    env.connect(this.bus);
    // A random start, so two hits in a row are never the same hiss.
    const offset = Math.random() * Math.max(0, this.noise.duration - dur - 0.05);
    source.start(t, offset);
    source.stop(t + dur + 0.02);
    source.onended = () => [source, filter, env].forEach((node) => node.disconnect());
  }

  private snare(t: number, gain = 0.1): void {
    this.noiseHit(t, 0.14, gain, 'bandpass', 1800);
  }

  /** Three hands a hair apart, the way a clap actually lands. */
  private clap(t: number): void {
    for (let i = 0; i < 3; i++)
      this.noiseHit(t + i * 0.009, 0.05 + i * 0.03, 0.05, 'bandpass', 1300);
  }

  private hat(t: number, gain: number): void {
    this.noiseHit(t, 0.04, gain, 'highpass', 7000);
  }

  private openHat(t: number): void {
    this.noiseHit(t, 0.22, 0.03, 'highpass', 6500);
  }

  private crash(t: number, gain: number): void {
    this.noiseHit(t, 1.1, Math.max(0.01, gain), 'highpass', 4200);
  }

  /** A noise sweep climbing across a whole bar into the next phrase. */
  private riser(t: number, length: number): void {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const env = this.context.createGain();
    source.buffer = this.noise;
    source.loop = true;
    filter.type = 'bandpass';
    filter.Q.value = 3;
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(6000, t + length);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.05, t + length * 0.95);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length + 0.04);
    source.connect(filter);
    filter.connect(env);
    env.connect(this.bus);
    source.start(t);
    source.stop(t + length + 0.08);
    source.onended = () => [source, filter, env].forEach((node) => node.disconnect());
  }
}
