import type { CSSProperties } from 'react';

import { botProfile } from '../../core/bots/levels';
import { nextStage, TOTAL_STARS, totalStars, worldById } from '../../core/campaign/journey';
import { dailySpec, streakAlive } from '../../core/daily/daily';
import { MODES, type ModeInfo } from '../../core/modes/catalog';
import { CHALLENGES } from '../../core/modes/challenges';
import type { ModeId } from '../../core/modes/types';
import { levelOf } from '../../core/progression/levels';
import { dayKey } from '../../core/progression/xp';
import type { PlayerProfile } from '../../core/profile/types';
import { actOf, isRunActive, RUN_STAGES } from '../../core/run/run';
import { abilitySlots } from '../../core/talents/save';
import { roundFor, tierById, tierForLevel } from '../../core/tournament/bracket';
import type { AccountState } from '../../core/account/store';
import { ProfileChip } from '../components/ProfileChip';
import { QuestList } from '../components/QuestList';
import { SyncBadge } from '../components/SyncBadge';
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import { FlameIcon, HeartIcon, MapIcon, StarIcon, StarRow, SwordsIcon } from '../icons/ModeIcons';
import modes from '../Modes.module.css';
import styles from '../Screens.module.css';

interface HomeScreenProps {
  profile: PlayerProfile;
  account: AccountState;
  /** The level being demoed, or null when the real save is in play. */
  demoLevel: number | null;
  onPick: (mode: ModeId) => void;
  onExitDemo: () => void;
  onProfile: () => void;
  onTalents: () => void;
}

/** The three modes that get a card of their own rather than a row. */
const FEATURED: readonly ModeId[] = ['campaign', 'daily', 'run'];

/** A one-line hint per mode, so nothing needs a sub-menu to be understood. */
function metaFor(mode: ModeInfo, profile: PlayerProfile): string {
  switch (mode.id) {
    case 'quick':
      return botProfile(profile.preferences.lastBot).name;
    case 'endless':
      return profile.stats.endlessBest > 0 ? `Best ${profile.stats.endlessBest}` : '3 lives';
    case 'challenge': {
      const cleared = CHALLENGES.filter((item) => profile.challenges[item.id]?.cleared).length;
      return `${cleared} / ${CHALLENGES.length}`;
    }
    case 'tournament': {
      const active = profile.tournament;
      if (active) return roundFor(active.round).name;
      return tierForLevel(levelOf(profile.xp)).name;
    }
    case 'versus':
      return '2 players';
    case 'practice':
      return 'No XP';
    default:
      return '';
  }
}

const accent = (hue: number): CSSProperties =>
  ({ '--accent': `hsl(${hue} 90% 66%)` }) as CSSProperties;

function JourneyCard({ profile, onPick }: { profile: PlayerProfile; onPick: () => void }) {
  const journey = profile.progress.journey;
  const stars = totalStars(journey);
  const next = nextStage(journey);
  const world = worldById(next?.world ?? 5);
  return (
    <button
      type="button"
      className={modes.feature}
      style={accent(world?.hue ?? 171)}
      onClick={onPick}
    >
      <span className={modes.featureTop}>
        <span className={modes.featureIcon}>
          <MapIcon />
        </span>
        <span className={modes.featureTitle}>
          <span className={modes.featureName}>Journey</span>
          <span className={modes.featureSub}>
            {next
              ? `${next.world}-${next.index + 1} · ${next.name}${next.boss ? ' · Boss' : ''}`
              : 'Every stage cleared'}
          </span>
        </span>
        <span className={modes.featureMeta}>
          <StarIcon />
          {stars}/{TOTAL_STARS}
        </span>
      </span>
      <span className={modes.featureBar}>
        <span className={modes.featureFill} style={{ width: `${(stars / TOTAL_STARS) * 100}%` }} />
      </span>
    </button>
  );
}

function DailyCard({ profile, onPick }: { profile: PlayerProfile; onPick: () => void }) {
  const today = dayKey();
  const spec = dailySpec(today);
  const record = profile.progress.daily;
  const medals = record.day === today ? record.medals : 0;
  const alive = streakAlive(record, today);
  return (
    <button type="button" className={modes.feature} style={accent(28)} onClick={onPick}>
      <span className={modes.featureTop}>
        <span className={modes.featureIcon}>
          <FlameIcon />
        </span>
        <span className={modes.featureTitle}>
          <span className={modes.featureName}>Daily</span>
          <span className={modes.featureSub}>
            {spec.title} · vs {botProfile(spec.bot).name}
          </span>
        </span>
        <span className={modes.featureMeta}>
          <FlameIcon />
          {alive ? record.streak : 0}
        </span>
      </span>
      {medals & 1 ? (
        <StarRow mask={medals} className={modes.stars} on={modes.starOn} />
      ) : (
        <span className={`${modes.featureTag} ${modes.pulse}`}>Today's challenge is open</span>
      )}
    </button>
  );
}

function GauntletCard({ profile, onPick }: { profile: PlayerProfile; onPick: () => void }) {
  const run = profile.progress.run;
  const records = profile.progress.runRecords;
  const live = isRunActive(run);
  return (
    <button type="button" className={modes.feature} style={accent(340)} onClick={onPick}>
      <span className={modes.featureTop}>
        <span className={modes.featureIcon}>
          <SwordsIcon />
        </span>
        <span className={modes.featureTitle}>
          <span className={modes.featureName}>Gauntlet</span>
          <span className={modes.featureSub}>
            {live
              ? `Act ${actOf(run.stage) + 1} · match ${run.stage + 1} of ${RUN_STAGES}`
              : records.clears > 0
                ? `Cleared ${records.clears}× · best Pressure ${records.bestPressure}`
                : records.runs > 0
                  ? `Best ${records.bestStage} of ${RUN_STAGES}`
                  : 'Nine matches, three hearts'}
          </span>
        </span>
        {live && (
          <span className={modes.featureMeta}>
            <HeartIcon />
            {run.hearts}
          </span>
        )}
      </span>
      {live && run.offer && (
        <span className={`${modes.featureTag} ${modes.pulse}`}>A boon is waiting</span>
      )}
    </button>
  );
}

export function HomeScreen({
  profile,
  account,
  demoLevel,
  onPick,
  onExitDemo,
  onProfile,
  onTalents
}: HomeScreenProps) {
  const coarse = useCoarsePointer();
  const cup = profile.tournament ? tierById(profile.tournament.tier) : null;
  const points = profile.talents.points;
  const skills = profile.talents.equipped.filter(Boolean).length;
  // The hint lists exactly the keys this build has slots for.
  const keys = Array.from(
    { length: abilitySlots(profile.talents, levelOf(profile.xp)) },
    (_, i) => i + 1
  );

  return (
    <section className={styles.screen}>
      <h1 className={styles.logo}>
        <span>b</span>Ball
      </h1>
      <p className={styles.tagline}>
        {demoLevel !== null
          ? 'Demo · nothing is saved'
          : cup
            ? `${cup.name} in progress`
            : 'Pick a mode and play'}
      </p>

      <div className={styles.body}>
        <div className={`${styles.stack} ${modes.stagger}`}>
          {demoLevel !== null && (
            <div className={styles.demoBar}>
              <span>Demo · level {demoLevel}</span>
              <button type="button" className={styles.demoExit} onClick={onExitDemo}>
                Exit
              </button>
            </div>
          )}

          <ProfileChip profile={profile} onClick={onProfile} />

          {demoLevel === null && <SyncBadge account={account} />}

          <div className={modes.features}>
            <JourneyCard profile={profile} onPick={() => onPick('campaign')} />
            <DailyCard profile={profile} onPick={() => onPick('daily')} />
            <GauntletCard profile={profile} onPick={() => onPick('run')} />
          </div>

          <QuestList profile={profile} />

          <div className={styles.grid}>
            {MODES.filter((mode) => !FEATURED.includes(mode.id)).map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={styles.row}
                onClick={() => onPick(mode.id)}
              >
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{mode.name}</span>
                  <span className={styles.rowBlurb}>{mode.blurb}</span>
                </span>
                <span className={styles.rowMeta}>{metaFor(mode, profile)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <button type="button" className={styles.ghost} onClick={onTalents}>
          Talents
          {points > 0 && <span className={styles.badge}>{points}</span>}
        </button>
        <p className={styles.note}>
          {coarse ? 'Drag anywhere to move' : 'Move the mouse or use ↑ ↓'}
          {' · flick the paddle as you hit to whip the ball'}
          {skills > 0 &&
            (coarse ? ' · tap the corner for skills' : ` · ${keys.join(' ')} for skills`)}
        </p>
      </footer>
    </section>
  );
}
