import assert from 'node:assert/strict';
import { it } from 'node:test';
import { summarizeExperience, validateExperience } from '../../scripts/summarize-experience';
import { FrameCapture } from '../../src/dev/frameCapture';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function fixture() {
  const capture = new FrameCapture('rally', 60, 30, 0);
  for (const timestampMs of [0, 16, 64])
    capture.add({ timestampMs, phase: 'play', updateMs: 2, drawMs: 3, steps: 2 });
  const session = {
    participantCode: 'N01',
    skillGroup: 'new',
    input: 'mouse',
    device: 'test',
    build: 'revision-a',
    cache: 'cold'
  };
  const context = {
    level: 1,
    engine: { fieldWidth: 1000, level: 1, effects: {}, abilities: [] },
    demo: false
  };
  const attempt = {
    id: 1,
    session,
    contextAtStart: context,
    startedAtMs: 0,
    endedAtMs: 60_000,
    partial: false,
    outcome: 'won',
    mode: 'journey',
    stageId: 'w1-6',
    bot: 'pro',
    ranked: true,
    won: true,
    objectiveMet: true,
    scoreYou: 5,
    scoreBot: 0,
    seconds: 60,
    hits: 12,
    bestRally: 5
  };
  return {
    format: 'bball-experience-1',
    recordingId: 'fixture-1',
    exportedAt: '2026-10-06T10:00:00.000Z',
    session,
    supported: { firstInput: false, longTasks: false },
    firstInput: null,
    startup: {
      navigation: null,
      firstPaintMs: null,
      firstContentfulPaintMs: null,
      engineStartedAtMs: 100,
      menuLoads: [],
      assets: [{ file: 'index-test.js', durationMs: 10 }]
    },
    captures: [{ ...capture.report(64, 'manual'), id: 1, session, context }],
    attempts: [attempt]
  };
}

it('summary recomputes frame distributions from raw samples and preserves unsupported timings as unavailable', () => {
  const report = fixture();
  report.captures[0]!.summary.frameIntervalMs!.p95 = 999;
  const summary = summarizeExperience([report]);
  assert.equal(summary.captures[0]!.all.frameIntervalMs?.p95, 48);
  assert.equal(summary.captures[0]!.all.frameIntervalMs?.median, 32);
  assert.equal(summary.captures[0]!.all.engineUpdateMs?.median, 2);
  assert.equal(summary.captures[0]!.all.canvasSubmissionMs?.median, 3);
  assert.equal(summary.startup[0]!.firstInput, null);
  assert.equal(summary.startup[0]!.supported.firstInput, false);
});

it('overlapping exports count each capture/trial once and use the newest final outcome', () => {
  const old = fixture();
  old.attempts[0]!.outcome = 'open';
  const newer = fixture();
  newer.exportedAt = '2026-10-06T10:01:00.000Z';
  const summary = summarizeExperience([newer, old, newer]);
  assert.equal(summary.uniqueCaptures, 1);
  assert.equal(summary.uniqueAttempts, 1);
  assert.equal(summary.journey[0]!.wins, 1);
  assert.equal(summary.journey[0]!.open, 0);
});

it('Journey reports distinguish ended trials, completed wins, quits and incomplete or partial records', () => {
  const report = fixture();
  const base = report.attempts[0]!;
  report.attempts = ['won', 'lost', 'abandoned', 'open', 'interrupted'].map((outcome, index) => ({
    ...base,
    id: index + 1,
    outcome
  }));
  report.attempts.push({ ...base, id: 6, partial: true });
  const summary = summarizeExperience([report]);
  const row = summary.journey[0]!;
  assert.equal(row.endedAttempts, 3);
  assert.equal(row.completedWinRate, 0.5);
  assert.equal(row.clearsPerEndedAttempt, 1 / 3);
  assert.equal(row.abandoned, 1);
  assert.equal(row.open, 1);
  assert.equal(row.interrupted, 1);
  assert.equal(summary.partialAttempts, 1);
  assert.equal(row.distinctParticipantCodes, 1);
});

it('different builds, input methods, courts and demo states cannot be pooled into one balance result', () => {
  const reports = ['build', 'input', 'court', 'demo'].map((difference, index) => {
    const report = fixture();
    report.recordingId = `fixture-${index + 2}`;
    if (difference === 'build') report.attempts[0]!.session.build = 'revision-b';
    if (difference === 'input') report.attempts[0]!.session.input = 'touch';
    if (difference === 'court') report.attempts[0]!.contextAtStart.engine.fieldWidth = 750;
    if (difference === 'demo') report.attempts[0]!.contextAtStart.demo = true;
    return report;
  });
  assert.equal(summarizeExperience([fixture(), ...reports]).journey.length, 5);
});

it('empty evidence produces unavailable rates rather than perfect or zero performance', () => {
  const summary = summarizeExperience([]);
  assert.equal(summary.uniqueAttempts, 0);
  assert.deepEqual(summary.journey, []);
  const report = fixture();
  report.attempts[0]!.outcome = 'open';
  assert.equal(summarizeExperience([report]).journey[0]!.completedWinRate, null);
  assert.equal(summarizeExperience([report]).journey[0]!.clearsPerEndedAttempt, null);
});

it('invalid report formats and inconsistent or negative frame measurements cannot generate a summary', () => {
  assert.throws(() => validateExperience({ format: 'bball-soak-1' }));
  const intervals = fixture();
  intervals.captures[0]!.frames[1]!.intervalMs = 100;
  assert.throws(() => summarizeExperience([intervals]), /inconsistent interval/);
  const clocks = fixture();
  clocks.captures[0]!.frames[0]!.drawMs = -1;
  assert.throws(() => summarizeExperience([clocks]), /Invalid frame/);
  for (const intervalMs of [undefined, '16', NaN, Infinity]) {
    const missing = fixture();
    Object.assign(missing.captures[0]!.frames[1]!, { intervalMs });
    assert.throws(() => summarizeExperience([missing]), /inconsistent interval/);
  }
  const outside = fixture();
  outside.captures[0]!.endedAtMs = 63;
  assert.throws(() => summarizeExperience([outside]), /Invalid frame/);
  const duplicate = fixture();
  duplicate.attempts.push(duplicate.attempts[0]!);
  assert.throws(() => summarizeExperience([duplicate]), /repeated attempt/);
});

it('the summary CLI accepts exported files with spaces, writes valid JSON and rejects malformed evidence', (t) => {
  const folder = mkdtempSync(join(tmpdir(), 'bball-experience-test-'));
  t.after(() => {
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep));
    rmSync(folder, { recursive: true, force: true });
  });
  const file = join(folder, 'a capture.json');
  const output = join(folder, 'a summary.json');
  writeFileSync(file, JSON.stringify(fixture()));
  const script = fileURLToPath(new URL('../../scripts/summarize-experience.ts', import.meta.url));
  const run = spawnSync(process.execPath, ['--import', 'tsx', script, file, '--output', output], {
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(run.status, 0, run.stderr);
  const summary = JSON.parse(readFileSync(output, 'utf8')) as {
    uniqueCaptures: number;
    uniqueAttempts: number;
  };
  assert.equal(summary.uniqueCaptures, 1);
  assert.equal(summary.uniqueAttempts, 1);
  writeFileSync(file, JSON.stringify({ format: 'bball-soak-1' }));
  const bad = spawnSync(process.execPath, ['--import', 'tsx', script, file], {
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Invalid experience report header/);
});
