import { useEffect, useMemo, useState } from 'react';

import { abilitySlotsForLevel } from '../../core/balance/config';
import { profileStore } from '../../core/profile/store';
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
import { TalentTree } from '../components/TalentTree';
import { TalentIcon } from '../icons/TalentIcon';
import screens from '../Screens.module.css';
import styles from '../Talents.module.css';

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
  const slots = abilitySlotsForLevel(level);
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

  const buy = (talent: TalentDef) => {
    if (profileStore.buyTalent(talent.id)) setBought(talent.id);
  };

  return (
    <Screen
      title="Talents"
      subtitle={`Level ${level} · ${spent} of ${TOTAL_TALENT_COST} invested`}
      onBack={onBack}
      footer={
        <button
          type="button"
          className={`${screens.ghost} ${confirmRespec ? screens.danger : ''}`}
          disabled={spent === 0}
          onClick={() => {
            if (confirmRespec) {
              profileStore.respecTalents();
              setConfirmRespec(false);
              setOpen(null);
            } else {
              setConfirmRespec(true);
            }
          }}
        >
          {confirmRespec ? 'Tap again to refund every branch' : 'Reset all talents · free'}
        </button>
      }
    >
      <div className={styles.points} aria-live="polite">
        <span className={styles.pointsLabel}>Points left</span>
        <span className={styles.pointsValue}>{save.points}</span>
      </div>

      {/* --------------------------------------------------------- actives */}
      <p className={screens.sectionLabel}>Active skills</p>
      <div className={styles.slots}>
        {Array.from({ length: slots }, (_, index) => {
          const id = loadout.equipped[index] ?? null;
          const def = id ? abilityById(id) : undefined;
          return (
            <button
              key={index}
              type="button"
              className={slot === index ? `${styles.slot} ${styles.slotOpen}` : styles.slot}
              onClick={() => setSlot(slot === index ? null : index)}
            >
              <span className={styles.slotGlyph}>{def ? def.glyph : '+'}</span>
              <span className={styles.slotName}>{def ? def.name : 'Empty'}</span>
            </button>
          );
        })}
      </div>

      {slot !== null && (
        <div className={styles.picker}>
          {owned.length === 0 && (
            <p className={screens.note}>
              Learn Power Strike, Dash or Perfect Guard to fill a slot.
            </p>
          )}
          {ABILITY_DEFS.filter((def) => owned.includes(def.id)).map((def) => (
            <button
              key={def.id}
              type="button"
              className={
                loadout.equipped[slot] === def.id ? `${styles.chip} ${styles.chipOn}` : styles.chip
              }
              onClick={() => {
                const next: AbilityId | null = loadout.equipped[slot] === def.id ? null : def.id;
                profileStore.equipAbility(slot, next);
              }}
            >
              <span className={styles.chipGlyph}>{def.glyph}</span>
              <span>
                <span className={styles.chipName}>{def.name}</span>
                <span className={styles.chipMeta}>{def.summary(loadout.effects)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {slots < 3 && <p className={screens.note}>A third slot unlocks at level 15.</p>}

      {/* ----------------------------------------------------------- trees */}
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
              profileStore.respecBranch(branch.id);
              setOpen(null);
            }}
          />
        ))}
      </div>
      <p className={screens.note}>
        Swipe the branches · tap a talent to spend a point. Each branch ends in an <b>ultimate</b>,
        behind {tierRequirement(ULTIMATE_TIER)} points in that branch.
      </p>

      {/* ------------------------------------------------------- synergies */}
      <p className={screens.sectionLabel}>Synergies</p>
      {SYNERGIES.map((synergy) => {
        const on = activeIds.has(synergy.id);
        return (
          <div
            key={synergy.id}
            className={on ? `${styles.synergy} ${styles.synergyOn}` : styles.synergy}
          >
            <span className={styles.synergyTick}>{on ? '✦' : '·'}</span>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{synergy.name}</span>
              <span className={styles.rowBlurb}>{synergy.blurb}</span>
            </span>
          </div>
        );
      })}

      <p className={screens.note}>
        Paddle speed {Math.round(loadout.paddleSpeed)} · {Math.round(loadout.basePaddleSpeed)} from
        level, ×{loadout.effects.paddleMul.toFixed(2)} from talents.
      </p>

      {/* ------------------------------------------------------ the tooltip */}
      {selected && state && (
        <>
          <button
            type="button"
            className={styles.sheetScrim}
            aria-label="Close talent details"
            onClick={() => setOpen(null)}
          />
          <div
            className={
              bought === selected.id ? `${styles.sheet} ${styles.sheetBought}` : styles.sheet
            }
            role="dialog"
            aria-label={selected.name}
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
                <span className={styles.sheetName}>{selected.name}</span>
                <span className={styles.sheetRank}>
                  Rank {state.rank} / {selected.maxRank}
                  {isUltimate(selected) ? (
                    <span className={`${styles.activeTag} ${styles.ultimateTag}`}>ultimate</span>
                  ) : (
                    selected.ability && <span className={styles.activeTag}>active skill</span>
                  )}
                </span>
              </span>
            </div>

            <p className={styles.sheetBlurb}>{selected.blurb}</p>

            {state.rank > 0 && (
              <p className={styles.detailLine}>
                <span className={styles.detailTag}>Now</span>
                {selected.rankText(state.rank)}
              </p>
            )}
            {!state.maxed && (
              <p className={styles.detailLine}>
                <span className={`${styles.detailTag} ${styles.detailNext}`}>
                  Rank {state.rank + 1}
                </span>
                {selected.rankText(state.rank + 1)}
              </p>
            )}

            {state.maxed ? (
              <p className={styles.maxedNote}>Fully invested</p>
            ) : (
              <>
                <button
                  type="button"
                  className={screens.primary}
                  disabled={!state.canBuy}
                  onClick={() => buy(selected)}
                >
                  Spend {state.cost} point{state.cost > 1 ? 's' : ''}
                </button>
                {!state.canBuy && <p className={screens.note}>{blockText(state)}</p>}
              </>
            )}
          </div>
        </>
      )}
    </Screen>
  );
}
