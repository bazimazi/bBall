import {
  ACCENTS,
  ARENAS,
  BALLS,
  DEFAULT_EQUIPPED,
  PADDLES,
  TRAILS,
  type AccentCosmetic,
  type ArenaAmbient,
  type ArenaCosmetic,
  type BallCosmetic,
  type BallStyle,
  type Equipped,
  type PaddleCosmetic,
  type PaddleStyle,
  type TrailCosmetic,
  type TrailStyle
} from './catalog';

/**
 * A flat, pre-resolved bag of numbers and colour strings for the renderer.
 *
 * Resolving happens once, when the player equips something - the draw loop
 * only ever reads fields, so cosmetics cost nothing per frame.
 */
export interface ResolvedTheme {
  /** The player's hue. The bot keeps its own so the two sides stay readable. */
  youHue: number;
  botHue: number;
  hotHue: number;
  bgHue: number;

  courtTop: string;
  courtBottom: string;
  lineAlpha: number;
  dash: readonly [number, number];
  /** Strength of the rippling floor grid. */
  gridAlpha: number;
  /** What lives on the arena's floor. */
  ambient: ArenaAmbient;

  ballFill: string;
  ballGlow: number;
  ballRing: number;
  ballStyle: BallStyle;

  paddleRound: number;
  paddleGlow: number;
  paddleStyle: PaddleStyle;
  paddleEngraving: number;

  trailAlpha: number;
  trailWidth: number;
  trailStyle: TrailStyle;

  /** CSS colour for the player's accent, mirrored into the React chrome. */
  accentCss: string;
}

const BOT_HUE = 342;
const HOT_HUE = 34;

function pick<T extends { id: string }>(list: readonly T[], id: string, fallbackId: string): T {
  return (
    list.find((item) => item.id === id) ?? list.find((item) => item.id === fallbackId) ?? list[0]!
  );
}

export function resolveTheme(equipped: Equipped): ResolvedTheme {
  const accent = pick<AccentCosmetic>(ACCENTS, equipped.accent, DEFAULT_EQUIPPED.accent);
  const ball = pick<BallCosmetic>(BALLS, equipped.ball, DEFAULT_EQUIPPED.ball);
  const paddle = pick<PaddleCosmetic>(PADDLES, equipped.paddle, DEFAULT_EQUIPPED.paddle);
  const trail = pick<TrailCosmetic>(TRAILS, equipped.trail, DEFAULT_EQUIPPED.trail);
  const arena = pick<ArenaCosmetic>(ARENAS, equipped.arena, DEFAULT_EQUIPPED.arena);

  // Keep the two sides apart on the colour wheel, whatever accent is chosen.
  const separation = Math.abs(((accent.hue - BOT_HUE + 540) % 360) - 180);
  const botHue = separation > 45 ? BOT_HUE : (accent.hue + 165) % 360;

  return {
    youHue: accent.hue,
    botHue,
    hotHue: HOT_HUE,
    bgHue: arena.bgHue,
    courtTop: arena.courtTop,
    courtBottom: arena.courtBottom,
    lineAlpha: arena.lineAlpha,
    dash: arena.dash,
    gridAlpha: arena.grid,
    ambient: arena.ambient,
    ballFill: ball.fill,
    ballGlow: ball.glow,
    ballRing: ball.ring,
    ballStyle: ball.style,
    paddleRound: paddle.round,
    paddleGlow: paddle.glow,
    paddleStyle: paddle.style,
    paddleEngraving: paddle.engraving ?? 0,
    trailAlpha: trail.alpha,
    trailWidth: trail.width,
    trailStyle: trail.style,
    accentCss: accent.css
  };
}

export const DEFAULT_THEME: ResolvedTheme = resolveTheme({ ...DEFAULT_EQUIPPED });
