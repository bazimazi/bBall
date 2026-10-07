import { useState } from 'react';
import { loadCouchPresets, saveCouchPresets } from '../../core/modes/couchPresets';
import { endlessRecordKey } from '../../core/modes/sessions';
import { ARENA_PRESETS } from '../../core/modes/arenas';
import type { MatchOptions } from '../../core/modes/types';
import { botProfile } from '../../core/bots/levels';
import { MODES, type ModeInfo } from '../../core/modes/catalog';
import { CHALLENGES } from '../../core/modes/challenges';
import type { ModeId } from '../../core/modes/types';
import { levelOf } from '../../core/progression/levels';
import type { PlayerProfile } from '../../core/profile/types';
import { roundsFor, tierForLevel } from '../../core/tournament/bracket';
import { Screen } from '../components/Screen';
import modes from '../Modes.module.css';
import styles from '../Screens.module.css';

interface ModesScreenProps {
  profile: PlayerProfile;
  onPick: (mode: ModeId, options?: MatchOptions) => void;
  onBack: () => void;
}

/** The modes Home already has a card for, so this list skips them. */
const HOME_MODES: readonly ModeId[] = ['campaign', 'daily', 'run'];

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
      if (active) return roundsFor(active)[active.round]!.name;
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

/**
 * Every mode Home does not feature, one row each. Home stays down to a Play
 * button and a couple of cards; the rest of the game lives one tap away here.
 */
export function ModesScreen({ profile, onPick, onBack }: ModesScreenProps) {
  const [arenaId, setArenaId] = useState('');
  const [waves, setWaves] = useState(false);
  const [series, setSeries] = useState<1 | 3 | 5>(1);
  const [mirror, setMirror] = useState(false);
  const [duel, setDuel] = useState<'' | 'speed' | 'precision'>('');
  const [presets, setPresets] = useState(loadCouchPresets);
  const couch: MatchOptions = {
    ...(arenaId ? { arenaId } : {}),
    ...(series > 1 ? { series } : {}),
    ...(mirror ? { mirror: true } : {}),
    ...(duel ? { duel } : {})
  };
  const record = profile.progress.endlessRecords[endlessRecordKey({ arenaId, waves })];
  return (
    <Screen title="More modes" subtitle="Quick games, cups and couch play" onBack={onBack}>
      <div className={styles.card}>
        <label>
          Court for Endless and Versus{' '}
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
          Endless format{' '}
          <select
            value={waves ? 'waves' : 'classic'}
            onChange={(e) => setWaves(e.target.value === 'waves')}
          >
            <option value="classic">Classic rally</option>
            <option value="waves">Waves · 12 returns per course</option>
          </select>
        </label>
        <p className={styles.rowBlurb}>
          {waves
            ? `Best ${record?.waves ?? 0} waves · Court choice seeds the route. Courts change safely between waves.`
            : `Course best rally ${record?.rally ?? 0}`}
        </p>
        <label>
          Versus series{' '}
          <select value={series} onChange={(e) => setSeries(Number(e.target.value) as 1 | 3 | 5)}>
            <option value={1}>Single match</option>
            <option value={3}>Best of 3</option>
            <option value={5}>Best of 5</option>
          </select>
        </label>
        <label>
          Versus rule{' '}
          <select value={duel} onChange={(e) => setDuel(e.target.value as typeof duel)}>
            <option value="">Standard</option>
            <option value="speed">Fast ball · both sides</option>
            <option value="precision">Precision · both paddles 80%</option>
          </select>
        </label>
        <label>
          Versus court{' '}
          <select
            value={mirror ? 'mirror' : 'original'}
            onChange={(e) => setMirror(e.target.value === 'mirror')}
          >
            <option value="original">Original layout</option>
            <option value="mirror">Mirrored pairs · breakable rails</option>
          </select>
        </label>
        <p className={styles.rowBlurb}>
          Review these rules together. Versus earns no XP or records.
        </p>
        <details>
          <summary>Four saved couch presets · this device</summary>
          {Array.from({ length: 4 }, (_, i) => (
            <div className={styles.presetRow} key={i}>
              <button
                type="button"
                className={styles.tab}
                onClick={() => {
                  const next = [...presets];
                  next[i] = couch;
                  for (let j = 0; j < i; j++) next[j] ??= {};
                  setPresets(next);
                  saveCouchPresets(next);
                }}
              >
                Save couch {i + 1}
              </button>
              <button
                type="button"
                className={styles.tab}
                disabled={!presets[i]}
                onClick={() => {
                  const p = presets[i]!;
                  setArenaId(p.arenaId ?? '');
                  setSeries(p.series ?? 1);
                  setMirror(!!p.mirror);
                  setDuel(p.duel ?? '');
                }}
              >
                Load couch {i + 1}
              </button>
            </div>
          ))}
        </details>
      </div>
      <div className={`${styles.grid} ${modes.stagger}`}>
        {MODES.filter((mode) => !HOME_MODES.includes(mode.id)).map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={styles.row}
            onClick={() =>
              onPick(
                mode.id,
                mode.id === 'endless'
                  ? { ...(arenaId ? { arenaId } : {}), ...(waves ? { waves: true } : {}) }
                  : mode.id === 'versus'
                    ? couch
                    : undefined
              )
            }
          >
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{mode.name}</span>
              <span className={styles.rowBlurb}>{mode.blurb}</span>
            </span>
            <span className={styles.rowMeta}>{metaFor(mode, profile)}</span>
          </button>
        ))}
      </div>
    </Screen>
  );
}
