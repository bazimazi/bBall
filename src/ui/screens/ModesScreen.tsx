import { t, msg } from '../../core/i18n/index';
import { useState } from 'react';
import { loadCouchPresets, saveCouchPresets } from '../../core/modes/couchPresets';
import { endlessRecordKey } from '../../core/modes/sessions';
import { neutralKit } from '../../core/equipment/catalog';
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
import { MenuDisclosure } from '../components/MenuDisclosure';
import { GamePicker } from '../components/GamePicker';
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
      return profile.stats.endlessBest > 0 ? `Legacy ${profile.stats.endlessBest}` : '3 lives';
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
  const recordKey = endlessRecordKey({ arenaId, waves });
  const legacy = profile.progress.endlessRecords[recordKey];
  const category = neutralKit(profile.progress.workshop.equipped) ? 'neutral' : 'workshop';
  const record = profile.progress.workshop.endless[`${category}-${recordKey}`];
  const best = (value: { waves: number; rally: number } | undefined) =>
    waves ? (value?.waves ?? 0) : (value?.rally ?? 0);
  return (
    <Screen
      title={t('More modes')}
      subtitle={t('Quick games, cups and couch play')}
      onBack={onBack}
    >
      <MenuDisclosure
        title={t('Court & couch rules')}
        hint={t(
          msg('{0} · {1} · {2} Versus', [
            t(ARENA_PRESETS.find((court) => court.id === arenaId)?.name ?? 'Open court'),
            t(waves ? 'Waves' : 'Classic rally'),
            t(series > 1 ? `Best of ${series}` : 'Single match')
          ])
        )}
      >
        <div className={styles.fieldGrid}>
          <GamePicker
            label={t('Court for Endless and Versus')}
            value={arenaId}
            onChange={setArenaId}
            options={[
              { value: '', name: 'Open court', hint: 'The classic duel. No court hazards.' },
              ...ARENA_PRESETS.map((c) => ({ value: c.id, name: c.name, hint: c.blurb }))
            ]}
          />
          <GamePicker
            label={t('Endless format')}
            value={waves ? 'waves' : 'classic'}
            onChange={(value) => setWaves(value === 'waves')}
            options={[
              { value: 'classic', name: 'Classic rally', hint: 'Keep one rally alive.' },
              {
                value: 'waves',
                name: 'Waves',
                hint: '12 returns per course. Courts change between waves.'
              }
            ]}
          />
        </div>
        <p className={styles.rowBlurb}>
          {t(category === 'neutral' ? 'Neutral equipment' : 'Workshop equipment')}
          {t(' best: ')}
          {t(best(record))}
          {t(' ')}
          {t(waves ? 'waves' : 'returns')}
          {t('. Neutral:')}
          {t(' ')}
          {t(best(profile.progress.workshop.endless[`neutral-${recordKey}`]))}
          {t(' · Workshop:')}
          {t(' ')}
          {t(best(profile.progress.workshop.endless[`workshop-${recordKey}`]))}
          {t(' · Legacy:')}
          {t(' ')}
          {t(best(legacy))}
          {t('.')}
          {t(waves && ' Court choice seeds the route. Courts change safely between waves.')}
        </p>
        <div className={styles.fieldGrid}>
          <GamePicker<1 | 3 | 5>
            label={t('Versus series')}
            value={series}
            onChange={setSeries}
            options={[
              { value: 1, name: 'Single match' },
              { value: 3, name: 'Best of 3' },
              { value: 5, name: 'Best of 5' }
            ]}
          />
          <GamePicker<'' | 'speed' | 'precision'>
            label={t('Versus rule')}
            value={duel}
            onChange={setDuel}
            options={[
              { value: '', name: 'Standard', hint: 'Classic pace and paddle reach.' },
              { value: 'speed', name: 'Fast ball', hint: 'More pace for both sides.' },
              { value: 'precision', name: 'Precision', hint: 'Both paddles have 80% reach.' }
            ]}
          />
          <GamePicker
            label={t('Versus court')}
            value={mirror ? 'mirror' : 'original'}
            onChange={(value) => setMirror(value === 'mirror')}
            options={[
              { value: 'original', name: 'Original layout' },
              {
                value: 'mirror',
                name: 'Mirrored pairs',
                hint: 'Symmetric courts with breakable rails.'
              }
            ]}
          />
        </div>
        <p className={styles.rowBlurb}>
          {t('Review these rules together. Versus earns no XP or records.')}
        </p>
        <details>
          <summary>{t('Four saved couch presets · this device')}</summary>
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
                {t('Save couch ')}
                {t(i + 1)}
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
                {t('Load couch ')}
                {t(i + 1)}
              </button>
            </div>
          ))}
        </details>
      </MenuDisclosure>
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
              <span className={styles.rowTitle}>{t(mode.name)}</span>
              <span className={styles.rowBlurb}>
                {t(
                  mode.id === 'endless'
                    ? msg('{0} · {1} · {2} best {3}', [
                        t(waves ? 'Waves' : 'Classic rally'),
                        t(
                          ARENA_PRESETS.find((court) => court.id === arenaId)?.name ?? 'Open court'
                        ),
                        t(category),
                        t(best(record))
                      ])
                    : mode.id === 'versus'
                      ? msg('{0} · {1}{2}', [
                          t(series > 1 ? `Best of ${series}` : 'Single match'),
                          t(
                            duel === 'precision'
                              ? 'Precision'
                              : duel === 'speed'
                                ? 'Fast ball'
                                : 'Standard'
                          ),
                          t(mirror ? ' · Mirrored' : '')
                        ])
                      : mode.blurb
                )}
              </span>
            </span>
            <span className={styles.rowMeta}>{t(metaFor(mode, profile))}</span>
          </button>
        ))}
      </div>
    </Screen>
  );
}
