import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ExperienceReport } from '../src/dev/experience';
import { distribution } from '../src/dev/frameCapture';

export function validateExperience(value: unknown): ExperienceReport {
  const report = value as ExperienceReport;
  if (
    !report ||
    report.format !== 'bball-experience-1' ||
    typeof report.recordingId !== 'string' ||
    !report.recordingId ||
    !Number.isFinite(Date.parse(report.exportedAt)) ||
    !Array.isArray(report.captures) ||
    report.captures.length > 12 ||
    !report.startup ||
    !Array.isArray(report.startup.assets) ||
    !Array.isArray(report.startup.menuLoads) ||
    !report.supported ||
    typeof report.supported.firstInput !== 'boolean' ||
    typeof report.supported.longTasks !== 'boolean' ||
    !Array.isArray(report.attempts) ||
    report.attempts.length > 200
  )
    throw new Error('Invalid experience report header.');
  const ids = new Set<number>();
  for (const capture of report.captures) {
    if (
      !capture ||
      !Number.isInteger(capture.id) ||
      capture.id < 1 ||
      ids.has(capture.id) ||
      typeof capture.label !== 'string' ||
      !capture.label ||
      capture.label.length > 100 ||
      !Number.isFinite(capture.startedAtMs) ||
      capture.startedAtMs < 0 ||
      !Number.isFinite(capture.endedAtMs) ||
      capture.endedAtMs < capture.startedAtMs ||
      !capture.context ||
      !capture.session ||
      !Array.isArray(capture.frames) ||
      capture.frames.length > 30_000 ||
      !Number.isFinite(capture.expectedRefreshHz) ||
      capture.expectedRefreshHz < 30 ||
      capture.expectedRefreshHz > 360
    )
      throw new Error('Invalid or repeated capture.');
    ids.add(capture.id);
    let previous: number | null = null;
    for (const frame of capture.frames) {
      if (!frame) throw new Error('Invalid frame sample.');
      const interval = previous === null ? null : frame.timestampMs - previous;
      if (
        !Number.isFinite(frame.timestampMs) ||
        frame.timestampMs < capture.startedAtMs ||
        frame.timestampMs > capture.endedAtMs ||
        (previous !== null && frame.timestampMs <= previous) ||
        !Number.isFinite(frame.updateMs) ||
        frame.updateMs < 0 ||
        !Number.isFinite(frame.drawMs) ||
        frame.drawMs < 0 ||
        !Number.isInteger(frame.steps) ||
        frame.steps < 0 ||
        typeof frame.phase !== 'string' ||
        (interval === null
          ? frame.intervalMs !== null
          : !Number.isFinite(frame.intervalMs) ||
            frame.intervalMs === null ||
            Math.abs(interval - frame.intervalMs) > 0.000001)
      )
        throw new Error('Invalid frame sample or inconsistent interval.');
      previous = frame.timestampMs;
    }
  }
  ids.clear();
  for (const attempt of report.attempts) {
    if (
      !attempt ||
      !Number.isInteger(attempt.id) ||
      attempt.id < 1 ||
      ids.has(attempt.id) ||
      !attempt.contextAtStart ||
      !attempt.session ||
      typeof attempt.partial !== 'boolean' ||
      typeof attempt.ranked !== 'boolean' ||
      typeof attempt.mode !== 'string' ||
      !['open', 'won', 'lost', 'abandoned', 'interrupted'].includes(attempt.outcome) ||
      !Number.isFinite(attempt.seconds) ||
      attempt.seconds < 0
    )
      throw new Error('Invalid or repeated attempt.');
    ids.add(attempt.id);
  }
  return report;
}

/** Retain the latest export of each record; keep capture contexts separate. */
export function summarizeExperience(values: readonly unknown[]) {
  const reports = values
    .map(validateExperience)
    .sort((a, b) => Date.parse(a.exportedAt) - Date.parse(b.exportedAt));
  const captures = new Map<
    string,
    { capture: ExperienceReport['captures'][number]; report: ExperienceReport }
  >();
  const attempts = new Map<
    string,
    { attempt: ExperienceReport['attempts'][number]; report: ExperienceReport }
  >();
  for (const report of reports) {
    for (const capture of report.captures)
      captures.set(`${report.recordingId}:${capture.id}`, { capture, report });
    for (const attempt of report.attempts)
      attempts.set(`${report.recordingId}:${attempt.id}`, { attempt, report });
  }
  const journey = new Map<
    string,
    {
      comparison: object;
      won: number;
      lost: number;
      abandoned: number;
      open: number;
      interrupted: number;
      participantCodes: Set<string>;
      seconds: number[];
    }
  >();
  let partialAttempts = 0;
  for (const { attempt, report } of attempts.values()) {
    if (attempt.partial) {
      partialAttempts++;
      continue;
    }
    if (attempt.mode !== 'journey' || !attempt.ranked || !attempt.stageId) continue;
    const fingerprint = [
      ...new Set(
        report.startup.assets
          .map((asset) => asset.file)
          .filter((file) => /^index-.*\.js$/.test(file))
      )
    ].sort();
    const comparison = {
      stageId: attempt.stageId,
      build: attempt.session.build,
      fingerprint,
      unidentifiedBuild:
        attempt.session.build === 'unspecified' && !fingerprint.length ? report.recordingId : null,
      skillGroup: attempt.session.skillGroup,
      input: attempt.session.input,
      context: attempt.contextAtStart
    };
    const key = JSON.stringify(comparison);
    let group = journey.get(key);
    if (!group) {
      group = {
        comparison,
        won: 0,
        lost: 0,
        abandoned: 0,
        open: 0,
        interrupted: 0,
        participantCodes: new Set(),
        seconds: []
      };
      journey.set(key, group);
    }
    group[attempt.outcome]++;
    if (attempt.session.participantCode)
      group.participantCodes.add(attempt.session.participantCode);
    if (attempt.outcome === 'won' || attempt.outcome === 'lost')
      group.seconds.push(attempt.seconds);
  }
  return {
    format: 'bball-experience-summary-1',
    sourceFiles: reports.length,
    recordings: new Set(reports.map((report) => report.recordingId)).size,
    uniqueCaptures: captures.size,
    uniqueAttempts: attempts.size,
    partialAttempts,
    startup: [
      ...new Map(
        reports.map((report) => [
          report.recordingId,
          {
            recordingId: report.recordingId,
            session: report.session,
            supported: report.supported,
            firstInput: report.firstInput,
            navigation: report.startup.navigation,
            firstPaintMs: report.startup.firstPaintMs,
            firstContentfulPaintMs: report.startup.firstContentfulPaintMs,
            engineStartedAtMs: report.startup.engineStartedAtMs,
            menuLoads: report.startup.menuLoads
          }
        ])
      ).values()
    ],
    captures: [...captures.values()].map(({ capture, report }) => {
      const summarizeFrames = (frames: typeof capture.frames) => {
        const intervals = frames.flatMap((frame) =>
          frame.intervalMs === null ? [] : [frame.intervalMs]
        );
        const budget = 1000 / capture.expectedRefreshHz;
        return {
          samples: frames.length,
          sampledIntervalMs: intervals.reduce((sum, value) => sum + value, 0),
          frameIntervalMs: distribution(intervals),
          engineUpdateMs: distribution(frames.map((frame) => frame.updateMs)),
          canvasSubmissionMs: distribution(frames.map((frame) => frame.drawMs)),
          lateIntervals: intervals.filter((interval) => interval > budget * 1.5).length,
          estimatedMissedRefreshSlots: intervals.reduce(
            (sum, interval) => sum + Math.max(0, Math.round(interval / budget) - 1),
            0
          )
        };
      };
      return {
        recordingId: report.recordingId,
        captureId: capture.id,
        label: capture.label,
        session: capture.session,
        context: capture.context,
        expectedRefreshHz: capture.expectedRefreshHz,
        reason: capture.reason,
        observedMs: capture.endedAtMs - capture.startedAtMs,
        all: summarizeFrames(capture.frames),
        byPhase: Object.fromEntries(
          [...new Set(capture.frames.map((frame) => frame.phase))].map((phase) => [
            phase,
            summarizeFrames(capture.frames.filter((frame) => frame.phase === phase))
          ])
        )
      };
    }),
    journey: [...journey.values()].map((group) => ({
      comparison: group.comparison,
      endedAttempts: group.won + group.lost + group.abandoned,
      wins: group.won,
      losses: group.lost,
      abandoned: group.abandoned,
      open: group.open,
      interrupted: group.interrupted,
      distinctParticipantCodes: group.participantCodes.size,
      completedWinRate: group.won + group.lost ? group.won / (group.won + group.lost) : null,
      clearsPerEndedAttempt:
        group.won + group.lost + group.abandoned
          ? group.won / (group.won + group.lost + group.abandoned)
          : null,
      completedMatchSeconds: distribution(group.seconds)
    })),
    interpretation:
      'Observational data only. Frame intervals are not displayed-frame or input-to-photon measurements. Quits need observer notes; unknown/partial/interrupted trials and small bot/player samples cannot establish difficulty or enjoyment.'
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  let output: string | null = null;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output') {
      if (output || !args[i + 1]) throw new Error('Use --output once with a path.');
      output = args[++i]!;
    } else if (args[i]!.startsWith('--')) throw new Error(`Unknown option ${args[i]}`);
    else files.push(args[i]!);
  }
  if (!files.length) throw new Error('Pass one or more exported bball-experience.json files.');
  const reports = await Promise.all(
    [...new Set(files.map((file) => resolve(file)))].map(async (file) => {
      try {
        return JSON.parse(await readFile(file, 'utf8')) as unknown;
      } catch (error) {
        throw new Error(`Could not read ${file}`, { cause: error });
      }
    })
  );
  const text = JSON.stringify(summarizeExperience(reports), null, 2) + '\n';
  if (output) {
    const path = resolve(output);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
    console.log(`Summary: ${path}`);
  } else console.log(text);
}
