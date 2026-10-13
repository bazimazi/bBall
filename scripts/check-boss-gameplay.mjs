import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

/* global window */
// Starts each boss drill through the real UI. Live phase tests then install the
// full authored rules on that real engine, since the UI intentionally freezes
// isolated Practice phases. Points come only from real simulation collisions.
const server = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, open: false, hmr: false }
});
let browser;
const checks = [];
const errors = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(new URL('/?experience=1', server.resolvedUrls.local[0]).href);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.evaluate(async () => {
    const { watchExperienceEngine } = await import('/src/dev/experienceBridge.ts');
    watchExperienceEngine((engine) => {
      window.bossEngine = engine;
    });
    const { settingsStore } = await import('/src/core/settings/store.ts');
    settingsStore.update({ autoServe: false, resumeCountdown: false, replays: false });
  });
  for (const id of ['gatekeeper', 'architect', 'duelist']) {
    await page.getByRole('button', { name: 'More modes', exact: true }).click();
    await page.getByRole('button', { name: /^Practice/ }).click();
    await page.getByRole('button', { name: /^Practice setup/ }).click();
    await page.getByRole('button', { name: 'Boss drill', exact: true }).click();
    await page.locator(`[role="option"][data-value="${id}"]`).click();
    await page.getByRole('button', { name: 'Start boss drill', exact: true }).click();
    const isolated = await page.evaluate(() => ({
      id: window.bossEngine.world.rules.boss.id,
      phases: window.bossEngine.world.rules.boss.phases.length
    }));
    assert.deepEqual(isolated, { id, phases: 0 });
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
    const paused = await page.evaluate(() => ({
      time: window.bossEngine.world.arena.time,
      half: window.bossEngine.world.bot.half,
      cooldowns: window.bossEngine.world.botTalents.slots.map((slot) => slot.cooldown)
    }));
    await page.waitForTimeout(120);
    assert.deepEqual(
      await page.evaluate(() => ({
        time: window.bossEngine.world.arena.time,
        half: window.bossEngine.world.bot.half,
        cooldowns: window.bossEngine.world.botTalents.slots.map((slot) => slot.cooldown)
      })),
      paused,
      `${id}: paused boss clock, reach and skills must stay fixed`
    );
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    const live = await page.evaluate(async (id) => {
      const { AUTHORED_BOSSES } = await import('/src/core/modes/authoredBosses.ts');
      const { practiceRules } = await import('/src/core/modes/rules.ts');
      const { step } = await import('/src/game/simulation.ts');
      const { FIXED_DT, FIELD_H, PADDLE_H } = await import('/src/game/constants.ts');
      const { forecast } = await import('/src/game/trajectory.ts');
      const { bossBeat } = await import('/src/game/bossRhythm.ts');
      const boss = AUTHORED_BOSSES.find((entry) => entry.spec.id === id);
      const engine = window.bossEngine;
      engine.play({ ...practiceRules(boss.bot, 'normal', { bossId: id }), boss: boss.spec });
      const world = engine.world;
      world.autoServe = true;
      const phases = [];
      const beats = new Set();
      const reach = { guard: 0, recovery: 1 };
      let previousPhase = -1;
      for (let frame = 0; frame < 100000 && world.match.status !== 'over'; frame++) {
        if (world.match.status === 'play' && world.ball.vx < 0) {
          const landing = forecast(world, world.player.x);
          const direction = world.bot.y > FIELD_H / 2 ? 1 : -1;
          world.player.target = landing + direction * world.player.half * 0.7;
        }
        step(world, FIXED_DT);
        const beat = bossBeat(world);
        beats.add(beat);
        let base = world.rules.modifiers.botPaddleScale;
        for (let phase = 0; phase < world.arena.phase; phase++)
          base = boss.spec.phases[phase]?.botPaddleScale ?? base;
        const factor = world.bot.baseHalf / ((PADDLE_H / 2) * base);
        if (beat === 'guard') reach.guard = Math.max(reach.guard, factor);
        if (beat === 'recovery') reach.recovery = Math.min(reach.recovery, factor);
        if (world.arena.phase !== previousPhase) {
          previousPhase = world.arena.phase;
          phases.push({
            phase: previousPhase,
            score: { ...world.match.score },
            arena: world.arena.spec,
            rank: world.botBrain.profile.rank
          });
        }
      }
      engine.publish();
      return {
        status: world.match.status,
        phases,
        beats: [...beats],
        reach,
        winner: world.match.winner
      };
    }, id);
    assert.equal(live.status, 'over', `${id}: natural duel must finish`);
    assert.deepEqual(live.beats.sort(), ['guard', 'recovery', 'windup']);
    assert.ok(live.reach.guard >= 0.99, `${id}: guard beat must restore full phase reach`);
    assert.ok(live.reach.recovery <= 0.71, `${id}: recovery beat must expose the authored opening`);
    assert.deepEqual(
      live.phases.map((phase) => phase.phase),
      [0, 1, 2],
      `${id}: natural points must reach both authored phases`
    );
    assert.equal(live.phases[1].rank, 4, `${id}: first phase upgrades to Elite`);
    assert.equal(live.phases[2].rank, 4, `${id}: final phase retains the Elite upgrade`);
    assert.notDeepEqual(live.phases[0].arena, live.phases[1].arena);
    assert.notDeepEqual(live.phases[1].arena, live.phases[2].arena);
    checks.push({ id, isolated, paused: true, live });
    await page
      .getByRole('heading', { name: /defeated|Bot wins|You win/ })
      .waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    console.log(
      `${id}: UI drill launch, frozen pause, all three rhythm beats and two naturally scored phases passed`
    );
  }
  assert.deepEqual(errors, []);
  await mkdir('.temp/boss-gameplay', { recursive: true });
  await writeFile('.temp/boss-gameplay/results.json', JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
