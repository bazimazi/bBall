import { useEffect, useMemo, useState } from 'react';

import { abilityById, ABILITY_DEFS } from '../../core/talents/abilities';
import { TALENT_BRANCHES, TOTAL_TALENT_COST, talentsOfBranch } from '../../core/talents/catalog';
import { branchSpend, resolveLoadout } from '../../core/talents/effects';
import { abilitySlotsForLevel } from '../../core/balance/config';
import {
  ownedAbilities,
  spentPoints,
  talentState,
  type TalentState
} from '../../core/talents/save';
import { activeSynergies, SYNERGIES } from '../../core/talents/synergy';
import { profileStore } from '../../core/profile/store';
import type { PlayerProfile } from '../../core/profile/types';
import { levelOf } from '../../core/progression/levels';
import type { AbilityId, BranchId, TalentDef } from '../../core/talents/types';
import { Screen } from '../components/Screen';
import screens from '../Screens.module.css';
import styles from '../Talents.module.css';

interface TalentScreenProps {
  profile: PlayerProfile;
  onBack: () => void;
}

/** Why a row is not buyable, in one short line under the button. */
function blockText(state: TalentState): string | null {
  const block = state.block;
  if (!block) return null;
  switch (block.kind) {
    case 'maxed':
      return 'Fully invested';
    case 'level':
      return `Unlocks at level ${block.level}`;
    case 'requires':
      return `Needs ${block.talent.name} ${block.rank}`;
    case 'points':
      return block.need === 1 ? '1 more point' : `${block.need} more points`;
  }
}

function Pips({ rank, max, hue }: { rank: number; max: number; hue: number }) {
  return (
    <span className={styles.pips} aria-label={`Rank ${rank} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i
          key={i}
          className={i < rank ? `${styles.pip} ${styles.pipOn}` : styles.pip}
          style={i < rank ? { background: `hsl(${hue},85%,62%)` } : undefined}
        />
      ))}
    </span>
  );
}

export function TalentScreen({ profile, onBack }: TalentScreenProps) {
  const level = levelOf(profile.xp);
  const save = profile.talents;
  const [branch, setBranch] = useState<BranchId>('power');
  const [open, setOpen] = useState<string | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [confirmRespec, setConfirmRespec] = useState(false);
  const [bought, setBought] = useState<string | null>(null);

  const loadout = useMemo(() => resolveLoadout(save, level), [save, level]);
  const spend = useMemo(() => branchSpend(save), [save]);
  const spent = spentPoints(save);
  const owned = ownedAbilities(save);
  const slots = abilitySlotsForLevel(level);
  const synergies = activeSynergies(save.ranks, loadout.equipped);
  const activeIds = new Set(synergies.map((entry) => entry.id));

  // The purchase flash is a one-shot, so it has to be cleared by hand.
  useEffect(() => {
    if (!bought) return;
    const id = window.setTimeout(() => setBought(null), 650);
    return () => window.clearTimeout(id);
  }, [bought]);

  const buy = (talent: TalentDef) => {
    if (profileStore.buyTalent(talent.id)) setBought(talent.id);
  };

  const rows = talentsOfBranch(branch);
  const hue = TALENT_BRANCHES.find((entry) => entry.id === branch)?.hue ?? 200;

  return (
    <Screen
      title="Talents"
      subtitle={`Level ${level} · ${spent} of ${TOTAL_TALENT_COST} invested`}
      onBack={onBack}
      footer={
        <button
          type="button"
          className={`${screens.ghost} ${confirmRespec ? screens.danger : ''}`}
          onClick={() => {
            if (confirmRespec) {
              profileStore.respecTalents();
              setConfirmRespec(false);
              setOpen(null);
            } else {
              setConfirmRespec(true);
            }
          }}
          disabled={spent === 0}
        >
          {confirmRespec ? 'Tap again to refund everything' : 'Reset talents · free'}
        </button>
      }
    >
      <div className={styles.points} aria-live="polite">
        <span className={styles.pointsValue}>{save.points}</span>
        <span className={styles.pointsLabel}>
          {save.points === 1 ? 'talent point' : 'talent points'} available
        </span>
      </div>

      {/* ------------------------------------------------------ actives */}
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
            <p className={screens.note}>Buy Power Strike, Dash or Perfect Guard to fill a slot.</p>
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

      {/* ------------------------------------------------------ branches */}
      <div className={styles.tabs} role="tablist" aria-label="Talent branches">
        {TALENT_BRANCHES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === branch}
            className={entry.id === branch ? `${styles.tab} ${styles.tabOn}` : styles.tab}
            style={entry.id === branch ? { borderColor: `hsl(${entry.hue},80%,58%)` } : undefined}
            onClick={() => {
              setBranch(entry.id);
              setOpen(null);
            }}
          >
            <i className={styles.tabDot} style={{ background: `hsl(${entry.hue},85%,60%)` }} />
            {entry.name}
            {spend[entry.id] > 0 && <span className={styles.tabCount}>{spend[entry.id]}</span>}
          </button>
        ))}
      </div>

      <p className={screens.note} style={{ textAlign: 'left' }}>
        {TALENT_BRANCHES.find((entry) => entry.id === branch)?.blurb}
      </p>

      {/* --------------------------------------------------------- rows */}
      <div className={styles.rows}>
        {rows.map((talent) => {
          const state = talentState(save, level, talent);
          const expanded = open === talent.id;
          const classes = [styles.row];
          if (state.rank > 0) classes.push(styles.owned);
          if (!state.unlocked) classes.push(styles.locked);
          if (bought === talent.id) classes.push(styles.bought);

          return (
            <div key={talent.id} className={classes.join(' ')}>
              <button
                type="button"
                className={styles.rowHead}
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : talent.id)}
              >
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>
                    {talent.name}
                    {talent.ability && <span className={styles.activeTag}>active</span>}
                  </span>
                  <span className={styles.rowBlurb}>{talent.blurb}</span>
                </span>
                <span className={styles.rowMeta}>
                  <Pips rank={state.rank} max={talent.maxRank} hue={hue} />
                  <span className={styles.rowCost}>
                    {state.maxed ? 'max' : `${state.cost} pt${state.cost > 1 ? 's' : ''}`}
                  </span>
                </span>
              </button>

              {expanded && (
                <div className={styles.detail}>
                  {state.rank > 0 && (
                    <p className={styles.detailLine}>
                      <span className={styles.detailTag}>Now</span>
                      {talent.rankText(state.rank)}
                    </p>
                  )}
                  {!state.maxed && (
                    <p className={styles.detailLine}>
                      <span className={`${styles.detailTag} ${styles.detailNext}`}>
                        Rank {state.rank + 1}
                      </span>
                      {talent.rankText(state.rank + 1)}
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
                        onClick={() => buy(talent)}
                      >
                        Spend {state.cost} point{state.cost > 1 ? 's' : ''}
                      </button>
                      {!state.canBuy && <p className={screens.note}>{blockText(state)}</p>}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ----------------------------------------------------- synergies */}
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
    </Screen>
  );
}
