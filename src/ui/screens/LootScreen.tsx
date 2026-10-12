import { useState } from 'react';
import { t, msg } from '../../core/i18n/index';
import type { PlayerProfile } from '../../core/profile/types';
import * as progression from '../../core/account/progression';
import { ITEM_INFO, LOOT_ITEMS, RESEARCH, type ResearchId } from '../../core/loot/catalog';
import { hasResearch, lootBalance, specializationSlots } from '../../core/loot/state';
import { RESONANCE_TRIALS, trialOpen } from '../../core/loot/trials';
import { specializationBuilds } from '../../core/loot/ops';
import { Screen } from '../components/Screen';
import { SaveNotice } from '../components/SaveNotice';
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
  const [pending, setPending] = useState<ResearchId | null>(null);
  const [tab, setTab] = useState<'research' | 'specializations' | 'trials'>('research');
  return (
    <Screen
      title={t('Resonance Lab')}
      subtitle={t('Turn every rally into new possibilities')}
      onBack={onBack}
    >
      <SaveNotice />
      <div className={styles.wallet} aria-label={t('Loot inventory')}>
        {LOOT_ITEMS.map((item) => (
          <div className={styles.resource} key={item}>
            <span className={styles.glyph} aria-hidden="true">
              {item === 'shards' ? '◇' : item === 'threads' ? '⌁' : '◈'}
            </span>
            <strong>{t(balance[item])}</strong>
            <span>{t(ITEM_INFO[item].name)}</span>
          </div>
        ))}
      </div>
      <div className={styles.circuit}>
        <div>
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
      </div>
      <MenuDisclosure title={t('Where loot comes from')} hint={t('Guaranteed rewards')}>
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
              setPending(null);
            }}
          >
            {t(
              { research: 'Research', specializations: 'Specializations', trials: 'Expert trials' }[
                value
              ]
            )}
          </button>
        ))}
      </div>
      <p className={screens.note} role="status">
        {t(notice)}
      </p>
      {tab === 'research' && (
        <div className={styles.research}>
          {RESEARCH.map((entry) => {
            const owned = hasResearch(state, entry.id),
              missing = entry.requires.filter((id) => !hasResearch(state, id));
            const affordable = LOOT_ITEMS.every((item) => balance[item] >= entry.cost[item]);
            return (
              <article key={entry.id} className={`${styles.card} ${owned ? styles.owned : ''}`}>
                <div className={styles.cardHead}>
                  <h3>{t(entry.name)}</h3>
                  <span>{t(owned ? 'Unlocked' : entry.ability ? 'New skill' : 'Upgrade')}</span>
                </div>
                <p>{t(entry.blurb)}</p>
                {!owned && (
                  <>
                    <div className={styles.cost}>
                      {LOOT_ITEMS.filter((item) => entry.cost[item] > 0).map((item) => (
                        <span key={item} data-short={balance[item] < entry.cost[item]}>
                          {t(msg('{0} {1}', [t(entry.cost[item]), t(ITEM_INFO[item].name)]))}
                          {balance[item] < entry.cost[item] && (
                            <small>
                              {t(msg('{0} more needed', [t(entry.cost[item] - balance[item])]))}
                            </small>
                          )}
                        </span>
                      ))}
                    </div>
                    {missing.length > 0 && (
                      <p>
                        {t(
                          msg('Requires {0}', [
                            missing
                              .map((id) => t(RESEARCH.find((item) => item.id === id)!.name))
                              .join(' · ')
                          ])
                        )}
                      </p>
                    )}
                    <button
                      type="button"
                      className={screens.primary}
                      disabled={!!missing.length || !affordable}
                      onClick={() => {
                        if (pending !== entry.id) {
                          setPending(entry.id);
                          return;
                        }
                        const ok = progression.lootAction({ type: 'research', id: entry.id });
                        setPending(null);
                        setNotice(
                          ok
                            ? msg('{0} unlocked', [t(entry.name)])
                            : 'Resources changed. Review the cost and try again.'
                        );
                      }}
                    >
                      {t(pending === entry.id ? 'Confirm unlock' : 'Unlock permanently')}
                    </button>
                  </>
                )}
                {owned && entry.ability && (
                  <button type="button" className={screens.ghost} onClick={onTalents}>
                    {t('Equip in Talents')}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
      {tab === 'specializations' && (
        <div className={styles.card}>
          <h3>{t('Pinned specializations')}</h3>
          <p>
            {t(
              'Keep your free saved-build library. Pin two or three favorites here after researching specializations. Courtside Switch brings these builds to the pause panel between rallies.'
            )}
          </p>
          {specializationSlots(state) === 0 && (
            <p>{t('Research Dual Specialization to pin your first two builds.')}</p>
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
        <div className={styles.research}>
          {RESONANCE_TRIALS.map((trial) => (
            <article key={trial.id} className={styles.card}>
              <h3>
                {t(trial.name)}
                {profile.challenges[trial.id]?.cleared && ' ✓'}
              </h3>
              <p>{t(trial.blurb)}</p>
              <p>
                {t('First clear bonus: 12 shards, 2 threads and 2 cores, plus normal match loot.')}
              </p>
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
    </Screen>
  );
}
