import { useState } from 'react';
import { ARENA_PRESETS } from '../../core/modes/arenas';
import { BOSSES, bossById } from '../../core/modes/bosses';
import { PERSONALITIES, SCHOOL_SCOUT } from '../../core/modes/recipes';
import type { MatchOptions } from '../../core/modes/types';
import { botProfile, SELECTABLE_BOTS } from '../../core/bots/levels';
import type { BotLevelId } from '../../core/bots/types';
import type { PlayerProfile } from '../../core/profile/types';
import { Screen } from '../components/Screen';
import { MenuDisclosure } from '../components/MenuDisclosure';
import { GamePicker } from '../components/GamePicker';
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
  const drill = practice && bossId ? bossById(bossId) : undefined;
  const phase = bossPhase > 0 ? drill?.spec.phases[bossPhase - 1] : undefined;
  const drillBot = drill ? botProfile(phase?.bot ?? drill.bot) : undefined;
  const school = personality[0]!.toUpperCase() + personality.slice(1);
  const options: MatchOptions = {
    personality,
    ...(!practice && series > 1 ? { series } : {}),
    ...(arenaId && !drill ? { arenaId } : {}),
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
      footer={
        drillBot && (
          <button
            type="button"
            className={styles.primary}
            onClick={() => onPick(drillBot.id, options)}
          >
            Start boss drill
          </button>
        )
      }
    >
      {practice && <PracticePaceChoice />}
      <MenuDisclosure
        title={practice ? 'Practice setup' : 'Match setup'}
        hint={
          drill
            ? `${drill.spec.name} · ${phase?.label ?? 'Opening phase'} · ${school}`
            : `${ARENA_PRESETS.find((court) => court.id === arenaId)?.name ?? 'Open court'} · ${school}${contract ? ` · ${contract === 'master' ? 'Master' : 'Mythic'}` : ''}${series > 1 && !practice ? ` · Best of ${series}` : ''}`
        }
      >
        {practice && (
          <div className={styles.fieldGrid}>
            <GamePicker
              label="Boss drill"
              value={bossId}
              onChange={(value) => {
                setBossId(value);
                setBossPhase(0);
              }}
              options={[
                {
                  value: '',
                  name: 'Ordinary opponent',
                  hint: 'Choose your own court and opponent.'
                },
                ...BOSSES.map((b) => ({ value: b.spec.id, name: b.spec.name, hint: b.spec.title }))
              ]}
            />
            {bossId && (
              <GamePicker
                label="Isolated phase"
                value={bossPhase}
                onChange={setBossPhase}
                options={[
                  { value: 0, name: 'Opening phase' },
                  ...(bossById(bossId)?.spec.phases ?? []).map((p, i) => ({
                    value: i + 1,
                    name: p.label
                  }))
                ]}
              />
            )}
          </div>
        )}
        {drill && (
          <p className={styles.rowBlurb}>
            Boss drills use the selected phase's opponent and court. Retry repeats that phase with
            your current equipped skills.
          </p>
        )}
        <div className={styles.fieldGrid}>
          {!drill && (
            <GamePicker
              label="Court"
              value={arenaId}
              onChange={setArenaId}
              options={[
                { value: '', name: 'Open court', hint: 'The classic duel. No court hazards.' },
                ...ARENA_PRESETS.map((c) => ({ value: c.id, name: c.name, hint: c.blurb }))
              ]}
            />
          )}
          <GamePicker
            label="Opponent school"
            value={personality}
            onChange={setPersonality}
            options={PERSONALITIES.map((p) => ({
              value: p,
              name: p[0]!.toUpperCase() + p.slice(1),
              hint: SCHOOL_SCOUT[p]
            }))}
          />
        </div>
        <p className={styles.rowBlurb}>{SCHOOL_SCOUT[personality]}</p>
        <div className={styles.fieldGrid}>
          {!practice && (
            <GamePicker<'' | 'master' | 'mythic'>
              label="Contract"
              value={contract}
              onChange={setContract}
              options={[
                { value: '', name: 'Standard', hint: 'Your chosen opponent. First to 5.' },
                { value: 'master', name: 'Master', hint: 'Legend · first to 7 · 90% paddle reach' },
                { value: 'mythic', name: 'Mythic', hint: 'Legend · first to 9 · 80% paddle reach' }
              ]}
            />
          )}
          {!practice && (
            <GamePicker<1 | 3 | 5>
              label="Series"
              value={series}
              onChange={setSeries}
              options={[
                { value: 1, name: 'Single match' },
                { value: 3, name: 'Best of 3' },
                { value: 5, name: 'Best of 5' }
              ]}
            />
          )}
        </div>
        {!practice && contract && (
          <p className={styles.rowBlurb}>
            Legend opponent · first to {contract === 'mythic' ? 9 : 7} ·{' '}
            {contract === 'mythic' ? '80%' : '90%'} paddle reach
          </p>
        )}
      </MenuDisclosure>
      <p className={styles.sectionLabel}>
        {drill
          ? 'Drill opponent'
          : contract && !practice
            ? 'Contract opponent'
            : 'Choose your opponent'}
      </p>
      {drillBot ? (
        <div className={styles.row}>
          <span className={styles.rowText}>
            <span className={styles.rowTitle}>
              {drillBot.name} · {phase?.label ?? 'Opening phase'}
            </span>
            <span className={styles.rowBlurb}>{drillBot.blurb}</span>
          </span>
          <span className={styles.rowMeta}>
            <RankDots rank={drillBot.rank} />
            <span>Free play</span>
          </span>
        </div>
      ) : (
        <div className={styles.grid}>
          {SELECTABLE_BOTS.filter((bot) => !contract || practice || bot.id === 'legend').map(
            (bot) => {
              const wins = profile.stats.winsByBot[bot.id] ?? 0;
              return (
                <button
                  key={bot.id}
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
            }
          )}
        </div>
      )}
    </Screen>
  );
}
