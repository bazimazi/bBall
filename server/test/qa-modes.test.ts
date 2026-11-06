/**
 * Mode flow, rules and progression findings from QA: leaving a match early,
 * Gauntlet continuation, clears, Pressure, drafts, idle XP, challenge goals,
 * Journey expansion bosses, cup trophies and the placement drill. Each test
 * pins the rule the shared core now applies, on the client and the server.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { stageById, stageCode, worldById, worldTitle } from '../../src/core/campaign/journey';
import { EXPANSION_WORLDS, frontierStage } from '../../src/core/campaign/expansion';
import { CHALLENGES, challengeById, contractChallenge } from '../../src/core/modes/challenges';
import { techniqueRules, techniqueTarget, TECHNIQUES } from '../../src/core/modes/drills';
import { encounterPracticeRules } from '../../src/core/modes/encounterPractice';
import { validArena } from '../../src/core/modes/recipes';
import {
  challengeRulesById,
  endlessRules,
  objectiveMet,
  practiceRules,
  quickMatchRules,
  runRules,
  tournamentRules
} from '../../src/core/modes/rules';
import { starGoalLabel } from '../../src/core/modes/stars';
import type { MatchResult } from '../../src/core/modes/types';
import { createProfile } from '../../src/core/profile/defaults';
import type { PlayerProfile } from '../../src/core/profile/types';
import { applyMatchResult } from '../../src/core/progression/apply';
import { forfeitResult, isForfeit, leaveStakes } from '../../src/core/progression/forfeit';
import { computeMatchXp, PARTICIPATION_XP, trophyAward } from '../../src/core/progression/xp';
import { boonById, RELICS } from '../../src/core/run/boons';
import { usefulFor } from '../../src/core/run/draft';
import { actIndex, atBoundary, ENDLESS_CLEAR_ACTS, runCleared } from '../../src/core/run/formats';
import { runActionOn, runBuild } from '../../src/core/run/ops';
import {
  advanceRun,
  createRun,
  encounterFor,
  hardCourt,
  pickBoon,
  PRESSURE,
  type RunSave
} from '../../src/core/run/run';
import { resolveLoadout } from '../../src/core/talents/effects';
import { createTalentSave } from '../../src/core/talents/save';
import { EMPTY_MATCH_STATS } from '../../src/core/talents/types';
import { createTournament, tierById, TOURNAMENT_TIERS } from '../../src/core/tournament/bracket';
import { FIELD_H, FIXED_DT } from '../../src/game/constants';
import { updateArena } from '../../src/game/arena';
import type { GameAudio } from '../../src/game/audio';
import { launchBall, startMatch } from '../../src/game/match';
import { stepBall } from '../../src/game/physics';
import { techniqueOutcome } from '../../src/game/technique';
import { createWorld, placePaddles } from '../../src/game/world';
import type { CloudProfileDto } from '../../shared/protocol';
import {
  auth,
  makeServer,
  matchSubmission,
  recordMatch,
  register,
  type TestServer
} from './helpers';

function result(patch: Partial<MatchResult> = {}): MatchResult {
  return {
    mode: 'quick',
    ranked: true,
    botId: 'amateur',
    botRank: 2,
    won: true,
    scoreYou: 5,
    scoreBot: 3,
    bestRally: 10,
    hits: 30,
    seconds: 90,
    livesLeft: 0,
    objectiveMet: true,
    objective: null,
    talent: { ...EMPTY_MATCH_STATS },
    flicks: 0,
    shutout: false,
    comeback: false,
    abandoned: false,
    ...patch
  };
}

const ctx = { matchesToday: 0, firstChallengeClear: false, talentXpMul: 1 };

/** Win a Gauntlet encounter through the shared progression path. */
function winRunMatch(profile: PlayerProfile): PlayerProfile {
  const run = profile.progress.run!;
  const rules = runRules(run);
  const next = applyMatchResult(
    profile,
    result({
      mode: 'run',
      botId: rules.bot.id,
      botRank: rules.bot.rank,
      runStage: run.stage,
      scoreYou: rules.winScore,
      scoreBot: 0
    })
  ).profile;
  const after = next.progress.run;
  if (after?.offer) next.progress.run = pickBoon(after, after.offer[0]!)!;
  return next;
}

// ------------------------------------------------------------ #1, #2 leaving

describe('leaving a match early', () => {
  it('is free until a point is played, then costs a loss, a cup or a heart', () => {
    const quick = quickMatchRules('pro');
    assert.equal(leaveStakes(quick, { you: 0, bot: 0 }, null), null, 'untouched is free');
    assert.deepEqual(leaveStakes(quick, { you: 0, bot: 4 }, null), { kind: 'loss' });
    assert.equal(leaveStakes(practiceRules('pro'), { you: 1, bot: 4 }, null), null);
    assert.equal(leaveStakes(endlessRules(), null, null), null);

    // A deficit the match starts on is not a point played.
    const twoDown = challengeRulesById('comeback')!;
    assert.equal(leaveStakes(twoDown, { you: 0, bot: 2 }, null), null);
    assert.deepEqual(leaveStakes(twoDown, { you: 1, bot: 2 }, null), { kind: 'loss' });

    const cup = tournamentRules({ ...createTournament(0, 0), round: 1 });
    assert.deepEqual(leaveStakes(cup, { you: 1, bot: 1 }, null), {
      kind: 'cup',
      cup: 'Bronze Cup',
      round: 2,
      rounds: 3
    });

    // A committed Gauntlet encounter is at stake from the first serve.
    const run: RunSave = { ...createRun('stakes', 0, 0, 'sprint'), attempt: { stage: 0 } };
    assert.deepEqual(leaveStakes(runRules(run), { you: 0, bot: 0 }, run), {
      kind: 'heart',
      hearts: 3
    });
    assert.equal(
      leaveStakes(runRules(run), { you: 0, bot: 0 }, { ...run, attempt: undefined }),
      null
    );
  });

  it('a forfeit records a loss and ends the streak but pays nothing', () => {
    let profile = createProfile();
    profile = applyMatchResult(profile, result()).profile;
    assert.equal(profile.stats.currentStreak, 1);
    const xp = profile.xp;
    const forfeit = forfeitResult(quickMatchRules('pro'), { you: 0, bot: 4 }, 600, '2026-11-06');
    assert.equal(isForfeit(forfeit), true);
    assert.equal(forfeit.seconds, 240, 'a long pause is not counted as play');
    const after = applyMatchResult(profile, forfeit);
    assert.equal(after.profile.stats.currentStreak, 0);
    assert.equal(after.profile.stats.losses, 1);
    assert.equal(after.profile.stats.matches, 2);
    assert.equal(after.profile.xp, xp);
    assert.equal(after.award.total, 0);
  });

  it('a forfeited cup round knocks the player out', () => {
    const profile = createProfile();
    profile.tournament = { ...createTournament(0, 0), round: 1 };
    const rules = tournamentRules(profile.tournament);
    const after = applyMatchResult(
      profile,
      forfeitResult(rules, { you: 1, bot: 1 }, 60, '2026-11-06')
    );
    assert.equal(after.profile.tournament, null);
    assert.equal(after.profile.lastTournament?.finished, true);
    assert.equal(after.profile.lastTournament?.champion, false);
    assert.equal(after.tournament?.finished, true);
  });

  it('Gauntlet restart spends a heart and the last one ends the run', () => {
    let profile = createProfile();
    profile.progress.run = {
      ...createRun('restart', 0, 0, 'sprint'),
      attempt: { stage: 0 },
      hearts: 2
    };
    profile = runActionOn(profile, 'restart')!;
    assert.equal(profile.progress.run?.hearts, 1);
    profile.progress.run = { ...profile.progress.run!, attempt: { stage: 0 } };
    profile = runActionOn(profile, 'restart')!;
    assert.equal(profile.progress.run, null);
    assert.equal(profile.progress.lastRun?.won, false);
  });
});

// ------------------------------------------------- #3, #4 continuation, clears

describe('Gauntlet formats', () => {
  it('a Sprint continued into Endless keeps climbing from its final act', () => {
    let profile = createProfile();
    const sprint = createRun('continue', 0, 1, 'sprint');
    const finalAct = encounterFor(sprint, 8);
    profile.progress.lastRun = { ...sprint, stage: 9, finished: true, won: true };
    profile = runActionOn(profile, 'continue')!;
    const run = profile.progress.run!;
    assert.equal(run.stage, 9);
    assert.ok(atBoundary(run));
    assert.equal(actIndex(run), 3, 'Act 4, after the Sprint’s three');
    assert.match(runRules(run).objective!.label, /Act 4, match 1 of 6/);
    const next = encounterFor(run);
    const rank = ['rookie', 'amateur', 'pro', 'elite', 'legend'];
    assert.ok(rank.indexOf(next.bot) >= rank.indexOf(finalAct.bot) - 1);
    assert.ok(encounterFor(run, 14).boss, 'the act still closes on a boss');
    // An Expedition already ends on a six-match boundary.
    let expedition = createProfile();
    expedition.progress.lastRun = {
      ...createRun('exp', 0, 1, 'expedition'),
      stage: 36,
      finished: true,
      won: true
    };
    expedition = runActionOn(expedition, 'continue')!;
    assert.equal(actIndex(expedition.progress.run!), 6);
  });

  it('an Endless run clears once, after three acts, and its acts are not clears', () => {
    let profile = createProfile();
    profile.progress.run = createRun('endless-clear', 0, 1, 'endless');
    for (let i = 0; i < 12; i++) profile = winRunMatch(profile);
    assert.equal(profile.progress.runRecords.clears, 0);
    assert.equal(profile.progress.runRecords.bestPressure, -1, 'Pressure 1 stays locked');
    assert.equal(profile.achievements['run-clear'], undefined);
    const banked = runActionOn(profile, 'bank')!;
    assert.equal(banked.progress.runRecords.clears, 0);
    assert.equal(runCleared(banked.progress.lastRun!), false);

    for (let i = 0; i < 6; i++) profile = winRunMatch(profile);
    assert.equal(actIndex(profile.progress.run!), ENDLESS_CLEAR_ACTS);
    assert.equal(profile.progress.runRecords.clears, 1);
    assert.equal(profile.progress.runRecords.bestPressure, 0);
    assert.ok(profile.achievements['run-clear']);
    for (let i = 0; i < 12; i++) profile = winRunMatch(profile);
    assert.equal(profile.progress.runRecords.clears, 1, 'a run counts once');
    assert.equal(runCleared(profile.progress.run!), true);
  });

  it('a cleared Sprint continued into Endless does not count again', () => {
    let profile = createProfile();
    profile.progress.run = createRun('sprint-clear', 0, 1, 'sprint');
    for (let i = 0; i < 9; i++) profile = winRunMatch(profile);
    assert.equal(profile.progress.runRecords.clears, 1);
    profile = runActionOn(profile, 'continue')!;
    for (let i = 0; i < 18; i++) profile = winRunMatch(profile);
    assert.equal(profile.progress.runRecords.clears, 1);
    assert.equal(profile.progress.runRecords.runs, 1);
  });
});

// ----------------------------------------------------------- #5 Hard Courts

describe('Hard Courts', () => {
  it('turns a new-format encounter’s hazards up from Pressure 3', () => {
    let harder = 0;
    let courts = 0;
    for (let stage = 0; stage < 36; stage++) {
      const below = encounterFor(createRun('hard', 2, 0, 'expedition'), stage);
      const at = encounterFor(createRun('hard', 3, 0, 'expedition'), stage);
      // Bosses rotate with Pressure; the same ordinary court compares cleanly.
      if (below.boss || at.boss) continue;
      const calm = below.modifiers.arena;
      const hard = at.modifiers.arena;
      assert.ok(calm && hard, 'every new-format encounter is a hazard court');
      courts++;
      assert.ok(validArena(hard));
      if (JSON.stringify(calm) !== JSON.stringify(hard)) harder++;
      if (calm.wind && hard.wind)
        assert.ok(Math.abs(hard.wind.strength) >= Math.abs(calm.wind.strength));
      for (const [i, gate] of (hard.gates ?? []).entries())
        assert.ok(gate.gap <= calm.gates![i]!.gap);
    }
    assert.equal(harder, courts, `${harder} of ${courts} courts changed`);
    assert.match(PRESSURE[2]!.blurb, /harder hazards/);
    assert.equal(hardCourt({}).zones?.length, 2, 'a plain court gains pace zones');
  });
});

// ----------------------------------------------------------------- #6 drafts

describe('Gauntlet drafts', () => {
  const fresh = resolveLoadout(createTalentSave(), 1);

  it('offer only options that change something for the build, never relics alone', () => {
    let offers = 0;
    for (let s = 0; s < 120; s++) {
      let run = createRun(`draft-${s}`, s % 6, 1, 'expedition');
      for (let i = 0; i < 10; i++) {
        run = advanceRun(run, true, 3, 0, fresh).save;
        const offer = run.offer!.map((id) => boonById(id)!);
        const useful = usefulFor(fresh, run.boons);
        for (const boon of offer) if (!boon.instant) assert.ok(useful(boon), boon.id);
        assert.ok(
          offer.some((boon) => boon.family !== 'relic'),
          offer.map((b) => b.id).join()
        );
        assert.ok(!run.offer!.includes('strike-clock'), 'no Power Strike, no strike cooldown');
        offers++;
        run = pickBoon(run, run.offer![s % run.offer!.length]!)!;
      }
    }
    assert.equal(offers, 1200);
  });

  it('drafts follow the build: a skill opens its own boons', () => {
    const save = createTalentSave();
    const struck = { ...fresh, equipped: ['power-strike', null, null] } as typeof fresh;
    assert.equal(usefulFor(fresh, {})(boonById('strike-clock')!), false);
    assert.equal(usefulFor(struck, {})(boonById('strike-clock')!), true);
    assert.equal(usefulFor(fresh, {})(boonById('reach')!), true, 'match boons always count');
    assert.ok(save);
  });

  it('server and client roll the same draft from the profile build', () => {
    let profile = createProfile();
    profile.progress.run = createRun('same-draft', 0, 1, 'sprint');
    const run = profile.progress.run;
    const rules = runRules(run);
    const summary = applyMatchResult(
      profile,
      result({
        mode: 'run',
        botId: rules.bot.id,
        botRank: rules.bot.rank,
        runStage: 0,
        scoreYou: 3,
        scoreBot: 0
      })
    );
    profile = summary.profile;
    const expected = advanceRun(run, true, 3, 0, runBuild(createProfile())).save.offer;
    assert.deepEqual(profile.progress.run!.offer, expected);
  });

  it('relic cards say what they double and what they cost', () => {
    const relic = RELICS.find((item) => item.name === 'Strike Clock Relic')!;
    assert.equal(
      relic.blurb,
      "Two ranks of Strike Clock at once (Strike cooldown -0.4s per rank). Cost: opponent's paddle 8% longer"
    );
    for (const item of RELICS)
      assert.match(item.blurb, /^Two ranks of .+ at once \(.+ per rank\)\. Cost: /);
  });
});

// ------------------------------------------------------------------- #7 XP

describe('idle matches', () => {
  it('a loss without returns pays only participation, whatever the opponent', () => {
    const idle = result({
      won: false,
      scoreYou: 0,
      scoreBot: 5,
      hits: 2,
      bestRally: 3,
      botId: 'legend',
      botRank: 5
    });
    assert.equal(computeMatchXp(idle, ctx).total, PARTICIPATION_XP);
    const rookieWin = result({ botId: 'rookie', botRank: 1, scoreYou: 5, scoreBot: 2 });
    assert.ok(computeMatchXp(rookieWin, ctx).total > computeMatchXp(idle, ctx).total * 4);
    const fought = result({
      won: false,
      scoreYou: 1,
      scoreBot: 5,
      hits: 9,
      botId: 'legend',
      botRank: 5
    });
    assert.ok(computeMatchXp(fought, ctx).total > 100, 'a contested loss still pays');
  });
});

// ---------------------------------------------------- #8, #9 challenge goals

describe('challenge goals', () => {
  it('rally challenges say they need a win', () => {
    for (const id of ['jetstream', 'long-rally']) {
      const challenge = challengeById(id)!;
      assert.match(challenge.objective.label, /^Win with a \d+-hit rally$/);
    }
  });

  it('rally challenges are not cleared by a loss', () => {
    const challenge = challengeById('jetstream')!;
    const lost = result({
      mode: 'challenge',
      won: false,
      scoreYou: 0,
      scoreBot: 3,
      bestRally: 20
    });
    assert.equal(objectiveMet(challenge.objective, lost), false);
    assert.equal(objectiveMet(challenge.objective, { ...lost, won: true, scoreYou: 3 }), true);
  });

  it('counted objectives agree with their number', () => {
    const labels = [
      ...CHALLENGES.map((c) => c.objective.label),
      ...Array.from({ length: 40 }, (_, i) => contractChallenge(i + 1).objective.label),
      ...(['banks', 'switches', 'breaks', 'gates', 'flicks'] as const).flatMap((id) =>
        [1, 2].map((value) => starGoalLabel({ id, value }))
      )
    ];
    for (const label of labels)
      assert.doesNotMatch(
        label,
        /\b1 (switches|structures|rail banks|openings|gate openings|flicks)\b/,
        label
      );
    assert.equal(starGoalLabel({ id: 'switches', value: 1 }), 'Trigger 1 switch');
    assert.equal(starGoalLabel({ id: 'breaks', value: 1 }), 'Break 1 structure');
    assert.ok(CHALLENGES.some((c) => c.objective.label === 'Win and trigger 1 switch'));
  });
});

// ------------------------------------------------------ #10 Journey, trophies

describe('Journey expansion bosses and cups', () => {
  it('a world boss has its own card and no mastery-trial paddle', () => {
    for (const world of EXPANSION_WORLDS) {
      const boss = world.stages[23]!;
      assert.ok(boss.boss);
      assert.doesNotMatch(boss.blurb, /Mastery trial/);
      assert.equal(boss.modifiers.playerPaddleScale, undefined);
      assert.equal(world.stages[22]!.modifiers.playerPaddleScale, 0.88, 'trials keep theirs');
    }
    assert.equal(stageById('w10-24')!.name, stageById('w10-24')!.name.trim());
  });

  it('Frontier names its sector and its boss properly', () => {
    const stage = frontierStage(1, 4);
    assert.ok(stage.boss);
    assert.match(stage.name, /^Frontier 1 · [A-Z]/);
    assert.doesNotMatch(stage.name, new RegExp(`· ${stage.boss}$`));
    assert.equal(stageCode(stage), 'Frontier 1-5');
    assert.equal(stageCode(stageById('w12-4')!), '12-4');
    assert.equal(worldTitle(worldById(31)!), 'Frontier 1');
    assert.equal(worldTitle(worldById(12)!), 'World 12');
  });

  it('the trophy a cup list shows is the trophy a final pays', () => {
    for (const tier of TOURNAMENT_TIERS)
      for (const format of [undefined, 'marathon', 'ladder'] as const) {
        const save = { ...createTournament(tier.id, 0, format) };
        const finalRound = (format === 'marathon' ? 7 : format === 'ladder' ? 6 : 3) - 1;
        const rules = tournamentRules({ ...save, round: finalRound });
        const award = computeMatchXp(
          result({
            mode: 'tournament',
            botId: rules.bot.id,
            botRank: rules.bot.rank,
            tournamentRound: finalRound,
            tournamentTier: tier.id,
            ...(format ? { tournamentFormat: format } : {})
          }),
          ctx
        );
        const champion = award.lines.find((line) => line.label === 'Champion')!;
        assert.equal(trophyAward(tier.id, format), Math.round(champion.xp * award.multiplier));
      }
    assert.equal(trophyAward(3), tierById(3).trophyXp * 5, 'a Legend final multiplies by five');
  });
});

// -------------------------------------------------- #11, #12 drills, rehearsal

describe('practice', () => {
  it('the placement drill is reachable the way its hint says, on every court width', () => {
    const drill = TECHNIQUES.find((d) => d.id === 'placement')!;
    assert.doesNotMatch(drill.hint, /edge to change direction/);
    assert.match(drill.hint, /just off your paddle’s centre/);
    const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;
    for (const width of [750, 1000, 1290])
      for (const attempt of [0, 1]) {
        const [low] = techniqueTarget('placement', attempt);
        const side = low < 0.5 ? -1 : 1; // the target half's side of the paddle centre
        for (const off of [2, 4, 6, 8, 10, 12]) {
          const world = createWorld(silent, 1);
          world.view.w = width;
          placePaddles(world);
          world.replays = false;
          startMatch(world, techniqueRules('placement'));
          world.match.points = attempt;
          world.player.y = world.player.target = FIELD_H / 2 - side * off;
          launchBall(world);
          let outcome: boolean | null = null;
          for (let i = 0; i < 4000 && outcome === null && world.match.status === 'play'; i++) {
            updateArena(world, FIXED_DT);
            stepBall(world, FIXED_DT);
            outcome = techniqueOutcome(world);
          }
          assert.equal(outcome, true, `width ${width} target ${attempt} contact ${off}`);
        }
      }
  });

  it('rehearsing an encounter keeps the deficit it starts on', () => {
    const source = challengeRulesById('comeback')!;
    const lost = result({ mode: 'challenge', won: false, scoreYou: 1, scoreBot: 3 });
    const drill = encounterPracticeRules(source, lost)!;
    assert.deepEqual(drill.modifiers.startScore, { you: 0, bot: 2 });
    assert.equal(drill.winScore, 3);
    const plain = encounterPracticeRules(quickMatchRules('pro'), { ...lost, mode: 'quick' })!;
    assert.deepEqual(plain.modifiers.startScore, { you: 0, bot: 0 });
  });
});

// ------------------------------------------------------------- server stance

describe('the server applies the same rules', () => {
  let server: TestServer;
  before(async () => {
    server = await makeServer();
  });
  after(async () => {
    await server.close();
  });

  const forfeit = (patch: Parameters<typeof matchSubmission>[0]) =>
    matchSubmission({
      won: false,
      abandoned: true,
      hits: 0,
      bestRally: 0,
      seconds: 40,
      objectiveMet: false,
      playedAt: server.time(),
      ...patch
    });

  it('a Quick Match left at 0-4 is a recorded loss that ends the streak', async () => {
    const user = await register(server.app);
    const won = await recordMatch(
      server.app,
      user.accessToken,
      matchSubmission({ playedAt: server.time() })
    );
    assert.equal(won.profile.stats.currentStreak, 1);
    const left = await recordMatch(
      server.app,
      user.accessToken,
      forfeit({ mode: 'quick', botId: 'amateur', scoreYou: 0, scoreBot: 4 })
    );
    assert.equal(left.summary.xpAwarded, 0);
    assert.equal(left.profile.xp, won.profile.xp);
    assert.equal(left.profile.stats.currentStreak, 0);
    assert.equal(left.profile.stats.losses, 1);
    assert.equal(left.profile.modeStats.quick?.losses, 1);
  });

  it('a cup round left at 1-1 eliminates the player', async () => {
    const user = await register(server.app);
    const started = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/tournament/start',
      headers: auth(user.accessToken),
      payload: { tier: 0 }
    });
    assert.equal(started.statusCode, 201);
    const left = await recordMatch(
      server.app,
      user.accessToken,
      forfeit({
        mode: 'tournament',
        botId: 'rookie',
        scoreYou: 1,
        scoreBot: 1,
        tournamentRound: 0,
        tournamentTier: 0
      })
    );
    const profile = left.profile as CloudProfileDto;
    assert.equal(profile.tournament, null);
    assert.equal(profile.lastTournament?.champion, false);
  });

  it('an idle loss earns only participation on the server too', async () => {
    const user = await register(server.app);
    const idle = await recordMatch(
      server.app,
      user.accessToken,
      matchSubmission({
        playedAt: server.time(),
        botId: 'legend',
        won: false,
        scoreYou: 0,
        scoreBot: 5,
        hits: 2,
        bestRally: 3,
        seconds: 30,
        objectiveMet: false
      })
    );
    assert.equal(idle.summary.xpAwarded, PARTICIPATION_XP);
  });
});
