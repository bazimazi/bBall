import { useState } from 'react';
import { botProfile } from '../../core/bots/levels';
import { CHALLENGES, contractChallenge } from '../../core/modes/challenges';
import type { PlayerProfile } from '../../core/profile/types';
import { Screen } from '../components/Screen';
import styles from '../Screens.module.css';

interface ChallengeScreenProps {
  profile: PlayerProfile;
  onPick: (id: string) => void;
  onBack: () => void;
}

export function ChallengeScreen({ profile, onPick, onBack }: ChallengeScreenProps) {
  const [page, setPage] = useState(0);
  const [playlist, setPlaylist] = useState(false);
  const seriesStart = Math.floor((profile.progress.contracts ?? 0) / 5) * 5 + 1;
  const seriesEnd = seriesStart + 4;
  const contract = contractChallenge((profile.progress.contracts ?? 0) + 1);
  const cleared = CHALLENGES.filter((item) => profile.challenges[item.id]?.cleared).length;

  return (
    <Screen
      title="Challenge"
      subtitle={`${cleared} of ${CHALLENGES.length} cleared`}
      onBack={onBack}
    >
      <div className={styles.card}>
        <button type="button" className={styles.tab} onClick={() => setPlaylist((v) => !v)}>
          {playlist ? 'Close playlist' : 'Five-trial contract playlist'}
        </button>
        {playlist && (
          <>
            <p className={styles.rowBlurb}>
              Seeded set {Math.ceil(seriesStart / 5)} ·{' '}
              {(profile.progress.contracts ?? 0) - seriesStart + 1} of 5 cleared. Complete each
              objective in order; progress survives reloads.
            </p>
            {Array.from({ length: 5 }, (_, i) => contractChallenge(seriesStart + i)).map(
              (trial) => (
                <button
                  type="button"
                  className={styles.row}
                  key={trial.id}
                  disabled={Number(trial.id.slice(9)) > (profile.progress.contracts ?? 0) + 1}
                  onClick={() => onPick(trial.id)}
                >
                  {trial.name} · {trial.objective.label}
                  {Number(trial.id.slice(9)) <= (profile.progress.contracts ?? 0) ? ' ✓' : ''}
                </button>
              )
            )}
            <p className={styles.rowBlurb}>
              Ends at contract {seriesEnd}. Normal contract rewards; no playlist bonus.
            </p>
          </>
        )}
      </div>
      <button type="button" className={styles.row} onClick={() => onPick(contract.id)}>
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{contract.name}</span>
          <span className={styles.rowBlurb}>
            {contract.objective.label} · Ongoing contract series
          </span>
        </span>
      </button>
      <div className={styles.tabs}>
        {Array.from({ length: 5 }, (_, i) => (
          <button
            type="button"
            key={i}
            className={page === i ? styles.tabActive : styles.tab}
            onClick={() => setPage(i)}
          >
            Trials {i * 24 + 1}–{(i + 1) * 24}
          </button>
        ))}
      </div>
      <div className={styles.grid}>
        {CHALLENGES.slice(page * 24, (page + 1) * 24).map((challenge) => {
          const record = profile.challenges[challenge.id];
          const done = record?.cleared ?? false;
          return (
            <button
              key={challenge.id}
              type="button"
              className={styles.row}
              onClick={() => onPick(challenge.id)}
            >
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>
                  {challenge.name}
                  {done ? ' ✓' : ''}
                </span>
                <span className={styles.rowBlurb}>{challenge.blurb}</span>
                <span className={styles.rowBlurb}>
                  {challenge.objective.label} · vs {botProfile(challenge.bot).name}
                </span>
              </span>
              <span className={done ? `${styles.rowMeta} ${styles.done}` : styles.rowMeta}>
                {done ? 'Cleared' : `${challenge.xp} XP`}
              </span>
            </button>
          );
        })}
      </div>
    </Screen>
  );
}
