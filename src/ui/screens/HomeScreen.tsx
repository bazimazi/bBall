import type { CSSProperties } from 'react';

import { nextStage, TOTAL_STARS, totalStars, worldById } from '../../core/campaign/journey';
import { dailySpec, streakAlive } from '../../core/daily/daily';
import type { ModeId } from '../../core/modes/types';
import { dayKey } from '../../core/progression/xp';
import type { PlayerProfile } from '../../core/profile/types';
import { isRunActive, RUN_STAGES } from '../../core/run/run';
import { tierById } from '../../core/tournament/bracket';
import type { AccountState } from '../../core/account/store';
import { ProfileChip } from '../components/ProfileChip';
import { BrandLogo } from '../components/BrandLogo';
import { SyncBadge } from '../components/SyncBadge';
import { SaveNotice } from '../components/SaveNotice';
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import { GearIcon, SparkIcon } from '../icons/MenuIcons';
import { FlameIcon, HeartIcon, MapIcon, StarIcon, StarRow, SwordsIcon } from '../icons/ModeIcons';
import modes from '../Modes.module.css';
import styles from '../Screens.module.css';
import { useSettings } from '../hooks/useSettings';
import { keyList } from '../../core/settings/controls';

interface HomeScreenProps {
  profile: PlayerProfile;
  account: AccountState;
  /** The level being demoed, or null when the real save is in play. */
  demoLevel: number | null;
  onPick: (mode: ModeId) => void;
  onModes: () => void;
  onExitDemo: () => void;
  onProfile: () => void;
  onTalents: () => void;
  onSettings: () => void;
  onHelp: () => void;
}

/** Matches after which the controls hint has done its job. */
const HINT_MATCHES = 3;

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
      aria-label="Open Journey map"
    >
      <span className={modes.homeJourneyTop}>
        <span className={modes.featureIcon}>
          <MapIcon />
        </span>
        <span className={modes.homeJourneyTitle}>
          <span className={modes.featureName}>Journey</span>
          <span className={modes.featureSub}>
            {next
              ? `${next.world}-${next.index + 1} · ${next.name}${next.boss ? ' · Boss' : ''}`
              : 'Every stage cleared'}
          </span>
        </span>
        <span className={modes.featureMeta} aria-label={`${stars} of ${TOTAL_STARS} stars`}>
          <StarIcon />
          {stars}/{TOTAL_STARS}
        </span>
      </span>
      <span className={`${modes.featureBar} ${modes.homeProgress}`}>
        <span
          className={`${modes.featureFill} ${modes.homeProgress}`}
          style={{ width: `${(stars / TOTAL_STARS) * 100}%` }}
        />
      </span>
    </button>
  );
}

function DailyTile({ profile, onPick }: { profile: PlayerProfile; onPick: () => void }) {
  const today = dayKey();
  const spec = dailySpec(today);
  const record = profile.progress.daily;
  const medals = record.day === today ? record.medals : 0;
  const alive = streakAlive(record, today);
  return (
    <button
      type="button"
      className={`${modes.feature} ${modes.tile}`}
      style={accent(28)}
      onClick={onPick}
    >
      <span className={modes.tileTop}>
        <span className={modes.featureIcon}>
          <FlameIcon />
        </span>
        {medals & 1 ? (
          <StarRow mask={medals} className={modes.stars} on={modes.starOn} />
        ) : (
          <span className={modes.featureMeta}>
            <FlameIcon />
            {alive ? record.streak : 0}
          </span>
        )}
      </span>
      <span className={modes.featureName}>Daily challenge</span>
      <span className={modes.featureSub}>{spec.title}</span>
      {!(medals & 1) && <span className={`${modes.featureTag} ${modes.pulse}`}>New today</span>}
    </button>
  );
}

function GauntletTile({ profile, onPick }: { profile: PlayerProfile; onPick: () => void }) {
  const run = profile.progress.run;
  const records = profile.progress.runRecords;
  const live = isRunActive(run);
  return (
    <button
      type="button"
      className={`${modes.feature} ${modes.tile}`}
      style={accent(340)}
      onClick={onPick}
    >
      <span className={modes.tileTop}>
        <span className={modes.featureIcon}>
          <SwordsIcon />
        </span>
        {live && (
          <span className={modes.featureMeta}>
            <HeartIcon />
            {run.hearts}
          </span>
        )}
      </span>
      <span className={modes.featureName}>Gauntlet</span>
      <span className={modes.featureSub}>
        {live
          ? `Match ${run.stage + 1} of ${RUN_STAGES}`
          : records.clears > 0
            ? `Cleared ${records.clears}×`
            : records.runs > 0
              ? `Best ${records.bestStage} of ${RUN_STAGES}`
              : 'Nine matches, three hearts'}
      </span>
      {live && run.offer && (
        <span className={`${modes.featureTag} ${modes.pulse}`}>Boon waiting</span>
      )}
    </button>
  );
}

/**
 * The front door. It asks one question - play? - and answers the rest with
 * as little as it can: who you are, where the Journey is up to, today's
 * Daily and the Gauntlet. All three modes are visible from the first visit.
 * Everything else sits behind "More modes".
 */
export function HomeScreen({
  profile,
  account,
  demoLevel,
  onPick,
  onModes,
  onExitDemo,
  onProfile,
  onTalents,
  onSettings,
  onHelp
}: HomeScreenProps) {
  const coarse = useCoarsePointer();
  const { keyBindings } = useSettings();
  const cup = profile.tournament ? tierById(profile.tournament.tier) : null;
  const points = profile.talents.points;
  const newcomer = profile.stats.matches === 0;

  return (
    <section className={styles.screen}>
      <div className={styles.body}>
        <div className={`${modes.homeStack} ${modes.stagger}`}>
          <div className={modes.homeIntro}>
            <BrandLogo />
            <p className={styles.tagline}>
              {demoLevel !== null
                ? 'Demo · nothing is saved'
                : newcomer
                  ? 'Your first match starts here'
                  : cup
                    ? `${cup.name} in progress`
                    : 'Ready when you are'}
            </p>
          </div>

          {demoLevel !== null && (
            <div className={styles.demoBar}>
              <span>Demo · level {demoLevel}</span>
              <button type="button" className={styles.demoExit} onClick={onExitDemo}>
                Exit
              </button>
            </div>
          )}

          <div className={modes.homeGroup}>
            <SaveNotice />
            <ProfileChip profile={profile} onClick={onProfile} />
            <JourneyCard profile={profile} onPick={() => onPick('campaign')} />
            {profile.stats.matches < HINT_MATCHES && (
              <>
                <p className={styles.note}>
                  {coarse
                    ? 'Drag to move your paddle'
                    : `Move the mouse or use ${keyList(keyBindings, 'up')} / ${keyList(keyBindings, 'down')}`}
                </p>
                <button type="button" className={styles.ghost} onClick={onHelp}>
                  New here? Learn the controls
                </button>
              </>
            )}
          </div>

          <section className={modes.homeGroup} aria-labelledby="home-other-modes">
            <h2 id="home-other-modes" className={modes.homeLabel}>
              More ways to play
            </h2>
            <div className={modes.homeCards}>
              <DailyTile profile={profile} onPick={() => onPick('daily')} />
              <GauntletTile profile={profile} onPick={() => onPick('run')} />
            </div>
          </section>

          <button type="button" className={styles.ghost} onClick={onModes}>
            More modes
          </button>
          {profile.stats.matches >= HINT_MATCHES && (
            <button type="button" className={styles.ghost} onClick={onHelp}>
              How to play
            </button>
          )}
          {demoLevel === null && <SyncBadge account={account} />}
        </div>
      </div>

      <nav className={modes.homeUtilities} aria-label="Player tools">
        <button
          type="button"
          className={modes.homeUtility}
          onClick={onTalents}
          aria-label={points > 0 ? `Talents, ${points} points to spend` : 'Talents'}
        >
          <SparkIcon />
          <span>Talents</span>
          {points > 0 && <span className={modes.homePoints}>{points}</span>}
        </button>
        <button type="button" className={modes.homeUtility} onClick={onSettings}>
          <GearIcon />
          <span>Settings</span>
        </button>
      </nav>
    </section>
  );
}
