import { t, msg } from '../../core/i18n/index';
import { hasResearch } from '../../core/loot/state';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { BALANCE, nextSlotLevel } from '../../core/balance/config';
import { buildSlots } from '../../core/talents/builds';
import * as progression from '../../core/account/progression';
import { profileStore } from '../../core/profile/store';
import type { PlayerProfile } from '../../core/profile/types';
import { levelOf } from '../../core/progression/levels';
import { abilityById, ABILITY_DEFS } from '../../core/talents/abilities';
import {
  branchCost,
  isUltimate,
  TALENT_BRANCHES,
  talentById,
  ULTIMATE_TIER,
  tierRequirement
} from '../../core/talents/catalog';
import { branchSpend, resolveLoadout } from '../../core/talents/effects';
import {
  ownedAbilities,
  refundTalentRank,
  spentPoints,
  talentState,
  type TalentState
} from '../../core/talents/save';
import { activeSynergies, SYNERGIES } from '../../core/talents/synergy';
import type {
  AbilityId,
  BranchId,
  TalentDef,
  TalentId,
  TalentSave
} from '../../core/talents/types';
import { Screen } from '../components/Screen';
import { MenuDisclosure } from '../components/MenuDisclosure';
import { Dialog } from '../components/Dialog';
import { useBackHandler } from '../hooks/useBackHandler';
import { useArmed } from '../hooks/useArmed';
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import { useWheelScrollX } from '../hooks/useWheelScrollX';
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
  onLab?: () => void;
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

/** The destructive buttons that ask twice: reset all, reset a branch, overwrite a build. */
type ArmKey = 'all' | `branch:${BranchId}` | `save:${number}`;

/**
 * A status line tied to the build it describes. It is shown only while the
 * talents are exactly as that action left them, so "Build saved" cannot
 * linger over a later, unrelated purchase or reset.
 */
interface Notice {
  readonly text: string;
  readonly save: TalentSave;
}

/** A copy of the drafts without one slot's. */
function withoutDraft(names: Record<number, string>, index: number): Record<number, string> {
  const next = { ...names };
  delete next[index];
  return next;
}

export function TalentScreen({ profile, onBack, onLab }: TalentScreenProps) {
  const level = levelOf(profile.xp);
  const save = profile.talents;
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState<TalentId | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [armed, setArmed] = useArmed<ArmKey>();
  const [bought, setBought] = useState<TalentId | null>(null);
  // Names being typed, by slot. A saved build's name is committed as a rename
  // when the field is left or Enter is pressed; an empty slot keeps its draft
  // for the next save.
  const [buildNames, setBuildNames] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [visible, setVisible] = useState<ReadonlySet<BranchId>>(() => new Set());
  const strip = useRef<HTMLDivElement>(null);
  useWheelScrollX(strip);

  /** Announce the outcome of an action against the talents it produced. */
  const announce = (text: string) => setNotice({ text, save: profileStore.getSnapshot().talents });
  const shownNotice = notice && notice.save === save ? notice.text : '';

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

  // Which branches are in view, so the jump buttons can show where the strip is.
  useEffect(() => {
    const root = strip.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) =>
        setVisible((current) => {
          const next = new Set(current);
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.branch as BranchId | undefined;
            if (!id) continue;
            if (entry.intersectionRatio >= 0.6) next.add(id);
            else next.delete(id);
          }
          return next;
        }),
      { root, threshold: [0, 0.6, 1] }
    );
    root.querySelectorAll('[data-branch]').forEach((tree) => observer.observe(tree));
    return () => observer.disconnect();
  }, []);

  // Back closes whatever is open over the tree before it leaves the tree: a
  // talent card, a slot being filled, or a half-confirmed reset.
  useBackHandler(open !== null || slot !== null || armed !== null, () => {
    if (open !== null) setOpen(null);
    else if (slot !== null) setSlot(null);
    else setArmed(null);
  });

  const buy = (talent: TalentDef) => {
    if (progression.buyTalent(talent.id)) setBought(talent.id);
  };

  /** Centre a branch in the strip - the mouse's way to reach the far ones. */
  const jumpTo = (id: BranchId) => {
    const root = strip.current;
    const tree = root?.querySelector<HTMLElement>(`[data-branch="${id}"]`);
    if (!root || !tree) return;
    const box = root.getBoundingClientRect();
    const target = tree.getBoundingClientRect();
    root.scrollBy({
      left: target.left + target.width / 2 - (box.left + box.width / 2),
      behavior: 'smooth'
    });
  };

  /** Commit a typed name for a saved build, keeping its ranks and skills. */
  const rename = (index: number) => {
    const draft = buildNames[index];
    const preset = save.presets?.[index];
    if (draft === undefined || !preset) return;
    const name = draft.trim();
    setBuildNames((names) => withoutDraft(names, index));
    if (!name) {
      announce('A build needs a name. The old name is kept.');
      return;
    }
    if (name === preset.name) return;
    announce(
      progression.talentBuild(index, 'rename', name)
        ? 'Build renamed'
        : 'Could not rename that build.'
    );
  };

  // The total is what this level has actually paid out, so the line can read
  // "all invested" - not the cost of every tree, which no level reaches.
  const earned = spent + save.points;

  return (
    <Screen
      title={t('Talents')}
      subtitle={`${t(msg('Level {0}', [t(level)]))}${t(' · ')}${t(
        `${spent} of ${earned} points invested`
      )}`}
      onBack={onBack}
      footer={
        <button
          type="button"
          className={`${screens.ghost} ${armed === 'all' ? screens.danger : ''}`}
          disabled={spent === 0}
          data-arm="all"
          onClick={() => {
            if (armed === 'all') {
              progression.respecTalents();
              setArmed(null);
              setOpen(null);
            } else {
              setArmed('all');
            }
          }}
        >
          {t(armed === 'all' ? 'Tap again to refund every branch' : 'Reset all talents · free')}
        </button>
      }
    >
      {onLab && (
        <button type="button" className={`${screens.ghost} ${styles.labLink}`} onClick={onLab}>
          {t('Resonance Lab · loot and upgrades')}
        </button>
      )}
      <p className={screens.note} role="status">
        {t(shownNotice)}
      </p>
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
        <p className={screens.rowBlurb}>
          {t(
            'To rename a saved build, edit its name and press Enter or leave the field. Its talents stay as saved.'
          )}
        </p>
        {Array.from({ length: buildSlots(level) }, (_, i) => {
          const preset = save.presets?.[i] ?? null;
          const fallback = msg('Build {0}', [t(i + 1)]);
          const overwrite: ArmKey = `save:${i}`;
          return (
            <div key={i} className={`${screens.preset} ${styles.buildPreset}`}>
              <input
                className={screens.input}
                maxLength={32}
                dir="auto"
                aria-label={t(msg('Build {0} name', [t(i + 1)]))}
                placeholder={fallback}
                // A player's own name for a build is shown as typed, never translated.
                value={buildNames[i] ?? preset?.name ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setBuildNames((names) => ({ ...names, [i]: value }));
                }}
                onBlur={() => rename(i)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    rename(i);
                  } else if (event.key === 'Escape' && buildNames[i] !== undefined) {
                    // Escape abandons the edit, not the screen.
                    event.preventDefault();
                    event.stopPropagation();
                    setBuildNames((names) => withoutDraft(names, i));
                  }
                }}
              />
              <button
                type="button"
                className={`${screens.ghost} ${armed === overwrite ? screens.danger : ''}`}
                aria-label={t(msg('Save current talents to build {0}', [t(i + 1)]))}
                data-arm={overwrite}
                onClick={() => {
                  if (preset && armed !== overwrite) {
                    setArmed(overwrite);
                    return;
                  }
                  // A blank field saves under the slot's own name, which the
                  // field then shows - never the blank it was given.
                  const name = (buildNames[i] ?? preset?.name ?? '').trim() || fallback;
                  const ok = progression.talentBuild(i, 'save', name);
                  setBuildNames((names) => withoutDraft(names, i));
                  announce(ok ? 'Build saved' : 'Could not save that build.');
                  setArmed(null);
                }}
              >
                {t(armed === overwrite ? 'Confirm overwrite' : 'Save current')}
              </button>
              <button
                type="button"
                className={screens.ghost}
                aria-label={t(msg('Load build {0}', [t(i + 1)]))}
                disabled={!preset}
                onClick={() => {
                  announce(
                    progression.talentBuild(i, 'load')
                      ? 'Build loaded'
                      : 'This build needs more talent points.'
                  );
                  setOpen(null);
                  setSlot(null);
                  setArmed(null);
                }}
              >
                {t('Load')}
              </button>
            </div>
          );
        })}
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

      {/* A mouse has no swipe: on a fine pointer every branch is one click away. */}
      {!coarse && (
        <div className={styles.branchNav} role="group" aria-label={t('Jump to a branch')}>
          {TALENT_BRANCHES.map((branch) => (
            <button
              key={branch.id}
              type="button"
              className={
                visible.has(branch.id)
                  ? `${styles.branchJump} ${styles.branchJumpOn}`
                  : styles.branchJump
              }
              style={{ '--branch': `${branch.hue}` } as CSSProperties}
              onClick={() => jumpTo(branch.id)}
            >
              <TalentIcon id={branch.crest} />
              <span>{t(branch.name)}</span>
            </button>
          ))}
        </div>
      )}

      <div className={styles.trees} ref={strip}>
        {TALENT_BRANCHES.map((branch) => {
          const reset: ArmKey = `branch:${branch.id}`;
          return (
            <TalentTree
              key={branch.id}
              branch={branch}
              save={save}
              spent={spend[branch.id]}
              total={branchCost(branch.id)}
              selected={open}
              onPick={(talent) => setOpen(open === talent.id ? null : talent.id)}
              resetArmed={armed === reset}
              onReset={() => {
                if (armed !== reset) {
                  setArmed(reset);
                  return;
                }
                progression.respecTalents(branch.id);
                setArmed(null);
                setOpen(null);
              }}
            />
          );
        })}
      </div>
      <p className={screens.note}>
        {t(
          coarse
            ? 'Swipe across the branches · tap a talent to see it and spend points. '
            : 'Scroll the branches with the wheel or jump to one above · click a talent to see it and spend points. '
        )}
        <b>{t('Ultimates')}</b>
        {t(' unlock after')}
        {t(' ')}
        {t(tierRequirement(ULTIMATE_TIER))}
        {t(' points in a branch.')}
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
                  <bdi dir="ltr">
                    {t(state.rank)}
                    {t(' / ')}
                    {t(selected.maxRank)}
                  </bdi>
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
                  {msg('Spend {0} point{1}', [t(state.cost), state.cost > 1 ? 's' : ''])}
                </button>
                {!state.canBuy && <p className={screens.note}>{t(blockText(state))}</p>}
              </>
            )}
            {state.rank > 0 && (
              <>
                <button
                  type="button"
                  className={screens.ghost}
                  disabled={
                    !hasResearch(profile.progress.loot, 'precision-refund') ||
                    !refundTalentRank(save, level, selected.id)
                  }
                  onClick={() => {
                    if (
                      progression.lootAction({
                        type: 'refund',
                        talent: selected.id,
                        expectedRank: state.rank
                      })
                    ) {
                      announce('Talent rank refunded');
                      setBought(null);
                    }
                  }}
                >
                  {t('Refund one rank · free')}
                </button>
                <p className={screens.note}>
                  {t(
                    !hasResearch(profile.progress.loot, 'precision-refund')
                      ? 'Unlock Precision Refund in the Resonance Lab.'
                      : !refundTalentRank(save, level, selected.id)
                        ? 'Other talents depend on this rank. Refund those first, or use the free branch reset.'
                        : 'Returns only this rank’s point cost. Your other talents stay invested.'
                  )}
                </p>
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
