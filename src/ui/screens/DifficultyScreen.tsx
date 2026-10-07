import { useState } from 'react';
import { ARENA_PRESETS } from '../../core/modes/arenas';
import { BOSSES, bossById } from '../../core/modes/bosses';
import { PERSONALITIES, SCHOOL_SCOUT } from '../../core/modes/recipes';
import type { MatchOptions } from '../../core/modes/types';
import { SELECTABLE_BOTS } from '../../core/bots/levels';
import type { BotLevelId } from '../../core/bots/types';
import type { PlayerProfile } from '../../core/profile/types';
import { Screen } from '../components/Screen';
import styles from '../Screens.module.css';
import { PracticePaceChoice } from '../components/PracticePaceChoice';

interface DifficultyScreenProps {
  profile: PlayerProfile;
  /** Practice runs the same bots without touching progression. */
  practice: boolean;
  onPick: (bot: BotLevelId, options?: MatchOptions) => void;
  onBack: () => void;
}

function RankDots({ rank }: { rank: number }) {
  return (
    <span className={styles.rank} aria-label={`Difficulty ${rank} of 5`}>
      {[1, 2, 3, 4, 5].map((step) => (
        <i
          key={step}
          className={step <= rank ? `${styles.rankDot} ${styles.rankOn}` : styles.rankDot}
        />
      ))}
    </span>
  );
}

/** One tap per bot: picking a difficulty starts the match straight away. */
export function DifficultyScreen({ profile, practice, onPick, onBack }: DifficultyScreenProps) {
  const [series, setSeries] = useState<1 | 3 | 5>(1);
  const [arenaId, setArenaId] = useState('');
  const [personality, setPersonality] = useState<(typeof PERSONALITIES)[number]>('opportunist');
  const [contract, setContract] = useState<'' | 'master' | 'mythic'>('');
  const [bossId, setBossId] = useState('');
  const [bossPhase, setBossPhase] = useState(0);
  const options: MatchOptions = {
    personality,
    ...(!practice && series > 1 ? { series } : {}),
    ...(arenaId ? { arenaId } : {}),
    ...(!practice && contract ? { contract } : {}),
    ...(practice && bossId ? { bossId, bossPhase } : {})
  };
  const last = practice ? profile.preferences.lastPracticeBot : profile.preferences.lastBot;

  return (
    <Screen
      title={practice ? 'Practice' : 'Quick Match'}
      subtitle={
        practice
          ? 'Nothing is recorded'
          : `First to ${contract === 'mythic' ? 9 : contract === 'master' ? 7 : 5} wins`
      }
      onBack={onBack}
    >
      {practice && <PracticePaceChoice />}
      {practice && (
        <div className={styles.card}>
          <label>
            Boss drill{' '}
            <select
              value={bossId}
              onChange={(e) => {
                setBossId(e.target.value);
                setBossPhase(0);
              }}
            >
              <option value="">Ordinary opponent</option>
              {BOSSES.map((b) => (
                <option key={b.spec.id} value={b.spec.id}>
                  {b.spec.name}
                </option>
              ))}
            </select>
          </label>
          {bossId && (
            <label>
              Isolated phase{' '}
              <select value={bossPhase} onChange={(e) => setBossPhase(Number(e.target.value))}>
                <option value={0}>Opening phase</option>
                {bossById(bossId)?.spec.phases.map((p, i) => (
                  <option value={i + 1} key={i}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className={styles.rowBlurb}>
            Boss drills use the selected phase's opponent and court. Retry repeats that phase with
            your current equipped skills.
          </p>
        </div>
      )}
      <div className={styles.card}>
        <label>
          Court{' '}
          <select value={arenaId} onChange={(e) => setArenaId(e.target.value)}>
            <option value="">Open court</option>
            {ARENA_PRESETS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Opponent school{' '}
          <select
            value={personality}
            onChange={(e) => setPersonality(e.target.value as typeof personality)}
          >
            {PERSONALITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <p className={styles.rowBlurb}>{SCHOOL_SCOUT[personality]}</p>
        {!practice && (
          <label>
            Contract{' '}
            <select
              value={contract}
              onChange={(e) => setContract(e.target.value as typeof contract)}
            >
              <option value="">Standard</option>
              <option value="master">Master · Legend, first to 7, 90% reach</option>
              <option value="mythic">Mythic · Legend, first to 9, 80% reach</option>
            </select>
          </label>
        )}
      </div>
      {!practice && (
        <div className={styles.card}>
          <label>
            Series{' '}
            <select value={series} onChange={(e) => setSeries(Number(e.target.value) as 1 | 3 | 5)}>
              <option value={1}>Single match</option>
              <option value={3}>Best of 3</option>
              <option value={5}>Best of 5</option>
            </select>
          </label>
          <p className={styles.rowBlurb}>Normal match XP per game. No extra series reward.</p>
        </div>
      )}
      <div className={styles.grid}>
        {SELECTABLE_BOTS.map((bot) => {
          const wins = profile.stats.winsByBot[bot.id] ?? 0;
          return (
            <button
              key={bot.id}
              disabled={!!contract && !practice && bot.id !== 'legend'}
              type="button"
              className={bot.id === last ? `${styles.row} ${styles.selected}` : styles.row}
              onClick={() => onPick(contract && !practice ? 'legend' : bot.id, options)}
            >
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{bot.name}</span>
                <span className={styles.rowBlurb}>{bot.blurb}</span>
              </span>
              <span className={styles.rowMeta}>
                <RankDots rank={bot.rank} />
                <span>
                  {practice ? 'Free play' : wins > 0 ? `${wins} won` : `${bot.xpFactor}x XP`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Screen>
  );
}
