/**
 * The account, and everything that keeps it in step with the server.
 *
 * Shaped like `profileStore`: a plain observable object the UI subscribes to
 * through `useSyncExternalStore`, with no framework inside it. It owns four
 * things - who is signed in, whether the network is reachable, what is
 * waiting in the outbox, and the last thing sync did - and it is the only
 * part of the client that talks to the API.
 *
 * The rule it exists to enforce: **the game never waits for it.** Every
 * method here returns immediately or runs in the background. A match is
 * applied locally the instant it ends and queued for the server afterwards,
 * so a player on a train sees their XP at the same speed as a player on
 * fibre, and the one on the train still has it when they get off.
 */

import type {
  ClaimOutcomeDto,
  CloudProfileDto,
  OAuthProviderDto,
  SyncOp,
  UserDto
} from '../../../shared/protocol';
import { profileStore } from '../profile/store';
import { ApiError, browserOnline, isOffline, setTokenProvider } from '../net/client';
import { api } from '../net/api';
import {
  acknowledgeDropped,
  clearOutbox,
  droppedCount,
  enqueue as enqueueOp,
  nextBatch,
  pendingCount,
  resolve as resolveOps
} from './outbox';
import {
  clearSession,
  currentAccessToken,
  deviceId,
  hasRememberedSession,
  rememberPendingOAuth,
  saveSession,
  storedRefreshToken,
  storedSession,
  takePendingOAuth,
  updateTokens
} from './session';

export type AccountStatus = 'guest' | 'restoring' | 'authenticated';
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface AccountState {
  readonly status: AccountStatus;
  readonly user: UserDto | null;
  /** Remembered email, available before the session has been restored. */
  readonly email: string | null;
  readonly online: boolean;
  readonly sync: SyncStatus;
  /** Operations waiting to reach the server. */
  readonly pending: number;
  readonly lastSyncedAt: number | null;
  /** A message worth showing the player. Cleared on the next success. */
  readonly notice: string | null;
  /** Something the player must be told about their progress, not just status. */
  readonly conflict: string | null;
  readonly busy: boolean;
  /** Social sign-in methods this deployment offers. Null until asked. */
  readonly providers: readonly OAuthProviderDto[] | null;
}

type Listener = () => void;

const IDLE: AccountState = {
  status: 'guest',
  user: null,
  email: null,
  online: true,
  sync: 'idle',
  pending: 0,
  lastSyncedAt: null,
  notice: null,
  conflict: null,
  busy: false,
  providers: null
};

/** How long after a change the queue is flushed, so a burst sends once. */
const FLUSH_DEBOUNCE_MS = 400;

class AccountStore {
  private state: AccountState = IDLE;
  private readonly listeners = new Set<Listener>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  /** Set while a flush is running and another one was asked for. */
  private flushAgain = false;
  /** Cached answer from the providers endpoint, including an empty one. */
  private providers: readonly OAuthProviderDto[] | null = null;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): AccountState => this.state;

  private set(patch: Partial<AccountState>): void {
    this.state = { ...this.state, ...patch, pending: patch.pending ?? pendingCount() };
    for (const listener of this.listeners) listener();
  }

  // ----------------------------------------------------------------- boot

  /**
   * Start the account layer.
   *
   * Safe to call before the network is up and safe to call when the player
   * has never signed in: it wires the token provider, restores a cached
   * cloud save if there is one, and then tries - without blocking - to bring
   * that cache up to date.
   */
  start(): void {
    setTokenProvider({
      accessToken: () => currentAccessToken(),
      refresh: () => this.refreshTokens(),
      onSignedOut: () => this.forceSignOut('Your session ended. Sign in again to sync.')
    });

    this.watchConnectivity();

    const remembered = storedSession();
    if (!remembered) return;

    // The cached save goes on screen first. A signed-in player relaunching on
    // a plane still sees their own level, build and history.
    profileStore.restoreCachedCloud(remembered.userId);
    this.set({ status: 'restoring', email: remembered.email, sync: 'syncing' });
    void this.resume();
  }

  private async resume(): Promise<void> {
    try {
      const ok = await this.refreshTokens();
      if (!ok) {
        this.forceSignOut(null);
        return;
      }
      const me = await api.me();
      this.set({ status: 'authenticated', user: me.user, email: me.user.email });
      profileStore.applyCloud(me.profile);
      await this.flush();
    } catch (error) {
      if (isOffline(error)) {
        // Offline with a cached save is a perfectly good state to play in.
        this.set({ status: 'authenticated', sync: 'offline', online: false });
        return;
      }
      this.forceSignOut(null);
    }
  }

  private watchConnectivity(): void {
    if (typeof window === 'undefined') return;

    const online = () => {
      this.set({ online: true });
      if (this.state.status === 'authenticated') this.scheduleFlush(0);
    };
    const offline = () => this.set({ online: false, sync: 'offline' });

    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    // Coming back to the tab is the moment a queue most often needs draining.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.state.status === 'authenticated') {
        this.scheduleFlush(0);
      }
    });
    this.set({ online: browserOnline() });
  }

  // ------------------------------------------------------------- identity

  isAuthenticated(): boolean {
    return this.state.status === 'authenticated';
  }

  /**
   * Create an account.
   *
   * `claimGuestProgress` sends the local save with the registration, so the
   * account exists and owns the player's progress in a single request -
   * there is no window where one is true and the other is not.
   */
  async register(
    email: string,
    password: string,
    options: { displayName?: string; claimGuestProgress?: boolean } = {}
  ): Promise<ClaimOutcomeDto | null> {
    this.set({ busy: true, notice: null, conflict: null });
    try {
      const guest = profileStore.guestProfile();
      const response = await api.register({
        email,
        password,
        ...(options.displayName ? { displayName: options.displayName } : {}),
        ...(options.claimGuestProgress ? { claim: profileStore.guestSave() } : {})
      });

      this.adopt(response.user, response.tokens, response.profile);
      if (response.claim) this.noteClaim(response.claim, guest.xp);
      return response.claim ?? null;
    } finally {
      this.set({ busy: false });
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    this.set({ busy: true, notice: null, conflict: null });
    try {
      const response = await api.login({ email, password });
      this.adopt(response.user, response.tokens, response.profile);
      // A queue left by a previous account must never be applied to this one.
      clearOutbox();
      await this.flush();
    } finally {
      this.set({ busy: false });
    }
  }

  private adopt(
    user: UserDto,
    tokens: Parameters<typeof saveSession>[1],
    profile: CloudProfileDto
  ): void {
    saveSession(user, tokens);
    profileStore.signIn(profile);
    this.set({
      status: 'authenticated',
      user,
      email: user.email,
      sync: 'idle',
      lastSyncedAt: Date.now(),
      notice: null
    });
  }

  // -------------------------------------------------------- social sign-in

  /**
   * Which providers the server offers.
   *
   * Fetched once and remembered, including the empty answer: a deployment
   * with no providers configured should not be asked again on every visit to
   * the account screen. A failure leaves the list null so it is retried.
   */
  async loadProviders(): Promise<readonly OAuthProviderDto[]> {
    if (this.providers) return this.providers;
    try {
      const response = await api.oauthProviders();
      this.providers = response.providers;
      this.set({ providers: response.providers });
      return response.providers;
    } catch {
      // Not worth an error on screen: the password form still works.
      return [];
    }
  }

  /**
   * Hand the browser over to a provider.
   *
   * The guest save is parked in localStorage first, because the round trip
   * leaves and re-enters the page and whatever is in memory does not survive
   * it. Everything else is the server's problem until the browser comes back
   * to `#/oauth`.
   */
  async startOAuth(
    provider: string,
    options: { claimGuestProgress?: boolean } = {}
  ): Promise<void> {
    this.set({ busy: true, notice: null, conflict: null });
    try {
      const started = await api.oauthStart(provider);
      rememberPendingOAuth({
        provider,
        claimGuestProgress: options.claimGuestProgress ?? false,
        startedAt: Date.now()
      });
      window.location.assign(started.authorizeUrl);
    } catch (error) {
      this.set({ busy: false });
      throw error;
    }
  }

  /**
   * Finish a social sign-in, from the code the callback redirected back with.
   *
   * The intent recorded before leaving decides whether the guest save goes
   * with it - the player answered that question on the previous page view,
   * and asking again after the round trip would be asking them to remember
   * what they had just chosen.
   */
  async completeOAuth(code: string): Promise<void> {
    const pending = takePendingOAuth();
    this.set({ busy: true, notice: null, conflict: null });
    try {
      const guest = profileStore.guestProfile();
      const response = await api.oauthComplete(
        code,
        pending?.claimGuestProgress ? profileStore.guestSave() : undefined
      );

      this.adopt(response.user, response.tokens, response.profile);
      // A queue left by a previous account must never be applied to this one.
      clearOutbox();
      if (response.claim) this.noteClaim(response.claim, guest.xp);
      await this.flush();
    } finally {
      this.set({ busy: false });
    }
  }

  /** The browser came back from a provider without a sign-in. */
  reportOAuthFailure(reason: string | null): void {
    takePendingOAuth();
    this.set({ busy: false, notice: reason ?? 'That sign-in did not complete.' });
  }

  /**
   * Carry the guest save into the signed-in account, after the fact.
   *
   * Offered when a player signed in rather than registered and still has
   * local progress the account does not.
   */
  async claimGuestProgress(): Promise<ClaimOutcomeDto> {
    const guest = profileStore.guestProfile();
    this.set({ busy: true });
    try {
      const response = await api.claim(profileStore.guestSave());
      profileStore.applyCloud(response.profile);
      this.noteClaim(response.claim, guest.xp);
      return response.claim;
    } finally {
      this.set({ busy: false });
    }
  }

  private noteClaim(claim: ClaimOutcomeDto, guestXp: number): void {
    const message =
      claim.outcome === 'rejected'
        ? 'That guest save had nothing to bring over.'
        : claim.outcome === 'already-claimed'
          ? 'That guest save was already on your account.'
          : claim.xpAfter < guestXp
            ? `Some guest progress could not be verified, so ${claim.xpAfter} XP was carried over.`
            : (claim.notes[0] ?? 'Your guest progress is on your account.');
    this.set({ conflict: claim.outcome === 'adopted' ? null : message, notice: message });
  }

  async signOut(options: { everywhere?: boolean; forget?: boolean } = {}): Promise<void> {
    this.set({ busy: true });
    try {
      // One last attempt to land whatever is queued, so signing out on a good
      // connection never costs a match. A failure here is not worth blocking.
      if (this.state.online && pendingCount() > 0) {
        try {
          await this.flush();
        } catch {
          /* the queue stays; it is cleared below with the session */
        }
      }
      try {
        if (options.everywhere) await api.logoutEverywhere();
        else await api.logout(storedRefreshToken());
      } catch {
        /* signing out locally must succeed even when the server cannot be told */
      }
    } finally {
      this.finishSignOut(options.forget ?? false, null);
      this.set({ busy: false });
    }
  }

  /** `password` is omitted by an account that has never had one. */
  async deleteAccount(password?: string): Promise<void> {
    this.set({ busy: true });
    try {
      await api.deleteAccount(password);
      this.finishSignOut(true, 'Your account and its progress have been deleted.');
    } finally {
      this.set({ busy: false });
    }
  }

  private finishSignOut(forget: boolean, notice: string | null): void {
    clearSession();
    clearOutbox();
    profileStore.signOut(forget);
    this.set({
      status: 'guest',
      user: null,
      email: null,
      sync: 'idle',
      pending: 0,
      lastSyncedAt: null,
      notice,
      conflict: null
    });
  }

  /** Signed out by the server rather than by the player. */
  private forceSignOut(notice: string | null): void {
    if (this.state.status === 'guest') return;
    this.finishSignOut(false, notice);
  }

  private async refreshTokens(): Promise<boolean> {
    if (!hasRememberedSession()) return false;
    try {
      const response = await api.refresh(storedRefreshToken());
      updateTokens(response.tokens);
      return true;
    } catch (error) {
      // A network failure is not a sign-out: the session may be perfectly
      // valid and simply unreachable.
      if (isOffline(error)) {
        this.set({ online: false, sync: 'offline' });
        return false;
      }
      return false;
    }
  }

  // --------------------------------------------------------- email flows

  async requestVerification(): Promise<void> {
    await api.requestVerification();
    this.set({ notice: 'Check your inbox for the confirmation link.' });
  }

  async confirmVerification(token: string): Promise<void> {
    const response = await api.confirmVerification(token);
    this.set({ user: response.user, notice: 'Your email address is confirmed.' });
    if (this.isAuthenticated()) profileStore.applyCloud(response.profile);
  }

  async forgotPassword(email: string): Promise<void> {
    await api.forgotPassword(email);
    this.set({ notice: 'If that address has an account, a reset link is on its way.' });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await api.resetPassword(token, password);
    this.finishSignOut(false, 'Your password is updated. Sign in with it.');
  }

  async changePassword(current: string, next: string): Promise<void> {
    await api.changePassword(current, next);
    this.finishSignOut(false, 'Your password is updated. Sign in with it.');
  }

  // ---------------------------------------------------------------- sync

  /**
   * Queue an operation and arrange for it to be sent.
   *
   * Called after the local profile has already been changed, never before:
   * the player sees the result of what they did immediately, and the server
   * confirms it afterwards.
   */
  enqueue(op: SyncOp): void {
    if (!this.isAuthenticated()) return;
    enqueueOp(op);
    this.set({ pending: pendingCount() });
    this.scheduleFlush(FLUSH_DEBOUNCE_MS);
  }

  private scheduleFlush(delay: number): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, delay);
  }

  /**
   * Send everything queued, then take the server's profile as the truth.
   *
   * Runs one at a time. A second caller while a flush is in progress sets a
   * flag rather than starting a parallel push, because two pushes of the same
   * queue would race on which ops get resolved.
   */
  async flush(): Promise<void> {
    if (!this.isAuthenticated()) return;
    if (this.flushing) {
      this.flushAgain = true;
      return;
    }
    if (!browserOnline()) {
      this.set({ online: false, sync: 'offline' });
      return;
    }

    this.flushing = true;
    this.set({ sync: 'syncing' });

    try {
      let batch = nextBatch();
      while (batch.length > 0) {
        const meta = profileStore.getCloudMeta();
        const response = await api.push(
          meta?.version ?? 0,
          batch,
          deviceId(),
          `push:${batch.map((op) => op.opId).join(',')}`.slice(0, 120)
        );

        resolveOps(response.results.map((result) => result.opId));
        profileStore.applyCloud(response.profile);

        const refused = response.results.filter((result) => result.status === 'rejected');
        if (refused.length > 0) {
          this.set({
            conflict:
              refused[0]?.reason ??
              'Some progress could not be saved and was rolled back to the server copy.'
          });
        } else if (response.diverged) {
          this.set({ conflict: 'Progress from another device was merged in.' });
        }

        const next = nextBatch();
        // Nothing left, or nothing moved - stop rather than loop forever on an
        // operation the server keeps refusing without resolving.
        if (next.length === 0 || next[0]?.opId === batch[0]?.opId) break;
        batch = next;
      }

      // Even with an empty queue, a flush is the moment to notice that another
      // device has been playing.
      if (pendingCount() === 0) await this.pull();

      if (droppedCount() > 0) {
        this.set({
          conflict: 'Some very old offline changes were dropped to make room for newer ones.'
        });
        acknowledgeDropped();
      }

      this.set({ sync: 'idle', online: true, lastSyncedAt: Date.now(), pending: pendingCount() });
    } catch (error) {
      if (isOffline(error)) {
        this.set({ sync: 'offline', online: false });
      } else if (error instanceof ApiError) {
        this.set({ sync: 'error', notice: error.message });
      } else {
        this.set({ sync: 'error' });
      }
    } finally {
      this.flushing = false;
      if (this.flushAgain) {
        this.flushAgain = false;
        this.scheduleFlush(FLUSH_DEBOUNCE_MS);
      }
    }
  }

  /** Take the server's copy. Used on resume and after a conflict. */
  async pull(): Promise<void> {
    if (!this.isAuthenticated()) return;
    const response = await api.pull(deviceId());
    profileStore.applyCloud(response.profile);
    this.set({ lastSyncedAt: Date.now(), online: true });
  }

  dismissNotice(): void {
    this.set({ notice: null, conflict: null });
  }
}

export const accountStore = new AccountStore();
