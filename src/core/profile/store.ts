import type { CloudProfileDto } from '../../../shared/protocol';
import type { BotLevelId } from '../bots/types';
import type { Equipped } from '../cosmetics/catalog';
import type { MatchResult } from '../modes/types';
import { applyMatchResult, syncUnlocks, type ProgressSummary } from '../progression/apply';
import { levelOf } from '../progression/levels';
import { clearRecord, loadRecord, saveRecord, type StoreSpec } from '../storage/localStore';
import { cloudMetaOf, cloudToProfile, toLocalSave, type CloudMeta } from './cloud';
import {
  buyTalent,
  cloneTalentSave,
  equipAbility,
  reconcile,
  respec,
  respecBranch
} from '../talents/save';
import type { AbilityId, BranchId, TalentId } from '../talents/types';
import { createTournament, type TournamentSave } from '../tournament/bracket';
import { cleanName, createProfile } from './defaults';
import { clampDemoLevel, createDemoProfile } from './demo';
import { PROFILE_SPEC } from './schema';
import type { AvatarId, PlayerProfile } from './types';

type Listener = () => void;

/** The pre-profile save from the original game, imported once. */
const LEGACY_BEST_KEY = 'bball.best';

/**
 * Where a signed-in player's cached cloud save is kept.
 *
 * Deliberately a separate key per account rather than overwriting
 * `bball.profile`. Signing in must not destroy the guest save - a player may
 * sign out again, or may be borrowing someone else's device - and signing out
 * must hand the guest save back exactly as it was.
 */
function cloudSpec(userId: string): StoreSpec<PlayerProfile> {
  return { ...PROFILE_SPEC, key: `bball.cloud.${userId}` };
}

function readLegacyBest(): number {
  try {
    const raw = window.localStorage.getItem(LEGACY_BEST_KEY);
    const value = raw === null ? 0 : parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/**
 * The single source of truth for player progression.
 *
 * It is a plain observable object rather than a React context so the domain
 * layer stays framework-free; the UI subscribes through `useSyncExternalStore`
 * and the engine never touches it at all.
 */
class ProfileStore {
  private profile: PlayerProfile;
  private readonly listeners = new Set<Listener>();

  /**
   * The real save, parked while Demo mode runs. Its presence is what makes
   * the store ephemeral: nothing is written to storage until it is back.
   */
  private parked: PlayerProfile | null = null;

  /**
   * The guest save, parked while an account is signed in.
   *
   * Signing out puts it straight back, untouched, which is what makes trying
   * an account free of consequences on a shared device.
   */
  private guest: PlayerProfile | null = null;

  /** Identity of the cloud save in play, or null when this is a guest. */
  private cloud: CloudMeta | null = null;

  /** True when the stored save was missing or had to be repaired. */
  readonly recovered: boolean;
  readonly firstRun: boolean;

  constructor() {
    const loaded = loadRecord(PROFILE_SPEC);
    this.profile = loaded.value;
    this.firstRun = loaded.fresh;
    this.recovered = loaded.recovered;

    if (loaded.fresh) {
      // A returning player from before profiles existed keeps their record.
      const best = readLegacyBest();
      if (best > 0) this.profile.stats.bestRally = best;
    }

    // A talent catalogue change can strand a rank, and levels earned before
    // talents existed still owe their points. Reconciling settles both.
    this.profile.talents = reconcile(this.profile.talents, levelOf(this.profile.xp));

    // Catalogue changes (or a repaired save) can leave unlocks out of date.
    const added = syncUnlocks(this.profile);
    if (loaded.fresh || loaded.recovered || added.length > 0) this.persist();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PlayerProfile => this.profile;

  private persist(): void {
    // A demo never reaches storage, so nothing it does can be kept.
    if (this.parked) return;
    // While signed in the local copy is a cache of the cloud save, so it goes
    // to that account's own key and leaves the guest save alone.
    saveRecord(this.cloud ? cloudSpec(this.cloud.userId) : PROFILE_SPEC, this.profile);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private commit(next: PlayerProfile): void {
    this.profile = { ...next, updatedAt: Date.now() };
    this.persist();
    this.notify();
  }

  /** Apply a small edit. The mutator receives a shallow copy to work on. */
  private patch(edit: (draft: PlayerProfile) => void): void {
    const draft: PlayerProfile = {
      ...this.profile,
      stats: { ...this.profile.stats, winsByBot: { ...this.profile.stats.winsByBot } },
      talents: cloneTalentSave(this.profile.talents),
      equipped: { ...this.profile.equipped },
      preferences: { ...this.profile.preferences }
    };
    edit(draft);
    this.commit(draft);
  }

  /** The player's level right now. Talent gates and paddle speed read it. */
  private get level(): number {
    return levelOf(this.profile.xp);
  }

  // ----------------------------------------------------------------- demo

  /** The level being demoed, or null when the real save is in play. */
  getDemoLevel = (): number | null => (this.parked ? levelOf(this.profile.xp) : null);

  /**
   * Swap the real save out for a throwaway profile at `level`.
   *
   * Calling it again while a demo runs re-rolls the demo rather than nesting,
   * so the level picker can be used any number of times without the real save
   * ever being at risk.
   */
  startDemo(level: number): void {
    const real = this.parked ?? this.profile;
    this.parked = real;
    this.profile = createDemoProfile(clampDemoLevel(level), real);
    this.notify();
  }

  /** Drop the demo and hand the real save back, untouched. */
  endDemo(): void {
    if (!this.parked) return;
    this.profile = this.parked;
    this.parked = null;
    this.notify();
  }

  // ---------------------------------------------------------------- cloud

  /** The cloud save in play, or null when this is a guest session. */
  getCloudMeta = (): CloudMeta | null => this.cloud;

  /** True when the profile on screen belongs to a signed-in account. */
  isCloud(): boolean {
    return this.cloud !== null;
  }

  /**
   * The guest save, packaged for the server.
   *
   * Read from the parked copy when an account is already signed in, so the
   * "bring my progress over" button still knows what it is offering.
   */
  guestSave(): ReturnType<typeof toLocalSave> {
    return toLocalSave(this.guest ?? this.profile);
  }

  /** The guest profile itself, for deciding whether it is worth offering. */
  guestProfile(): PlayerProfile {
    return this.guest ?? this.profile;
  }

  /**
   * Switch to an account's save.
   *
   * The guest profile is parked rather than replaced, and the incoming cloud
   * profile is cached under the account's own key so the next launch is
   * instant and offline-capable.
   */
  signIn(dto: CloudProfileDto): void {
    // A demo is a throwaway view of the game; signing in ends it rather than
    // nesting a real account inside a fake one.
    this.endDemo();
    if (!this.cloud) this.guest = this.profile;
    this.cloud = cloudMetaOf(dto);
    this.commit(this.reconciled(cloudToProfile(dto)));
  }

  /**
   * Take a fresh authoritative profile from the server.
   *
   * Used after every sync. Ignored when signed out, so a response that
   * arrives after the player signed out cannot resurrect their account's
   * save on the screen.
   */
  applyCloud(dto: CloudProfileDto): void {
    if (!this.cloud || this.cloud.userId !== dto.userId) return;
    this.cloud = cloudMetaOf(dto);
    this.commit(this.reconciled(cloudToProfile(dto)));
  }

  /**
   * Hand the guest save back.
   *
   * `forget` wipes the cached cloud copy as well, which is what account
   * deletion and an explicit "sign out on a shared device" both want.
   */
  signOut(forget = false): void {
    // A demo parked the real save; ending it first is what stops the guest
    // profile being restored underneath a demo that is still running, which
    // would leave the store unable to write anything at all.
    this.endDemo();

    const account = this.cloud;
    if (!account) return;
    if (forget) clearRecord(cloudSpec(account.userId));

    this.cloud = null;
    const guest = this.guest ?? loadRecord(PROFILE_SPEC).value;
    this.guest = null;
    this.commit(this.reconciled(guest));
  }

  /**
   * Try to restore a cached cloud save before the network answers.
   *
   * This is what makes a signed-in relaunch show the player's real level
   * immediately instead of a spinner or, worse, a blank guest profile.
   */
  restoreCachedCloud(userId: string): boolean {
    const loaded = loadRecord(cloudSpec(userId));
    if (loaded.fresh) return false;

    this.endDemo();
    if (!this.cloud) this.guest = this.profile;
    this.cloud = {
      userId,
      // Zero means "no version seen yet", so the first push reports no
      // divergence rather than a false conflict against a guessed number.
      version: 0,
      saveId: '',
      updatedAt: loaded.value.updatedAt
    };
    this.commit(this.reconciled(loaded.value));
    return true;
  }

  /** Settle a profile against the catalogue before it goes on screen. */
  private reconciled(profile: PlayerProfile): PlayerProfile {
    const next: PlayerProfile = {
      ...profile,
      talents: reconcile(profile.talents, levelOf(profile.xp))
    };
    syncUnlocks(next);
    return next;
  }

  // ------------------------------------------------------------- identity

  setIdentity(name: string, avatar: AvatarId): void {
    this.patch((draft) => {
      draft.name = cleanName(name);
      draft.avatar = avatar;
      draft.onboarded = true;
    });
  }

  skipOnboarding(): void {
    this.patch((draft) => {
      draft.onboarded = true;
    });
  }

  // ----------------------------------------------------------- cosmetics

  equip(slot: keyof Equipped, id: string): void {
    if (!this.profile.unlocks.includes(id)) return;
    this.patch((draft) => {
      draft.equipped[slot] = id;
    });
  }

  // -------------------------------------------------------------- talents

  /**
   * Spend one point on `id`. Silently does nothing when the purchase is not
   * legal - the UI disables those rows, and the store is the backstop.
   */
  buyTalent(id: TalentId): boolean {
    const next = buyTalent(this.profile.talents, this.level, id);
    if (!next) return false;
    this.patch((draft) => {
      draft.talents = next;
    });
    return true;
  }

  /** Refund the whole tree. Free, so a build is never a trap. */
  respecTalents(): void {
    const next = respec(this.profile.talents, this.level);
    this.patch((draft) => {
      draft.talents = next;
    });
  }

  /** Refund a single branch, leaving the rest of the build in place. */
  respecBranch(branch: BranchId): void {
    const next = respecBranch(this.profile.talents, this.level, branch);
    if (next === this.profile.talents) return;
    this.patch((draft) => {
      draft.talents = next;
    });
  }

  /** Slot an active ability, or clear the slot with `null`. */
  equipAbility(slot: number, id: AbilityId | null): boolean {
    const next = equipAbility(this.profile.talents, this.level, slot, id);
    if (!next) return false;
    this.patch((draft) => {
      draft.talents = next;
    });
    return true;
  }

  // --------------------------------------------------------- preferences

  setLastBot(bot: BotLevelId): void {
    this.patch((draft) => {
      draft.preferences.lastBot = bot;
    });
  }

  setLastPracticeBot(bot: BotLevelId): void {
    this.patch((draft) => {
      draft.preferences.lastPracticeBot = bot;
    });
  }

  // ---------------------------------------------------------- tournament

  startTournament(tier: number): TournamentSave {
    const save = createTournament(tier);
    this.patch((draft) => {
      draft.tournament = save;
      draft.stats.cupsPlayed += 1;
    });
    return save;
  }

  /** Give up on the current cup. It counts as played, never as won. */
  abandonTournament(): void {
    if (!this.profile.tournament) return;
    this.patch((draft) => {
      const current = draft.tournament;
      if (!current) return;
      draft.lastTournament = { ...current, finished: true, champion: false };
      draft.tournament = null;
    });
  }

  // --------------------------------------------------------- progression

  applyResult(result: MatchResult): ProgressSummary {
    const summary = applyMatchResult(this.profile, result);
    if (summary.profile !== this.profile) this.commit(summary.profile);
    return summary;
  }

  /**
   * Wipe everything and start over. Used by the profile screen.
   *
   * Refused while signed in: the server owns that save, and erasing the local
   * cache would only have it pulled straight back. Deleting an account is a
   * different, deliberate action on the account screen.
   */
  reset(): void {
    // The demo has nothing to wipe, and the parked save is not its to erase.
    if (this.parked || this.cloud) return;
    this.commit({ ...createProfile(), onboarded: true });
  }
}

export const profileStore = new ProfileStore();
export type { ProgressSummary };
