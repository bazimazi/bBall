import { useState } from 'react';

import { ACHIEVEMENTS } from '../../core/achievements/catalog';
import { NAME_MAX } from '../../core/profile/defaults';
import { setIdentity } from '../../core/account/progression';
import { profileStore } from '../../core/profile/store';
import { AVATARS, type PlayerProfile } from '../../core/profile/types';
import type { AccountState } from '../../core/account/store';
import { Avatar } from '../components/Avatar';
import { Screen } from '../components/Screen';
import { ConfirmAction } from '../components/ConfirmAction';
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
  onSettings: () => void;
  onDemo: () => void;
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

/** Unmount on account/demo changes so a previous reset request cannot become active again. */
function GuestReset({ onReset }: { onReset: () => void }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`${styles.ghost} ${styles.danger}`}
        onClick={() => setShow(true)}
      >
        Reset progress
      </button>
      <ConfirmAction
        show={show}
        title="Reset guest progress?"
        description="This erases this device's guest profile and starts over. XP, records, Journey stars, talents, achievements and cosmetic unlocks will be lost. This cannot be undone. Device settings stay."
        cancelLabel="Keep progress"
        confirmLabel="Erase guest progress"
        onCancel={() => setShow(false)}
        onConfirm={() => {
          setShow(false);
          onReset();
        }}
      />
    </>
  );
}

export function ProfileScreen({
  profile,
  account,
  onAccount,
  onAchievements,
  onCustomize,
  onSettings,
  onDemo,
  onBack
}: ProfileScreenProps) {
  const [name, setName] = useState(profile.name);
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

      <div className={styles.buttonRow}>
        <button type="button" className={styles.ghost} onClick={onAchievements}>
          Achievements {earned}/{ACHIEVEMENTS.length}
        </button>
        <button type="button" className={styles.ghost} onClick={onCustomize}>
          Customise
        </button>
      </div>
      <button type="button" className={styles.ghost} onClick={onSettings}>
        Settings
      </button>

      {demoLevel !== null ? (
        // There is nothing here to erase: a demo profile is never written.
        <p className={styles.note}>Demo profile · level {demoLevel}. Nothing here is saved.</p>
      ) : account.status !== 'guest' ? (
        // The server owns this save, so wiping the local copy would achieve
        // nothing but a re-download. Deleting the account is the real action,
        // and it lives on the account screen where it can be confirmed.
        <p className={styles.note}>
          {account.status === 'authenticated'
            ? 'This progress lives on your account. To erase it, delete the account from the account screen.'
            : 'Restoring your account. Progress reset is unavailable until this finishes.'}
        </p>
      ) : (
        <GuestReset
          key={profile.id}
          onReset={() => {
            profileStore.reset();
            setName('Player');
          }}
        />
      )}

      <button type="button" className={styles.ghost} onClick={onDemo}>
        {demoLevel === null ? 'Demo a level' : 'Change demo level'}
      </button>
    </Screen>
  );
}
