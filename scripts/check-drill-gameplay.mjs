import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

/* global window, document */
// Actual app navigation, pointer aiming and keyboard serving. Observers call
// the original drawing/audio methods and never change a live score or result.
// The renderer and animation loop keep running for every attempt.
const server = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, open: false, hmr: false }
});
let browser;
const checks = [];
const errors = [];
const selectedIds = (process.env.DRILL_IDS ?? 'bank,gate,placement').split(',');
const selectedEntries = (process.env.DRILL_ENTRIES ?? 'routes,practice').split(',');
assert.ok(
  selectedIds.every((id) => ['bank', 'gate', 'placement'].includes(id)),
  'invalid DRILL_IDS'
);
assert.ok(
  selectedEntries.every((entry) => ['routes', 'practice'].includes(entry)),
  'invalid DRILL_ENTRIES'
);
const directory = `.temp/drill-gameplay${process.env.DRILL_IDS || process.env.DRILL_ENTRIES ? '/focused' : ''}`;

async function observeDrill(page) {
  await page.evaluate(async () => {
    const { BALL_R } = await import('/src/game/constants.ts');
    const { watchExperienceEngine } = await import('/src/dev/experienceBridge.ts');
    watchExperienceEngine((engine) => {
      window.drillEngine = engine;
      if (!engine || engine.drillObserved) return;
      engine.drillObserved = true;
      const observation = { botDraws: 0, playerDraws: 0, pipDraws: 0, goalPath: null, shot: null };
      window.drillObservation = observation;
      const solo = (world) => !!world.rules.technique && !world.rules.ranked;
      const renderer = engine.renderer;
      const paddle = renderer.drawPaddle;
      renderer.drawPaddle = function (world, body, ...args) {
        if (solo(world)) {
          if (body.side === 'bot') observation.botDraws++;
          else observation.playerDraws++;
        }
        return paddle.call(this, world, body, ...args);
      };
      const pips = renderer.drawPips;
      renderer.drawPips = function (world, ...args) {
        if (solo(world)) observation.pipDraws++;
        return pips.call(this, world, ...args);
      };
      const render = renderer.render;
      renderer.render = function (world) {
        const shot = observation.shot;
        if (shot && solo(world) && world.match.status === 'play') {
          const { ball, match, view } = world;
          if (ball.owner === 'you' && ball.vx > 0) {
            shot.farthestVisibleX = Math.max(shot.farthestVisibleX, ball.x);
            if (ball.x > view.w * 0.82 && match.score.you === shot.scoreYou)
              shot.liveBeyondOldTarget = true;
          }
        }
        return render.call(this, world);
      };
      // Observe the real green target stroke, including its canvas transform.
      // A floating target must fail even if the scoring helper has been fixed.
      const ctx = renderer.ctx;
      let path = [];
      for (const method of ['beginPath', 'moveTo', 'lineTo']) {
        const original = ctx[method];
        ctx[method] = function (...args) {
          if (method === 'beginPath') path = [];
          else path.push({ x: args[0], y: args[1] });
          return original.apply(this, args);
        };
      }
      const stroke = ctx.stroke;
      ctx.stroke = function (...args) {
        if (solo(engine.world) && this.strokeStyle === '#80ffca' && this.lineWidth === 5) {
          const transform = this.getTransform();
          observation.goalPath = path.map(({ x, y }) => ({
            x,
            y,
            screenX: (transform.a * x + transform.c * y + transform.e) / engine.world.view.dpr,
            screenY: (transform.b * x + transform.d * y + transform.f) / engine.world.view.dpr
          }));
          observation.goalPhase = {
            status: engine.world.match.status,
            points: engine.world.match.points
          };
        }
        return stroke.apply(this, args);
      };
      const point = engine.world.audio.point;
      engine.world.audio.point = function (...args) {
        const world = engine.world;
        if (solo(world) && observation.shot)
          observation.shot.endpoint = {
            x: world.ball.x,
            y: world.ball.y,
            owner: world.ball.owner,
            won: args[0],
            width: world.view.w,
            goalX: world.view.w - BALL_R
          };
        return point.apply(this, args);
      };
    });
    const { settingsStore } = await import('/src/core/settings/store.ts');
    settingsStore.update({
      autoServe: false,
      resumeCountdown: false,
      replays: false,
      shake: 'off'
    });
  });
}

async function checkServe(page, id) {
  await page.waitForFunction(() => window.drillEngine.world.match.status === 'serve');
  await page.getByText('Solo drill · 3 targets before 3 misses', { exact: true }).waitFor();
  await page.waitForFunction(async () => {
    const { techniqueTarget } = await import('/src/core/modes/drills.ts');
    const world = window.drillEngine.world;
    const path = window.drillObservation.goalPath;
    return (
      path?.length === 2 &&
      path[0].y === techniqueTarget(world.rules.technique, world.match.points)[0] * world.view.h
    );
  });
  assert.ok(
    await page
      .getByText('Misses', { exact: true })
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
    'the Misses HUD label must be fully visible in portrait as well as landscape'
  );
  const state = await page.evaluate(async () => {
    const world = window.drillEngine.world;
    const { BALL_R, FIELD_H } = await import('/src/game/constants.ts');
    const { toScreenX, toScreenY } = await import('/src/game/view.ts');
    const { techniqueTarget } = await import('/src/core/modes/drills.ts');
    const [low, high] = techniqueTarget(world.rules.technique, world.match.points);
    const x = world.view.w - BALL_R;
    return {
      technique: world.rules.technique,
      ball: { x: world.ball.x, y: world.ball.y },
      width: world.view.w,
      height: FIELD_H,
      screenCenter: { x: world.view.cx, y: world.view.cy },
      ballScreen: {
        x: toScreenX(world.view, world.ball.x, world.ball.y),
        y: toScreenY(world.view, world.ball.x, world.ball.y)
      },
      goal: [low, high].map((fraction) => ({
        x,
        y: fraction * FIELD_H,
        screenX: toScreenX(world.view, x, fraction * FIELD_H),
        screenY: toScreenY(world.view, x, fraction * FIELD_H)
      })),
      observation: window.drillObservation,
      hud: document.body.innerText
    };
  });
  assert.equal(state.technique, id);
  assert.equal(state.ball.x, state.width / 2, 'every feed must start at the court centre');
  assert.equal(state.ball.y, state.height / 2);
  assert.deepEqual(
    state.ballScreen,
    state.screenCenter,
    'the rendered ball must be screen-centred'
  );
  assert.match(state.hud, /Targets\s+\d+\s+Misses\s+\d+/);
  assert.doesNotMatch(state.hud, /opponent|First to 3|Rival/);
  assert.equal(state.observation.botDraws, 0, 'solo drills must never draw a bot paddle');
  assert.equal(state.observation.pipDraws, 0, 'solo drills must not draw duel score pips');
  assert.ok(state.observation.playerDraws > 0, 'the actual player paddle must still render');
  for (let i = 0; i < 2; i++)
    for (const coordinate of ['x', 'y', 'screenX', 'screenY'])
      assert.ok(
        Math.abs(state.observation.goalPath[i][coordinate] - state.goal[i][coordinate]) < 0.01,
        `${id} target ${coordinate} must match the visible far boundary, including portrait rotation`
      );
  return state;
}

async function beginShotObservation(page) {
  await page.evaluate(() => {
    window.drillObservation.shot = {
      scoreYou: window.drillEngine.world.match.score.you,
      farthestVisibleX: 0,
      liveBeyondOldTarget: false,
      endpoint: null
    };
  });
}

async function checkShot(page, success) {
  const observation = await page.evaluate(() => window.drillObservation);
  const shot = observation.shot;
  assert.equal(shot.endpoint.won, success);
  if (success) {
    assert.ok(
      shot.liveBeyondOldTarget,
      'the ball must remain live beyond the former midfield target'
    );
    assert.ok(
      shot.farthestVisibleX > shot.endpoint.width * 0.9,
      'the returned ball must visibly travel into the far end before scoring'
    );
    assert.equal(shot.endpoint.owner, 'you');
    assert.ok(
      Math.abs(shot.endpoint.x - shot.endpoint.goalX) < 1e-8,
      'a target must score exactly when the ball touches the far court edge'
    );
  }
  assert.equal(observation.botDraws, 0);
  assert.equal(observation.pipDraws, 0);
  return shot;
}

async function checkFinishedTarget(page, id) {
  await page.waitForFunction(
    () =>
      window.drillObservation.goalPhase?.status === 'over' &&
      window.drillObservation.goalPhase.points === 3
  );
  const state = await page.evaluate(async () => {
    const { techniqueTarget } = await import('/src/core/modes/drills.ts');
    const world = window.drillEngine.world;
    return {
      path: window.drillObservation.goalPath,
      expected: techniqueTarget(world.rules.technique, world.match.points - 1).map(
        (fraction) => fraction * world.view.h
      )
    };
  });
  assert.deepEqual(
    state.path.map((point) => point.y),
    state.expected,
    `${id} must keep the final scored target visible during the completed match`
  );
  return state.path;
}
try {
  await mkdir(directory, { recursive: true });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 }
  ]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(new URL('/?experience=1', server.resolvedUrls.local[0]).href);
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await observeDrill(page);
    const progression = await page.evaluate(async () => {
      const { profileStore } = await import('/src/core/profile/store.ts');
      const profile = profileStore.getSnapshot();
      return { xp: profile.xp, stats: profile.stats, talents: profile.talents, loot: profile.loot };
    });
    for (const [id, name] of [
      ['bank', 'Bank-shot drill'],
      ['gate', 'Gate-timing drill'],
      ['placement', 'Placement drill']
    ]) {
      if (!selectedIds.includes(id)) continue;
      for (const entry of ['Short sessions', 'Practice']) {
        if (!selectedEntries.includes(entry === 'Short sessions' ? 'routes' : 'practice')) continue;
        await page.getByRole('button', { name: 'More modes', exact: true }).click();
        if (entry === 'Short sessions') {
          await page.getByRole('button', { name: /^Short sessions/ }).click();
          const route =
            id === 'bank'
              ? 'Learn the bank'
              : id === 'gate'
                ? 'Read the opening'
                : 'Find the corners';
          const card = page
            .locator('div')
            .filter({
              has: page.getByRole('heading', { name: route, exact: true })
            })
            .filter({ has: page.getByRole('button', { name: 'Start route', exact: true }) })
            .last();
          await card.getByRole('button', { name: 'Start route', exact: true }).click();
        } else {
          await page.getByRole('button', { name: /^Practice/ }).click();
          await page.getByRole('button', { name: /^Technique drills/ }).click();
          await page.getByRole('button', { name, exact: true }).click();
        }
        await page.waitForFunction((id) => window.drillEngine?.world.rules.technique === id, id);
        const initial = await checkServe(page, id);
        await page.waitForFunction(() => window.drillEngine.world.fx.bannerTimer <= 0);
        const screenshot = `${viewport.width}-${id}-${entry === 'Short sessions' ? 'route' : 'practice'}-serve.png`;
        await page.screenshot({ path: `${directory}/${screenshot}` });
        const shots = [];
        for (let point = 0; point < 3; point++) {
          await checkServe(page, id);
          if (id === 'gate') {
            const opening = await page.evaluate(async () => {
              const world = window.drillEngine.world;
              const { gateOpening } = await import('/src/game/course.ts');
              return {
                time: world.arena.time,
                opening: gateOpening(world.arena.spec.gates[0], world.arena.time)
              };
            });
            await page.waitForTimeout(250);
            const held = await page.evaluate(async () => {
              const world = window.drillEngine.world;
              const { gateOpening } = await import('/src/game/course.ts');
              return {
                time: world.arena.time,
                opening: gateOpening(world.arena.spec.gates[0], world.arena.time)
              };
            });
            assert.equal(
              opening.time,
              0,
              'each gate feed must preview its launch phase immediately'
            );
            assert.deepEqual(
              held,
              opening,
              'the visible gate opening must stay fixed while preparing the feed'
            );
          }
          const aim = await page.evaluate(
            async ({ id, point }) => {
              const { createWorld, placePaddles } = await import('/src/game/world.ts');
              const { techniqueRules } = await import('/src/core/modes/drills.ts');
              const { startMatch, launchBall } = await import('/src/game/match.ts');
              const { step } = await import('/src/game/simulation.ts');
              const { FIXED_DT, FIELD_H } = await import('/src/game/constants.ts');
              const { toScreenX, toScreenY } = await import('/src/game/view.ts');
              const actual = window.drillEngine.world;
              const audio = new Proxy({}, { get: () => () => 0 });
              for (let offset = -0.9; offset < 0.91; offset += 0.025) {
                const probe = createWorld(audio, 1);
                probe.view.w = actual.view.w;
                placePaddles(probe);
                startMatch(probe, techniqueRules(id));
                probe.match.points = point;
                probe.replays = false;
                probe.player.y = probe.player.target = FIELD_H / 2 + offset * probe.player.half;
                launchBall(probe);
                for (let i = 0; i < 6000 && probe.match.status === 'play'; i++)
                  step(probe, FIXED_DT);
                if (probe.match.score.you > 0) {
                  const y = FIELD_H / 2 + offset * actual.player.half;
                  return {
                    x: toScreenX(actual.view, actual.player.x + 70, y),
                    y: toScreenY(actual.view, actual.player.x + 70, y),
                    fieldY: y
                  };
                }
              }
              throw new Error('No achievable ' + id + ' shot at attempt ' + point);
            },
            { id, point }
          );
          await page.mouse.move(aim.x, aim.y);
          await page.waitForFunction(
            (y) => Math.abs(window.drillEngine.world.player.y - y) < 0.3,
            aim.fieldY
          );
          await beginShotObservation(page);
          await page.keyboard.press('Enter');
          if (id === 'gate' && point === 0) {
            await page.waitForFunction(
              () =>
                window.drillEngine.world.match.status === 'play' &&
                window.drillEngine.world.arena.time > 0
            );
            assert.ok(
              await page.evaluate(() => window.drillEngine.world.arena.time > 0),
              'the gate must start moving with the live feed'
            );
          }
          await page.waitForFunction(
            (point) => window.drillEngine.world.match.score.you === point + 1,
            point,
            { timeout: 15000 }
          );
          const score = await page.evaluate(() => ({ ...window.drillEngine.world.match.score }));
          assert.equal(score.bot, 0, `${id} must award the aimed target, without an extra miss`);
          shots.push(await checkShot(page, true));
        }
        const finishedTarget = await checkFinishedTarget(page, id);
        await page.getByRole('heading', { name: 'Drill complete', exact: true }).waitFor();
        checks.push({
          viewport,
          id,
          entry,
          outcome: '3 real aimed targets',
          ball: initial.ball,
          width: initial.width,
          goal: initial.goal,
          screenshot,
          shots,
          finishedTarget
        });
        if (entry === 'Short sessions') {
          await page.screenshot({ path: `${directory}/${viewport.width}-${id}-route-result.png` });
          await page.getByRole('button', { name: 'Short sessions', exact: true }).click();
          await page.getByRole('heading', { name: 'Short sessions', exact: true }).waitFor();
          const saved = await page.evaluate(
            async (routeId) => {
              const { loadRoutes } = await import('/src/core/modes/routes.ts');
              const { profileStore } = await import('/src/core/profile/store.ts');
              return loadRoutes(profileStore.getSnapshot().id).find(
                (route) => route.id === routeId
              );
            },
            id === 'bank' ? 'banks' : id === 'gate' ? 'timing' : 'placement'
          );
          assert.equal(saved.step, 1, 'the real first drill must advance exactly one route step');
          assert.equal(saved.attempts, 1);
          await page.getByRole('button', { name: 'Back', exact: true }).click();
          console.log(
            `${viewport.width}×${viewport.height}: ${id} Short session first step passed`
          );
          continue;
        }
        await page.getByRole('button', { name: 'Practise again', exact: true }).click();
        for (let miss = 0; miss < 3; miss++) {
          await checkServe(page, id);
          const aim = await page.evaluate(async () => {
            const { toScreenX, toScreenY } = await import('/src/game/view.ts');
            const { view } = window.drillEngine.world;
            // Aim in an unobstructed canvas lane. The upper-left HUD is an
            // interactive control and intentionally does not steer the paddle.
            return { x: toScreenX(view, view.w * 0.4, 80), y: toScreenY(view, view.w * 0.4, 80) };
          });
          await page.mouse.move(aim.x, aim.y);
          await page.waitForFunction(() => window.drillEngine.world.player.y < 90);
          await beginShotObservation(page);
          await page.keyboard.press('Enter');
          await page.waitForFunction(
            (miss) => window.drillEngine.world.match.score.bot === miss + 1,
            miss
          );
          await checkShot(page, false);
        }
        await page.getByRole('heading', { name: 'Keep practising', exact: true }).waitFor();
        checks.push({
          viewport,
          id,
          entry: 'Practice replay',
          outcome: '3 real missed feeds, clean replay'
        });
        await page.getByRole('button', { name: 'Practice', exact: true }).click();
        await page.getByRole('button', { name: 'Back', exact: true }).click();
        console.log(
          `${viewport.width}×${viewport.height}: ${id} Practice and missed-feed replay passed`
        );
      }
    }
    assert.deepEqual(
      await page.evaluate(async () => {
        const { profileStore } = await import('/src/core/profile/store.ts');
        const profile = profileStore.getSnapshot();
        return {
          xp: profile.xp,
          stats: profile.stats,
          talents: profile.talents,
          loot: profile.loot
        };
      }),
      progression,
      'Technique matches must not change progression'
    );
    await page.close();
    console.log(
      `${viewport.width}×${viewport.height}: selected drill flows completed with real input`
    );
  }
  assert.deepEqual(errors, []);
  await writeFile(`${directory}/results.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(`${checks.length} real drill and Short sessions gameplay checks passed.`);
} finally {
  await browser?.close();
  await server.close();
}
