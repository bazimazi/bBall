/**
 * The one door every progression change goes through.
 *
 * Each function does the same two things in the same order: apply the change
 * locally so the player sees it at once, then queue it for the server so it
 * becomes real. When there is no account the second half simply does not
 * happen, and the game behaves exactly as it did before there was a server.
 *
 * Doing it in that order is the whole design. The alternative - ask the
 * server, then show the result - would put a round trip between the last
 * point of a match and the result card, and would make the game unplayable
 * on a bad connection. The cost is that the local numbers are a *prediction*:
 * the client and the server run the same pure functions over the same save,
 * so the prediction is right, and when it is not, the server's answer
 * overwrites it within a second.
 */

import type { MatchSubmissionDto, SyncOp } from '../../../shared/protocol';
import type { BotLevelId } from '../bots/types';
import type { Equipped } from '../cosmetics/catalog';
import type { MatchResult } from '../modes/types';
import { profileStore, type ProgressSummary } from '../profile/store';
import type { AvatarId } from '../profile/types';
import type { AbilityId, BranchId, TalentId } from '../talents/types';
import { accountStore } from './store';

function newOpId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}:${random}`.replace(/[^A-Za-z0-9_:.-]/g, '').slice(0, 64);
}

/**
 * Queue an operation, unless there is nothing real to queue.
 *
 * Demo mode is the case that matters. A demo parks the player's save and runs
 * a throwaway one, and the profile store already refuses to write it to
 * storage - so it must not reach the server either, or a demo at level 400
 * would arrive at the account as four hundred levels of progress.
 */
function queue(op: SyncOp): void {
  if (profileStore.getDemoLevel() !== null) return;
  accountStore.enqueue(op);
}

/**
 * Turn a finished match into something the server can check.
 *
 * Note what is *not* here: XP, level, talent points, unlocks, achievements.
 * The client computed all of those locally a moment ago to draw the result
 * card, and none of them are sent - the server derives its own from the
 * evidence below and the save it already holds.
 */
export function toSubmission(result: MatchResult, clientMatchId: string): MatchSubmissionDto {
  return {
    clientMatchId,
    mode: result.mode,
    botId: result.botId,
    won: result.won,
    scoreYou: result.scoreYou,
    scoreBot: result.scoreBot,
    bestRally: result.bestRally,
    hits: result.hits,
    seconds: Math.round(result.seconds),
    livesLeft: result.livesLeft,
    objectiveMet: result.objectiveMet,
    shutout: result.shutout,
    comeback: result.comeback,
    abandoned: result.abandoned,
    ...(result.challengeId ? { challengeId: result.challengeId } : {}),
    ...(result.tournamentRound !== undefined ? { tournamentRound: result.tournamentRound } : {}),
    ...(result.tournamentTier !== undefined ? { tournamentTier: result.tournamentTier } : {}),
    talent: { ...result.talent },
    playedAt: Date.now()
  };
}

/**
 * Record a finished match.
 *
 * Returns the local summary immediately, which is what the result card
 * renders. The server's own summary arrives with the next sync and replaces
 * the profile; if the two disagree, the server wins and the difference shows
 * up as a corrected XP bar rather than as an error.
 */
export function recordMatch(result: MatchResult): ProgressSummary {
  const summary = profileStore.applyResult(result);

  // Practice and abandoned matches change nothing, so there is nothing worth
  // a round trip - the server would compute the same empty result.
  const counts = result.ranked && !result.abandoned;
  if (counts) {
    const opId = newOpId('match');
    queue({ kind: 'match', opId, payload: toSubmission(result, opId) });
  }
  return summary;
}

export function buyTalent(id: TalentId): boolean {
  const before = profileStore.getSnapshot().talents.ranks[id] ?? 0;
  const bought = profileStore.buyTalent(id);
  if (!bought) return false;
  // `expectedRank` is the rank before the purchase, so a request that arrives
  // twice - or after another device bought the same rank - is refused rather
  // than spending a second point.
  queue({
    kind: 'talent.purchase',
    opId: newOpId('talent'),
    payload: { talentId: id, expectedRank: before }
  });
  return true;
}

export function respecTalents(branch?: BranchId): void {
  if (branch) profileStore.respecBranch(branch);
  else profileStore.respecTalents();
  queue({
    kind: 'talent.respec',
    opId: newOpId('respec'),
    payload: branch ? { branch } : {}
  });
}

export function equipAbility(slot: number, id: AbilityId | null): boolean {
  const ok = profileStore.equipAbility(slot, id);
  if (!ok) return false;
  queue({ kind: 'ability.equip', opId: newOpId('equip'), payload: { slot, abilityId: id } });
  return true;
}

export function equipCosmetic(slot: keyof Equipped, id: string): void {
  if (!profileStore.getSnapshot().unlocks.includes(id)) return;
  profileStore.equip(slot, id);
  queue({ kind: 'cosmetic.equip', opId: newOpId('cosmetic'), payload: { slot, cosmeticId: id } });
}

export function setIdentity(name: string, avatar: AvatarId): void {
  profileStore.setIdentity(name, avatar);
  const saved = profileStore.getSnapshot();
  queue({
    kind: 'profile.update',
    opId: newOpId('identity'),
    // The cleaned name, not the typed one: the server would clean it the same
    // way, and sending the cleaned value keeps the two copies identical.
    payload: { displayName: saved.name, avatar: saved.avatar }
  });
}

export function setLastBot(bot: BotLevelId): void {
  profileStore.setLastBot(bot);
  queue({ kind: 'preferences.update', opId: newOpId('pref'), payload: { lastBot: bot } });
}

export function setLastPracticeBot(bot: BotLevelId): void {
  profileStore.setLastPracticeBot(bot);
  queue({ kind: 'preferences.update', opId: newOpId('pref'), payload: { lastPracticeBot: bot } });
}

export function startTournament(tier: number) {
  const save = profileStore.startTournament(tier);
  queue({ kind: 'tournament.start', opId: newOpId('cup'), payload: { tier } });
  return save;
}

export function abandonTournament(): void {
  if (!profileStore.getSnapshot().tournament) return;
  profileStore.abandonTournament();
  queue({ kind: 'tournament.abandon', opId: newOpId('cup'), payload: {} });
}
