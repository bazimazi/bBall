import type { BotLevelId } from '../bots/types';
import type { Equipped } from '../cosmetics/catalog';
import type { MatchResult } from '../modes/types';
import { applyMatchResult, syncUnlocks, type ProgressSummary } from '../progression/apply';
import { loadRecord, saveRecord } from '../storage/localStore';
import { createTournament, type TournamentSave } from '../tournament/bracket';
import { cleanName, createProfile } from './defaults';
import { PROFILE_SPEC } from './schema';
import type { AvatarId, PlayerProfile } from './types';

type Listener = () => void;

/** The pre-profile save from the original game, imported once. */
const LEGACY_BEST_KEY = 'bball.best';

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
    saveRecord(PROFILE_SPEC, this.profile);
  }

  private commit(next: PlayerProfile): void {
    this.profile = { ...next, updatedAt: Date.now() };
    this.persist();
    for (const listener of this.listeners) listener();
  }

  /** Apply a small edit. The mutator receives a shallow copy to work on. */
  private patch(edit: (draft: PlayerProfile) => void): void {
    const draft: PlayerProfile = {
      ...this.profile,
      stats: { ...this.profile.stats, winsByBot: { ...this.profile.stats.winsByBot } },
      equipped: { ...this.profile.equipped },
      preferences: { ...this.profile.preferences }
    };
    edit(draft);
    this.commit(draft);
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

  /** Wipe everything and start over. Used by the profile screen. */
  reset(): void {
    this.commit({ ...createProfile(), onboarded: true });
  }
}

export const profileStore = new ProfileStore();
export type { ProgressSummary };
