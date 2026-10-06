import { profileStore } from '../core/profile/store';
import { levelOf } from '../core/progression/levels';
import { settingsStore } from '../core/settings/store';
import type { GameEngine } from '../game/engine';
import { experienceBoot, experienceEnabled, watchExperienceEngine } from './experienceBridge';
import { FrameCapture, type CaptureEnd } from './frameCapture';

interface SessionLabels {
  participantCode: string;
  skillGroup: 'new' | 'returning' | 'experienced' | 'unspecified';
  input: 'mouse' | 'keyboard' | 'touch' | 'pen' | 'mixed' | 'unspecified';
  device: string;
  build: string;
  cache: 'cold' | 'warm' | 'unspecified';
}

interface Attempt {
  id: number;
  session: SessionLabels;
  contextAtStart: ReturnType<typeof context>;
  startedAtMs: number | null;
  endedAtMs: number | null;
  partial: boolean;
  outcome: 'open' | 'won' | 'lost' | 'abandoned' | 'interrupted';
  mode: string;
  stageId: string | null;
  bot: string;
  ranked: boolean;
  won: boolean | null;
  objectiveMet: boolean | null;
  scoreYou: number;
  scoreBot: number;
  seconds: number;
  hits: number;
  bestRally: number;
}

type CaptureReport = ReturnType<FrameCapture['report']>;
const MAX_REPORTS = 12;
const MAX_ATTEMPTS = 200;
let installed: ReturnType<typeof createExperience> | null = null;

function context(engine: GameEngine | null) {
  const profile = profileStore.getSnapshot();
  const settings = settingsStore.getSnapshot();
  const canvas = document.querySelector('canvas');
  const game = engine?.getSnapshot();
  return {
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      ratio: window.devicePixelRatio
    },
    canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
    quality: settings.canvasQuality,
    effects: settings.effects,
    shake: settings.shake,
    replays: settings.replays,
    touchMode: settings.touchMode,
    touchSensitivity: settings.touchSensitivity,
    practicePace: settings.practicePace,
    autoServe: settings.autoServe,
    resumeCountdown: settings.resumeCountdown,
    level: levelOf(profile.xp),
    talents: { ...profile.talents.ranks },
    abilities: [...profile.talents.equipped],
    cosmetics: { ...profile.equipped },
    demo: profileStore.getDemoLevel() !== null,
    mode: game?.mode ?? null,
    courtLabel: game?.label ?? null,
    engine: engine?.getDiagnostics() ?? null
  };
}

function timeline(type: string): PerformanceEntry[] {
  try {
    return performance.getEntriesByType(type);
  } catch {
    return [];
  }
}

function startup() {
  const navigation = timeline('navigation')[0] as PerformanceNavigationTiming | undefined;
  const paint = timeline('paint');
  const value = (number: number | undefined) => (number && Number.isFinite(number) ? number : null);
  // Export only static asset filenames, never URLs, queries or account/API data.
  const assets = timeline('resource')
    .flatMap((entry) => {
      try {
        const name = new URL(entry.name).pathname.split('/').pop() ?? '';
        return /^[\w.-]+\.(js|css)$/.test(name) ? [{ file: name, durationMs: entry.duration }] : [];
      } catch {
        return [];
      }
    })
    .slice(0, 128);
  return {
    ...experienceBoot(),
    navigation: navigation
      ? {
          type: navigation.type,
          responseStartMs: value(navigation.responseStart),
          responseEndMs: value(navigation.responseEnd),
          domInteractiveMs: value(navigation.domInteractive),
          domContentLoadedMs: value(navigation.domContentLoadedEventEnd),
          loadEventEndMs: value(navigation.loadEventEnd)
        }
      : null,
    firstPaintMs: value(paint.find((entry) => entry.name === 'first-paint')?.startTime),
    firstContentfulPaintMs: value(
      paint.find((entry) => entry.name === 'first-contentful-paint')?.startTime
    ),
    assets
  };
}

function createExperience() {
  const recordingId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${performance.now()}`;
  let attemptSerial = 0;
  let captureSerial = 0;
  let engine: GameEngine | null = null;
  let unsubscribeEngine = () => {};
  let unsubscribeMatches = () => {};
  let unsubscribeFrames = () => {};
  let active: FrameCapture | null = null;
  let captureContext: ReturnType<typeof context> | null = null;
  let captureLabels: SessionLabels | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let lastResult = 0;
  let labels: SessionLabels = {
    participantCode: '',
    skillGroup: 'unspecified',
    input: 'unspecified',
    device: '',
    build: 'unspecified',
    cache: 'unspecified'
  };
  const captures: (CaptureReport & {
    id: number;
    context: ReturnType<typeof context>;
    session: SessionLabels;
  })[] = [];
  const attempts: Attempt[] = [];
  let currentAttempt: Attempt | null = null;
  let firstInput: { event: string; delayMs: number; processingMs: number } | null = null;
  const longTasks: { startTimeMs: number; durationMs: number }[] = [];
  const observers: PerformanceObserver[] = [];
  const available = { firstInput: false, longTasks: false };

  function collect(entries: readonly PerformanceEntry[]) {
    for (const entry of entries) {
      if (entry.entryType === 'first-input' && firstInput === null) {
        const event = entry as PerformanceEventTiming;
        if (Number.isFinite(event.processingStart) && Number.isFinite(event.processingEnd))
          firstInput = {
            event: event.name,
            delayMs: Math.max(0, event.processingStart - event.startTime),
            processingMs: Math.max(0, event.processingEnd - event.processingStart)
          };
      }
      if (entry.entryType === 'longtask' && longTasks.length < 256)
        longTasks.push({ startTimeMs: entry.startTime, durationMs: entry.duration });
    }
  }

  for (const [type, key] of [
    ['first-input', 'firstInput'],
    ['longtask', 'longTasks']
  ] as const) {
    let observer: PerformanceObserver | null = null;
    try {
      if (
        typeof PerformanceObserver === 'undefined' ||
        !PerformanceObserver.supportedEntryTypes?.includes(type)
      )
        continue;
      observer = new PerformanceObserver((list) => collect(list.getEntries()));
      observer.observe({ type, buffered: true });
      observers.push(observer);
      available[key] = true;
    } catch {
      observer?.disconnect();
      /* Unsupported timing remains unavailable, never a fabricated zero. */
    }
  }

  function stop(reason: CaptureEnd = 'manual') {
    if (!active) return null;
    const report = active.report(performance.now(), reason);
    active = null;
    unsubscribeFrames();
    unsubscribeFrames = () => {};
    if (timer !== null) clearTimeout(timer);
    timer = null;
    captures.push({
      ...report,
      id: ++captureSerial,
      context: captureContext!,
      session: captureLabels!
    });
    captureContext = null;
    captureLabels = null;
    return report;
  }

  const contextChanged = () => {
    if (active && JSON.stringify(context(engine)) !== JSON.stringify(captureContext))
      stop('context-changed');
  };
  const unwatch = watchExperienceEngine((next) => {
    if (engine !== next) {
      stop('disposed');
      if (currentAttempt) {
        currentAttempt.outcome = 'interrupted';
        currentAttempt.endedAtMs = performance.now();
        currentAttempt = null;
      }
    }
    unsubscribeEngine();
    unsubscribeMatches();
    engine = next;
    lastResult = next?.getSnapshot().resultId ?? 0;
    if (next)
      unsubscribeEngine = next.subscribe(() => {
        const snapshot = next.getSnapshot();
        if (
          active &&
          (snapshot.mode !== captureContext?.mode || snapshot.label !== captureContext.courtLabel)
        )
          stop('context-changed');
        if (!snapshot.result || snapshot.resultId === lastResult) return;
        lastResult = snapshot.resultId;
        if (attempts.length >= MAX_ATTEMPTS && !currentAttempt) return;
        const result = snapshot.result;
        const attempt: Attempt = currentAttempt ?? {
          id: ++attemptSerial,
          session: { ...labels },
          contextAtStart: context(next),
          startedAtMs: null,
          endedAtMs: null,
          partial: true,
          outcome: 'open',
          mode: result.mode,
          stageId: result.stageId ?? null,
          bot: result.botId,
          ranked: result.ranked,
          won: null,
          objectiveMet: null,
          scoreYou: 0,
          scoreBot: 0,
          seconds: 0,
          hits: 0,
          bestRally: 0
        };
        if (!currentAttempt) attempts.push(attempt);
        Object.assign(attempt, {
          endedAtMs: performance.now(),
          outcome: result.abandoned ? 'abandoned' : result.won ? 'won' : 'lost',
          won: result.won,
          objectiveMet: result.objectiveMet,
          scoreYou: result.scoreYou,
          scoreBot: result.scoreBot,
          seconds: result.seconds,
          hits: result.hits,
          bestRally: result.bestRally
        });
        currentAttempt = null;
      });
    else unsubscribeEngine = () => {};
    if (next)
      unsubscribeMatches = next.observeMatches((event) => {
        if (event.kind === 'started') {
          if (attempts.length >= MAX_ATTEMPTS) return;
          currentAttempt = {
            id: ++attemptSerial,
            session: { ...labels },
            contextAtStart: context(next),
            startedAtMs: performance.now(),
            endedAtMs: null,
            partial: false,
            outcome: 'open',
            mode: event.mode,
            stageId: event.stageId,
            bot: event.bot,
            ranked: event.ranked,
            won: null,
            objectiveMet: null,
            scoreYou: 0,
            scoreBot: 0,
            seconds: 0,
            hits: 0,
            bestRally: 0
          };
          attempts.push(currentAttempt);
        } else if (currentAttempt) {
          Object.assign(currentAttempt, {
            scoreYou: event.scoreYou,
            scoreBot: event.scoreBot,
            seconds: event.seconds,
            hits: event.hits,
            bestRally: event.bestRally,
            outcome: 'abandoned',
            endedAtMs: performance.now()
          });
          currentAttempt = null;
        }
      });
    else unsubscribeMatches = () => {};
  });
  const unsettings = settingsStore.subscribe(contextChanged);
  const unprofile = profileStore.subscribe(contextChanged);
  const hidden = () => {
    if (document.hidden) stop('hidden');
  };
  const pagehide = () => {
    stop('hidden');
  };
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagehide', pagehide);
  window.addEventListener('resize', contextChanged);

  return {
    configure(options: Partial<SessionLabels>) {
      if (disposed) throw new Error('Experience capture was disposed.');
      const merged = {
        participantCode: options.participantCode ?? labels.participantCode,
        skillGroup: options.skillGroup ?? labels.skillGroup,
        input: options.input ?? labels.input,
        device: options.device ?? labels.device,
        build: options.build ?? labels.build,
        cache: options.cache ?? labels.cache
      };
      if (
        !['new', 'returning', 'experienced', 'unspecified'].includes(merged.skillGroup) ||
        !['mouse', 'keyboard', 'touch', 'pen', 'mixed', 'unspecified'].includes(merged.input) ||
        !['cold', 'warm', 'unspecified'].includes(merged.cache)
      )
        throw new Error('Invalid session labels.');
      for (const key of ['participantCode', 'device', 'build'] as const)
        if (typeof merged[key] !== 'string' || merged[key].length > 100)
          throw new Error('Session labels must be at most 100 characters.');
      stop('context-changed');
      labels = merged;
    },
    start(options: { label: string; refreshHz: number; seconds?: number }) {
      if (disposed || !engine) throw new Error('The game engine is not available.');
      if (document.hidden) throw new Error('Return to the visible game before capturing.');
      if (active) throw new Error('Stop the current capture before starting another.');
      if (captures.length >= MAX_REPORTS)
        throw new Error('Export and reset before capturing more.');
      active = new FrameCapture(
        options.label,
        options.refreshHz,
        options.seconds ?? 30,
        performance.now()
      );
      captureContext = context(engine);
      captureLabels = { ...labels };
      unsubscribeFrames = engine.observeFrames((sample) => {
        if (!active) return;
        if (document.hidden) {
          stop('hidden');
          return;
        }
        const reason = active.add(sample);
        if (reason) stop(reason);
      });
      // A stalled engine still ends; hidden/pagehide events stop sooner.
      timer = setTimeout(() => stop('duration'), active.seconds * 1000);
    },
    stop: () => stop(),
    status: () => ({
      active: active?.label ?? null,
      captures: captures.length,
      attempts: attempts.length,
      disposed
    }),
    report() {
      if (active) throw new Error('Stop the capture before exporting its report.');
      for (const observer of observers) collect(observer.takeRecords());
      const report = {
        format: 'bball-experience-1',
        recordingId,
        session: { ...labels },
        exportedAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        supported: { ...available },
        firstInput,
        startup: startup(),
        captures: captures.map((capture) => ({
          ...capture,
          longTasks: longTasks.filter(
            (task) =>
              task.startTimeMs < capture.endedAtMs &&
              task.startTimeMs + task.durationMs > capture.startedAtMs
          )
        })),
        attempts: [...attempts],
        limits: {
          maxCaptures: MAX_REPORTS,
          maxFramesPerCapture: 30_000,
          maxAttempts: MAX_ATTEMPTS,
          maxLongTasks: 256
        }
      };
      // A returned report must remain a snapshot after a later match/export.
      return JSON.parse(JSON.stringify(report)) as typeof report;
    },
    json() {
      return JSON.stringify(this.report(), null, 2);
    },
    download() {
      const url = URL.createObjectURL(new Blob([this.json()], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'bball-experience.json';
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    },
    reset() {
      stop();
      captures.length = 0;
      attempts.length = 0;
      currentAttempt = null;
      longTasks.length = 0;
    },
    dispose() {
      if (disposed) return;
      stop('disposed');
      disposed = true;
      unwatch();
      unsubscribeEngine();
      unsubscribeMatches();
      unsettings();
      unprofile();
      for (const observer of observers) observer.disconnect();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('resize', contextChanged);
    }
  };
}

/** Console capture API for disposable playtests; no storage, telemetry or UI. */
export function installExperience() {
  if (!experienceEnabled) return null;
  if (installed && !installed.status().disposed) return installed;
  installed = createExperience();
  Object.defineProperty(window, 'bballExperience', { value: installed, configurable: true });
  console.info(
    'bBall local capture ready: window.bballExperience. See docs/player-experience-validation.md.'
  );
  return installed;
}

export type ExperienceReport = ReturnType<
  NonNullable<ReturnType<typeof installExperience>>['report']
>;
