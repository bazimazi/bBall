import { useState } from 'react';

import { ACHIEVEMENTS } from '../../core/achievements/catalog';
import { NAME_MAX } from '../../core/profile/defaults';
import { setIdentity } from '../../core/account/progression';
import { profileStore } from '../../core/profile/store';
import { AVATARS, type PlayerProfile } from '../../core/profile/types';
import type { AccountState } from '../../core/account/store';
import { Avatar } from '../components/Avatar';
import { Screen } from '../components/Screen';
import { SyncBadge } from '../components/SyncBadge';
import { XpBar } from '../components/XpBar';
import { useDemoLevel } from '../hooks/useProfile';
import styles from '../Screens.module.css';

interface ProfileScreenProps {
  profile: PlayerProfile;
  account: AccountState;
  onAccount: () => void;
  onAchievements: () => void;
  onCustomize: () => void;
  onTalents: () => void;
  onBack: () => void;
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function playTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function ProfileScreen({
  profile,
  account,
  onAccount,
  onAchievements,
  onCustomize,
  onTalents,
  onBack
}: ProfileScreenProps) {
  const [name, setName] = useState(profile.name);
  const [confirmReset, setConfirmReset] = useState(false);
  const demoLevel = useDemoLevel();

  const stats = profile.stats;
  const talents = profile.talents.stats;
  const played = stats.matches;
  const winRate = played > 0 ? Math.round((stats.wins / played) * 100) : 0;
  const earned = Object.keys(profile.achievements).length;

  const commitName = () => {
    if (name !== profile.name) setIdentity(name, profile.avatar);
  };

  return (
    <Screen title="Profile" onBack={onBack}>
      <div className={styles.card} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <Avatar avatar={profile.avatar} large />
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <input
            className={styles.input}
            value={name}
            maxLength={NAME_MAX}
            aria-label="Player name"
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </div>
      </div>

      <div className={styles.card}>
        <XpBar xp={profile.xp} />
      </div>

      {demoLevel === null && (
        <>
          <p className={styles.sectionLabel}>Account</p>
          <button type="button" className={styles.ghost} onClick={onAccount}>
            {account.status === 'authenticated' ? (account.email ?? 'Account') : 'Sign in'}
            {account.pending > 0 && <span className={styles.badge}>{account.pending}</span>}
          </button>
          <SyncBadge account={account} showGuest />
        </>
      )}

      <p className={styles.sectionLabel}>Avatar</p>
      <div className={styles.swatchGrid}>
        {AVATARS.map((avatar) => (
          <button
            key={avatar}
            type="button"
            className={
              avatar === profile.avatar ? `${styles.swatch} ${styles.selected}` : styles.swatch
            }
            aria-label={`Avatar ${avatar}`}
            aria-pressed={avatar === profile.avatar}
            onClick={() => setIdentity(name, avatar)}
          >
            <Avatar avatar={avatar} />
          </button>
        ))}
      </div>

      <p className={styles.sectionLabel}>Record</p>
      <div className={styles.stats}>
        <Stat value={played} label="Matches" />
        <Stat value={stats.wins} label="Wins" />
        <Stat value={`${winRate}%`} label="Win rate" />
        <Stat value={stats.bestRally} label="Best rally" />
        <Stat value={stats.endlessBest} label="Endless" />
        <Stat value={stats.bestStreak} label="Streak" />
        <Stat value={stats.cupsWon} label="Cups won" />
        <Stat value={stats.challengesCleared} label="Challenges" />
        <Stat value={playTime(stats.playSeconds)} label="Played" />
      </div>

      <p className={styles.sectionLabel}>Build</p>
      <div className={styles.stats}>
        <Stat value={profile.talents.points} label="Points" />
        <Stat value={talents.bestDrive} label="Best drive" />
        <Stat value={talents.abilitiesUsed} label="Skills used" />
        <Stat value={talents.crits} label="Criticals" />
        <Stat value={talents.shieldSaves} label="Shields" />
        <Stat value={talents.perfectGuards} label="Guards" />
      </div>

      <button type="button" className={styles.ghost} onClick={onTalents}>
        Talents
        {profile.talents.points > 0 && (
          <span className={styles.badge}>{profile.talents.points}</span>
        )}
      </button>

      <div className={styles.buttonRow}>
        <button type="button" className={styles.ghost} onClick={onAchievements}>
          Achievements {earned}/{ACHIEVEMENTS.length}
        </button>
        <button type="button" className={styles.ghost} onClick={onCustomize}>
          Customise
        </button>
      </div>

      {demoLevel !== null ? (
        // There is nothing here to erase: a demo profile is never written.
        <p className={styles.note}>Demo profile · level {demoLevel}. Nothing here is saved.</p>
      ) : account.status === 'authenticated' ? (
        // The server owns this save, so wiping the local copy would achieve
        // nothing but a re-download. Deleting the account is the real action,
        // and it lives on the account screen where it can be confirmed.
        <p className={styles.note}>
          This progress lives on your account. To erase it, delete the account from the account
          screen.
        </p>
      ) : (
        <button
          type="button"
          className={`${styles.ghost} ${styles.danger}`}
          onClick={() => {
            if (confirmReset) {
              profileStore.reset();
              setName('Player');
              setConfirmReset(false);
            } else {
              setConfirmReset(true);
            }
          }}
        >
          {confirmReset ? 'Tap again to erase everything' : 'Reset progress'}
        </button>
      )}
    </Screen>
  );
}
