import { t, msg } from '../../core/i18n/index';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { BALANCE, nextSlotLevel } from '../../core/balance/config';
import { buildSlots } from '../../core/talents/builds';
import * as progression from '../../core/account/progression';
import type { PlayerProfile } from '../../core/profile/types';
import { levelOf } from '../../core/progression/levels';
import { abilityById, ABILITY_DEFS } from '../../core/talents/abilities';
import {
  branchCost,
  isUltimate,
  TALENT_BRANCHES,
  talentById,
  TOTAL_TALENT_COST,
  ULTIMATE_TIER,
  tierRequirement
} from '../../core/talents/catalog';
import { branchSpend, resolveLoadout } from '../../core/talents/effects';
import {
  ownedAbilities,
  spentPoints,
  talentState,
  type TalentState
} from '../../core/talents/save';
import { activeSynergies, SYNERGIES } from '../../core/talents/synergy';
import type { AbilityId, TalentDef, TalentId } from '../../core/talents/types';
import { Screen } from '../components/Screen';
import { MenuDisclosure } from '../components/MenuDisclosure';
import { Dialog } from '../components/Dialog';
import { useBackHandler } from '../hooks/useBackHandler';
import { TalentTree } from '../components/TalentTree';
import { TalentIcon } from '../icons/TalentIcon';
import screens from '../Screens.module.css';
import styles from '../Talents.module.css';

const BALANCE_SLOTS_MAX = BALANCE.talents.slots.max;

/** "+14%", "-12%", or "standard" for a paddle the build leaves alone. */
function lengthLabel(length: number): string {
  if (Math.abs(length) < 0.0005) return 'standard';
  const pct = Math.round(length * 1000) / 10;
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

interface TalentScreenProps {
  profile: PlayerProfile;
  onBack: () => void;
}

/** Why a talent cannot be bought right now, in one short line. */
function blockText(state: TalentState): string | null {
  const block = state.block;
  if (!block) return null;
  switch (block.kind) {
    case 'maxed':
      return null;
    case 'tier': {
      const name = TALENT_BRANCHES.find((entry) => entry.id === block.branch)?.name ?? '';
      return `Requires ${block.need} points in ${name}`;
    }
    case 'requires':
      return `Requires ${block.talent.name}, rank ${block.rank}`;
    case 'points':
      return block.need === 1 ? '1 more talent point' : `${block.need} more talent points`;
  }
}

export function TalentScreen({ profile, onBack }: TalentScreenProps) {
  const level = levelOf(profile.xp);
  const save = profile.talents;
  const [open, setOpen] = useState<TalentId | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [confirmRespec, setConfirmRespec] = useState(false);
  const [bought, setBought] = useState<TalentId | null>(null);

  const loadout = useMemo(() => resolveLoadout(save, level), [save, level]);
  const spend = useMemo(() => branchSpend(save), [save]);
  const spent = spentPoints(save);
  const owned = ownedAbilities(save);
  const slots = loadout.slots;
  // `slots` already counts Versatility's, so once the build is at the cap no
  // level can promise another.
  const nextSlot = slots < BALANCE_SLOTS_MAX ? nextSlotLevel(level) : null;
  const synergies = activeSynergies(save.ranks, loadout.equipped);
  const activeIds = new Set(synergies.map((entry) => entry.id));

  const selected = open ? talentById(open) : undefined;
  const state = selected ? talentState(save, selected) : null;

  // The purchase flash is a one-shot, so it has to be cleared by hand.
  useEffect(() => {
    if (!bought) return;
    const id = window.setTimeout(() => setBought(null), 600);
    return () => window.clearTimeout(id);
  }, [bought]);

  // Back closes whatever is open over the tree before it leaves the tree: a
  // talent card, a slot being filled, or a half-confirmed respec.
  useBackHandler(open !== null || slot !== null || confirmRespec, () => {
    if (open !== null) setOpen(null);
    else if (slot !== null) setSlot(null);
    else setConfirmRespec(false);
  });

  const buy = (talent: TalentDef) => {
    if (progression.buyTalent(talent.id)) setBought(talent.id);
  };

  return (
    <Screen
      title={t('Talents')}
      subtitle={t(
        msg('Level {0} · {1} of {2} invested', [t(level), t(spent), t(TOTAL_TALENT_COST)])
      )}
      onBack={onBack}
      footer={
        <button
          type="button"
          className={`${screens.ghost} ${confirmRespec ? screens.danger : ''}`}
          disabled={spent === 0}
          onClick={() => {
            if (confirmRespec) {
              progression.respecTalents();
              setConfirmRespec(false);
              setOpen(null);
            } else {
              setConfirmRespec(true);
            }
          }}
        >
          {t(confirmRespec ? 'Tap again to refund every branch' : 'Reset all talents · free')}
        </button>
      }
    >
      <MenuDisclosure
        title={t('Saved builds')}
        hint={t(
          msg('{0}/{1} slots saved', [
            t(save.presets?.filter(Boolean).length ?? 0),
            t(buildSlots(level))
          ])
        )}
      >
        <p className={screens.rowBlurb}>
          {t(
            'Save your current talents and skills, then load them with a free respec. Six slots open at level 50; eight at level 100.'
          )}
        </p>
        {Array.from({ length: buildSlots(level) }, (_, i) => (
          <div key={i} className={screens.preset}>
            <span>{t(save.presets?.[i]?.name ?? msg('Build {0} · empty', [t(i + 1)]))}</span>
            <button
              type="button"
              className={screens.ghost}
              aria-label={t(msg('Save current talents to build {0}', [t(i + 1)]))}
              onClick={() => progression.talentBuild(i, 'save', `Build ${i + 1}`)}
            >
              {t('Save current')}
            </button>
            <button
              type="button"
              className={screens.ghost}
              aria-label={t(msg('Load build {0}', [t(i + 1)]))}
              disabled={!save.presets?.[i]}
              onClick={() => {
                progression.talentBuild(i, 'load');
                setOpen(null);
                setSlot(null);
                setConfirmRespec(false);
              }}
            >
              {t('Load')}
            </button>
          </div>
        ))}
      </MenuDisclosure>
      {/* --------------------------------------------------------- actives */}
      <p className={screens.sectionLabel}>{t('Active skills')}</p>
      <div className={styles.slots}>
        {Array.from({ length: slots }, (_, index) => {
          const id = loadout.equipped[index] ?? null;
          const def = id ? abilityById(id) : undefined;
          return (
            <button
              key={index}
              type="button"
              className={slot === index ? `${styles.slot} ${styles.slotOpen}` : styles.slot}
              // The skill's own hue, so the colour it wears in the match is
              // the colour it is equipped in here.
              style={def ? ({ '--hue': String(def.hue) } as CSSProperties) : undefined}
              onClick={() => setSlot(slot === index ? null : index)}
            >
              <span className={def ? styles.slotGlyphOn : styles.slotGlyph}>
                {def ? <TalentIcon id={def.talent} /> : '+'}
              </span>
              <span className={styles.slotName}>{t(def ? def.name : 'Empty')}</span>
            </button>
          );
        })}
      </div>

      {slot !== null && (
        <div className={styles.picker}>
          {owned.length === 0 && (
            <p className={screens.note}>
              {t('Learn Power Strike, Dash or Perfect Guard - or any ultimate - to fill a slot.')}
            </p>
          )}
          {ABILITY_DEFS.filter((def) => owned.includes(def.id)).map((def) => (
            <button
              key={def.id}
              type="button"
              className={
                loadout.equipped[slot] === def.id ? `${styles.chip} ${styles.chipOn}` : styles.chip
              }
              style={{ '--hue': String(def.hue) } as CSSProperties}
              onClick={() => {
                const next: AbilityId | null = loadout.equipped[slot] === def.id ? null : def.id;
                progression.equipAbility(slot, next);
              }}
            >
              <span className={styles.chipGlyph}>
                <TalentIcon id={def.talent} />
              </span>
              <span>
                <span className={styles.chipName}>{t(def.name)}</span>
                <span className={styles.chipMeta}>{t(def.summary(loadout.effects))}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {nextSlot !== null && (
        <p className={screens.note}>
          {t('Slot ')}
          {t(slots + 1)}
          {t(' unlocks at level ')}
          {t(nextSlot)}
          {t('.')}
        </p>
      )}

      {/* ----------------------------------------------------------- trees */}
      <div className={styles.points} aria-live="polite">
        <span className={styles.pointsLabel}>{t('Points left')}</span>
        <span className={styles.pointsValue}>{t(save.points)}</span>
      </div>

      <div className={styles.trees}>
        {TALENT_BRANCHES.map((branch) => (
          <TalentTree
            key={branch.id}
            branch={branch}
            save={save}
            spent={spend[branch.id]}
            total={branchCost(branch.id)}
            selected={open}
            onPick={(talent) => setOpen(open === talent.id ? null : talent.id)}
            onReset={() => {
              progression.respecTalents(branch.id);
              setOpen(null);
            }}
          />
        ))}
      </div>
      <p className={screens.note}>
        {t('Swipe the branches · tap a talent to spend a point. ')}
        <b>{t('Ultimates')}</b>
        {t(' unlock after')}
        {t(' ')}
        {t(tierRequirement(ULTIMATE_TIER))}
        {t(' points in a branch. Advanced court talents continue below.')}
      </p>

      {/* ------------------------------------------------------- synergies */}
      <p className={screens.sectionLabel}>{t('Synergies')}</p>
      {SYNERGIES.map((synergy) => {
        const on = activeIds.has(synergy.id);
        return (
          <div
            key={synergy.id}
            className={on ? `${styles.synergy} ${styles.synergyOn}` : styles.synergy}
          >
            <span className={styles.synergyTick}>{t(on ? '✦' : '·')}</span>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{t(synergy.name)}</span>
              <span className={styles.rowBlurb}>{t(synergy.blurb)}</span>
              <span className={styles.rowBlurb}>
                {t(
                  on
                    ? 'Active'
                    : synergy.requires
                        .map((need) => {
                          const rank = save.ranks[need.talent] ?? 0;
                          return msg('{0} {1}/{2}', [
                            t(talentById(need.talent)?.name ?? need.talent),
                            t(Math.min(rank, need.rank)),
                            t(need.rank)
                          ]);
                        })
                        .join(' · ')
                )}
                {t(
                  !on && synergy.minEquipped
                    ? msg(' · Equip {0} skills', [t(synergy.minEquipped)])
                    : ''
                )}
              </span>
            </span>
          </div>
        );
      })}

      <p className={screens.note}>
        {t('Paddle length ')}
        {t(lengthLabel(loadout.effects.length))}
        {t(' · speed')}
        {t(' ')}
        {t(Math.round(loadout.paddleSpeed))}
        {t(' from level.')}
      </p>

      {/* ------------------------------------------------------ the tooltip */}
      {selected && state && (
        <Dialog
          label={t(selected.name)}
          onDismiss={() => setOpen(null)}
          className={styles.sheetLayer}
          portal
        >
          <button
            type="button"
            className={styles.sheetScrim}
            aria-label={t('Close talent details')}
            tabIndex={-1}
            onClick={() => setOpen(null)}
          />
          <div
            className={
              bought === selected.id ? `${styles.sheet} ${styles.sheetBought}` : styles.sheet
            }
          >
            <div className={styles.sheetHead}>
              <span
                className={
                  isUltimate(selected)
                    ? `${styles.sheetIcon} ${styles.sheetCrest}`
                    : styles.sheetIcon
                }
              >
                <TalentIcon id={selected.id} />
              </span>
              <span className={styles.rowText}>
                <span className={styles.sheetName} tabIndex={-1} data-dialog-initial>
                  {t(selected.name)}
                </span>
                <span className={styles.sheetRank}>
                  {t('Rank ')}
                  {t(state.rank)}
                  {t(' / ')}
                  {t(selected.maxRank)}
                  {isUltimate(selected) ? (
                    <span className={`${styles.activeTag} ${styles.ultimateTag}`}>
                      {t('ultimate')}
                    </span>
                  ) : (
                    selected.ability && (
                      <span className={styles.activeTag}>{t('active skill')}</span>
                    )
                  )}
                </span>
              </span>
            </div>

            <p className={styles.sheetBlurb}>{t(selected.blurb)}</p>
            {SYNERGIES.filter((entry) =>
              entry.requires.some((need) => need.talent === selected.id)
            ).map((entry) => (
              <p key={entry.id} className={styles.detailLine}>
                <span className={styles.detailTag}>
                  {t(activeIds.has(entry.id) ? 'Active' : 'Combo')}
                </span>
                {t(entry.name)}
                {t(': ')}
                {t(entry.blurb)}
              </p>
            ))}

            {state.rank > 0 && (
              <p className={styles.detailLine}>
                <span className={styles.detailTag}>{t('Now')}</span>
                {t(selected.rankText(state.rank))}
              </p>
            )}
            {!state.maxed && (
              <p className={styles.detailLine}>
                <span className={`${styles.detailTag} ${styles.detailNext}`}>
                  {t('Rank ')}
                  {t(state.rank + 1)}
                </span>
                {t(selected.rankText(state.rank + 1))}
              </p>
            )}

            {state.maxed ? (
              <p className={styles.maxedNote}>{t('Fully invested')}</p>
            ) : (
              <>
                <button
                  type="button"
                  className={screens.primary}
                  disabled={!state.canBuy}
                  onClick={() => buy(selected)}
                >
                  {t('Spend ')}
                  {t(state.cost)}
                  {t(' point')}
                  {t(state.cost > 1 ? 's' : '')}
                </button>
                {!state.canBuy && <p className={screens.note}>{t(blockText(state))}</p>}
              </>
            )}
            <button type="button" className={screens.ghost} onClick={() => setOpen(null)}>
              {t('Close details')}
            </button>
          </div>
        </Dialog>
      )}
    </Screen>
  );
}
