/**
 * The in-match soundtrack: a small step sequencer on top of Web Audio.
 *
 * Like the effects in `audio.ts` it is synthesised on the fly - no files to
 * ship. Notes are scheduled a fraction of a second ahead on the audio clock
 * (the usual "lookahead" scheduler), driven from the engine's frame loop, so
 * timing stays tight even though frames themselves jitter.
 */

const BPM = 108;
/** One sixteenth note, in seconds. */
const STEP = 60 / BPM / 4;
const STEPS_PER_BAR = 16;
const BARS_PER_SECTION = 4;
/** How far ahead of the audio clock notes are queued. */
const LOOKAHEAD = 0.3;
/** Kept well under the effects, so a hit is always heard over the band. */
const MUSIC_GAIN = 0.34;
/** The music's low-pass when nothing is muffling it: effectively open. */
const OPEN_CUTOFF = 20000;

interface Chord {
  /** MIDI note of the bass root. */
  readonly root: number;
  /** MIDI notes of the voicing the pad and arpeggio use. */
  readonly notes: readonly number[];
}

const Am: Chord = { root: 45, notes: [57, 60, 64] };
const F: Chord = { root: 41, notes: [57, 60, 65] };
const C: Chord = { root: 48, notes: [55, 60, 64] };
const G: Chord = { root: 43, notes: [55, 59, 62] };
const Em: Chord = { root: 40, notes: [55, 59, 64] };
const Dm: Chord = { root: 38, notes: [57, 62, 65] };

interface Section {
  readonly chords: readonly Chord[];
  readonly drums: boolean;
  readonly arp: boolean;
  readonly lead: boolean;
  /** Kick on every beat instead of every other one. */
  readonly drive: boolean;
}

/** Played once at the start of every match, then {@link LOOP} repeats. */
const INTRO: Section = {
  chords: [Am, F, C, G],
  drums: false,
  arp: true,
  lead: false,
  drive: false
};

const LOOP: readonly Section[] = [
  { chords: [Am, F, C, G], drums: true, arp: true, lead: false, drive: false },
  { chords: [Am, F, C, G], drums: true, arp: true, lead: true, drive: false },
  { chords: [F, G, Em, Am], drums: true, arp: true, lead: true, drive: true },
  { chords: [Dm, Am, F, G], drums: true, arp: false, lead: true, drive: true },
  { chords: [F, G, C, Am], drums: false, arp: true, lead: false, drive: false }
];

/** A minor pentatonic across two octaves - every note sits well on every chord here. */
const LEAD_SCALE = [69, 72, 74, 76, 79, 81, 84, 86, 88];

/** Sixteenth-note positions the bass plays on, and whether it jumps an octave. */
const BASS_PATTERN: readonly (readonly [number, boolean])[] = [
  [0, false],
  [3, false],
  [6, true],
  [8, false],
  [10, false],
  [14, true]
];

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
  private step = 0;
  private nextTime = 0;
  private playing = false;
  /** The lead line for the bar being scheduled: step -> MIDI note. */
  private phrase = new Map<number, number>();
  private readonly context: AudioContext;
  private readonly muffle: BiquadFilterNode;
  private readonly ducker: GainNode;

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context;
    // Through the effects' master gain, so the mute button silences both.
    // The low-pass and the second gain are only for {@link duck}.
    this.muffle = context.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = OPEN_CUTOFF;
    this.ducker = context.createGain();
    this.muffle.connect(this.ducker);
    this.ducker.connect(destination);

    this.bus = context.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(this.muffle);

    const length = Math.floor(context.sampleRate * 0.3);
    this.noise = context.createBuffer(1, length, context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  /**
   * Pull the band down and under water for `hold` seconds, then let it back
   * up. An ultimate does this: for a moment the court is louder than the song.
   */
  duck(hold: number): void {
    const t = this.context.currentTime;
    const gain = this.ducker.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(0.25, t + 0.04);
    gain.setValueAtTime(0.25, t + hold);
    gain.linearRampToValueAtTime(1, t + hold + 0.9);

    const cutoff = this.muffle.frequency;
    cutoff.cancelScheduledValues(t);
    cutoff.setValueAtTime(cutoff.value, t);
    cutoff.exponentialRampToValueAtTime(420, t + 0.06);
    cutoff.setValueAtTime(420, t + hold);
    cutoff.exponentialRampToValueAtTime(OPEN_CUTOFF, t + hold + 1.1);
  }

  /** Back to the top of the song - called when a new match starts. */
  restart(): void {
    this.step = 0;
    this.nextTime = 0;
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
    if (!on) return;

    // First bar, or the loop stalled (hidden tab, long pause): pick up from now.
    if (this.nextTime < now) this.nextTime = now + 0.06;
    while (this.nextTime < now + LOOKAHEAD) {
      this.schedule(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step++;
    }
  }

  // ----------------------------------------------------------- sequencing

  private sectionAt(bar: number): { section: Section; index: number; pass: number } {
    const block = Math.floor(bar / BARS_PER_SECTION);
    if (block === 0) return { section: INTRO, index: -1, pass: 0 };
    const index = (block - 1) % LOOP.length;
    return { section: LOOP[index]!, index, pass: Math.floor((block - 1) / LOOP.length) };
  }

  private schedule(step: number, t: number): void {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const s = step % STEPS_PER_BAR;
    const { section, index, pass } = this.sectionAt(bar);
    const barInSection = bar % BARS_PER_SECTION;
    const chord = section.chords[barInSection]!;
    const barLength = STEP * STEPS_PER_BAR;

    if (s === 0) {
      this.pad(chord, t, barLength);
      if (section.lead)
        this.phrase = this.writePhrase(chord, index * 17 + barInSection + (pass % 2) * 101);
    }

    for (const [at, up] of BASS_PATTERN) {
      if (at === s) this.bass(chord.root + (up ? 12 : 0), t, STEP * (up ? 1.6 : 2.4));
    }

    if (section.arp && s % 2 === 0) {
      const order = [0, 1, 2, 1];
      const note = chord.notes[order[(s / 2) % order.length]!]! + 12;
      this.voice(midiToFreq(note), t, STEP * 1.5, 'triangle', 0.045, 0.005);
    }

    if (section.lead) {
      const note = this.phrase.get(s);
      if (note !== undefined) this.voice(midiToFreq(note), t, STEP * 2.6, 'square', 0.028, 0.01);
    }

    if (section.drums) {
      const kick = section.drive ? s % 4 === 0 : s === 0 || s === 8 || s === 10;
      if (kick) this.kick(t);
      if (s === 4 || s === 12) this.snare(t);
      if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.05 : 0.025);
      // A little fill into the next section.
      if (barInSection === BARS_PER_SECTION - 1 && s >= 13) this.snare(t, 0.06);
    } else if (s % 4 === 2) {
      this.hat(t, 0.018);
    }
  }

  /** A short, repeatable melodic idea for one bar, leaning on the chord's own tones. */
  private writePhrase(chord: Chord, seed: number): Map<number, number> {
    const random = mulberry32(seed);
    const phrase = new Map<number, number>();
    const tones = new Set(chord.notes.map((note) => note % 12));
    const fits = LEAD_SCALE.filter((note) => tones.has(note % 12));
    let position = Math.floor(random() * LEAD_SCALE.length);
    for (let s = 0; s < STEPS_PER_BAR; s += 2) {
      // Strong beats almost always sound; off-beats only sometimes.
      if (random() > (s % 4 === 0 ? 0.85 : 0.4)) continue;
      position = Math.max(
        0,
        Math.min(LEAD_SCALE.length - 1, position + Math.round((random() - 0.5) * 4))
      );
      const onBeat = s % 8 === 0 && fits.length > 0;
      phrase.set(s, onBeat ? fits[Math.floor(random() * fits.length)]! : LEAD_SCALE[position]!);
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
    attack: number
  ): void {
    const osc = this.context.createOscillator();
    const env = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    env.connect(this.bus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private pad(chord: Chord, t: number, dur: number): void {
    for (const note of chord.notes) {
      // Two slightly detuned voices per note make it breathe instead of buzz.
      this.voice(midiToFreq(note) * 0.998, t, dur * 1.05, 'sine', 0.05, 0.4);
      this.voice(midiToFreq(note) * 1.002, t, dur * 1.05, 'triangle', 0.025, 0.4);
    }
  }

  private bass(note: number, t: number, dur: number): void {
    const osc = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const env = this.context.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(midiToFreq(note), t);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(220, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter);
    filter.connect(env);
    env.connect(this.bus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private kick(t: number): void {
    const osc = this.context.createOscillator();
    const env = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.32, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(env);
    env.connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  private noiseHit(
    t: number,
    dur: number,
    gain: number,
    type: BiquadFilterType,
    freq: number
  ): void {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const env = this.context.createGain();
    source.buffer = this.noise;
    filter.type = type;
    filter.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    source.connect(filter);
    filter.connect(env);
    env.connect(this.bus);
    source.start(t);
    source.stop(t + dur + 0.02);
  }

  private snare(t: number, gain = 0.1): void {
    this.noiseHit(t, 0.14, gain, 'bandpass', 1800);
  }

  private hat(t: number, gain: number): void {
    this.noiseHit(t, 0.04, gain, 'highpass', 7000);
  }
}
