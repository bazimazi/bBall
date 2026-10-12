import { useState } from 'react';
import { t, msg } from '../../core/i18n/index';
import type { PlayerProfile } from '../../core/profile/types';
import * as progression from '../../core/account/progression';
import { ITEM_INFO, LOOT_ITEMS, RESEARCH, type ResearchId } from '../../core/loot/catalog';
import { hasResearch, lootBalance, specializationSlots } from '../../core/loot/state';
import { RESONANCE_TRIALS, trialOpen } from '../../core/loot/trials';
import { specializationBuilds } from '../../core/loot/ops';
import { Screen } from '../components/Screen';
import { Dialog } from '../components/Dialog';
import { MenuDisclosure } from '../components/MenuDisclosure';
import { GamePicker } from '../components/GamePicker';
import screens from '../Screens.module.css';
import styles from './LootScreen.module.css';

interface LootScreenProps {
  profile: PlayerProfile;
  onBack: () => void;
  onTalents: () => void;
  onPlay: (id: string) => void;
}
export function LootScreen({ profile, onBack, onTalents, onPlay }: LootScreenProps) {
  const state = profile.progress.loot,
    balance = lootBalance(state);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<ResearchId | null>(null);
  const [tab, setTab] = useState<'research' | 'specializations' | 'trials'>('research');
  const selectedEntry = RESEARCH.find((entry) => entry.id === selected);
  const glyphs = { shards: '◇', threads: '⌁', cores: '◈' };
  return (
    <Screen
      title={t('Resonance Lab')}
      subtitle={t('Play. Collect. Unlock forever.')}
      onBack={onBack}
    >
      <div className={styles.wallet} aria-label={t('Loot inventory')}>
        {LOOT_ITEMS.map((item) => (
          <div className={styles.resource} data-large={balance[item] >= 10000} key={item}>
            <span className={styles.glyph} aria-hidden="true">
              {glyphs[item]}
            </span>
            <strong>{t(balance[item])}</strong>
            <span>{t(ITEM_INFO[item].name)}</span>
          </div>
        ))}
      </div>
      <MenuDisclosure
        title={t('Where loot comes from')}
        hint={t(msg('{0}/3 modes visited', [t(state.circuit.length)]))}
      >
        <div className={styles.circuitHead}>
          <strong>{t('Resonance Circuit')}</strong>
          <span>{t(msg('{0}/3 modes visited', [t(state.circuit.length)]))}</span>
        </div>
        <p>
          {t(
            'Complete three different ranked modes to earn 1 core and 2 threads. The circuit repeats without a daily limit.'
          )}
        </p>
        <p>
          {state.circuit.length
            ? state.circuit
                .map((mode) =>
                  t(
                    {
                      quick: 'Quick Match',
                      campaign: 'Journey',
                      challenge: 'Challenge',
                      daily: 'Daily challenge',
                      run: 'Gauntlet',
                      endless: 'Endless',
                      tournament: 'Tournament'
                    }[mode]
                  )
                )
                .join(' · ')
            : t(
                'Choose any three: Quick Match, Journey, Challenges, Daily, Gauntlet, Endless or Tournament.'
              )}
        </p>

        {LOOT_ITEMS.map((item) => (
          <p className={screens.rowBlurb} key={item}>
            <b>{t(ITEM_INFO[item].name)}</b>
            {t(' · ')}
            {t(ITEM_INFO[item].source)}
          </p>
        ))}
        <p className={screens.note}>
          {t(
            'Loot is banked automatically, even after a defeat. A ranked attempt needs at least 15 seconds and 2 returns. Practice, demos, archives, Versus and abandoned matches do not affect your real inventory.'
          )}
        </p>
        <p className={screens.note}>
          {t(
            'First visits, new Journey stars and first challenge clears add bonuses. Research is permanent; using an unlocked feature costs nothing.'
          )}
        </p>
      </MenuDisclosure>
      <div className={styles.tabs} role="group" aria-label={t('Lab sections')}>
        {(['research', 'specializations', 'trials'] as const).map((value) => (
          <button
            type="button"
            aria-pressed={tab === value}
            key={value}
            onClick={() => {
              setTab(value);
              setSelected(null);
            }}
          >
            {t({ research: 'Upgrades', specializations: 'Builds', trials: 'Expert trials' }[value])}
          </button>
        ))}
      </div>
      <p className={styles.notice} role="status">
        {t(notice)}
      </p>
      {tab === 'research' && (
        <>
          <p className={styles.intro}>
            {t('Spend match loot on permanent upgrades. Tap one to see what it does.')}
          </p>
          <div className={styles.research}>
            {RESEARCH.map((entry) => {
              const owned = hasResearch(state, entry.id);
              const ready =
                !owned &&
                entry.requires.every((id) => hasResearch(state, id)) &&
                LOOT_ITEMS.every((item) => balance[item] >= entry.cost[item]);
              return (
                <article key={entry.id} className={`${styles.tile} ${owned ? styles.owned : ''}`}>
                  <button
                    type="button"
                    className={styles.tileButton}
                    onClick={() => setSelected(entry.id)}
                    aria-haspopup="dialog"
                  >
                    <span
                      className={styles.emblem}
                      data-kind={entry.ability ? 'skill' : 'upgrade'}
                      aria-hidden="true"
                    >
                      <ResearchIcon id={entry.id} />
                    </span>
                    <span className={styles.tileCopy}>
                      <h3>{t(entry.name)}</h3>
                      <span>{t(SUMMARIES[entry.id])}</span>
                      <small data-ready={ready}>
                        {t(owned ? 'Unlocked' : ready ? 'Ready to unlock' : 'View upgrade')}
                      </small>
                    </span>
                    <span className={styles.chevron} data-owned={owned} aria-hidden="true">
                      {owned ? '✓' : '›'}
                    </span>
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}
      {tab === 'specializations' && (
        <div className={styles.card}>
          <h3>{t('Pinned specializations')}</h3>
          <p>
            {t('Choose saved talent builds to switch between. Create and edit them in Talents.')}
          </p>
          {specializationSlots(state) === 0 && (
            <>
              <p>{t('Research Dual Specialization to pin your first two builds.')}</p>
              <button
                type="button"
                className={screens.primary}
                onClick={() => setSelected('dual-spec')}
              >
                {t('View upgrade')}
              </button>
            </>
          )}
          {Array.from({ length: specializationSlots(state) }, (_, slot) => (
            <div key={slot} className={styles.pinned}>
              <GamePicker
                label={t(msg('Specialization {0}', [t(slot + 1)]))}
                value={state.specializations[slot] ?? -1}
                onChange={(preset) => {
                  const ok = progression.lootAction({
                    type: 'pin',
                    specialization: slot,
                    preset: preset < 0 ? null : preset
                  });
                  setNotice(
                    ok ? 'Specialization saved' : 'That build is already pinned or unavailable.'
                  );
                }}
                options={[
                  { value: -1, name: 'Empty' },
                  ...(profile.talents.presets ?? []).flatMap((preset, index) =>
                    preset ? [{ value: index, name: preset.name }] : []
                  )
                ]}
              />
              <button
                type="button"
                className={screens.ghost}
                disabled={state.specializations[slot] === null}
                onClick={() => {
                  const preset = state.specializations[slot];
                  if (preset !== null && preset !== undefined)
                    setNotice(
                      progression.talentBuild(preset, 'load')
                        ? 'Specialization loaded'
                        : 'This build needs more talent points.'
                    );
                }}
              >
                {t('Load specialization')}
              </button>
            </div>
          ))}
          <p>{t(msg('{0} legal builds ready', [t(specializationBuilds(profile).length)]))}</p>
          <button type="button" className={screens.ghost} onClick={onTalents}>
            {t('Manage saved builds')}
          </button>
        </div>
      )}
      {tab === 'trials' && (
        <div className={styles.trials}>
          <p className={styles.intro}>
            {t('First clear bonus: 12 shards, 2 threads and 2 cores, plus normal match loot.')}
          </p>
          {!hasResearch(state, 'resonance-trials') && (
            <button
              type="button"
              className={screens.ghost}
              onClick={() => setSelected('resonance-trials')}
            >
              {t('Unlock expert trials')}
            </button>
          )}
          {RESONANCE_TRIALS.map((trial) => (
            <article key={trial.id} className={styles.card}>
              <h3>
                {t(trial.name)}
                {profile.challenges[trial.id]?.cleared && ' ✓'}
              </h3>
              <p>{t(trial.blurb)}</p>
              {!trialOpen(profile, trial.id) && <p>{t('Research Resonance Trials to enter.')}</p>}
              <button
                type="button"
                className={screens.primary}
                disabled={!trialOpen(profile, trial.id)}
                onClick={() => onPlay(trial.id)}
              >
                {t('Enter trial')}
              </button>
            </article>
          ))}
        </div>
      )}
      {selectedEntry &&
        (() => {
          const entry = selectedEntry;
          const owned = hasResearch(state, entry.id);
          const missing = entry.requires.filter((id) => !hasResearch(state, id));
          const affordable = LOOT_ITEMS.every((item) => balance[item] >= entry.cost[item]);
          return (
            <Dialog
              key={entry.id}
              label={t(entry.name)}
              portal
              className={styles.overlay}
              onDismiss={() => setSelected(null)}
            >
              <article className={styles.sheet}>
                <header className={styles.sheetHead}>
                  <span className={styles.emblem} aria-hidden="true">
                    <ResearchIcon id={entry.id} />
                  </span>
                  <h3 tabIndex={-1} data-dialog-initial>
                    {t(entry.name)}
                  </h3>
                  <button
                    type="button"
                    className={screens.ghost}
                    aria-label={t('Close details')}
                    onClick={() => setSelected(null)}
                  >
                    ×
                  </button>
                </header>
                <div className={styles.sheetBody}>
                  <p>{t(entry.blurb)}</p>
                  {!owned && (
                    <>
                      <p className={styles.permanent}>{t('One unlock. Free to use forever.')}</p>
                      <div className={styles.cost}>
                        {LOOT_ITEMS.filter((item) => entry.cost[item] > 0).map((item) => (
                          <div key={item} data-short={balance[item] < entry.cost[item]}>
                            <span aria-hidden="true">{glyphs[item]}</span>
                            <span>
                              <b>
                                {t(entry.cost[item])} {t(ITEM_INFO[item].name)}
                              </b>
                              <small>
                                {t(
                                  balance[item] < entry.cost[item]
                                    ? msg('{0} more needed', [t(entry.cost[item] - balance[item])])
                                    : msg('You have {0}', [t(balance[item])])
                                )}
                              </small>
                            </span>
                          </div>
                        ))}
                      </div>
                      {missing.map((id) => (
                        <button
                          key={id}
                          type="button"
                          className={screens.ghost}
                          onClick={() => setSelected(id)}
                        >
                          {t(
                            msg('Requires {0}', [t(RESEARCH.find((item) => item.id === id)!.name)])
                          )}
                        </button>
                      ))}
                    </>
                  )}
                  {owned && <p className={styles.permanent}>{t('Unlocked')}</p>}
                </div>
                <footer className={styles.sheetFooter}>
                  {!owned ? (
                    <button
                      type="button"
                      className={screens.primary}
                      disabled={!!missing.length || !affordable}
                      onClick={() => {
                        const ok = progression.lootAction({ type: 'research', id: entry.id });
                        setNotice(
                          ok
                            ? msg('{0} unlocked', [t(entry.name)])
                            : 'Resources changed. Review the cost and try again.'
                        );
                        setSelected(null);
                      }}
                    >
                      {t('Unlock permanently')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={screens.primary}
                      onClick={() => {
                        setSelected(null);
                        if (entry.ability || entry.id === 'precision-refund') onTalents();
                        else setTab(entry.id === 'resonance-trials' ? 'trials' : 'specializations');
                      }}
                    >
                      {t(
                        entry.ability
                          ? 'Equip in Talents'
                          : entry.id === 'precision-refund'
                            ? 'Talents'
                            : entry.id === 'resonance-trials'
                              ? 'Expert trials'
                              : 'Manage specializations'
                      )}
                    </button>
                  )}
                </footer>
              </article>
            </Dialog>
          );
        })()}
    </Screen>
  );
}

const SUMMARIES: Record<ResearchId, string> = {
  'precision-refund': 'Reset one talent at a time',
  'dual-spec': 'Switch between two builds',
  'triple-spec': 'Keep a third build ready',
  'board-switch': 'Change builds between rallies',
  'pulse-brake': 'Slow a fast incoming ball',
  'phase-lens': 'Straighten a tricky incoming ball',
  'resonance-trials': 'Take on three expert challenges'
};
function ResearchIcon({ id }: { id: ResearchId }) {
  const paths: Record<ResearchId, string> = {
    'precision-refund': 'M6 8a8 8 0 1 1-1 8M2 3v6h6M12 7v5l3 2',
    'dual-spec': 'M3 5h11v13H3zM10 2h11v13M7 9h3M7 13h3',
    'triple-spec': 'M2 8h10v14H2zM7 5h10v14M12 2h10v14',
    'board-switch': 'M3 7h17l-4-4M21 17H4l4 4M20 7l-4 4M4 17l4-4',
    'pulse-brake': 'M3 12h4l3-8 4 16 3-8h4',
    'phase-lens': 'M3 5c9 0 9 14 18 14M3 12h18M10 3v18M14 3v18',
    'resonance-trials':
      'M8 3h8v7a4 4 0 0 1-8 0zM8 5H3v3a5 5 0 0 0 5 5M16 5h5v3a5 5 0 0 1-5 5M12 14v6M7 21h10'
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[id]} />
    </svg>
  );
}
