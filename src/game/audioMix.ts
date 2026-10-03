/** Shared mix targets. Sliders remain independent of event ducking and compression. */
export const AUDIO_MIX = {
  master: 0.6,
  effects: 0.8,
  music: 0.5,
  musicDefault: 0.8,
  effectsDefault: 1,
  reverbSeconds: 1.6,
  reverbReturn: 0.3,
  duckLevel: 0.55,
  duckCutoff: 1800,
  duckRelease: 0.5,
  maxHitPitch: 1600
} as const;

/** A gentle perceptual taper, with genuine silence at zero and full gain at one. */
export function volumeGain(value: number): number {
  return Math.pow(Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0, 1.5);
}

/** Compress each bus separately so a big effect does not squash the whole song. */
export function mixBus(
  context: BaseAudioContext,
  destination: AudioNode,
  music: boolean
): AudioNode {
  const lowCut = context.createBiquadFilter();
  lowCut.type = 'highpass';
  lowCut.frequency.value = music ? 35 : 45;
  lowCut.Q.value = 0.5;
  const warmth = context.createBiquadFilter();
  warmth.type = 'lowpass';
  warmth.frequency.value = Math.min(music ? 12000 : 10000, context.sampleRate * 0.45);
  warmth.Q.value = 0.5;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = music ? -22 : -16;
  compressor.knee.value = 12;
  compressor.ratio.value = music ? 2 : 3;
  compressor.attack.value = 0.008;
  compressor.release.value = music ? 0.25 : 0.12;
  lowCut.connect(warmth);
  warmth.connect(compressor);
  compressor.connect(destination);
  return lowCut;
}
