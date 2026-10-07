/** Render the real mix in Chromium's OfflineAudioContext; no speakers required. */
import { GameAudio } from '../src/game/audio';
import type { SongId } from '../src/game/music';

function levels(buffer: AudioBuffer) {
  let peak = 0;
  let sum = 0;
  let samples = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    for (const value of buffer.getChannelData(channel)) {
      if (!Number.isFinite(value)) throw new Error('Non-finite audio sample');
      peak = Math.max(peak, Math.abs(value));
      sum += value * value;
      samples++;
    }
  }
  return { peak, rms: Math.sqrt(sum / samples) };
}

async function render(
  duration: number,
  setup: (audio: GameAudio) => void,
  tick?: (audio: GameAudio, time: number) => void
) {
  const context = new OfflineAudioContext(2, Math.ceil(44100 * duration), 44100);
  const original = window.AudioContext;
  // GameAudio builds its real graph, substituting only the rendering context.
  window.AudioContext = function () {
    return context;
  } as unknown as typeof AudioContext;
  const audio = new GameAudio();
  try {
    audio.setMuted(false);
    audio.unlock();
    setup(audio);
    tick?.(audio, 0);
    const pauses: Promise<void>[] = [];
    if (tick) {
      for (let time = 0.2; time < duration - 0.1; time += 0.2) pauses.push(context.suspend(time));
    }
    const result = context.startRendering();
    for (const pause of pauses) {
      await pause;
      tick?.(audio, context.currentTime);
      await context.resume();
    }
    return levels(await result);
  } finally {
    window.AudioContext = original;
  }
}

async function runAudioCheck() {
  const report: Record<string, { peak: number; rms: number }> = {};
  const effects: Record<string, (audio: GameAudio) => void> = {
    serve: (a) => a.serve(),
    hit: (a) => a.hit(1, 30),
    firmHit: (a) => a.hit(1, 30, 0, 'firm'),
    softHit: (a) => a.hit(1, 30, 0, 'soft'),
    wall: (a) => a.wall(1),
    flick: (a) => a.flick(),
    bumper: (a) => a.bumper(1),
    brick: (a) => a.brick(),
    portal: (a) => a.portal(-0.7, 0.7),
    phase: (a) => a.phase(),
    star: (a) => a.star(2),
    winPoint: (a) => a.point(true),
    losePoint: (a) => a.point(false),
    pip: (a) => a.pip(),
    combo: (a) => a.combo(4),
    ignite: (a) => a.ignite(),
    applause: (a) => a.applause(),
    winMatch: (a) => a.matchOver(true),
    loseMatch: (a) => a.matchOver(false),
    rewind: (a) => a.rewind(),
    ui: (a) => a.ui(),
    click: (a) => a.click(),
    dash: (a) => a.dash(),
    charge: (a) => a.charge(),
    guard: (a) => a.guard(),
    parry: (a) => a.guardHit(),
    charged: (a) => a.impact(true),
    critical: (a) => a.impact(false),
    shield: (a) => a.shield(),
    secondChance: (a) => a.secondChance()
  };
  for (const id of ['overload', 'slipstream', 'aegis', 'zenith', 'echo'])
    effects[id] = (a) => a.ultimate(id);
  for (const [name, effect] of Object.entries(effects)) {
    report[name] = await render(4, effect);
    if (report[name]!.peak <= 0 || report[name]!.peak >= 0.98)
      throw new Error(`${name}: silent or clipping`);
  }
  for (const song of ['neon', 'horizon', 'pulse', 'showdown'] as SongId[]) {
    report[song] = await render(
      24,
      (a) => a.startMusic(song),
      (a) => a.updateMusic(true, 0.8, true)
    );
    if (report[song]!.rms < 0.005 || report[song]!.peak >= 0.98)
      throw new Error(`${song}: too quiet or clipping`);
  }
  report.busyMix = await render(
    12,
    (a) => a.startMusic('showdown'),
    (a, time) => {
      a.updateMusic(true, 1, true);
      a.hit(1, 30);
      if (time < 0.01 || Math.abs(time - 4) < 0.01) {
        a.ultimate('aegis');
        a.shield();
        a.impact(true);
      }
    }
  );
  if (report.busyMix.peak >= 0.98) throw new Error('Stacked effects clip');
  report.musicOff = await render(
    2,
    (a) => {
      a.setVolumes(0, 1);
      a.startMusic('neon');
    },
    (a) => a.updateMusic(true)
  );
  report.effectsOff = await render(2, (a) => {
    a.setVolumes(1, 0);
    a.ultimate('zenith');
  });
  report.effectsOnly = await render(2, (a) => {
    a.setVolumes(0, 1);
    a.hit(1, 8);
  });
  report.musicOnly = await render(
    4,
    (a) => {
      a.setVolumes(1, 0);
      a.startMusic('horizon');
    },
    (a) => a.updateMusic(true)
  );
  if (report.effectsOnly.peak <= 0 || report.musicOnly.peak <= 0)
    throw new Error('Volume controls are not independent');
  report.muted = await render(
    2,
    (a) => {
      a.setMuted(true);
      a.ultimate('overload');
      a.startMusic('neon');
    },
    (a) => a.updateMusic(true)
  );
  for (const name of ['musicOff', 'effectsOff', 'muted'])
    if (report[name]!.peak !== 0) throw new Error(`${name}: not silent`);
  return report;
}

Object.assign(globalThis, { runAudioCheck });
