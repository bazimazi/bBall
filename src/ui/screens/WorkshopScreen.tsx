import { useState, type CSSProperties } from 'react';
import {
  COMPONENTS,
  componentById,
  equipmentReach,
  kitName,
  kitOf,
  sameKit,
  surfaceResponse,
  contactAngle,
  reboundBonus
} from '../../core/equipment/catalog';
import {
  EQUIPMENT_SLOTS,
  NEUTRAL_KIT,
  type PaddleKit,
  type EquipmentSlot
} from '../../core/equipment/types';
import {
  WORKSHOP_CONTRACTS,
  ownsKit,
  workshopMilestone,
  workshopServiceRun
} from '../../core/equipment/workshop';
import { workshopAction } from '../../core/account/progression';
import { BALANCE } from '../../core/balance/config';
import { resolveLoadout } from '../../core/talents/effects';
import { levelOf } from '../../core/progression/levels';
import type { PlayerProfile } from '../../core/profile/types';
import { Screen } from '../components/Screen';
import { Dialog } from '../components/Dialog';
import { MaterialGlyph, PaddlePreview, WorkshopSymbol } from './WorkshopArt';
import { MATERIAL_COLOURS } from './workshopVisuals';
import { useWorkshopDetailMotion, useWorkshopMotion } from './useWorkshopMotion';
import styles from '../Screens.module.css';
import css from './WorkshopScreen.module.css';

const SLOT_NAMES = { core: 'Core', surface: 'Contact surface', frame: 'Frame', insert: 'Insert' };
const STAGES = [
  'Introduction',
  'Contact craft',
  'Tuning craft',
  'Frame craft',
  'Material craft',
  'Signature craft'
];
const NEXT = [
  'Compare a different core or surface to earn your first 12 Marks.',
  'Complete Clean contact or Moving craft to unlock tuning.',
  'Complete both contact contracts and use two surfaces to unlock frames.',
  'Complete Edge craft and Opponent craft to unlock advanced materials and Copper.',
  'Complete Signature craft to earn your signature engraving.',
  'Keep building signature records. Every ten encounters starts a new cycle.'
];
const PATH = ['Materials', 'Tuning', 'Frames', 'Advanced', 'Signature'];
const SHORT = { core: 'Core', surface: 'Surface', frame: 'Frame', insert: 'Insert' };
const VIEWS = ['Build', 'Practice', 'Progress', 'Saved'] as const;
type View = (typeof VIEWS)[number];
type PartTab = EquipmentSlot | 'tuning';
const PART_TABS: readonly PartTab[] = [...EQUIPMENT_SLOTS, 'tuning'];
const TUNINGS = ['standard', 'firm', 'grip'] as const;
const tabPosition = (index: number, count: number, colour?: string) =>
  ({ '--tab-index': index, '--tab-count': count, '--tab-colour': colour }) as CSSProperties;
const accent = (id: string) => ({ '--material': MATERIAL_COLOURS[id] }) as CSSProperties;
const MATERIAL_HINTS: Record<string, string> = {
  'balanced-core': 'All-round response',
  springsteel: 'Clean-hit attacker',
  cork: 'Attack absorber',
  'memory-gel': 'Store & release',
  'balanced-surface': 'All-round control',
  rubber: 'Moving flicks',
  ceramic: 'Steady placement',
  graphite: 'Edge grip',
  woven: 'Gentle edge saves',
  split: 'Two contact zones',
  'balanced-frame': 'Standard reach',
  extended: 'Cover more court',
  compact: 'Sharper placement',
  'empty-insert': 'Keep it simple',
  copper: 'Switch-powered return'
};
interface Props {
  profile: PlayerProfile;
  initialKit?: PaddleKit | null | undefined;
  onBack: () => void;
  onBench: (kit: PaddleKit, serve: 'routine' | 'attack' | 'edge') => void;
  onCustomize: () => void;
}
function playstyle(kit: PaddleKit): string {
  if (kit.core === 'memory-gel') return 'Catch. Store. Strike.';
  if (kit.insert === 'copper') return 'Route your next attack.';
  if (kit.surface === 'rubber') return 'Put motion into every return.';
  if (kit.surface === 'split') return 'One paddle. Two ways to play.';
  if (kit.core === 'cork') return 'Take the pace. Find the opening.';
  if (kit.surface === 'ceramic') return 'Settle. Aim. Send it.';
  if (kit.core === 'springsteel') return 'Own the centre. Build the pace.';
  if (kit.surface === 'graphite') return 'Make the edge your advantage.';
  if (kit.surface === 'woven') return 'Stay composed at the edge.';
  return 'Build your next great return.';
}
function ContactDiagram({ kit, moving }: { kit: PaddleKit; moving: boolean }) {
  const raw = moving ? 0.65 : 0.18;
  const response = surfaceResponse(kit, raw, raw);
  const angle = contactAngle(response.off, 625, moving ? 700 : 0, response.grip, 0.92);
  const y = 70 + Math.sin(angle) * 90;
  return (
    <svg
      viewBox="0 0 220 130"
      role="img"
      aria-label={`${moving ? 'Moving' : 'Stationary'} ordinary return angle ${Math.round((angle * 180) / Math.PI)} degrees`}
    >
      <path d="M12 12H208V118H12Z" fill="none" stroke="currentColor" opacity=".15" />
      <path d="M22 48V94" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <path d={`M32 70L190 ${Math.min(114, y)}`} stroke="currentColor" strokeWidth="2" />
      <circle cx="32" cy="70" r="5" fill="currentColor" />
      {moving && <path d="M10 68V90M6 84L10 90L14 84" fill="none" stroke="currentColor" />}
    </svg>
  );
}

export function WorkshopScreen({ profile, initialKit, onBack, onBench, onCustomize }: Props) {
  const w = profile.progress.workshop;
  const stage = workshopMilestone(w);
  const [selected, setSelected] = useState<PaddleKit>(() => kitOf(initialKit ?? w.equipped));
  const [view, setView] = useState<View>('Build');
  const [slot, setSlot] = useState<PartTab>('surface');
  const [page, setPage] = useState(() =>
    Math.floor(
      COMPONENTS.filter((c) => c.slot === 'surface').findIndex((c) => c.id === selected.surface) / 2
    )
  );
  const [contractIndex, setContractIndex] = useState(0);
  const [presetIndex, setPresetIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const [presetName, setPresetName] = useState('');
  const [detail, setDetail] = useState<'material' | 'paths' | 'rewards' | 'service' | null>(null);
  const [moving, setMoving] = useState(false);
  const viewMotion = useWorkshopMotion(view, VIEWS.indexOf(view));
  const materialMotion = useWorkshopMotion(`${slot}:${page}`, PART_TABS.indexOf(slot) * 10 + page);
  const previewMotion = useWorkshopMotion(Object.values(selected).join(':'), 0, true);
  const contractMotion = useWorkshopMotion(String(contractIndex), contractIndex);
  const presetMotion = useWorkshopMotion(String(presetIndex), presetIndex);
  const pathsMotion = useWorkshopMotion(String(moving), Number(moving));
  const {
    panel: detailPanel,
    close: closeDetail,
    blockClosingClick
  } = useWorkshopDetailMotion(detail, () => setDetail(null));
  const loadout = resolveLoadout(profile.talents, levelOf(profile.xp));
  const reach = Math.min(
    BALANCE.talents.maxLength,
    Math.max(BALANCE.talents.minLength, loadout.effects.length + equipmentReach(selected))
  );
  const bonus = reboundBonus(selected, 0, false);
  const grip = Math.min(
    BALANCE.equipment.overallSpinMax,
    loadout.effects.spinMul * surfaceResponse(selected, 0.65, 0.65).grip
  );
  const reboundLimit =
    BALANCE.ball.growth + loadout.effects.clutchGrowth + bonus >= BALANCE.talents.maxHitGrowth;
  const part = componentById(selected[slot === 'tuning' ? 'surface' : slot])!;
  const materials = COMPONENTS.filter((c) => c.slot === slot);
  // Two cards per page keeps every material reachable without a scroll on small phones.
  const pages = Math.ceil(materials.length / 2);
  const equipped = sameKit(selected, w.equipped);
  const owned = ownsKit(w, selected);
  const crafted = COMPONENTS.filter((c) => c.cost > 0 && w.owned.includes(c.id)).length;
  const completed = WORKSHOP_CONTRACTS.filter((c) => (w.contracts[c.id] ?? 0) >= c.target).length;
  const contract = WORKSHOP_CONTRACTS[contractIndex]!;
  const value = Math.min(contract.target, w.contracts[contract.id] ?? 0);
  const done = value >= contract.target;
  const preset = w.presets[presetIndex];
  const choose = (key: keyof PaddleKit, id: string) => {
    const next = { ...selected, [key]: id };
    if (key === 'insert' && id === 'copper' && next.core === 'memory-gel')
      next.core = 'balanced-core';
    setSelected(kitOf(next));
    setNotice(
      key === 'insert' && id === 'copper' && selected.core === 'memory-gel'
        ? 'Copper replaces Memory gel; their stored charges cannot combine.'
        : key === 'core' && id === 'memory-gel' && selected.insert === 'copper'
          ? 'Memory gel removes Copper; their stored charges cannot combine.'
          : ''
    );
  };
  const changeSlot = (key: PartTab) => {
    setSlot(key);
    setPage(
      key === 'tuning'
        ? 0
        : Math.floor(
            COMPONENTS.filter((c) => c.slot === key).findIndex((c) => c.id === selected[key]) / 2
          )
    );
  };
  const act = (action: Parameters<typeof workshopAction>[0], message: string) => {
    const ok = workshopAction(action);
    setNotice(ok ? message : 'Unavailable. Check Marks, ownership, milestone or the active run.');
    return ok;
  };
  const compare = () => {
    workshopAction({ type: 'compare', kit: { ...NEUTRAL_KIT } });
    act({ type: 'compare', kit: selected }, 'Comparison recorded. Try both kits in Practice.');
  };
  const showcase = (
    <section className={css.showcase} style={accent(selected.surface)} aria-label="Selected paddle">
      <div className={css.preview} ref={previewMotion} data-workshop-motion="paddle">
        <PaddlePreview kit={selected} />
      </div>
      <div className={css.identity}>
        <span className={css.state}>
          {equipped ? 'Equipped' : owned ? 'Ready to equip' : 'Bench loan'}
        </span>
        <h3>{playstyle(selected)}</h3>
        <p>{kitName(selected)}</p>
      </div>
      <div className={css.readouts} aria-label="Paddle properties with current talents">
        <span>
          <b>{Math.round((1 + reach) * 100)}%</b> Reach
        </span>
        <span>
          <b>{Math.round(grip * 100)}%</b> Moving grip
        </span>
        <span>
          <b>{selected.core === 'cork' || selected.core === 'memory-gel' ? 80 : 60}%</b> Bonus
          damping
        </span>
      </div>
    </section>
  );
  return (
    <Screen
      title="Paddle Workshop"
      onBack={onBack}
      className={css.screen}
      footer={
        <div className={css.footer}>
          <button
            type="button"
            className={`${styles.ghost} ${css.equip}`}
            disabled={!owned || equipped}
            aria-label={
              equipped ? 'Equipped' : owned ? 'Equip paddle' : 'Craft and unlock parts to equip'
            }
            onClick={() =>
              act(
                { type: 'equip', kit: selected },
                'Paddle equipped. Active runs and cups keep their starting kit.'
              )
            }
          >
            {equipped ? 'Equipped' : owned ? 'Equip paddle' : 'Loan only'}
          </button>
          <button
            type="button"
            className={`${styles.primary} ${css.test}`}
            aria-label="Try selected paddle · no rewards"
            onClick={() => onBench(selected, 'routine')}
          >
            <WorkshopSymbol kind="play" />
            <span>
              Test paddle<small>Free practice · no rewards</small>
            </span>
          </button>
        </div>
      }
    >
      <div className={css.workshop} data-workshop-view={view}>
        <div className={css.navigation}>
          <nav
            className={`${css.views} ${css.motionTabs}`}
            style={tabPosition(VIEWS.indexOf(view), VIEWS.length)}
            aria-label="Workshop views"
          >
            {VIEWS.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={view === name}
                aria-controls="workshop-view"
                onClick={() => setView(name)}
              >
                {name}
              </button>
            ))}
          </nav>
          <span className={css.wallet} aria-label={`${w.marks} Workshop Marks`}>
            <WorkshopSymbol kind="marks" />
            <b>{w.marks}</b>
            <span>Marks</span>
          </span>
        </div>
        <div id="workshop-view" className={css.view} ref={viewMotion} data-workshop-motion="view">
          {(view === 'Build' || view === 'Practice') && (
            <div className={css.buildSummary}>
              {showcase}
              {view === 'Build' && (
                <div className={css.mission} data-workshop-comparison>
                  <button type="button" className={styles.ghost} onClick={compare}>
                    Compare selected kit
                  </button>
                  <span>
                    {w.introduced ? 'Free comparison' : '+12 starter Marks'}
                    <small>
                      {w.introduced ? 'Owned changes are free' : 'Change core or surface'}
                    </small>
                  </span>
                </div>
              )}
            </div>
          )}
          {view === 'Build' && (
            <section className={css.builder} aria-label="Assemble paddle">
              <div
                className={`${css.slots} ${css.motionTabs}`}
                style={tabPosition(
                  PART_TABS.indexOf(slot),
                  PART_TABS.length,
                  slot === 'tuning' ? undefined : MATERIAL_COLOURS[selected[slot]]
                )}
                role="group"
                aria-label="Paddle parts"
              >
                {EQUIPMENT_SLOTS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={SLOT_NAMES[key]}
                    aria-pressed={slot === key}
                    aria-controls="workshop-materials"
                    style={accent(selected[key])}
                    onClick={() => changeSlot(key)}
                  >
                    <MaterialGlyph id={selected[key]} />
                    <span>{SHORT[key]}</span>
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Tuning"
                  aria-pressed={slot === 'tuning'}
                  aria-controls="workshop-materials"
                  onClick={() => changeSlot('tuning')}
                >
                  <WorkshopSymbol kind="target" />
                  <span>Tune</span>
                </button>
              </div>
              <div
                id="workshop-materials"
                className={css.materials}
                ref={materialMotion}
                data-workshop-motion="materials"
              >
                {slot === 'tuning' ? (
                  <div
                    className={`${css.tuningChoices} ${css.motionTabs}`}
                    style={tabPosition(TUNINGS.indexOf(selected.tuning), TUNINGS.length)}
                    role="group"
                    aria-label="Tuning settings"
                  >
                    {TUNINGS.map((tuning) => (
                      <button
                        key={tuning}
                        type="button"
                        aria-pressed={selected.tuning === tuning}
                        onClick={() => choose('tuning', tuning)}
                      >
                        <WorkshopSymbol kind={tuning === 'firm' ? 'attack' : 'target'} />
                        <b>
                          {tuning === 'standard' ? 'Standard' : tuning === 'firm' ? 'Firm' : 'Grip'}
                        </b>
                        <small>
                          {tuning === 'standard'
                            ? 'Balanced'
                            : tuning === 'firm'
                              ? 'Rebound ↑ grip ↓'
                              : 'Grip ↑ placement ↓'}
                        </small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div
                    className={css.carousel}
                    role="group"
                    aria-label={`${SLOT_NAMES[slot]} materials`}
                  >
                    <button
                      type="button"
                      className={css.pageArrow}
                      aria-label="Previous materials"
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      ‹
                    </button>
                    <div className={css.inventory}>
                      {materials.slice(page * 2, page * 2 + 2).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          aria-label={`Select ${c.name}`}
                          aria-pressed={selected[slot] === c.id}
                          className={css.material}
                          style={accent(c.id)}
                          onClick={() => choose(slot, c.id)}
                        >
                          <MaterialGlyph id={c.id} />
                          <b>{c.name}</b>
                          <small>{MATERIAL_HINTS[c.id]}</small>
                          <span>
                            {w.owned.includes(c.id)
                              ? 'Owned'
                              : `${c.milestone > stage ? 'Loan · ' : ''}${c.cost} Marks`}
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={css.pageArrow}
                      aria-label="Next materials"
                      disabled={page >= pages - 1}
                      onClick={() => setPage(page + 1)}
                    >
                      ›
                    </button>
                  </div>
                )}
                <div className={css.pageInfo} aria-live="polite">
                  <span>
                    {slot === 'tuning'
                      ? stage < 2
                        ? 'Loan until Tuning craft'
                        : 'Free to switch'
                      : `${SHORT[slot]} · ${page + 1}/${pages}`}
                  </span>
                  <span>{crafted}/11 crafted</span>
                </div>
              </div>
              <div className={css.buildActions}>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => setDetail('material')}
                >
                  {slot === 'tuning' ? 'Tuning details' : 'Material details'}
                </button>
                {slot !== 'tuning' && !w.owned.includes(part.id) ? (
                  <button
                    type="button"
                    className={`${styles.ghost} ${css.craft}`}
                    style={accent(part.id)}
                    disabled={stage < part.milestone || w.marks < part.cost}
                    onClick={() =>
                      act(
                        { type: 'craft', component: part.id },
                        `${part.name} crafted permanently.`
                      )
                    }
                  >
                    {stage < part.milestone
                      ? `Unlock at ${STAGES[part.milestone]}`
                      : `Craft · ${part.cost} Marks`}
                  </button>
                ) : (
                  <span className={css.ownedHint}>
                    {slot === 'tuning' ? 'Try any setting free' : `${part.name} · owned`}
                  </span>
                )}
              </div>
            </section>
          )}
          {view === 'Practice' && (
            <section className={css.range} aria-labelledby="range-title">
              <div className={css.sectionHead}>
                <h3 id="range-title">Practice range</h3>
                <span>Free loans · no rewards</span>
              </div>
              <div className={css.drills}>
                {(['routine', 'attack', 'edge'] as const).map((serve) => (
                  <button
                    key={serve}
                    type="button"
                    onClick={() => onBench(selected, serve)}
                    aria-label={
                      serve === 'routine'
                        ? 'Routine return'
                        : serve === 'attack'
                          ? 'Incoming attack'
                          : 'Edge approach'
                    }
                  >
                    <WorkshopSymbol
                      kind={serve === 'routine' ? 'target' : serve === 'attack' ? 'attack' : 'edge'}
                    />
                    <span>
                      <b>
                        {serve === 'routine'
                          ? 'Routine return'
                          : serve === 'attack'
                            ? 'Incoming attack'
                            : 'Edge approach'}
                      </b>
                      <small>
                        {serve === 'routine'
                          ? 'Find your feel'
                          : serve === 'attack'
                            ? 'Catch the bonus pace'
                            : 'Work the outer contact'}
                      </small>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
              <button type="button" className={styles.ghost} onClick={() => setDetail('paths')}>
                Compare return paths
              </button>
            </section>
          )}
          {view === 'Progress' && (
            <section className={css.progression} aria-labelledby="progression-title">
              <div className={css.sectionHead}>
                <h3 id="progression-title">{STAGES[stage]}</h3>
                <span>{completed}/6 complete</span>
              </div>
              <ol className={css.path} aria-label="Workshop unlock path">
                {PATH.map((name, i) => (
                  <li
                    key={name}
                    className={stage >= i + 1 ? css.pathDone : ''}
                    aria-current={Math.max(1, stage) === i + 1 ? 'step' : undefined}
                  >
                    <span>{stage >= i + 1 ? <WorkshopSymbol kind="check" /> : i + 1}</span>
                    <b>{name}</b>
                  </li>
                ))}
              </ol>
              <p className={css.next}>{NEXT[stage]}</p>
              <div className={css.contractHeading}>
                <h4>Technique contracts</h4>
                <span>
                  {contractIndex + 1}/{WORKSHOP_CONTRACTS.length}
                </span>
              </div>
              <div className={css.contractCarousel}>
                <button
                  type="button"
                  className={css.pageArrow}
                  aria-label="Previous contract"
                  disabled={contractIndex === 0}
                  onClick={() => setContractIndex(contractIndex - 1)}
                >
                  ‹
                </button>
                <div
                  className={`${css.contract} ${done ? css.contractDone : ''}`}
                  ref={contractMotion}
                  data-workshop-motion="contract"
                  aria-live="polite"
                >
                  <div className={css.sectionHead}>
                    <b>{contract.name}</b>
                    <span>{done ? 'Complete' : `+${contract.reward} Marks`}</span>
                  </div>
                  <p>{contract.description}</p>
                  <div className={css.contractMeter}>
                    <progress max={contract.target} value={value} aria-label={contract.name} />
                    <span>
                      {value}/{contract.target}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={css.pageArrow}
                  aria-label="Next contract"
                  disabled={contractIndex === WORKSHOP_CONTRACTS.length - 1}
                  onClick={() => setContractIndex(contractIndex + 1)}
                >
                  ›
                </button>
              </div>
              <div className={css.buildActions}>
                <button type="button" className={styles.ghost} onClick={() => setDetail('rewards')}>
                  Marks & signatures
                </button>
                <button type="button" className={styles.ghost} onClick={onCustomize}>
                  Finishes & engravings ↗
                </button>
              </div>
            </section>
          )}
          {view === 'Saved' && (
            <section className={css.saved} aria-labelledby="saved-title">
              <div className={css.sectionHead}>
                <h3 id="saved-title">Saved paddles</h3>
                {profile.progress.run?.equipment?.version === 1 ? (
                  <button
                    type="button"
                    className={styles.ghost}
                    aria-label="Gauntlet service"
                    onClick={() => setDetail('service')}
                  >
                    Service · {profile.progress.run.credits ?? 0} credits
                  </button>
                ) : (
                  <span>{w.presets.filter(Boolean).length}/3 saved</span>
                )}
              </div>
              <div
                className={`${css.presetTabs} ${css.motionTabs}`}
                style={tabPosition(presetIndex, w.presets.length)}
                role="group"
                aria-label="Paddle presets"
              >
                {w.presets.map((p, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-label={`Paddle preset ${index + 1}`}
                    aria-pressed={presetIndex === index}
                    onClick={() => setPresetIndex(index)}
                  >
                    <span>0{index + 1}</span>
                    <b>{p?.name ?? 'Empty'}</b>
                  </button>
                ))}
              </div>
              <div
                className={css.preset}
                ref={presetMotion}
                data-workshop-motion="preset"
                aria-live="polite"
              >
                <h4>{preset?.name ?? 'Save your favourite'}</h4>
                <p>
                  {preset
                    ? kitName(preset.kit)
                    : 'Equip a paddle, then save it here for your next match.'}
                </p>
              </div>
              <label className={css.presetName}>
                <span>Preset name</span>
                <input
                  maxLength={24}
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="My paddle"
                />
              </label>
              <div className={css.buildActions}>
                <button
                  type="button"
                  className={styles.ghost}
                  aria-label={`Save equipped paddle to slot ${presetIndex + 1}`}
                  onClick={() =>
                    act(
                      { type: 'preset', slot: presetIndex, action: 'save', name: presetName },
                      'Equipped paddle saved.'
                    )
                  }
                >
                  Save equipped
                </button>
                <button
                  type="button"
                  className={styles.ghost}
                  aria-label={`Load paddle slot ${presetIndex + 1}`}
                  disabled={!preset}
                  onClick={() => {
                    if (
                      act({ type: 'preset', slot: presetIndex, action: 'load' }, 'Preset equipped.')
                    )
                      setSelected({ ...preset!.kit });
                  }}
                >
                  Load
                </button>
              </div>
            </section>
          )}
        </div>
        <p className={css.notice} role="status" aria-live="polite">
          {notice}
        </p>
      </div>
      {detail && (
        <Dialog
          label={
            detail === 'material'
              ? slot === 'tuning'
                ? 'Tuning details'
                : part.name
              : detail === 'paths'
                ? 'Return paths'
                : detail === 'rewards'
                  ? 'Marks and signatures'
                  : 'Gauntlet service'
          }
          portal
          className={css.overlay}
          onDismiss={closeDetail}
        >
          <div
            className={css.detailPanel}
            ref={detailPanel}
            onClickCapture={blockClosingClick}
            data-workshop-detail
          >
            <header>
              <h3>
                {detail === 'material'
                  ? slot === 'tuning'
                    ? 'Tuning details'
                    : part.name
                  : detail === 'paths'
                    ? 'Return paths'
                    : detail === 'rewards'
                      ? 'Marks & signatures'
                      : 'Gauntlet service'}
              </h3>
              <button
                type="button"
                className={styles.ghost}
                aria-label="Close details"
                onClick={closeDetail}
              >
                ✕
              </button>
            </header>
            <div className={css.detailBody}>
              {detail === 'material' && (
                <>
                  {slot === 'tuning' ? (
                    <>
                      <p>
                        <b>Standard</b>Balanced response.
                      </p>
                      <p>
                        <b>Firm</b>More ordinary rebound, less moving grip.
                      </p>
                      <p>
                        <b>Grip</b>More moving grip, softer geometric placement.
                      </p>
                      <p className={css.muted}>
                        {stage < 2
                          ? 'Free to test. Complete a contact contract to unlock tuning for scored play.'
                          : 'Unlocked. Switch settings freely.'}
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        <b>Gain</b>
                        {part.benefit}
                      </p>
                      <p>
                        <b>Trade-off</b>
                        {part.costText}
                      </p>
                      <p>
                        <b>Technique</b>
                        {part.technique}
                      </p>
                      {!w.owned.includes(part.id) && (
                        <p className={css.muted}>
                          {stage < part.milestone
                            ? `Unlocks at ${STAGES[part.milestone]}.`
                            : w.marks < part.cost
                              ? `${part.cost - w.marks} more Marks to craft.`
                              : 'Ready to craft.'}{' '}
                          Free to test now.
                        </p>
                      )}
                    </>
                  )}
                  <div className={css.propertyDetails}>
                    <h4>Your paddle response</h4>
                    <p>
                      Reach and moving grip include your talents.
                      {reach >= BALANCE.talents.maxLength ? ' Reach is capped.' : ''}
                      {grip >= BALANCE.equipment.overallSpinMax
                        ? ' Moving grip is capped.'
                        : ''}{' '}
                      Damping affects incoming bonus pace.
                    </p>
                    <p>
                      {bonus > 0
                        ? `+${(bonus * 100).toFixed(1)}% ordinary clean-centre growth.`
                        : 'Standard clean-centre growth.'}
                      {reboundLimit ? ' At the passive limit in clutch.' : ''} Charged returns keep
                      their skill response.
                    </p>
                    <p>
                      {selected.surface === 'ceramic'
                        ? 'Straight centre band.'
                        : selected.surface === 'split'
                          ? 'Steady centre, grippy ends.'
                          : selected.surface === 'woven'
                            ? 'Gentle edge response.'
                            : selected.surface === 'rubber'
                              ? 'Flatter stationary contact.'
                              : 'Standard geometric placement.'}
                      {selected.frame === 'compact'
                        ? ' Compact frame sharpens geometric placement.'
                        : ''}
                    </p>
                  </div>
                </>
              )}
              {detail === 'paths' && (
                <>
                  <div
                    className={`${css.presetTabs} ${css.motionTabs}`}
                    style={tabPosition(Number(moving), 2)}
                    role="group"
                    aria-label="Contact motion"
                  >
                    <button type="button" aria-pressed={!moving} onClick={() => setMoving(false)}>
                      Stationary
                    </button>
                    <button type="button" aria-pressed={moving} onClick={() => setMoving(true)}>
                      Moving
                    </button>
                  </div>
                  <div className={css.comparison} ref={pathsMotion} data-workshop-motion="paths">
                    <div>
                      <h4>Neutral</h4>
                      <ContactDiagram kit={{ ...NEUTRAL_KIT }} moving={moving} />
                    </div>
                    <div>
                      <h4>Selected</h4>
                      <ContactDiagram kit={selected} moving={moving} />
                    </div>
                  </div>
                  <p className={css.muted}>
                    Ordinary surface response only. Your skills still apply in live practice.
                  </p>
                </>
              )}
              {detail === 'rewards' && (
                <>
                  <p>
                    <b>Earn Marks</b>Scored wins/losses earn 4/2 Marks after three paddle contacts.
                    Gauntlet pays per act. Technique contracts pay once.
                  </p>
                  <p>
                    <b>Practice</b>Practice and survival Endless pay no Marks. All materials are
                    free to test.
                  </p>
                  <p>
                    <b>Signatures</b>
                    {stage >= 5
                      ? `${w.signatures} encounters · cycle ${Math.floor(w.signatures / 10) + 1}. Combat bonuses remain capped.`
                      : 'Complete Signature craft to unlock your signature engraving.'}
                  </p>
                  {crafted === 11 && (
                    <p>
                      All functional recipes crafted. Continue for signatures and cosmetic records.
                    </p>
                  )}
                </>
              )}
              {detail === 'service' && (
                <>
                  <p>
                    Swap to this owned paddle for 2 credits at an act boundary, after resolving your
                    boon offer.
                  </p>
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={!workshopServiceRun(profile, selected)}
                    onClick={() => {
                      if (
                        act(
                          { type: 'service', kit: selected },
                          'Run paddle changed for the next encounter.'
                        )
                      )
                        closeDetail();
                    }}
                  >
                    Change run paddle · 2 credits
                  </button>
                </>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </Screen>
  );
}
