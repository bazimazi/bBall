import { useState, type CSSProperties } from 'react';

import { botProfile } from '../../core/bots/levels';
import {
  JOURNEY,
  nextStage,
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
 * The Journey map: a tab per world, its six stages, and the chosen stage in
 * detail with its three stars spelled out. Always opens on the stage the
 * player should play next.
 */
export function JourneyScreen({ profile, onPlay, onBack }: JourneyScreenProps) {
  const journey = profile.progress.journey;
  const stars = totalStars(journey);
  const upcoming = nextStage(journey);
  const [worldId, setWorldId] = useState(upcoming?.world ?? 1);
  const [stageId, setStageId] = useState<string | null>(upcoming?.id ?? null);

  const world = worldById(worldId) ?? JOURNEY[0]!;
  const open = worldOpen(journey, world);
  const selected = stageId ? stageById(stageId) : undefined;
  const shown = selected && selected.world === world.id ? selected : undefined;

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
      subtitle={`${stars} of ${TOTAL_STARS} stars`}
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
      <div className={modes.tabs} role="tablist">
        {JOURNEY.map((item) => {
          const unlocked = worldOpen(journey, item);
          const classes = [modes.tab];
          if (item.id === world.id) classes.push(modes.tabOn);
          if (!unlocked) classes.push(modes.tabLocked);
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
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

      <div className={modes.stages} key={world.id}>
        {world.stages.map((item) => (
          <StageTile
            key={item.id}
            stage={item}
            hue={item.boss ? (bossById(item.boss)?.spec.hue ?? world.hue) : world.hue}
            mask={journey[item.id] ?? 0}
            open={stageOpen(journey, item)}
            next={upcoming?.id === item.id}
            selected={shown?.id === item.id}
            onSelect={() => setStageId(item.id)}
          />
        ))}
      </div>

      {shown && (
        <StageDetail
          key={shown.id}
          stage={shown}
          hue={shown.boss ? (bossById(shown.boss)?.spec.hue ?? world.hue) : world.hue}
          mask={journey[shown.id] ?? 0}
        />
      )}
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
