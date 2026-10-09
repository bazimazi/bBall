import { t, msg } from '../../core/i18n/index';
import { useState } from 'react';
import { ARENA_PRESETS } from '../../core/modes/arenas';
import { BOSSES, bossById } from '../../core/modes/bosses';
import { PERSONALITIES, SCHOOL_SCOUT } from '../../core/modes/recipes';
import { quickMatchRules } from '../../core/modes/rules';
import type { MatchOptions } from '../../core/modes/types';
import { botProfile, SELECTABLE_BOTS } from '../../core/bots/levels';
import type { BotLevelId } from '../../core/bots/types';
import type { PlayerProfile } from '../../core/profile/types';
import { Screen } from '../components/Screen';
import { PaddleNotice } from '../components/PaddleNotice';
import { MenuDisclosure } from '../components/MenuDisclosure';
import { GamePicker } from '../components/GamePicker';
import {
  ContractPreview,
  CourtPreview,
  SchoolPreview,
  SeriesPreview
} from '../components/RulePreview';
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
    <span className={styles.rank} aria-label={t(msg('Difficulty {0} of 5', [t(rank)]))}>
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
  const arena = ARENA_PRESETS.find((court) => court.id === arenaId)?.arena;
  const setupRules = quickMatchRules(last, options);
  const paddleScales = [
    setupRules.modifiers.playerPaddleScale,
    setupRules.modifiers.botPaddleScale
  ] as const;

  return (
    <Screen
      title={t(practice ? 'Practice' : 'Quick Match')}
      subtitle={t(
        practice
          ? 'Nothing is recorded'
          : msg('First to {0} wins', [t(contract === 'mythic' ? 9 : contract === 'master' ? 7 : 5)])
      )}
      onBack={onBack}
      footer={
        drillBot && (
          <button
            type="button"
            className={styles.primary}
            onClick={() => onPick(drillBot.id, options)}
          >
            {t('Start boss drill')}
          </button>
        )
      }
    >
      <PaddleNotice profile={profile} />
      {practice && <PracticePaceChoice />}
      <MenuDisclosure
        title={t(practice ? 'Practice setup' : 'Match setup')}
        hint={t(
          drill
            ? msg('{0} · {1} · {2}', [
                t(drill.spec.name),
                t(phase?.label ?? 'Opening phase'),
                t(school)
              ])
            : msg('{0} · {1}{2}{3}', [
                t(ARENA_PRESETS.find((court) => court.id === arenaId)?.name ?? 'Open court'),
                t(school),
                t(contract ? ` · ${contract === 'master' ? 'Master' : 'Mythic'}` : ''),
                t(series > 1 && !practice ? ` · Best of ${series}` : '')
              ])
        )}
      >
        {!practice && (
          <p className={styles.rowBlurb}>
            {t('Tap a rule to compare board previews.')} {t('School previews show example shots.')}
          </p>
        )}
        {practice && (
          <div className={styles.fieldGrid}>
            <GamePicker
              label={t('Boss drill')}
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
                label={t('Isolated phase')}
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
            {t(
              "Boss drills use the selected phase's opponent and court. Retry repeats that phase with your current equipped skills."
            )}
          </p>
        )}
        <div className={styles.fieldGrid}>
          {!drill && (
            <GamePicker
              label={t('Court')}
              value={arenaId}
              onChange={setArenaId}
              options={[
                {
                  value: '',
                  name: 'Open court',
                  hint: 'The classic duel. No court hazards.',
                  preview: !practice ? <CourtPreview /> : undefined
                },
                ...ARENA_PRESETS.map((c) => ({
                  value: c.id,
                  name: c.name,
                  hint: c.blurb,
                  preview: !practice ? <CourtPreview arena={c.arena} /> : undefined
                }))
              ]}
            />
          )}
          <GamePicker
            label={t('Opponent school')}
            value={personality}
            onChange={setPersonality}
            options={PERSONALITIES.map((p) => ({
              value: p,
              name: p[0]!.toUpperCase() + p.slice(1),
              hint: SCHOOL_SCOUT[p],
              preview: !practice ? (
                <SchoolPreview school={p} arena={arena} paddleScales={paddleScales} />
              ) : undefined
            }))}
          />
        </div>
        {practice && <p className={styles.rowBlurb}>{t(SCHOOL_SCOUT[personality])}</p>}
        <div className={styles.fieldGrid}>
          {!practice && (
            <GamePicker<'' | 'master' | 'mythic'>
              label={t('Contract')}
              value={contract}
              onChange={setContract}
              options={[
                {
                  value: '',
                  name: 'Standard',
                  hint: 'Your chosen opponent. First to 5.',
                  preview: <ContractPreview rules={quickMatchRules(last, { arenaId })} />
                },
                {
                  value: 'master',
                  name: 'Master',
                  hint: 'Legend · first to 7 · 90% paddle reach',
                  preview: (
                    <ContractPreview
                      rules={quickMatchRules(last, { arenaId, contract: 'master' })}
                    />
                  )
                },
                {
                  value: 'mythic',
                  name: 'Mythic',
                  hint: 'Legend · first to 9 · 80% paddle reach',
                  preview: (
                    <ContractPreview
                      rules={quickMatchRules(last, { arenaId, contract: 'mythic' })}
                    />
                  )
                }
              ]}
            />
          )}
          {!practice && (
            <GamePicker<1 | 3 | 5>
              label={t('Series')}
              value={series}
              onChange={setSeries}
              options={[
                {
                  value: 1,
                  name: 'Single match',
                  hint: 'One match decides the winner.',
                  preview: <SeriesPreview series={1} arena={arena} paddleScales={paddleScales} />
                },
                {
                  value: 3,
                  name: 'Best of 3',
                  hint: 'First to 2 match wins.',
                  preview: <SeriesPreview series={3} arena={arena} paddleScales={paddleScales} />
                },
                {
                  value: 5,
                  name: 'Best of 5',
                  hint: 'First to 3 match wins.',
                  preview: <SeriesPreview series={5} arena={arena} paddleScales={paddleScales} />
                }
              ]}
            />
          )}
        </div>
      </MenuDisclosure>
      <p className={styles.sectionLabel}>
        {t(
          drill
            ? 'Drill opponent'
            : contract && !practice
              ? 'Contract opponent'
              : 'Choose your opponent'
        )}
      </p>
      {drillBot ? (
        <div className={styles.row}>
          <span className={styles.rowText}>
            <span className={styles.rowTitle}>
              {t(drillBot.name)}
              {t(' · ')}
              {t(phase?.label ?? 'Opening phase')}
            </span>
            <span className={styles.rowBlurb}>{t(drillBot.blurb)}</span>
          </span>
          <span className={styles.rowMeta}>
            <RankDots rank={drillBot.rank} />
            <span>{t('Free play')}</span>
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
                    <span className={styles.rowTitle}>{t(bot.name)}</span>
                    <span className={styles.rowBlurb}>{t(bot.blurb)}</span>
                  </span>
                  <span className={styles.rowMeta}>
                    <RankDots rank={bot.rank} />
                    <span>
                      {t(
                        practice
                          ? 'Free play'
                          : wins > 0
                            ? msg('{0} won', [t(wins)])
                            : msg('{0}x XP', [t(bot.xpFactor)])
                      )}
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
