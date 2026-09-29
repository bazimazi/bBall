/**
 * The newer modes: the Journey, the daily challenge and the Gauntlet.
 *
 * Same theme as the rest of the progression suite - the client reports what
 * happened, the server decides what it was worth - with three new ways to be
 * wrong: a stage that is not open yet, a daily that has closed, and a run
 * whose next match or draft is not what the client says it is.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { dailySpec } from '../../src/core/daily/daily';
import { runRules } from '../../src/core/modes/rules';
import { dayKey } from '../../src/core/progression/xp';
import type { RunSave } from '../../src/core/run/run';
import type { CloudProfileDto, SyncOp, SyncPushResponse } from '../../shared/protocol';
import {
  auth,
  makeServer,
  matchSubmission,
  recordMatch,
  register,
  type TestServer
} from './helpers';

let server: TestServer;

before(async () => {
  server = await makeServer();
});

after(async () => {
  await server.close();
});

async function submit(token: string, patch: Parameters<typeof matchSubmission>[0]) {
  return server.app.inject({
    method: 'POST',
    url: '/v1/progression/match',
    headers: auth(token),
    payload: matchSubmission({ playedAt: server.time(), ...patch })
  });
}

async function push(token: string, ops: SyncOp[]) {
  const response = await server.app.inject({
    method: 'POST',
    url: '/v1/sync/push',
    headers: auth(token),
    payload: { baseVersion: 0, ops }
  });
  assert.equal(response.statusCode, 200);
  return response.json<SyncPushResponse>();
}

function liveRun(profile: CloudProfileDto): RunSave {
  const run = profile.progress?.run;
  assert.ok(run, 'a run should be in progress');
  return run;
}

describe('the Journey', () => {
  it('records the stars a stage earned, and pays for the new ones', async () => {
    const user = await register(server.app);
    const result = await recordMatch(
      server.app,
      user.accessToken,
      matchSubmission({
        mode: 'campaign',
        stageId: 'w1-1',
        botId: 'rookie',
        scoreYou: 3,
        scoreBot: 0,
        shutout: true,
        bestRally: 10,
        hits: 30,
        seconds: 90,
        playedAt: server.time()
      })
    );
    assert.equal(result.profile.progress?.journey['w1-1'], 7, 'win, margin and rally: all three');
    assert.ok(result.summary.lines.some((line) => /star/i.test(line.label)));

    // The same stars again are worth nothing extra.
    server.advance(5 * 60 * 1000);
    const again = await recordMatch(
      server.app,
      user.accessToken,
      matchSubmission({
        mode: 'campaign',
        stageId: 'w1-1',
        botId: 'rookie',
        scoreYou: 3,
        scoreBot: 0,
        shutout: true,
        bestRally: 10,
        hits: 30,
        seconds: 90,
        playedAt: server.time()
      })
    );
    assert.ok(!again.summary.lines.some((line) => /star/i.test(line.label)));
  });

  it('refuses a stage that is not open yet', async () => {
    const user = await register(server.app);
    const response = await submit(user.accessToken, {
      mode: 'campaign',
      stageId: 'w1-3',
      botId: 'amateur',
      scoreYou: 3,
      scoreBot: 1
    });
    assert.notEqual(response.statusCode, 200);
  });

  it('refuses a stage played against the wrong opponent', async () => {
    const user = await register(server.app);
    const response = await submit(user.accessToken, {
      mode: 'campaign',
      stageId: 'w1-1',
      botId: 'legend',
      scoreYou: 3,
      scoreBot: 1
    });
    assert.notEqual(response.statusCode, 200);
  });
});

describe('the daily challenge', () => {
  function dailyWin(key: string) {
    const spec = dailySpec(key);
    const start = spec.modifiers.startScore ?? { you: 0, bot: 0 };
    return {
      mode: 'daily' as const,
      dailyKey: key,
      botId: spec.bot,
      scoreYou: spec.winScore,
      scoreBot: start.bot,
      shutout: false,
      comeback: false
    };
  }

  it('accepts today and starts a streak', async () => {
    const user = await register(server.app);
    const key = dayKey(new Date(server.time()));
    const result = await recordMatch(
      server.app,
      user.accessToken,
      matchSubmission({ ...dailyWin(key), playedAt: server.time() })
    );
    assert.equal(result.profile.progress?.daily.streak, 1);
    assert.equal(result.profile.progress?.daily.clears, 1);
    assert.ok(result.summary.lines.some((line) => line.label === 'Daily clear'));
  });

  it('refuses a daily that closed days ago', async () => {
    const user = await register(server.app);
    const old = new Date(server.time() - 5 * 86_400_000);
    const response = await submit(user.accessToken, dailyWin(dayKey(old)));
    assert.notEqual(response.statusCode, 200);
  });
});

describe('the Gauntlet', () => {
  it('runs a match, opens a draft, and holds the next match until a boon is picked', async () => {
    const user = await register(server.app);
    const started = await push(user.accessToken, [
      { kind: 'run.start', opId: 'run-start-a', payload: { seed: 'seed-a', pressure: 0 } }
    ]);
    assert.equal(started.results[0]?.status, 'applied');
    const run = liveRun(started.profile);
    assert.equal(run.stage, 0);

    const rules = runRules(run);
    const won = await recordMatch(
      server.app,
      user.accessToken,
      matchSubmission({
        mode: 'run',
        runStage: 0,
        botId: rules.bot.id,
        scoreYou: 3,
        scoreBot: 1,
        playedAt: server.time()
      })
    );
    const after = liveRun(won.profile);
    assert.equal(after.stage, 1);
    assert.equal(after.offer?.length, 3);

    // No match while a draft waits.
    server.advance(5 * 60 * 1000);
    const blocked = await submit(user.accessToken, {
      mode: 'run',
      runStage: 1,
      botId: runRules({ ...after, offer: null }).bot.id,
      scoreYou: 3,
      scoreBot: 0
    });
    assert.notEqual(blocked.statusCode, 200);

    // A boon that was not offered is refused; one that was is taken.
    const offered = after.offer![0]!;
    const missing = ['reach', 'heavy', 'angles', 'bend', 'sight', 'crit'].find(
      (id) => !after.offer!.includes(id)
    )!;
    const picks = await push(user.accessToken, [
      { kind: 'run.pick', opId: 'run-pick-bad', payload: { boonId: missing } },
      { kind: 'run.pick', opId: 'run-pick-good', payload: { boonId: offered } }
    ]);
    assert.deepEqual(
      picks.results.map((r) => r.status),
      ['rejected', 'applied']
    );
    const picked = liveRun(picks.profile);
    assert.equal(picked.offer, null);
    if (offered !== 'heart') assert.equal(picked.boons[offered], 1);
  });

  it('refuses a second run while one is under way, and a Pressure not yet earned', async () => {
    const user = await register(server.app);
    const results = await push(user.accessToken, [
      { kind: 'run.start', opId: 'run-start-b-1', payload: { seed: 'seed-b', pressure: 0 } },
      { kind: 'run.start', opId: 'run-start-b-2', payload: { seed: 'seed-c', pressure: 0 } },
      { kind: 'run.abandon', opId: 'run-start-b-3', payload: {} },
      { kind: 'run.start', opId: 'run-start-b-4', payload: { seed: 'seed-d', pressure: 3 } }
    ]);
    assert.deepEqual(
      results.results.map((r) => r.status),
      ['applied', 'rejected', 'applied', 'rejected']
    );
    assert.equal(results.profile.progress?.run, null);
    assert.equal(results.profile.progress?.runRecords.runs, 1);
    assert.equal(results.profile.progress?.lastRun?.seed, 'seed-b');
  });
});

describe('matches that are never recorded', () => {
  it('refuses a two-player match', async () => {
    const user = await register(server.app);
    const response = await submit(user.accessToken, { mode: 'versus', botId: 'pro' });
    assert.notEqual(response.statusCode, 200);
  });

  it('refuses more flicks than returns', async () => {
    const user = await register(server.app);
    const response = await submit(user.accessToken, { flicks: 500, hits: 40 });
    assert.notEqual(response.statusCode, 200);
  });
});
