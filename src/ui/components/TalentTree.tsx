import {
  BRANCH_COLUMNS,
  isUltimate,
  linksOfBranch,
  talentsOfBranch,
  tiersOfBranch
} from '../../core/talents/catalog';
import { talentState, type TalentState } from '../../core/talents/save';
import type { Branch, TalentDef, TalentId, TalentSave } from '../../core/talents/types';
import { TalentIcon } from '../icons/TalentIcon';
import styles from '../Talents.module.css';

/**
 * One branch, drawn as a grid of icons.
 *
 * Geometry lives here rather than in the stylesheet because the connecting
 * arrows are an SVG overlay that has to line up with the tiles exactly - one
 * set of numbers, used by both the grid and the paths drawn over it.
 */
const TILE = 44;
const GAP = 14;

const cellX = (column: number) => column * (TILE + GAP);
const cellY = (tier: number) => tier * (TILE + GAP);
const gridW = BRANCH_COLUMNS * TILE + (BRANCH_COLUMNS - 1) * GAP;

interface TalentTreeProps {
  branch: Branch;
  save: TalentSave;
  /** Points already in this branch, for the header count. */
  spent: number;
  /** Everything this branch would cost to fill. */
  total: number;
  selected: TalentId | null;
  onPick: (talent: TalentDef) => void;
  onReset: () => void;
}

/** Which of the four looks a tile wears. */
function tileClass(state: TalentState, selected: boolean): string {
  const classes = [styles.tile];
  if (isUltimate(state.talent)) classes.push(styles.tileUltimate);
  if (state.maxed) classes.push(styles.tileMaxed);
  else if (state.rank > 0) classes.push(styles.tileLearned);
  else if (state.unlocked) classes.push(styles.tileOpen);
  else classes.push(styles.tileLocked);
  if (selected) classes.push(styles.tileSelected);
  return classes.join(' ');
}

/**
 * An arrow from a prerequisite down to what it unlocks.
 *
 * Straight down when the two share a column, otherwise an elbow - down the
 * source's column, across the gap between the rows, then into the target.
 */
function Arrow({ from, to }: { from: TalentDef; to: TalentDef }) {
  const x1 = cellX(from.column) + TILE / 2;
  const x2 = cellX(to.column) + TILE / 2;
  const y1 = cellY(from.tier) + TILE + 3;
  const y2 = cellY(to.tier) - 9;
  const bend = y2 - GAP / 2 + 2;

  const path =
    from.column === to.column
      ? `M${x1} ${y1} L${x1} ${y2}`
      : `M${x1} ${y1} L${x1} ${bend} L${x2} ${bend} L${x2} ${y2}`;

  return (
    <g className={styles.arrow}>
      <path d={path} />
      <path
        d={`M${x2 - 4.5} ${y2} L${x2} ${y2 + 6} L${x2 + 4.5} ${y2} Z`}
        className={styles.head}
      />
    </g>
  );
}

export function TalentTree({
  branch,
  save,
  spent,
  total,
  selected,
  onPick,
  onReset
}: TalentTreeProps) {
  const talents = talentsOfBranch(branch.id);
  const links = linksOfBranch(branch.id);
  const rows = tiersOfBranch(branch.id);
  const gridH = rows * TILE + (rows - 1) * GAP;
  const hue = branch.hue;

  return (
    <section
      className={styles.tree}
      style={{ '--branch': `${hue}` } as React.CSSProperties}
      aria-label={`${branch.name} talents`}
    >
      <header className={styles.treeHead}>
        <span className={styles.treeCrest}>
          <TalentIcon id={branch.crest} />
        </span>
        <span className={styles.treeName}>{branch.name}</span>
        <span className={styles.treeCount}>
          {spent} / {total}
        </span>
      </header>

      <div className={styles.treeBody}>
        <div className={styles.grid} style={{ width: gridW, height: gridH }}>
          <svg
            className={styles.links}
            width={gridW}
            height={gridH}
            viewBox={`0 0 ${gridW} ${gridH}`}
            aria-hidden="true"
          >
            {links.map((link) => (
              <Arrow key={`${link.from.id}-${link.to.id}`} from={link.from} to={link.to} />
            ))}
          </svg>

          {talents.map((talent) => {
            const state = talentState(save, talent);
            return (
              <button
                key={talent.id}
                type="button"
                className={tileClass(state, selected === talent.id)}
                style={{ left: cellX(talent.column), top: cellY(talent.tier) }}
                aria-label={`${talent.name}, rank ${state.rank} of ${talent.maxRank}`}
                aria-pressed={selected === talent.id}
                onClick={() => onPick(talent)}
              >
                <TalentIcon id={talent.id} />
                <span className={styles.rank}>
                  {state.rank}/{talent.maxRank}
                </span>
                {isUltimate(talent) && <span className={styles.crown} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>

      <button type="button" className={styles.treeReset} disabled={spent === 0} onClick={onReset}>
        ✕ Reset
      </button>
    </section>
  );
}
