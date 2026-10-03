/**
 * The building blocks every effect in `audio.ts` is made from.
 *
 * A voice is one oscillator with its own envelope, and optionally a filter
 * sweep, a stereo glide and a send into a shared reverb. A noise burst is the
 * same thing with white noise in place of the oscillator - the stuff of
 * whooshes, cracks and crashes. Layering a handful of each is how a skill gets
 * a body, an edge and a tail instead of sounding like a single beep.
 */

import { AUDIO_MIX } from './audioMix';

export interface FilterSpec {
  readonly type: BiquadFilterType;
  readonly freq: number;
  /** Where the cutoff ends up by the end of the sound. */
  readonly to?: number | undefined;
  readonly q?: number;
}

interface Shape {
  readonly gain: number;
  /** Seconds, attack included. */
  readonly dur: number;
  readonly attack?: number;
  /** Seconds from now before the sound starts. */
  readonly delay?: number;
  readonly filter?: FilterSpec;
  /** 0-1: how much goes into the reverb. */
  readonly send?: number;
  /** -1 (left) to 1 (right), gliding to `panTo` over the sound. */
  readonly pan?: number;
  readonly panTo?: number;
}

export interface VoiceSpec extends Shape {
  readonly freq: number;
  /** Where the pitch ends up by the end of the sound. */
  readonly to?: number | undefined;
  readonly type?: OscillatorType;
  /** Cents. */
  readonly detune?: number;
}

export type NoiseSpec = Shape;

const REVERB_SECONDS = AUDIO_MIX.reverbSeconds;
const REVERB_RETURN = AUDIO_MIX.reverbReturn;

/** A stereo impulse response: decaying noise, a little different per ear. */
function impulse(context: BaseAudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * REVERB_SECONDS);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.2);
    }
  }
  return buffer;
}

export class Synth {
  private readonly context: AudioContext;
  private readonly out: AudioNode;
  private readonly reverb: AudioNode;
  private readonly noiseBuffer: AudioBuffer;

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context;
    this.out = destination;

    const convolver = context.createConvolver();
    convolver.buffer = impulse(context);
    const wet = context.createGain();
    wet.gain.value = REVERB_RETURN;
    const damping = context.createBiquadFilter();
    damping.type = 'lowpass';
    damping.frequency.value = Math.min(5500, context.sampleRate * 0.45);
    convolver.connect(damping);
    damping.connect(wet);
    wet.connect(destination);
    this.reverb = convolver;

    const length = context.sampleRate * 2;
    this.noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  voice(spec: VoiceSpec): void {
    if (spec.gain <= 0 || spec.dur <= 0) return;
    const t = this.context.currentTime + (spec.delay ?? 0);
    const osc = this.context.createOscillator();
    osc.type = spec.type ?? 'sine';
    const maxFrequency = this.context.sampleRate * 0.45;
    osc.frequency.setValueAtTime(Math.min(maxFrequency, Math.max(20, spec.freq)), t);
    if (spec.to)
      osc.frequency.exponentialRampToValueAtTime(
        Math.min(maxFrequency, Math.max(20, spec.to)),
        t + spec.dur
      );
    if (spec.detune) osc.detune.value = spec.detune;
    this.route(osc, spec, t);
    osc.start(t);
    osc.stop(t + spec.dur + 0.05);
  }

  noise(spec: NoiseSpec): void {
    if (spec.gain <= 0 || spec.dur <= 0) return;
    const t = this.context.currentTime + (spec.delay ?? 0);
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    // A random start, so two bursts in a row are never the same hiss.
    const offset = Math.random() * (this.noiseBuffer.duration - Math.min(1.9, spec.dur));
    this.route(source, spec, t);
    source.start(t, Math.max(0, offset));
    source.stop(t + spec.dur + 0.05);
  }

  /**
   * A struck bell: inharmonic partials, each dying faster than the one below.
   * The glassy, metallic colour comes from the ratios not being whole numbers.
   */
  bell(freq: number, gain: number, dur: number, extra: Partial<VoiceSpec> = {}): void {
    const partials = [
      [1, 1, 1],
      [2.76, 0.45, 0.6],
      [5.4, 0.22, 0.35],
      [8.93, 0.1, 0.2]
    ] as const;
    for (const [ratio, level, length] of partials) {
      this.voice({
        ...extra,
        freq: freq * ratio,
        gain: gain * level,
        dur: dur * length,
        attack: 0.002
      });
    }
  }

  /** Three slightly detuned copies of one voice - thick, wide, "supersaw". */
  stack(spec: VoiceSpec, spread = 14): void {
    this.voice({ ...spec, gain: spec.gain / 3, detune: (spec.detune ?? 0) - spread, pan: -0.4 });
    this.voice({ ...spec, gain: spec.gain / 3 });
    this.voice({ ...spec, gain: spec.gain / 3, detune: (spec.detune ?? 0) + spread, pan: 0.4 });
  }

  private route(source: AudioScheduledSourceNode, spec: Shape, t: number): void {
    const nodes: AudioNode[] = [source];
    let node: AudioNode = source;

    if (spec.filter) {
      const { type, freq, to, q } = spec.filter;
      const filter = this.context.createBiquadFilter();
      nodes.push(filter);
      filter.type = type;
      const cutoff = (value: number) =>
        Math.min(this.context.sampleRate * 0.45, Math.max(20, value));
      filter.frequency.setValueAtTime(cutoff(freq), t);
      if (to) filter.frequency.exponentialRampToValueAtTime(cutoff(to), t + spec.dur);
      if (q !== undefined) filter.Q.value = q;
      node.connect(filter);
      node = filter;
    }

    const env = this.context.createGain();
    nodes.push(env);
    const attack = Math.min(spec.dur * 0.8, Math.max(0.001, spec.attack ?? 0.005));
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(spec.gain, t + attack);
    // Give each sound a short body before its tail. One exponential straight
    // to silence made even strong paddle contacts disappear under the band.
    const body = Math.max(attack + 0.001, spec.dur * 0.3);
    env.gain.exponentialRampToValueAtTime(spec.gain * 0.25, t + body);
    env.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(spec.dur, attack + 0.01));
    node.connect(env);
    node = env;

    if (spec.pan !== undefined && typeof this.context.createStereoPanner === 'function') {
      const panner = this.context.createStereoPanner();
      nodes.push(panner);
      panner.pan.setValueAtTime(spec.pan, t);
      if (spec.panTo !== undefined) panner.pan.linearRampToValueAtTime(spec.panTo, t + spec.dur);
      node.connect(panner);
      node = panner;
    }

    node.connect(this.out);
    if (spec.send) {
      const send = this.context.createGain();
      nodes.push(send);
      send.gain.value = spec.send;
      node.connect(send);
      send.connect(this.reverb);
    }
    source.onended = () => nodes.forEach((owned) => owned.disconnect());
  }
}
