import { t } from '../../core/i18n';
import { COURT_HEIGHT } from '../../core/modes/geometry';
import { waveRecipe } from '../../core/modes/sessions';
import type { Personality } from '../../core/modes/recipes';
import type { ArenaSpec, MatchOptions, MatchRules } from '../../core/modes/types';
import styles from './RulePreview.module.css';

type Duel = MatchOptions['duel'];
type PaddleScales = readonly [number, number];
const WIDTH = 1050;

function Arrow({
  x,
  y,
  angle = 0,
  length = 55
}: {
  x: number;
  y: number;
  angle?: number;
  length?: number;
}) {
  return (
    <path
      transform={`translate(${x} ${y}) rotate(${angle})`}
      d={`M0 0h${length}m-18 -14 18 14-18 14`}
      fill="none"
      stroke="currentColor"
      strokeWidth="8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** Static teaching diagrams: positions come from the same specs as the match. */
function Board({
  arena = {},
  duel,
  paddleScales,
  x = 8,
  y = 8,
  width = 224,
  height = 128
}: {
  arena?: ArenaSpec | undefined;
  duel?: Duel;
  paddleScales?: PaddleScales | undefined;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}) {
  const scales = paddleScales ?? (duel === 'precision' ? [0.8, 0.8] : [1, 1]);
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={`-16 -16 ${WIDTH + 32} ${COURT_HEIGHT + 32}`}
    >
      <rect className={styles.surface} width={WIDTH} height={COURT_HEIGHT} rx="36" />
      <path className={styles.midline} d={`M${WIDTH / 2} 24v552`} />
      {arena.wind && (
        <g className={styles.wind} data-hazard="wind">
          {[0.34, 0.66].map((lane, index) => (
            <g key={lane}>
              {[0.22, 0.5, 0.78].map((row) => (
                <Arrow
                  key={row}
                  x={lane * WIDTH}
                  y={row * COURT_HEIGHT}
                  angle={arena.wind?.shear && index ? -90 : 90}
                  length={60}
                />
              ))}
            </g>
          ))}
        </g>
      )}
      {arena.well && (
        <g
          className={styles.well}
          data-hazard="well"
          transform={`translate(${arena.well.x * WIDTH} ${arena.well.y * COURT_HEIGHT})`}
        >
          <circle r="105" className={styles.aura} />
          <circle r="62" fill="none" stroke="currentColor" strokeWidth="6" />
          <circle r="16" fill="currentColor" />
          {[0, 90, 180, 270].map((angle) => (
            <g key={angle} transform={`rotate(${angle})`}>
              <Arrow x={135} y={0} angle={180} length={48} />
              {arena.well?.pulsePeriod && (
                <g className={styles.push}>
                  <Arrow x={144} y={0} length={42} />
                </g>
              )}
            </g>
          ))}
        </g>
      )}
      {arena.zones?.map((zone, i) => (
        <g className={styles.zone} data-hazard="zone" key={i}>
          <rect
            x={zone.x * WIDTH}
            y={zone.y * COURT_HEIGHT}
            width={zone.w * WIDTH}
            height={zone.h * COURT_HEIGHT}
            rx="12"
          />
          <path
            d="m-24 -18 18 18-18 18m28 -36 18 18-18 18"
            transform={`translate(${(zone.x + zone.w / 2) * WIDTH} ${(zone.y + zone.h / 2) * COURT_HEIGHT})`}
          />
        </g>
      ))}
      {arena.rails?.map((rail, i) => (
        <g className={styles.rail} data-hazard="rail" data-breakable={!!rail.hp} key={i}>
          <path
            d={`M${rail.ax * WIDTH} ${rail.ay * COURT_HEIGHT}L${rail.bx * WIDTH} ${rail.by * COURT_HEIGHT}`}
          />
          {rail.hp && (
            <path
              className={styles.cracks}
              d={`M${rail.ax * WIDTH} ${rail.ay * COURT_HEIGHT}L${rail.bx * WIDTH} ${rail.by * COURT_HEIGHT}`}
            />
          )}
        </g>
      ))}
      {arena.gates?.map((gate, i) => {
        const top = (gate.center - gate.gap / 2) * COURT_HEIGHT;
        const bottom = (gate.center + gate.gap / 2) * COURT_HEIGHT;
        return (
          <g className={styles.gate} data-hazard="gate" key={i}>
            <path d={`M${gate.x * WIDTH} 12V${top}M${gate.x * WIDTH} ${bottom}V588`} />
            <path className={styles.opening} d={`M${gate.x * WIDTH} ${top}V${bottom}`} />
            {gate.amplitude && (
              <Arrow x={gate.x * WIDTH + 32} y={top + 22} angle={90} length={45} />
            )}
            {gate.phased && <circle cx={gate.x * WIDTH} cy={28} r="18" className={styles.aura} />}
          </g>
        );
      })}
      {arena.switches?.map((target, i) => (
        <g className={styles.switch} data-hazard="switch" key={i}>
          <path
            className={styles.link}
            d={`M${target.x * WIDTH} ${target.y * COURT_HEIGHT}L${(arena.gates?.[target.gate]?.x ?? target.x) * WIDTH} ${target.y * COURT_HEIGHT}`}
          />
          <rect
            x={-target.r}
            y={-target.r}
            width={target.r * 2}
            height={target.r * 2}
            transform={`translate(${target.x * WIDTH} ${target.y * COURT_HEIGHT}) rotate(45)`}
          />
        </g>
      ))}
      {arena.bumpers?.map((bumper, i) => {
        const cx = bumper.x * WIDTH;
        const cy = bumper.y * COURT_HEIGHT;
        const bx = cx + (bumper.orbit ? Math.cos(bumper.orbit.phase) * bumper.orbit.radius : 0);
        const by =
          cy +
          (bumper.orbit ? Math.sin(bumper.orbit.phase) * bumper.orbit.radius : 0) +
          (bumper.slide ? Math.sin(bumper.slide.phase) * bumper.slide.amplitude : 0);
        return (
          <g className={styles.bumper} data-hazard="bumper" key={i}>
            {bumper.orbit && (
              <circle className={styles.motionPath} cx={cx} cy={cy} r={bumper.orbit.radius} />
            )}
            {bumper.slide && (
              <path
                className={styles.motionPath}
                d={`M${cx} ${Math.max(bumper.r, cy - bumper.slide.amplitude)}V${Math.min(COURT_HEIGHT - bumper.r, cy + bumper.slide.amplitude)}`}
              />
            )}
            <circle
              cx={bx}
              cy={Math.max(bumper.r, Math.min(COURT_HEIGHT - bumper.r, by))}
              r={bumper.r}
            />
          </g>
        );
      })}
      {arena.portals?.map((portal, i) => (
        <g className={styles.portal} data-hazard="portal" key={i}>
          <path
            className={styles.link}
            d={`M${portal.a.x * WIDTH} ${portal.a.y * COURT_HEIGHT}L${portal.b.x * WIDTH} ${portal.b.y * COURT_HEIGHT}`}
          />
          {[portal.a, portal.b].map((mouth, j) => (
            <g key={j} className={j ? styles.portalExit : undefined}>
              <circle cx={mouth.x * WIDTH} cy={mouth.y * COURT_HEIGHT} r={portal.r} />
              <circle
                cx={mouth.x * WIDTH}
                cy={mouth.y * COURT_HEIGHT}
                r={portal.r + 12}
                className={styles.motionPath}
              />
            </g>
          ))}
        </g>
      ))}
      {arena.bricks &&
        (arena.bricks.sides === 'both'
          ? [0.26, 0.74]
          : [arena.bricks.sides === 'you' ? 0.26 : 0.74]
        ).map((side) => {
          const rows = Math.max(2, arena.bricks!.rows);
          const brickHeight = (COURT_HEIGHT - 7 * (rows + 1)) / rows;
          return (
            <g className={styles.brick} data-hazard="bricks" key={side}>
              {Array.from({ length: rows }, (_, row) => (
                <rect
                  key={row}
                  x={side * WIDTH - 8}
                  y={7 + row * (brickHeight + 7)}
                  width="16"
                  height={brickHeight}
                  rx="3"
                  strokeWidth={arena.bricks?.armored ? 8 : 4}
                />
              ))}
            </g>
          );
        })}
      {[46, WIDTH - 46].map((side, i) => (
        <g key={side} className={i ? styles.foe : styles.you}>
          {scales[i] !== 1 && (
            <rect
              className={styles.fullReach}
              x={side - 8}
              y={246}
              width="16"
              height="108"
              rx="8"
            />
          )}
          <rect
            data-paddle
            x={side - 8}
            y={(COURT_HEIGHT - 108 * scales[i]!) / 2}
            width="16"
            height={108 * scales[i]!}
            rx="8"
            fill="currentColor"
          />
        </g>
      ))}
      <g className={styles.ball}>
        <path
          className={styles.ballTrail}
          d={`M${WIDTH * 0.57} 310l${duel === 'speed' ? 140 : 75} -45`}
        />
        {duel === 'speed' && <path className={styles.ballTrail} d="m600 275 98-31m-73 69 78-26" />}
        <circle
          cx={WIDTH * 0.57 + (duel === 'speed' ? 140 : 75)}
          cy="265"
          r="11"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function CourtPreview({ arena, duel }: { arena?: ArenaSpec | undefined; duel?: Duel }) {
  return (
    <svg
      className={styles.diagram}
      viewBox="0 0 240 144"
      aria-hidden="true"
      focusable="false"
      data-rule-preview="court"
      data-duel={duel || 'standard'}
    >
      <Board arena={arena} duel={duel} />
      {duel && (
        <g className={styles.badge}>
          <rect x="91" y="112" width="58" height="24" rx="8" />
          <text x="120" y="128">
            {t(duel === 'speed' ? '+15%' : '80%')}
          </text>
        </g>
      )}
    </svg>
  );
}

export function EndlessPreview({
  waves,
  arenaId,
  arena
}: {
  waves: boolean;
  arenaId: string;
  arena?: ArenaSpec | undefined;
}) {
  if (!waves)
    return (
      <svg
        className={styles.diagram}
        viewBox="0 0 240 144"
        aria-hidden="true"
        focusable="false"
        data-rule-preview="classic"
      >
        <Board arena={arena} />
        <path className={styles.rally} d="M48 83 193 43M183 38l10 5-6 9M58 88l-10-5 6-9" />
        <g className={styles.badge}>
          <rect x="101" y="112" width="38" height="24" rx="8" />
          <text x="120" y="129">
            ∞
          </text>
        </g>
      </svg>
    );
  return (
    <svg
      className={styles.diagram}
      viewBox="0 0 240 144"
      aria-hidden="true"
      focusable="false"
      data-rule-preview="waves"
    >
      {[0, 1, 2].map((wave) => (
        <g key={wave}>
          <Board
            arena={waveRecipe(arenaId ? { arenaId } : undefined, wave).modifiers.arena}
            x={4 + wave * 82}
            y={30}
            width={68}
            height={54}
          />
          <text className={styles.counter} x={38 + wave * 82} y="105">
            {t(12)}
          </text>
          {wave < 2 && <path className={styles.rally} d={`M${73 + wave * 82} 56h8m-4-4 4 4-4 4`} />}
        </g>
      ))}
    </svg>
  );
}

export function SeriesPreview({
  series,
  arena,
  duel,
  paddleScales
}: {
  series: 1 | 3 | 5;
  arena?: ArenaSpec | undefined;
  duel?: Duel;
  paddleScales?: PaddleScales | undefined;
}) {
  return (
    <svg
      className={styles.diagram}
      viewBox="0 0 240 144"
      aria-hidden="true"
      focusable="false"
      data-rule-preview="series"
      data-series={series}
    >
      <Board
        arena={arena}
        duel={duel}
        paddleScales={paddleScales}
        x={8}
        y={4}
        width={224}
        height={94}
      />
      {Array.from({ length: series }, (_, i) => (
        <g
          key={i}
          className={i < Math.ceil(series / 2) ? styles.win : styles.remaining}
          data-series-game
        >
          <rect x={120 - (series * 28 - 6) / 2 + i * 28} y="105" width="22" height="22" rx="6" />
          {i < Math.ceil(series / 2) && (
            <path d={`m${120 - (series * 28 - 6) / 2 + i * 28 + 5} 116 4 4 8-9`} />
          )}
        </g>
      ))}
    </svg>
  );
}

/** Example shot routes illustrate a school, rather than predicting a rally. */
const SCHOOL_PATHS: Record<Personality, readonly string[]> = {
  anchor: ['M208 70 31 70'],
  aggressor: ['M208 70 31 29', 'M208 70 31 113'],
  banker: ['M208 70 128 14 31 87'],
  curver: ['M208 70Q139 69 108 92T31 106'],
  disruptor: ['M208 70 31 102'],
  opportunist: ['M208 70 31 43', 'M208 70 31 96']
};

export function SchoolPreview({
  school,
  arena,
  paddleScales
}: {
  school: Personality;
  arena?: ArenaSpec | undefined;
  paddleScales?: PaddleScales | undefined;
}) {
  return (
    <svg
      className={styles.diagram}
      viewBox="0 0 240 144"
      aria-hidden="true"
      focusable="false"
      data-rule-preview="school"
      data-school={school}
    >
      <Board arena={arena} paddleScales={paddleScales} />
      <g className={styles.tactic}>
        {SCHOOL_PATHS[school].map((path, i) => (
          <path key={path} d={path} strokeDasharray={i ? '4 5' : undefined} />
        ))}
        <circle cx="208" cy="70" r="3" />
        {school === 'disruptor' && <path d="M24 60v42m-4-6 4 6 4-6" />}
        {school === 'anchor' && <circle cx="31" cy="70" r="7" />}
        {school === 'aggressor' && <path d="m200 59-7 6 7 6m-7-12-7 6 7 6" />}
      </g>
    </svg>
  );
}

export function ContractPreview({ rules }: { rules: Pick<MatchRules, 'modifiers' | 'winScore'> }) {
  const { playerPaddleScale, botPaddleScale, arena } = rules.modifiers;
  return (
    <svg
      className={styles.diagram}
      viewBox="0 0 240 144"
      aria-hidden="true"
      focusable="false"
      data-rule-preview="contract"
      data-win-score={rules.winScore}
    >
      <Board
        arena={arena}
        paddleScales={[playerPaddleScale, botPaddleScale]}
        x={8}
        y={4}
        width={224}
        height={94}
      />
      <g className={styles.scoreTarget}>
        {Array.from({ length: rules.winScore }, (_, i) => (
          <circle key={i} cx={155 - (rules.winScore - 1) * 5 + i * 10} cy="110" r="3" />
        ))}
        <text className={styles.counter} x="155" y="132">
          {t(rules.winScore)}
        </text>
      </g>
      <g className={styles.badge}>
        <rect x="13" y="112" width="54" height="24" rx="8" />
        <text x="40" y="128">
          {t(`${Math.round(playerPaddleScale * 100)}%`)}
        </text>
      </g>
    </svg>
  );
}
