import { useState } from 'react';

import { botProfile } from '../../core/bots/levels';
import { levelOf } from '../../core/progression/levels';
import type { PlayerProfile } from '../../core/profile/types';
import {
  TOURNAMENT_ROUNDS,
  TOURNAMENT_TIERS,
  opponentFor,
  tierById,
  tierForLevel
} from '../../core/tournament/bracket';
import { Screen } from '../components/Screen';
import styles from '../Screens.module.css';

interface TournamentScreenProps {
  profile: PlayerProfile;
  onPlay: () => void;
  onStart: (tier: number) => void;
  onAbandon: () => void;
  onBack: () => void;
}

/** The three rounds of the cup in play, with results filled in as they land. */
function Bracket({ profile }: { profile: PlayerProfile }) {
  const save = profile.tournament;
  if (!save) return null;

  return (
    <div className={styles.bracket}>
      {TOURNAMENT_ROUNDS.map((round, index) => {
        const played = save.results[index];
        const current = index === save.round;
        const opponent = botProfile(opponentFor(save, index));
        return (
          <div
            key={round.name}
            className={current ? `${styles.bracketRow} ${styles.bracketNow}` : styles.bracketRow}
          >
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{round.name}</span>
              <span className={styles.rowBlurb}>
                vs {opponent.name} · first to {round.winScore}
              </span>
            </span>
            <span
              className={`${styles.bracketScore} ${played ? (played.won ? styles.win : styles.lose) : ''}`}
            >
              {played ? `${played.you}-${played.bot}` : current ? 'Next' : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TournamentScreen({
  profile,
  onPlay,
  onStart,
  onAbandon,
  onBack
}: TournamentScreenProps) {
  const level = levelOf(profile.xp);
  const [tier, setTier] = useState(() => tierForLevel(level).id);
  const active = profile.tournament;
  const last = profile.lastTournament;

  if (active) {
    const cup = tierById(active.tier);
    const round = TOURNAMENT_ROUNDS[active.round] ?? TOURNAMENT_ROUNDS[0]!;
    return (
      <Screen
        title={cup.name}
        subtitle={`Round ${active.round + 1} of ${TOURNAMENT_ROUNDS.length}`}
        onBack={onBack}
        footer={
          <>
            <button type="button" className={styles.primary} onClick={onPlay}>
              Play {round.name}
            </button>
            <button
              type="button"
              className={`${styles.ghost} ${styles.danger}`}
              onClick={onAbandon}
            >
              Give up the cup
            </button>
          </>
        }
      >
        <Bracket profile={profile} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Tournament"
      subtitle="Three rounds, one trophy"
      onBack={onBack}
      footer={
        <button type="button" className={styles.primary} onClick={() => onStart(tier)}>
          Start {tierById(tier).name}
        </button>
      }
    >
      {last && (
        <div className={styles.card}>
          <p className={styles.sectionLabel}>Last cup</p>
          <p className={styles.note} style={{ textAlign: 'left', marginTop: 6 }}>
            {last.champion
              ? `Champion of the ${tierById(last.tier).name}`
              : `Knocked out in the ${(TOURNAMENT_ROUNDS[Math.max(0, last.round - 1)] ?? TOURNAMENT_ROUNDS[0]!).name.toLowerCase()}`}
          </p>
        </div>
      )}

      <p className={styles.sectionLabel}>Choose a cup</p>
      <div className={styles.grid}>
        {TOURNAMENT_TIERS.map((item) => {
          const locked = level < item.minLevel;
          return (
            <button
              key={item.id}
              type="button"
              disabled={locked}
              className={item.id === tier ? `${styles.row} ${styles.selected}` : styles.row}
              onClick={() => setTier(item.id)}
            >
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{item.name}</span>
                <span className={styles.rowBlurb}>
                  {item.opponents.map((id) => botProfile(id).name).join(' → ')}
                </span>
              </span>
              <span className={styles.rowMeta}>
                {locked ? `Level ${item.minLevel}` : `${item.trophyXp} XP`}
              </span>
            </button>
          );
        })}
      </div>
    </Screen>
  );
}
