import { t, msg } from '../../core/i18n/index';
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
      aria-label={t(
        msg('{0} ordinary return angle {1} degrees', [
          t(moving ? 'Moving' : 'Stationary'),
          t(Math.round((angle * 180) / Math.PI))
        ])
      )}
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
    <section
      className={css.showcase}
      style={accent(selected.surface)}
      aria-label={t('Selected paddle')}
    >
      <div className={css.preview} ref={previewMotion} data-workshop-motion="paddle">
        <PaddlePreview kit={selected} />
      </div>
      <div className={css.identity}>
        <span className={css.state}>
          {t(equipped ? 'Equipped' : owned ? 'Ready to equip' : 'Bench loan')}
        </span>
        <h3>{t(playstyle(selected))}</h3>
        <p>{t(kitName(selected))}</p>
      </div>
      <div className={css.readouts} aria-label={t('Paddle properties with current talents')}>
        <span>
          <b>
            {t(Math.round((1 + reach) * 100))}
            {t('%')}
          </b>
          {t(' Reach')}
        </span>
        <span>
          <b>
            {t(Math.round(grip * 100))}
            {t('%')}
          </b>
          {t(' Moving grip')}
        </span>
        <span>
          <b>
            {t(selected.core === 'cork' || selected.core === 'memory-gel' ? 80 : 60)}
            {t('%')}
          </b>
          {t(' Bonus damping')}
        </span>
      </div>
    </section>
  );
  return (
    <Screen
      title={t('Paddle Workshop')}
      onBack={onBack}
      className={css.screen}
      footer={
        <div className={css.footer}>
          <button
            type="button"
            className={`${styles.ghost} ${css.equip}`}
            disabled={!owned || equipped}
            aria-label={t(
              equipped ? 'Equipped' : owned ? 'Equip paddle' : 'Craft and unlock parts to equip'
            )}
            onClick={() =>
              act(
                { type: 'equip', kit: selected },
                'Paddle equipped. Active runs and cups keep their starting kit.'
              )
            }
          >
            {t(equipped ? 'Equipped' : owned ? 'Equip paddle' : 'Loan only')}
          </button>
          <button
            type="button"
            className={`${styles.primary} ${css.test}`}
            aria-label={t('Try selected paddle · no rewards')}
            onClick={() => onBench(selected, 'routine')}
          >
            <WorkshopSymbol kind="play" />
            <span>
              {t('Test paddle')}
              <small>{t('Free practice · no rewards')}</small>
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
            aria-label={t('Workshop views')}
          >
            {VIEWS.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={view === name}
                aria-controls="workshop-view"
                onClick={() => setView(name)}
              >
                {t(name)}
              </button>
            ))}
          </nav>
          <span className={css.wallet} aria-label={t(msg('{0} Workshop Marks', [t(w.marks)]))}>
            <WorkshopSymbol kind="marks" />
            <b>{t(w.marks)}</b>
            <span>{t('Marks')}</span>
          </span>
        </div>
        <div id="workshop-view" className={css.view} ref={viewMotion} data-workshop-motion="view">
          {(view === 'Build' || view === 'Practice') && (
            <div className={css.buildSummary}>
              {t(showcase)}
              {view === 'Build' && (
                <div className={css.mission} data-workshop-comparison>
                  <button type="button" className={styles.ghost} onClick={compare}>
                    {t('Compare selected kit')}
                  </button>
                  <span>
                    {t(w.introduced ? 'Free comparison' : '+12 starter Marks')}
                    <small>
                      {t(w.introduced ? 'Owned changes are free' : 'Change core or surface')}
                    </small>
                  </span>
                </div>
              )}
            </div>
          )}
          {view === 'Build' && (
            <section className={css.builder} aria-label={t('Assemble paddle')}>
              <div
                className={`${css.slots} ${css.motionTabs}`}
                style={tabPosition(
                  PART_TABS.indexOf(slot),
                  PART_TABS.length,
                  slot === 'tuning' ? undefined : MATERIAL_COLOURS[selected[slot]]
                )}
                role="group"
                aria-label={t('Paddle parts')}
              >
                {EQUIPMENT_SLOTS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={t(SLOT_NAMES[key])}
                    aria-pressed={slot === key}
                    aria-controls="workshop-materials"
                    style={accent(selected[key])}
                    onClick={() => changeSlot(key)}
                  >
                    <MaterialGlyph id={selected[key]} />
                    <span>{t(SHORT[key])}</span>
                  </button>
                ))}
                <button
                  type="button"
                  aria-label={t('Tuning')}
                  aria-pressed={slot === 'tuning'}
                  aria-controls="workshop-materials"
                  onClick={() => changeSlot('tuning')}
                >
                  <WorkshopSymbol kind="target" />
                  <span>{t('Tune')}</span>
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
                    aria-label={t('Tuning settings')}
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
                          {t(
                            tuning === 'standard' ? 'Standard' : tuning === 'firm' ? 'Firm' : 'Grip'
                          )}
                        </b>
                        <small>
                          {t(
                            tuning === 'standard'
                              ? 'Balanced'
                              : tuning === 'firm'
                                ? 'Rebound ↑ grip ↓'
                                : 'Grip ↑ placement ↓'
                          )}
                        </small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div
                    className={css.carousel}
                    role="group"
                    aria-label={t(msg('{0} materials', [t(SLOT_NAMES[slot])]))}
                  >
                    <button
                      type="button"
                      className={css.pageArrow}
                      aria-label={t('Previous materials')}
                      disabled={page === 0}
                      onClick={() => setPage(page - 1)}
                    >
                      {t('‹')}
                    </button>
                    <div className={css.inventory}>
                      {materials.slice(page * 2, page * 2 + 2).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          aria-label={t(msg('Select {0}', [t(c.name)]))}
                          aria-pressed={selected[slot] === c.id}
                          className={css.material}
                          style={accent(c.id)}
                          onClick={() => choose(slot, c.id)}
                        >
                          <MaterialGlyph id={c.id} />
                          <b>{t(c.name)}</b>
                          <small>{t(MATERIAL_HINTS[c.id])}</small>
                          <span>
                            {t(
                              w.owned.includes(c.id)
                                ? 'Owned'
                                : msg('{0}{1} Marks', [
                                    t(c.milestone > stage ? 'Loan · ' : ''),
                                    t(c.cost)
                                  ])
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={css.pageArrow}
                      aria-label={t('Next materials')}
                      disabled={page >= pages - 1}
                      onClick={() => setPage(page + 1)}
                    >
                      {t('›')}
                    </button>
                  </div>
                )}
                <div className={css.pageInfo} aria-live="polite">
                  <span>
                    {t(
                      slot === 'tuning'
                        ? stage < 2
                          ? 'Loan until Tuning craft'
                          : 'Free to switch'
                        : msg('{0} · {1}/{2}', [t(SHORT[slot]), t(page + 1), t(pages)])
                    )}
                  </span>
                  <span>
                    {t(crafted)}
                    {t('/11 crafted')}
                  </span>
                </div>
              </div>
              <div className={css.buildActions}>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => setDetail('material')}
                >
                  {t(slot === 'tuning' ? 'Tuning details' : 'Material details')}
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
                    {t(
                      stage < part.milestone
                        ? msg('Unlock at {0}', [t(STAGES[part.milestone])])
                        : msg('Craft · {0} Marks', [t(part.cost)])
                    )}
                  </button>
                ) : (
                  <span className={css.ownedHint}>
                    {t(
                      slot === 'tuning'
                        ? 'Try any setting free'
                        : msg('{0} · owned', [t(part.name)])
                    )}
                  </span>
                )}
              </div>
            </section>
          )}
          {view === 'Practice' && (
            <section className={css.range} aria-labelledby="range-title">
              <div className={css.sectionHead}>
                <h3 id="range-title">{t('Practice range')}</h3>
                <span>{t('Free loans · no rewards')}</span>
              </div>
              <div className={css.drills}>
                {(['routine', 'attack', 'edge'] as const).map((serve) => (
                  <button
                    key={serve}
                    type="button"
                    onClick={() => onBench(selected, serve)}
                    aria-label={t(
                      serve === 'routine'
                        ? 'Routine return'
                        : serve === 'attack'
                          ? 'Incoming attack'
                          : 'Edge approach'
                    )}
                  >
                    <WorkshopSymbol
                      kind={serve === 'routine' ? 'target' : serve === 'attack' ? 'attack' : 'edge'}
                    />
                    <span>
                      <b>
                        {t(
                          serve === 'routine'
                            ? 'Routine return'
                            : serve === 'attack'
                              ? 'Incoming attack'
                              : 'Edge approach'
                        )}
                      </b>
                      <small>
                        {t(
                          serve === 'routine'
                            ? 'Find your feel'
                            : serve === 'attack'
                              ? 'Catch the bonus pace'
                              : 'Work the outer contact'
                        )}
                      </small>
                    </span>
                    <span aria-hidden="true">{t('↗')}</span>
                  </button>
                ))}
              </div>
              <button type="button" className={styles.ghost} onClick={() => setDetail('paths')}>
                {t('Compare return paths')}
              </button>
            </section>
          )}
          {view === 'Progress' && (
            <section className={css.progression} aria-labelledby="progression-title">
              <div className={css.sectionHead}>
                <h3 id="progression-title">{t(STAGES[stage])}</h3>
                <span>
                  {t(completed)}
                  {t('/6 complete')}
                </span>
              </div>
              <ol className={css.path} aria-label={t('Workshop unlock path')}>
                {PATH.map((name, i) => (
                  <li
                    key={name}
                    className={stage >= i + 1 ? css.pathDone : ''}
                    aria-current={Math.max(1, stage) === i + 1 ? 'step' : undefined}
                  >
                    <span>{stage >= i + 1 ? <WorkshopSymbol kind="check" /> : i + 1}</span>
                    <b>{t(name)}</b>
                  </li>
                ))}
              </ol>
              <p className={css.next}>{t(NEXT[stage])}</p>
              <div className={css.contractHeading}>
                <h4>{t('Technique contracts')}</h4>
                <span>
                  {t(contractIndex + 1)}
                  {t('/')}
                  {t(WORKSHOP_CONTRACTS.length)}
                </span>
              </div>
              <div className={css.contractCarousel}>
                <button
                  type="button"
                  className={css.pageArrow}
                  aria-label={t('Previous contract')}
                  disabled={contractIndex === 0}
                  onClick={() => setContractIndex(contractIndex - 1)}
                >
                  {t('‹')}
                </button>
                <div
                  className={`${css.contract} ${done ? css.contractDone : ''}`}
                  ref={contractMotion}
                  data-workshop-motion="contract"
                  aria-live="polite"
                >
                  <div className={css.sectionHead}>
                    <b>{t(contract.name)}</b>
                    <span>{t(done ? 'Complete' : msg('+{0} Marks', [t(contract.reward)]))}</span>
                  </div>
                  <p>{t(contract.description)}</p>
                  <div className={css.contractMeter}>
                    <progress max={contract.target} value={value} aria-label={t(contract.name)} />
                    <span>
                      {t(value)}
                      {t('/')}
                      {t(contract.target)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={css.pageArrow}
                  aria-label={t('Next contract')}
                  disabled={contractIndex === WORKSHOP_CONTRACTS.length - 1}
                  onClick={() => setContractIndex(contractIndex + 1)}
                >
                  {t('›')}
                </button>
              </div>
              <div className={css.buildActions}>
                <button type="button" className={styles.ghost} onClick={() => setDetail('rewards')}>
                  {t('Marks & signatures')}
                </button>
                <button type="button" className={styles.ghost} onClick={onCustomize}>
                  {t('Finishes & engravings ↗')}
                </button>
              </div>
            </section>
          )}
          {view === 'Saved' && (
            <section className={css.saved} aria-labelledby="saved-title">
              <div className={css.sectionHead}>
                <h3 id="saved-title">{t('Saved paddles')}</h3>
                {profile.progress.run?.equipment?.version === 1 ? (
                  <button
                    type="button"
                    className={styles.ghost}
                    aria-label={t('Gauntlet service')}
                    onClick={() => setDetail('service')}
                  >
                    {t('Service · ')}
                    {t(profile.progress.run.credits ?? 0)}
                    {t(' credits')}
                  </button>
                ) : (
                  <span>
                    {t(w.presets.filter(Boolean).length)}
                    {t('/3 saved')}
                  </span>
                )}
              </div>
              <div
                className={`${css.presetTabs} ${css.motionTabs}`}
                style={tabPosition(presetIndex, w.presets.length)}
                role="group"
                aria-label={t('Paddle presets')}
              >
                {w.presets.map((p, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-label={t(msg('Paddle preset {0}', [t(index + 1)]))}
                    aria-pressed={presetIndex === index}
                    onClick={() => setPresetIndex(index)}
                  >
                    <span>
                      {t('0')}
                      {t(index + 1)}
                    </span>
                    <b>{p?.name ?? t('Empty')}</b>
                  </button>
                ))}
              </div>
              <div
                className={css.preset}
                ref={presetMotion}
                data-workshop-motion="preset"
                aria-live="polite"
              >
                <h4>{preset?.name ?? t('Save your favourite')}</h4>
                <p>
                  {t(
                    preset
                      ? kitName(preset.kit)
                      : 'Equip a paddle, then save it here for your next match.'
                  )}
                </p>
              </div>
              <label className={css.presetName}>
                <span>{t('Preset name')}</span>
                <input
                  maxLength={24}
                  value={presetName}
                  dir="auto"
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder={t('My paddle')}
                />
              </label>
              <div className={css.buildActions}>
                <button
                  type="button"
                  className={styles.ghost}
                  aria-label={t(msg('Save equipped paddle to slot {0}', [t(presetIndex + 1)]))}
                  onClick={() =>
                    act(
                      { type: 'preset', slot: presetIndex, action: 'save', name: presetName },
                      'Equipped paddle saved.'
                    )
                  }
                >
                  {t('Save equipped')}
                </button>
                <button
                  type="button"
                  className={styles.ghost}
                  aria-label={t(msg('Load paddle slot {0}', [t(presetIndex + 1)]))}
                  disabled={!preset}
                  onClick={() => {
                    if (
                      act({ type: 'preset', slot: presetIndex, action: 'load' }, 'Preset equipped.')
                    )
                      setSelected({ ...preset!.kit });
                  }}
                >
                  {t('Load')}
                </button>
              </div>
            </section>
          )}
        </div>
        <p className={css.notice} role="status" aria-live="polite">
          {t(notice)}
        </p>
      </div>
      {detail && (
        <Dialog
          label={t(
            detail === 'material'
              ? slot === 'tuning'
                ? 'Tuning details'
                : part.name
              : detail === 'paths'
                ? 'Return paths'
                : detail === 'rewards'
                  ? 'Marks and signatures'
                  : 'Gauntlet service'
          )}
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
                {t(
                  detail === 'material'
                    ? slot === 'tuning'
                      ? 'Tuning details'
                      : part.name
                    : detail === 'paths'
                      ? 'Return paths'
                      : detail === 'rewards'
                        ? 'Marks & signatures'
                        : 'Gauntlet service'
                )}
              </h3>
              <button
                type="button"
                className={styles.ghost}
                aria-label={t('Close details')}
                onClick={closeDetail}
              >
                {t('✕')}
              </button>
            </header>
            <div className={css.detailBody}>
              {detail === 'material' && (
                <>
                  {slot === 'tuning' ? (
                    <>
                      <p>
                        <b>{t('Standard')}</b>
                        {t('Balanced response.')}
                      </p>
                      <p>
                        <b>{t('Firm')}</b>
                        {t('More ordinary rebound, less moving grip.')}
                      </p>
                      <p>
                        <b>{t('Grip')}</b>
                        {t('More moving grip, softer geometric placement.')}
                      </p>
                      <p className={css.muted}>
                        {t(
                          stage < 2
                            ? 'Free to test. Complete a contact contract to unlock tuning for scored play.'
                            : 'Unlocked. Switch settings freely.'
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        <b>{t('Gain')}</b>
                        {t(part.benefit)}
                      </p>
                      <p>
                        <b>{t('Trade-off')}</b>
                        {t(part.costText)}
                      </p>
                      <p>
                        <b>{t('Technique')}</b>
                        {t(part.technique)}
                      </p>
                      {!w.owned.includes(part.id) && (
                        <p className={css.muted}>
                          {t(
                            stage < part.milestone
                              ? msg('Unlocks at {0}.', [t(STAGES[part.milestone])])
                              : w.marks < part.cost
                                ? msg('{0} more Marks to craft.', [t(part.cost - w.marks)])
                                : 'Ready to craft.'
                          )}
                          {t(' ')}
                          {t('Free to test now.')}
                        </p>
                      )}
                    </>
                  )}
                  <div className={css.propertyDetails}>
                    <h4>{t('Your paddle response')}</h4>
                    <p>
                      {t('Reach and moving grip include your talents.')}
                      {t(reach >= BALANCE.talents.maxLength ? ' Reach is capped.' : '')}
                      {t(grip >= BALANCE.equipment.overallSpinMax ? ' Moving grip is capped.' : '')}
                      {t(' ')}
                      {t('Damping affects incoming bonus pace.')}
                    </p>
                    <p>
                      {t(
                        bonus > 0
                          ? msg('+{0}% ordinary clean-centre growth.', [
                              t((bonus * 100).toFixed(1))
                            ])
                          : 'Standard clean-centre growth.'
                      )}
                      {t(reboundLimit ? ' At the passive limit in clutch.' : '')}
                      {t(' Charged returns keep their skill response.')}
                    </p>
                    <p>
                      {t(
                        selected.surface === 'ceramic'
                          ? 'Straight centre band.'
                          : selected.surface === 'split'
                            ? 'Steady centre, grippy ends.'
                            : selected.surface === 'woven'
                              ? 'Gentle edge response.'
                              : selected.surface === 'rubber'
                                ? 'Flatter stationary contact.'
                                : 'Standard geometric placement.'
                      )}
                      {t(
                        selected.frame === 'compact'
                          ? ' Compact frame sharpens geometric placement.'
                          : ''
                      )}
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
                    aria-label={t('Contact motion')}
                  >
                    <button type="button" aria-pressed={!moving} onClick={() => setMoving(false)}>
                      {t('Stationary')}
                    </button>
                    <button type="button" aria-pressed={moving} onClick={() => setMoving(true)}>
                      {t('Moving')}
                    </button>
                  </div>
                  <div className={css.comparison} ref={pathsMotion} data-workshop-motion="paths">
                    <div>
                      <h4>{t('Neutral')}</h4>
                      <ContactDiagram kit={{ ...NEUTRAL_KIT }} moving={moving} />
                    </div>
                    <div>
                      <h4>{t('Selected')}</h4>
                      <ContactDiagram kit={selected} moving={moving} />
                    </div>
                  </div>
                  <p className={css.muted}>
                    {t('Ordinary surface response only. Your skills still apply in live practice.')}
                  </p>
                </>
              )}
              {detail === 'rewards' && (
                <>
                  <p>
                    <b>{t('Earn Marks')}</b>
                    {t(
                      'Scored wins/losses earn 4/2 Marks after three paddle contacts. Gauntlet pays per act. Technique contracts pay once.'
                    )}
                  </p>
                  <p>
                    <b>{t('Practice')}</b>
                    {t(
                      'Practice and survival Endless pay no Marks. All materials are free to test.'
                    )}
                  </p>
                  <p>
                    <b>{t('Signatures')}</b>
                    {t(
                      stage >= 5
                        ? msg('{0} encounters · cycle {1}. Combat bonuses remain capped.', [
                            t(w.signatures),
                            t(Math.floor(w.signatures / 10) + 1)
                          ])
                        : 'Complete Signature craft to unlock your signature engraving.'
                    )}
                  </p>
                  {crafted === 11 && (
                    <p>
                      {t(
                        'All functional recipes crafted. Continue for signatures and cosmetic records.'
                      )}
                    </p>
                  )}
                </>
              )}
              {detail === 'service' && (
                <>
                  <p>
                    {t(
                      'Swap to this owned paddle for 2 credits at an act boundary, after resolving your boon offer.'
                    )}
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
                    {t('Change run paddle · 2 credits')}
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
