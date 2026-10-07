import { SCHOOL_SCOUT } from '../../core/modes/recipes';
import { tournamentRules } from '../../core/modes/rules';
import { useState } from 'react';

import { botProfile } from '../../core/bots/levels';
import { levelOf } from '../../core/progression/levels';
import type { PlayerProfile } from '../../core/profile/types';
import {
  roundsFor,
  CUP_FORMATS,
  type TournamentFormat,
  TOURNAMENT_TIERS,
  opponentFor,
  tierById,
  tierForLevel
} from '../../core/tournament/bracket';
import { Screen } from '../components/Screen';
import { ChoiceGroup } from '../components/ChoiceGroup';
import { ConfirmAction } from '../components/ConfirmAction';
import styles from '../Screens.module.css';

interface TournamentScreenProps {
  profile: PlayerProfile;
  onPlay: () => void;
  onStart: (tier: number, format?: TournamentFormat) => void;
  onAbandon: () => void;
  onBack: () => void;
}

/** The three rounds of the cup in play, with results filled in as they land. */
function Bracket({ profile }: { profile: PlayerProfile }) {
  const save = profile.tournament;
  if (!save) return null;

  return (
    <div className={styles.bracket}>
      {roundsFor(save).map((round, index) => {
        const played = save.results[index];
        const current = index === save.round;
        const opponent = botProfile(opponentFor(save, index));
        return (
          <div
            key={round.name}
            className={current ? `${styles.bracketRow} ${styles.bracketNow}` : styles.bracketRow}
            aria-current={current ? 'step' : undefined}
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

/** A changed cup/round mounts afresh, discarding any earlier request to give it up. */
function ActiveCup({
  profile,
  onPlay,
  onAbandon,
  onBack
}: Pick<TournamentScreenProps, 'profile' | 'onPlay' | 'onAbandon' | 'onBack'>) {
  const [confirm, setConfirm] = useState(false);
  const active = profile.tournament;
  if (!active) return null;
  const cup = tierById(active.tier);
  const rules = tournamentRules(active);
  const school = rules.bot.personality ?? 'opportunist';
  const round = roundsFor(active)[active.round] ?? roundsFor(active)[0]!;
  return (
    <Screen
      title={cup.name}
      subtitle={`Round ${active.round + 1} of ${roundsFor(active).length}`}
      onBack={onBack}
      footer={
        <>
          <button type="button" className={styles.primary} onClick={onPlay}>
            Play {round.name}
          </button>
          <button
            type="button"
            className={`${styles.ghost} ${styles.danger}`}
            onClick={() => setConfirm(true)}
          >
            Give up the cup
          </button>
        </>
      }
    >
      <div className={styles.card}>
        <p className={styles.sectionLabel}>
          Next opponent · {rules.bot.name} · {school}
          {active.format === 'ladder' ? ` · Season ${(active.season ?? 0) + 1}` : ''}
        </p>
        <p className={styles.rowBlurb}>{SCHOOL_SCOUT[school]}</p>
        <p className={styles.rowBlurb}>
          {rules.courtFamily ?? 'Open court'} · first to {rules.winScore}
        </p>
      </div>
      <Bracket profile={profile} />
      <ConfirmAction
        show={confirm}
        title="Give up this cup?"
        description={`This ends your ${cup.name} at round ${active.round + 1} of ${roundsFor(active).length}. It will not count as a cup won. Your earned XP and unlocks stay. You can keep the cup and return later.`}
        cancelLabel="Keep cup"
        confirmLabel="Give up cup"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          onAbandon();
        }}
      />
    </Screen>
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
  const [format, setFormat] = useState<TournamentFormat>('classic');
  const [tier, setTier] = useState(() => tierForLevel(level).id);
  const active = profile.tournament;
  const last = profile.lastTournament;
  if (active)
    return (
      <ActiveCup
        key={`${profile.id}:${active.startedAt}:${active.tier}:${active.round}`}
        profile={profile}
        onPlay={onPlay}
        onAbandon={onAbandon}
        onBack={onBack}
      />
    );

  return (
    <Screen
      title="Tournament"
      subtitle="Choose a format and compete for a cup"
      onBack={onBack}
      footer={
        <button type="button" className={styles.primary} onClick={() => onStart(tier, format)}>
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
              : `Knocked out in the ${(roundsFor(last)[Math.max(0, last.round - 1)] ?? roundsFor(last)[0]!).name.toLowerCase()}`}
          </p>
        </div>
      )}

      <ChoiceGroup<TournamentFormat>
        label="Format"
        value={format}
        onChange={setFormat}
        options={CUP_FORMATS.map((f) => ({
          value: f,
          name: f === 'classic' ? 'Classic' : f === 'marathon' ? 'Marathon' : 'Ladder',
          hint: f === 'classic' ? '3 rounds' : f === 'marathon' ? '7 rounds' : '6-round seasons'
        }))}
      />
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
              aria-pressed={item.id === tier}
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
