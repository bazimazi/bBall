import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  distribution,
  FrameCapture,
  MAX_CAPTURE_SAMPLES,
  type FrameSample
} from '../../src/dev/frameCapture';
import { simulationOptions, withSoakRandom } from '../../scripts/sim-options';

const frame = (timestampMs: number, phase = 'play'): FrameSample => ({
  timestampMs,
  phase,
  updateMs: 2,
  drawMs: 3,
  steps: 2
});

it('capture percentiles retain long outliers and leave source samples intact', () => {
  const values = Array.from({ length: 100 }, (_, i) => 100 - i);
  const before = [...values];
  assert.deepEqual(distribution(values), { count: 100, median: 50.5, p95: 95, p99: 99, max: 100 });
  assert.deepEqual(values, before);
  assert.equal(distribution([]), null);
});

it('frame reports use actual intervals and separate engine work, canvas submission and phases', () => {
  const capture = new FrameCapture('rally', 60, 30, 0);
  capture.add(frame(0));
  capture.add(frame(16));
  capture.add(frame(32, 'serve'));
  capture.add(frame(80));
  const report = capture.report(100, 'manual');
  assert.deepEqual(
    report.frames.map((sample) => sample.intervalMs),
    [null, 16, 16, 48]
  );
  assert.equal(report.summary.frameIntervalMs?.p95, 48);
  assert.equal(report.summary.sampledIntervalMs, 80);
  assert.equal(report.summary.lateIntervals, 1);
  assert.equal(report.summary.estimatedMissedRefreshSlots, 2);
  assert.equal(report.summary.engineUpdateMs?.median, 2);
  assert.equal(report.summary.canvasSubmissionMs?.median, 3);
  assert.equal(report.byPhase.play?.samples, 3);
  assert.equal(report.byPhase.serve?.frameIntervalMs?.median, 16);
});

it('invalid and pre-capture timestamps cannot produce negative intervals or reset the valid clock', () => {
  const capture = new FrameCapture('rally', 120, 30, 10);
  capture.add(frame(9));
  capture.add(frame(NaN));
  capture.add(frame(10));
  capture.add(frame(10));
  capture.add(frame(8));
  capture.add({ ...frame(11), updateMs: Infinity });
  capture.add({ ...frame(11), drawMs: -1 });
  capture.add(frame(15));
  assert.equal(capture.invalidSamples, 6);
  assert.deepEqual(
    capture.frames.map((sample) => sample.intervalMs),
    [null, 5]
  );
});

it('a frame reaches the requested duration without fabricating missing samples', () => {
  const capture = new FrameCapture('rally', 60, 1, 100);
  assert.equal(capture.add(frame(110)), null);
  assert.equal(capture.add(frame(1100)), 'duration');
  const report = capture.report(1101, 'duration');
  assert.equal(report.frames.length, 2);
  assert.equal(report.summary.frameIntervalMs?.max, 990);
  assert.equal(report.reason, 'duration');
});

it('frame capture has a hard sample bound even if a caller continues after reaching it', () => {
  const capture = new FrameCapture('limit', 360, 120, 0);
  for (let i = 0; i < MAX_CAPTURE_SAMPLES - 1; i++) assert.equal(capture.add(frame(i / 100)), null);
  assert.equal(capture.add(frame(MAX_CAPTURE_SAMPLES / 100)), 'sample-limit');
  assert.equal(capture.add(frame(500)), 'sample-limit');
  assert.equal(capture.frames.length, MAX_CAPTURE_SAMPLES);
});

it('invalid capture parameters are rejected rather than silently changing comparison conditions', () => {
  assert.throws(() => new FrameCapture('', 60, 30, 0));
  assert.throws(() => new FrameCapture('rally', NaN, 30, 0));
  assert.throws(() => new FrameCapture('rally', 0, 30, 0));
  assert.throws(() => new FrameCapture('rally', 60, 0, 0));
  assert.throws(() => new FrameCapture('rally', 60, 121, 0));
  assert.throws(() => new FrameCapture('rally', 60, 30, Infinity));
});

it('soak options identify reproducible seeds, court width and requested scope', () => {
  assert.deepEqual(simulationOptions([]), {
    matches: 40,
    playerBot: 'pro',
    width: 1000,
    seed: 'bball-soak-v1',
    group: 'all',
    output: null
  });
  assert.deepEqual(
    simulationOptions([
      '6',
      'amateur',
      '--width=750',
      '--seed',
      'trial-1',
      '--group=journey',
      '--output',
      'a report.json'
    ]),
    {
      matches: 6,
      playerBot: 'amateur',
      width: 750,
      seed: 'trial-1',
      group: 'journey',
      output: 'a report.json'
    }
  );
});

it('invalid soak arguments cannot silently run another bot, width or sample size', () => {
  for (const args of [
    ['0'],
    ['1.5'],
    ['1', 'toString'],
    ['--width=NaN'],
    ['--width=740'],
    ['--group=other'],
    ['--seed'],
    ['--seed='],
    ['--width=750', '--width=1290'],
    ['--unknown=1']
  ])
    assert.throws(() => simulationOptions(args), args.join(' '));
});

it('soak randomness repeats per case/trial and restores live randomness even after a failure', () => {
  const original = Math.random;
  const sample = () => Array.from({ length: 8 }, () => Math.random());
  const first = withSoakRandom('trial', 'w1-6', 0, sample);
  assert.deepEqual(withSoakRandom('trial', 'w1-6', 0, sample), first);
  assert.notDeepEqual(withSoakRandom('trial', 'w1-6', 1, sample), first);
  assert.notDeepEqual(withSoakRandom('trial', 'w2-6', 0, sample), first);
  assert.throws(() =>
    withSoakRandom('trial', 'w1-6', 0, () => {
      throw new Error('stop');
    })
  );
  assert.ok(Math.random === original);
});
