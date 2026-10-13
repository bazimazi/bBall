/**
 * Client progression rules that must agree with what their text promises:
 * achievements that stay reachable, day-keyed rewards that only move forward,
 * talent ranks that each do something, and saves that cannot equip what they
 * do not own.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { achievementById } from '../../src/core/achievements/catalog';
import { COSMETICS, DEFAULT_EQUIPPED } from '../../src/core/cosmetics/catalog';
import { applyDaily, createDailyRecord } from '../../src/core/daily/daily';
import { CHALLENGES } from '../../src/core/modes/challenges';
import type { MatchResult } from '../../src/core/modes/types';
import { createProfile } from '../../src/core/profile/defaults';
import { validateProfile } from '../../src/core/profile/schema';
import { applyQuests, createQuestState, type QuestContext } from '../../src/core/quests/quests';
import { resolveLoadout } from '../../src/core/talents/effects';
import { createTalentSave } from '../../src/core/talents/save';

describe('achievements', () => {
  it('Endless rally achievements count Workshop-era runs and the match just played', () => {
    const profile = createProfile();
    const endless30 = achievementById('endless-30')!;
    assert.equal(endless30.check({ profile, level: 1, result: null }), false);

    profile.progress.workshop.endless['neutral-classic'] = {
      rally: 31,
      waves: 2,
      kit: profile.progress.workshop.endless['neutral-classic']?.kit as never
    };
    assert.equal(endless30.check({ profile, level: 1, result: null }), true);

    const fresh = createProfile();
    const result = { mode: 'endless', bestRally: 64 } as MatchResult;
    assert.equal(achievementById('endless-60')!.check({ profile: fresh, level: 1, result }), true);
  });

  it('Challenge Master needs every challenge, not a large cleared counter', () => {
    const profile = createProfile();
    const master = achievementById('challenge-master')!;
    profile.stats.challengesCleared = CHALLENGES.length + 50;
    assert.equal(master.check({ profile, level: 1, result: null }), false);
    for (const challenge of CHALLENGES)
      profile.challenges[challenge.id] = {
        ...(profile.challenges[challenge.id] ?? {}),
        cleared: true
      } as never;
    assert.equal(master.check({ profile, level: 1, result: null }), true);
  });
});

describe('day-keyed rewards', () => {
  it('an older daily card earns nothing and does not reset today', () => {
    const today = applyDaily(createDailyRecord(), '2026-10-13', 1);
    assert.equal(today.firstClear, true);
    const stale = applyDaily(today.record, '2026-10-12', 1);
    assert.equal(stale.firstClear, false);
    assert.equal(stale.newMedals, 0);
    assert.equal(stale.record.day, '2026-10-13');
    const again = applyDaily(stale.record, '2026-10-13', 1);
    assert.equal(again.firstClear, false);
    assert.equal(again.record.clears, 1);
  });

  it("an older day's match does not roll today's quests back", () => {
    const state = createQuestState('2026-10-13');
    const context = {
      result: { mode: 'quick', won: true, scoreYou: 5, scoreBot: 0 } as MatchResult,
      newStars: 0,
      bossBeaten: true,
      dailyCleared: true,
      runWin: false
    } satisfies QuestContext;
    const outcome = applyQuests(state, '2026-10-12', context);
    assert.equal(outcome.state, state);
    assert.equal(outcome.xp, 0);
    assert.equal(outcome.completed.length, 0);
  });
});

describe('talent ranks', () => {
  for (const [id, field, maxRank] of [
    ['combo-drive', 'comboLength', 3],
    ['flow-state', 'flowAngle', 3],
    ['flow-state', 'flowHeft', 3],
    ['clutch', 'clutchLength', 2]
  ] as const)
    it(`every ${id} rank changes ${field}`, () => {
      let previous = -1;
      for (let rank = 1; rank <= maxRank; rank++) {
        const value = resolveLoadout({ ...createTalentSave(), ranks: { [id]: rank } }, 200).effects[
          field
        ];
        assert.ok(value > previous, `${id} rank ${rank} should raise ${field}`);
        previous = value;
      }
    });
});

describe('saved cosmetics', () => {
  it('a locked cosmetic cannot stay equipped', () => {
    const locked = COSMETICS.find(
      (item) => item.kind === 'accent' && item.unlock.type !== 'default'
    )!;
    const profile = createProfile();
    const tampered = { ...profile, equipped: { ...profile.equipped, accent: locked.id } };
    assert.equal(validateProfile(tampered)!.equipped.accent, DEFAULT_EQUIPPED.accent);
    const owned = { ...tampered, unlocks: [...profile.unlocks, locked.id] };
    assert.equal(validateProfile(owned)!.equipped.accent, locked.id);
  });
});
