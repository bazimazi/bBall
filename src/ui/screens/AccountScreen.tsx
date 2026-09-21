import { useEffect, useState, type FormEvent } from 'react';

import { accountStore } from '../../core/account/store';
import { ApiError } from '../../core/net/client';
import { profileStore } from '../../core/profile/store';
import { levelFromXp } from '../../core/progression/levels';
import { ProviderButton } from '../components/ProviderButton';
import { Screen } from '../components/Screen';
import { SyncBadge } from '../components/SyncBadge';
import { useAccount } from '../hooks/useAccount';
import styles from '../Account.module.css';
import screens from '../Screens.module.css';

/** A deep-linked token from a verification or password-reset email. */
export interface AccountToken {
  readonly kind: 'verify' | 'reset';
  readonly token: string;
}

interface AccountScreenProps {
  onBack: () => void;
  token?: AccountToken | null;
  /** Called once a deep-linked token has been dealt with. */
  onTokenUsed?: () => void;
}

type Mode = 'signin' | 'register' | 'forgot' | 'reset';

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = error.details?.[0]?.message;
    return detail ? `${error.message} ${detail}` : error.message;
  }
  if (error instanceof Error && error.name === 'NetworkError') {
    return 'No connection. You can keep playing - this will sync later.';
  }
  return 'Something went wrong. Try again.';
}

/** Provider ids are lowercase on the wire and capitalised on screen. */
function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Is there anything on this device worth offering to carry over? */
function guestProgress(): { has: boolean; summary: string } {
  const guest = profileStore.guestProfile();
  const level = levelFromXp(guest.xp).level;
  const has = guest.xp > 0 || guest.stats.matches > 0 || guest.stats.endlessRuns > 0;
  const parts: string[] = [`Level ${level}`];
  if (guest.stats.matches > 0) parts.push(`${guest.stats.matches} matches`);
  if (guest.stats.bestRally > 0) parts.push(`best rally ${guest.stats.bestRally}`);
  return { has, summary: parts.join(' · ') };
}

/**
 * Sign in, create an account, or look after the one you have.
 *
 * The screen is optional by construction. Every path out of it - including
 * the back button - leaves the player in a playable game, and the guest entry
 * point is a first-class option rather than a grudging link at the bottom.
 */
export function AccountScreen({ onBack, token, onTokenUsed }: AccountScreenProps) {
  const account = useAccount();
  const [mode, setMode] = useState<Mode>(token?.kind === 'reset' ? 'reset' : 'signin');
  // Every field starts empty, including the email. The remembered address is
  // a convenience for the status line, not a value to type on someone's
  // behalf - and on a shared device, pre-filling it tells the next person who
  // was here.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [carryOver, setCarryOver] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const guest = guestProgress();
  const providers = account.providers ?? [];

  // Asked for once, and remembered by the store - including an empty answer,
  // so a deployment with no providers configured is not asked again.
  useEffect(() => {
    void accountStore.loadProviders();
  }, []);

  const run = async (work: () => Promise<void>): Promise<void> => {
    setError(null);
    setWorking(true);
    try {
      await work();
    } catch (failure) {
      setError(messageFor(failure));
    } finally {
      setWorking(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (working) return;

    void run(async () => {
      switch (mode) {
        case 'signin':
          await accountStore.signIn(email, password);
          // Signing in to an existing account can still be the moment a guest
          // save comes across; the server merges rather than overwrites, so
          // this never costs the account anything it already had.
          if (carryOver && guest.has) await accountStore.claimGuestProgress();
          onBack();
          break;
        case 'register':
          await accountStore.register(email, password, {
            ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
            claimGuestProgress: carryOver && guest.has
          });
          onBack();
          break;
        case 'forgot':
          await accountStore.forgotPassword(email);
          setInfo('If that address has an account, a reset link is on its way.');
          setMode('signin');
          break;
        case 'reset':
          if (!token) {
            setError('That reset link is no longer valid. Ask for a new one.');
            return;
          }
          await accountStore.resetPassword(token.token, password);
          onTokenUsed?.();
          setInfo('Your password is updated. Sign in with it.');
          setMode('signin');
          break;
      }
    });
  };

  // ------------------------------------------------------- signed in view

  if (account.status === 'authenticated' && mode !== 'reset') {
    const user = account.user;
    return (
      <Screen title="Account" onBack={onBack}>
        <div className={styles.form}>
          <div className={screens.card}>
            <div className={styles.identity}>
              <span className={styles.email}>{user?.email ?? account.email}</span>
              <span className={styles.meta}>
                {user?.emailVerified ? 'Email confirmed' : 'Email not confirmed yet'}
              </span>
              {/* What this account can sign in with. Worth showing plainly:
                  it is the answer to "why does my password not work". */}
              {user && user.providers.length > 0 && (
                <span className={styles.linked}>
                  {user.providers.map((provider) => (
                    <span key={provider} className={styles.linkedChip}>
                      {provider === 'password' ? 'Password' : titleCase(provider)}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>

          <SyncBadge account={account} />

          {account.conflict && <p className={styles.info}>{account.conflict}</p>}
          {(info ?? account.notice) && <p className={styles.info}>{info ?? account.notice}</p>}
          {error && <p className={styles.error}>{error}</p>}

          <button
            type="button"
            className={screens.ghost}
            disabled={working || !account.online}
            onClick={() => void run(() => accountStore.flush())}
          >
            Sync now
            {account.pending > 0 && <span className={screens.badge}>{account.pending}</span>}
          </button>

          {guest.has && (
            <button
              type="button"
              className={screens.ghost}
              disabled={working}
              onClick={() =>
                void run(async () => {
                  const outcome = await accountStore.claimGuestProgress();
                  setInfo(outcome.notes[0] ?? 'Guest progress added.');
                })
              }
            >
              Bring guest progress over
            </button>
          )}

          {user && !user.emailVerified && (
            <button
              type="button"
              className={screens.ghost}
              disabled={working}
              onClick={() =>
                void run(async () => {
                  await accountStore.requestVerification();
                  setInfo('Check your inbox for the confirmation link.');
                })
              }
            >
              Resend confirmation email
            </button>
          )}

          <button
            type="button"
            className={screens.ghost}
            disabled={working}
            onClick={() => void run(() => accountStore.signOut())}
          >
            Sign out
          </button>

          <DeleteAccount
            onRun={run}
            working={working}
            onDone={onBack}
            needsPassword={user?.providers.includes('password') ?? true}
          />

          <p className={screens.note}>
            Signing out puts your guest save back exactly as it was. Your account keeps its own
            progress on the server.
          </p>
        </div>
      </Screen>
    );
  }

  // --------------------------------------------------------- signed out

  const title =
    mode === 'forgot' ? 'Reset password' : mode === 'reset' ? 'Choose a password' : 'Account';

  return (
    <Screen
      title={title}
      {...(mode === 'signin' || mode === 'register'
        ? { subtitle: 'Optional. The game plays either way.' }
        : {})}
      onBack={onBack}
    >
      <form className={styles.form} onSubmit={submit}>
        {(mode === 'signin' || mode === 'register') && (
          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              className={mode === 'signin' ? `${styles.tab} ${styles.tabOn}` : styles.tab}
              onClick={() => setMode('signin')}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? `${styles.tab} ${styles.tabOn}` : styles.tab}
              onClick={() => setMode('register')}
            >
              Create account
            </button>
          </div>
        )}

        {/*
          The guest-progress question comes first, because it applies to every
          way of getting an account below it - including the provider buttons,
          which navigate away and so have to carry the answer with them.
        */}
        {guest.has && (mode === 'signin' || mode === 'register') && (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={carryOver}
              onChange={(event) => setCarryOver(event.target.checked)}
            />
            <span className={styles.checkText}>
              Bring my progress with me
              <span className={styles.checkHint}>{guest.summary}</span>
            </span>
          </label>
        )}

        {/*
          Social sign-in sits above the form, where most people will reach for
          it. One button per provider the server actually offers, so a
          deployment without Apple credentials shows no Apple button rather
          than one that cannot work.
        */}
        {providers.length > 0 && (mode === 'signin' || mode === 'register') && (
          <>
            <div className={styles.providers}>
              {providers.map((provider) => (
                <ProviderButton
                  key={provider.id}
                  provider={provider}
                  disabled={working || account.busy}
                  onClick={() =>
                    void run(() =>
                      accountStore.startOAuth(provider.id, {
                        claimGuestProgress: carryOver && guest.has
                      })
                    )
                  }
                />
              ))}
            </div>
            <p className={styles.divider}>or</p>
          </>
        )}

        {mode !== 'reset' && (
          <div className={screens.field}>
            <label className={screens.label} htmlFor="account-email">
              Email
            </label>
            <input
              id="account-email"
              className={screens.input}
              type="email"
              value={email}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        )}

        {mode !== 'forgot' && (
          <div className={screens.field}>
            <label className={screens.label} htmlFor="account-password">
              {mode === 'signin' ? 'Password' : 'New password'}
            </label>
            <input
              id="account-password"
              className={screens.input}
              type="password"
              value={password}
              minLength={mode === 'signin' ? 1 : 10}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              onChange={(event) => setPassword(event.target.value)}
            />
            {mode !== 'signin' && (
              <span className={styles.checkHint}>
                At least 10 characters. Length is what counts.
              </span>
            )}
          </div>
        )}

        {mode === 'register' && (
          <div className={screens.field}>
            <label className={screens.label} htmlFor="account-name">
              Display name (optional)
            </label>
            <input
              id="account-name"
              className={screens.input}
              value={displayName}
              maxLength={14}
              autoComplete="nickname"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
        )}

        {info && <p className={styles.info}>{info}</p>}
        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={screens.primary} disabled={working}>
          {working
            ? 'Working...'
            : mode === 'signin'
              ? 'Sign in'
              : mode === 'register'
                ? 'Create account'
                : mode === 'forgot'
                  ? 'Send reset link'
                  : 'Set password'}
        </button>

        {mode === 'signin' && (
          <button type="button" className={styles.link} onClick={() => setMode('forgot')}>
            Forgotten your password?
          </button>
        )}
        {(mode === 'forgot' || mode === 'reset') && (
          <button type="button" className={styles.link} onClick={() => setMode('signin')}>
            Back to sign in
          </button>
        )}

        <button type="button" className={screens.ghost} onClick={onBack}>
          Keep playing as a guest
        </button>

        <p className={screens.note}>
          An account keeps your level, build and records across devices. Without one, everything
          stays on this device and the game plays exactly the same.
        </p>
      </form>
    </Screen>
  );
}

/**
 * Deletion, behind a confirmation and - where there is one - a password.
 *
 * Two steps on purpose: this is the only irreversible thing in the game, and
 * the server asks for the password again even though the session is live. An
 * account that only ever signed in with Google or Apple has no password to
 * ask for, so it gets the confirmation alone rather than a field nobody can
 * fill in.
 */
function DeleteAccount({
  onRun,
  working,
  onDone,
  needsPassword
}: {
  onRun: (work: () => Promise<void>) => Promise<void>;
  working: boolean;
  onDone: () => void;
  needsPassword: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        className={`${screens.ghost} ${screens.danger}`}
        onClick={() => setOpen(true)}
      >
        Delete account
      </button>
    );
  }

  return (
    <div className={screens.card}>
      <p className={screens.sectionLabel}>Delete account</p>
      <p className={styles.checkHint}>
        This removes your account, your cloud progress and your match history. It cannot be undone.
        Your guest save on this device is not touched.
      </p>
      {needsPassword && (
        <div className={screens.field} style={{ marginTop: 10 }}>
          <label className={screens.label} htmlFor="delete-password">
            Confirm your password
          </label>
          <input
            id="delete-password"
            className={screens.input}
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      )}
      <div className={screens.buttonRow} style={{ marginTop: 10 }}>
        <button type="button" className={screens.ghost} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="button"
          className={`${screens.ghost} ${screens.danger}`}
          disabled={working || (needsPassword && password.length === 0)}
          onClick={() =>
            void onRun(async () => {
              await accountStore.deleteAccount(needsPassword ? password : undefined);
              onDone();
            })
          }
        >
          Delete for good
        </button>
      </div>
    </div>
  );
}
