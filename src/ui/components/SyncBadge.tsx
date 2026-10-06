import type { AccountState } from '../../core/account/store';
import styles from '../Account.module.css';
import { useLocalSave } from '../hooks/useLocalSave';

interface SyncBadgeProps {
  account: AccountState;
  /** Shown even for a guest, so "not signed in" is never a mystery. */
  showGuest?: boolean;
}

function describe(account: AccountState, unsaved: boolean): { tone: string; text: string } {
  // One dot class, plus at most one tone on top of it.
  const dot = (tone?: string): string => [styles.dot, tone].filter(Boolean).join(' ');

  if (account.status === 'guest') {
    return {
      tone: dot(),
      text: unsaved ? 'Playing as guest' : 'Playing as guest - progress is on this device'
    };
  }
  if (account.status === 'restoring') {
    if (account.sync === 'offline') {
      return { tone: dot(styles.dotOffline), text: 'Account offline - playing as guest' };
    }
    if (account.sync === 'error') {
      return { tone: dot(styles.dotError), text: 'Could not restore account - playing as guest' };
    }
    return { tone: dot(styles.dotSyncing), text: 'Restoring your account...' };
  }
  switch (account.sync) {
    case 'syncing':
      return { tone: dot(styles.dotSyncing), text: 'Saving to your account...' };
    case 'offline':
      return {
        tone: dot(styles.dotOffline),
        // The reassurance is the point: offline is a normal state here, not a
        // failure, and a player mid-cup needs to know their run is safe.
        text: account.pending > 0 && !unsaved ? 'Offline - progress is saved here' : 'Offline'
      };
    case 'error':
      return { tone: dot(styles.dotError), text: 'Could not reach your account' };
    case 'idle':
      return {
        tone: dot(styles.dotOk),
        text: account.pending > 0 ? 'Saving...' : 'Synced'
      };
  }
}

/** One line of status: a dot, a sentence, and how much is still waiting. */
export function SyncBadge({ account, showGuest = false }: SyncBadgeProps) {
  const unsaved = useLocalSave() !== 'saved';
  if (account.status === 'guest' && !showGuest) return null;
  const { tone, text } = describe(account, unsaved);

  return (
    <p className={styles.syncRow} role="status">
      <span className={tone} aria-hidden="true" />
      <span className={styles.syncText}>{text}</span>
      {account.pending > 0 && <span className={styles.pending}>{account.pending} queued</span>}
    </p>
  );
}
