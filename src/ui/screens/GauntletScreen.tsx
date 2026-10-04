import { useState, type CSSProperties } from 'react';

import { botProfile } from '../../core/bots/levels';
import { bossById } from '../../core/modes/bosses';
import type { PlayerProfile } from '../../core/profile/types';
import { boonById, type BoonDef, type BoonFamily } from '../../core/run/boons';
import {
  encounterFor,
  heartsFor,
  isRunActive,
  PRESSURE,
  pressureUnlocked,
  RUN_STAGES,
  type RunSave
} from '../../core/run/run';
import { Screen } from '../components/Screen';
import { HeartIcon } from '../icons/ModeIcons';
import modes from '../Modes.module.css';
import styles from '../Screens.module.css';

interface GauntletScreenProps {
  profile: PlayerProfile;
  onStart: (pressure: number) => void;
  onPlay: () => void;
  onPick: (boonId: string) => void;
  onAbandon: () => void;
  onBack: () => void;
}

const FAMILY_HUE: Record<BoonFamily, number> = {
  power: 22,
  control: 190,
  defense: 150,
  tempo: 280,
  duo: 46
};

const FAMILY_NAME: Record<BoonFamily, string> = {
  power: 'Power',
  control: 'Control',
  defense: 'Defense',
  tempo: 'Tempo',
  duo: 'Duo'
};

const accent = (hue: number): CSSProperties =>
  ({ '--accent': `hsl(${hue} 90% 66%)` }) as CSSProperties;

function Hearts({ run }: { run: RunSave }) {
  const total = Math.max(heartsFor(run.pressure), run.hearts);
  return (
    <span className={modes.hearts} aria-label={`${run.hearts} hearts left`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < run.hearts ? undefined : modes.heartLost}>
          <HeartIcon />
        </span>
      ))}
    </span>
  );
}

/**
 * The Gauntlet, in whichever state it is in: a run to start, a draft to
 * pick from, or the road ahead with the next opponent named.
 */
export function GauntletScreen({
  profile,
  onStart,
  onPlay,
  onPick,
  onAbandon,
  onBack
}: GauntletScreenProps) {
  const run = profile.progress.run;
  if (!isRunActive(run)) return <StartView profile={profile} onStart={onStart} onBack={onBack} />;
  if (run.offer) return <DraftView run={run} onPick={onPick} onBack={onBack} />;
  return <RunView run={run} onPlay={onPlay} onAbandon={onAbandon} onBack={onBack} />;
}

// ------------------------------------------------------------------ start

function StartView({
  profile,
  onStart,
  onBack
}: {
  profile: PlayerProfile;
  onStart: (pressure: number) => void;
  onBack: () => void;
}) {
  const records = profile.progress.runRecords;
  const unlocked = pressureUnlocked(records);
  const [pressure, setPressure] = useState(0);
  const last = profile.progress.lastRun;

  return (
    <Screen
      title="Gauntlet"
      subtitle={
        records.runs > 0
          ? `${records.runs} run${records.runs > 1 ? 's' : ''} · ${records.clears} cleared`
          : 'A run of nine matches'
      }
      onBack={onBack}
      footer={
        <button type="button" className={styles.primary} onClick={() => onStart(pressure)}>
          {pressure > 0 ? `Start at Pressure ${pressure}` : 'Start a run'}
        </button>
      }
    >
      <div className={modes.stagger} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className={modes.detail} style={accent(340)}>
          <div className={modes.detailHead}>
            <h3 className={modes.detailName}>Three acts. Three hearts.</h3>
            <p className={modes.detailBlurb}>
              Each act is two matches and a boss. Win a match and choose one boon of three - they
              last until the run ends. Lose one and a heart goes, and the same opponent waits for a
              rematch.
            </p>
          </div>
        </div>

        <p className={styles.sectionLabel}>Pressure</p>
        <div className={modes.pressure}>
          {Array.from({ length: 6 }, (_, level) => (
            <button
              key={level}
              type="button"
              className={
                level === pressure
                  ? `${modes.pressureChip} ${modes.pressureOn}`
                  : modes.pressureChip
              }
              disabled={level > unlocked}
              onClick={() => setPressure(level)}
            >
              {level}
            </button>
          ))}
        </div>
        <div className={modes.ranks}>
          {PRESSURE.map((rank) => (
            <span
              key={rank.level}
              className={
                rank.level <= pressure ? modes.rankLine : `${modes.rankLine} ${modes.rankOff}`
              }
            >
              <b>{rank.level}</b> {rank.name} - {rank.blurb}
            </span>
          ))}
          {unlocked < 5 && (
            <span className={modes.rankLine}>
              Clear a run at Pressure {unlocked} to open Pressure {unlocked + 1}.
            </span>
          )}
        </div>

        {last && (
          <div className={styles.card}>
            <p className={styles.sectionLabel} style={{ marginTop: 0 }}>
              Last run
            </p>
            <p className={styles.rowBlurb}>
              {last.won
                ? `Cleared at Pressure ${last.pressure}`
                : `Reached match ${Math.min(RUN_STAGES, last.stage + 1)} of ${RUN_STAGES}`}
              {Object.keys(last.boons).length > 0
                ? ` · ${Object.keys(last.boons)
                    .map((id) => boonById(id)?.name ?? id)
                    .join(', ')}`
                : ''}
            </p>
          </div>
        )}
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------------ draft

function DraftView({
  run,
  onPick,
  onBack
}: {
  run: RunSave;
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  const offer = (run.offer ?? [])
    .map((id) => boonById(id))
    .filter((boon): boon is BoonDef => !!boon);
  return (
    <Screen
      title="Choose a boon"
      subtitle={`Match ${run.stage} of ${RUN_STAGES} won`}
      onBack={onBack}
    >
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Hearts run={run} />
      </div>
      <div className={modes.draft}>
        {offer.map((boon) => {
          const owned = run.boons[boon.id] ?? 0;
          const classes = boon.family === 'duo' ? `${modes.boon} ${modes.duo}` : modes.boon;
          return (
            <button
              key={boon.id}
              type="button"
              className={classes}
              style={accent(FAMILY_HUE[boon.family])}
              onClick={() => onPick(boon.id)}
            >
              <span className={modes.boonTop}>
                <span className={modes.boonName}>{boon.name}</span>
                <span className={modes.boonFamily}>{FAMILY_NAME[boon.family]}</span>
              </span>
              <span className={modes.boonBlurb}>{boon.blurb}</span>
              {!boon.instant && boon.maxRank > 1 && (
                <span
                  className={modes.boonRank}
                  aria-label={`Rank ${owned + 1} of ${boon.maxRank}`}
                >
                  {Array.from({ length: boon.maxRank }, (_, i) => (
                    <span
                      key={i}
                      className={
                        i < owned
                          ? `${modes.pip} ${modes.pipOn}`
                          : i === owned
                            ? `${modes.pip} ${modes.pipNew}`
                            : modes.pip
                      }
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <BoonList run={run} />
    </Screen>
  );
}

function BoonList({ run }: { run: RunSave }) {
  const owned = Object.entries(run.boons).filter(([, rank]) => rank > 0);
  if (owned.length === 0) return null;
  return (
    <>
      <p className={styles.sectionLabel}>Your boons</p>
      <div className={modes.boonChips}>
        {owned.map(([id, rank]) => {
          const boon = boonById(id);
          if (!boon) return null;
          return (
            <span key={id} className={modes.boonChip} style={accent(FAMILY_HUE[boon.family])}>
              {boon.name}
              {boon.maxRank > 1 ? ` ${rank}` : ''}
            </span>
          );
        })}
      </div>
    </>
  );
}

// -------------------------------------------------------------------- run

function RunView({
  run,
  onPlay,
  onAbandon,
  onBack
}: {
  run: RunSave;
  onPlay: () => void;
  onAbandon: () => void;
  onBack: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const next = encounterFor(run);
  const boss = next.boss ? bossById(next.boss) : undefined;
  const lastResult = run.results[run.results.length - 1];
  const rematch = lastResult && !lastResult.won && lastResult.stage === run.stage;

  return (
    <Screen
      title="Gauntlet"
      subtitle={`Pressure ${run.pressure} · match ${run.stage + 1} of ${RUN_STAGES}`}
      onBack={onBack}
      footer={
        <>
          <button type="button" className={styles.primary} onClick={onPlay}>
            {rematch ? 'Rematch' : boss ? `Face ${boss.spec.name}` : 'Play next match'}
          </button>
          <button
            type="button"
            className={confirm ? `${styles.ghost} ${styles.danger}` : styles.ghost}
            onClick={() => (confirm ? onAbandon() : setConfirm(true))}
          >
            {confirm ? 'Tap again to end this run' : 'End run'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Hearts run={run} />
      </div>

      <div className={modes.acts}>
        {[0, 1, 2].map((act) => (
          <div key={act} className={modes.act}>
            <span className={modes.actLabel}>Act {act + 1}</span>
            {[0, 1, 2].map((slot) => {
              const stage = act * 3 + slot;
              const encounter = encounterFor(run, stage);
              const won = run.results.some((item) => item.stage === stage && item.won);
              const classes = [modes.node];
              if (won) classes.push(modes.nodeDone);
              if (stage === run.stage) classes.push(modes.nodeNow);
              if (encounter.boss) classes.push(modes.nodeBoss);
              // Opponents further down the road stay a mystery until reached.
              const known = stage <= run.stage;
              const name = encounter.boss
                ? known
                  ? (bossById(encounter.boss)?.spec.name ?? 'Boss')
                  : 'Boss'
                : known
                  ? botProfile(encounter.bot).name
                  : '?';
              const results = run.results.filter((item) => item.stage === stage);
              const score = results[results.length - 1];
              return (
                <span key={slot} className={classes.join(' ')}>
                  <span className={modes.nodeName}>{name}</span>
                  <span>
                    {score ? `${score.you}-${score.bot}` : stage === run.stage ? 'Next' : ''}
                  </span>
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <div className={modes.detail} style={accent(boss?.spec.hue ?? 340)}>
        <div className={modes.detailHead}>
          <span className={modes.stageNum}>{boss ? 'Boss' : `Act ${next.act + 1}`}</span>
          <h3 className={modes.detailName}>
            {boss ? boss.spec.name : `vs ${botProfile(next.bot).name}`}
          </h3>
          <p className={modes.detailBlurb}>
            {boss ? boss.spec.title : next.courtName ? `On ${next.courtName}` : 'On a plain court'}
            {` · first to ${next.winScore}`}
          </p>
        </div>
      </div>

      <BoonList run={run} />
    </Screen>
  );
}
