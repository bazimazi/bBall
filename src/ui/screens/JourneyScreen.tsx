import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { botProfile } from '../../core/bots/levels';
import {
  JOURNEY,
  nextStage,
  nextFrontierStage,
  stageById,
  stageOpen,
  starsInWorld,
  TOTAL_STARS,
  totalStars,
  worldById,
  worldCleared,
  worldOpen,
  type JourneyWorld,
  type Stage
} from '../../core/campaign/journey';
import { bossById } from '../../core/modes/bosses';
import { starGoalLabel } from '../../core/modes/stars';
import type { PlayerProfile } from '../../core/profile/types';
import { Screen } from '../components/Screen';
import { PaddleNotice } from '../components/PaddleNotice';
import { GamePicker } from '../components/GamePicker';
import { LockIcon, StarIcon, StarRow } from '../icons/ModeIcons';
import modes from '../Modes.module.css';
import styles from '../Screens.module.css';

interface JourneyScreenProps {
  profile: PlayerProfile;
  onPlay: (stageId: string) => void;
  onBack: () => void;
}

const accent = (hue: number): CSSProperties =>
  ({ '--accent': `hsl(${hue} 90% 66%)` }) as CSSProperties;

/** Why a world is still shut, in the fewest words that tell the player what to do. */
function lockReason(
  world: JourneyWorld,
  stars: number,
  journey: PlayerProfile['progress']['journey']
): string {
  const previous = worldById(world.id - 1);
  if (previous && !worldCleared(journey, previous)) {
    const boss = previous.stages[previous.stages.length - 1];
    return `Beat ${boss?.name ?? 'the boss'} in ${previous.name}`;
  }
  return `${world.starsToOpen - stars} more stars to open`;
}

/**
 * The Journey map: a tab per world, six stages at a time, and the chosen stage in
 * detail with its three stars spelled out. Always opens on the stage the
 * player should play next.
 */
export function JourneyScreen({ profile, onPlay, onBack }: JourneyScreenProps) {
  const journey = profile.progress.journey;
  const stars = totalStars(journey);
  const upcoming = nextStage(journey);
  const [worldId, setWorldId] = useState(upcoming?.world ?? 1);
  const [stageId, setStageId] = useState<string | null>(upcoming?.id ?? null);
  const [variant, setVariant] = useState<'story' | 'veteran' | 'ascendant'>('story');
  const activeTab = useRef<HTMLButtonElement>(null);

  const world = worldById(worldId) ?? JOURNEY[0]!;
  const open = worldOpen(journey, world);
  const selected = stageId
    ? stageById(
        variant === 'story' || stageId.startsWith('f2-') ? stageId : `${variant}-${stageId}`
      )
    : undefined;
  const shown = selected && selected.world === world.id ? selected : undefined;
  const stagePage = Math.floor((shown?.index ?? 0) / 6);
  const pageCount = Math.ceil(world.stages.length / 6);
  const worlds =
    worldId > 30
      ? [world]
      : JOURNEY.slice(Math.floor((worldId - 1) / 5) * 5, Math.floor((worldId - 1) / 5) * 5 + 5);

  useEffect(() => {
    activeTab.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [worldId]);

  const pickWorld = (id: number) => {
    setWorldId(id);
    const target = worldById(id);
    const first = target?.stages.find(
      (item) => stageOpen(journey, item) && !(journey[item.id] ?? 0)
    );
    setStageId(first?.id ?? target?.stages[0]?.id ?? null);
  };

  const playable = shown ? stageOpen(journey, shown) : false;

  return (
    <Screen
      title="Journey"
      subtitle={
        worldId > 30
          ? `Journey Beyond · sector ${worldId - 30}`
          : `${stars} of ${TOTAL_STARS} Story stars`
      }
      onBack={onBack}
      footer={
        <button
          type="button"
          className={styles.primary}
          disabled={!playable}
          onClick={() => shown && onPlay(shown.id)}
        >
          {shown
            ? playable
              ? `Play ${shown.world}-${shown.index + 1}`
              : 'Locked'
            : 'Pick a stage'}
        </button>
      }
    >
      <PaddleNotice profile={profile} />
      <div className={styles.fieldGrid}>
        <GamePicker<'story' | 'veteran' | 'ascendant'>
          label="Journey rules"
          value={worldId > 30 ? 'story' : variant}
          disabled={worldId > 30}
          onChange={setVariant}
          options={[
            {
              value: 'story',
              name: 'Story',
              hint: 'The original journey. Clear stages and earn stars.'
            },
            { value: 'veteran', name: 'Veteran', hint: 'Harder rematches after each Story clear.' },
            {
              value: 'ascendant',
              name: 'Ascendant',
              hint: 'Legend opponents and a shorter paddle after each Story clear.'
            }
          ]}
        />
        <GamePicker
          label="Chapter"
          value={worldId > 30 ? 6 : Math.floor((worldId - 1) / 5)}
          onChange={(chapter) => {
            if (chapter === 6) {
              const next = nextFrontierStage(journey);
              setWorldId(next.world);
              setStageId(next.id);
            } else pickWorld(chapter * 5 + 1);
          }}
          options={[
            ...[
              'Original Journey',
              'Precision Circuit',
              'Reactive Courts',
              'Rival Schools',
              'Fractured Worlds',
              'Apex Dominion'
            ].map((name, i) => ({
              value: i,
              name,
              tag: String(i + 1).padStart(2, '0'),
              hint: `Worlds ${i * 5 + 1}–${i * 5 + 5}`
            })),
            {
              value: 6,
              name: 'Journey Beyond',
              tag: '∞',
              hint:
                (journey['w5-6'] ?? 0) & 1
                  ? 'Continuing frontier sectors'
                  : 'Beat the World 5 boss to open',
              disabled: !((journey['w5-6'] ?? 0) & 1)
            }
          ]}
        />
      </div>
      {variant !== 'story' && worldId <= 30 && (
        <p className={styles.rowBlurb} style={{ margin: 0 }}>
          {variant === 'veteran'
            ? 'Clear each Story stage to unlock its Veteran rematch.'
            : 'Clear each Story stage to face Legend with a shorter paddle.'}
        </p>
      )}
      <div
        className={modes.tabs}
        role="tablist"
        aria-label="Journey worlds"
        onKeyDown={(event) => {
          const current = worlds.findIndex((item) => item.id === worldId);
          const index =
            event.key === 'ArrowRight'
              ? (current + 1) % worlds.length
              : event.key === 'ArrowLeft'
                ? (current + worlds.length - 1) % worlds.length
                : event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? worlds.length - 1
                    : null;
          if (index === null) return;
          event.preventDefault();
          pickWorld(worlds[index]!.id);
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
        }}
      >
        {worlds.map((item) => {
          const unlocked = worldOpen(journey, item);
          const classes = [modes.tab];
          if (item.id === world.id) classes.push(modes.tabOn);
          if (!unlocked) classes.push(modes.tabLocked);
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              ref={item.id === world.id ? activeTab : undefined}
              tabIndex={item.id === world.id ? 0 : -1}
              id={`world-tab-${item.id}`}
              aria-controls="journey-stages"
              aria-selected={item.id === world.id}
              className={classes.join(' ')}
              style={accent(item.hue)}
              onClick={() => pickWorld(item.id)}
            >
              <span className={modes.tabName}>{item.name}</span>
              <span className={modes.tabMeta}>
                {unlocked ? <StarIcon /> : <LockIcon />}
                {starsInWorld(journey, item)}/{item.stages.length * 3}
              </span>
            </button>
          );
        })}
      </div>

      <div className={modes.worldHead}>
        <span className={styles.sectionLabel} style={{ margin: 0 }}>
          World {world.id} · {world.theme}
        </span>
      </div>

      {!open && (
        <p className={modes.lockNote}>
          <LockIcon />
          {lockReason(world, stars, journey)}
        </p>
      )}

      {pageCount > 1 && (
        <nav className={styles.pager} aria-label="Stage pages">
          <button
            type="button"
            className={styles.ghost}
            disabled={stagePage === 0}
            onClick={() => setStageId(world.stages[(stagePage - 1) * 6]!.id)}
          >
            Previous
          </button>
          <span>
            Stages {stagePage * 6 + 1}–{Math.min((stagePage + 1) * 6, world.stages.length)}
          </span>
          <button
            type="button"
            className={styles.ghost}
            disabled={stagePage === pageCount - 1}
            onClick={() => setStageId(world.stages[(stagePage + 1) * 6]!.id)}
          >
            Next
          </button>
        </nav>
      )}
      <div
        className={`${modes.stages} ${pageCount > 1 ? modes.stagesCompact : ''}`}
        key={world.id}
        id="journey-stages"
        role="tabpanel"
        aria-labelledby={`world-tab-${world.id}`}
      >
        {world.stages.slice(stagePage * 6, (stagePage + 1) * 6).map((base) => {
          const item =
            variant === 'story' || base.id.startsWith('f2-')
              ? base
              : stageById(`${variant}-${base.id}`)!;
          return (
            <StageTile
              key={item.id}
              stage={item}
              hue={item.boss ? (bossById(item.boss)?.spec.hue ?? world.hue) : world.hue}
              mask={journey[item.id] ?? 0}
              open={stageOpen(journey, item)}
              next={upcoming?.id === item.id}
              selected={shown?.id === item.id}
              onSelect={() => setStageId(base.id)}
            />
          );
        })}
      </div>

      {shown && (
        <StageDetail
          key={shown.id}
          stage={shown}
          hue={shown.boss ? (bossById(shown.boss)?.spec.hue ?? world.hue) : world.hue}
          mask={journey[shown.id] ?? 0}
        />
      )}
      {(journey['w5-6'] ?? 0) & 1 ? (
        <button
          type="button"
          className={styles.ghost}
          onClick={() => {
            const next = nextFrontierStage(journey);
            setWorldId(next.world);
            setStageId(next.id);
          }}
        >
          Journey Beyond · next frontier sector
        </button>
      ) : null}
    </Screen>
  );
}

interface StageTileProps {
  stage: Stage;
  hue: number;
  mask: number;
  open: boolean;
  next: boolean;
  selected: boolean;
  onSelect: () => void;
}

function StageTile({ stage, hue, mask, open, next, selected, onSelect }: StageTileProps) {
  const classes = [modes.stage];
  if (stage.boss) classes.push(modes.stageBoss);
  if (selected) classes.push(modes.stageSelected);
  if (!open) classes.push(modes.stageLocked);
  if (next) classes.push(modes.stageNext);
  return (
    <button
      type="button"
      className={classes.join(' ')}
      style={accent(hue)}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className={modes.stageNum}>
        {stage.world}-{stage.index + 1}
      </span>
      <span className={modes.stageName}>{stage.name}</span>
      {stage.boss && <span className={modes.bossBadge}>Boss</span>}
      <StarRow mask={mask} className={modes.stars} on={modes.starOn} />
    </button>
  );
}

function StageDetail({ stage, hue, mask }: { stage: Stage; hue: number; mask: number }) {
  const bot = botProfile(stage.bot);
  const goals = [
    { bit: 1, label: 'Win the match' },
    { bit: 2, label: starGoalLabel(stage.goals[0]) },
    { bit: 4, label: starGoalLabel(stage.goals[1]) }
  ];
  const boss = stage.boss ? bossById(stage.boss) : undefined;
  return (
    <div className={modes.detail} style={accent(hue)}>
      <div className={modes.detailHead}>
        <span className={modes.stageNum}>
          {boss ? 'Boss · ' : ''}Stage {stage.world}-{stage.index + 1}
        </span>
        <h3 className={modes.detailName}>{stage.name}</h3>
        <p className={modes.detailBlurb}>{stage.blurb}</p>
        <p className={modes.detailBlurb}>
          vs {bot.name} · first to {stage.winScore}
          {boss ? ` · ${boss.spec.phases.length + 1} phases` : ''}
        </p>
      </div>
      <div className={modes.goals}>
        {goals.map((goal) => (
          <span
            key={goal.bit}
            className={mask & goal.bit ? `${modes.goal} ${modes.goalOn}` : modes.goal}
          >
            <StarIcon />
            {goal.label}
          </span>
        ))}
      </div>
    </div>
  );
}
