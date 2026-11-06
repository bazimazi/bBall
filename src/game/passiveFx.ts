import { branchById, talentById } from '../core/talents/catalog';
import type { TalentId } from '../core/talents/types';
import { BALL_R, FIELD_H, MAX_BOUNCE_ANGLE, PADDLE_W } from './constants';
import { sideHue } from './palette';
import type { World } from './world';

/**
 * What a passive talent looks like when it pays out.
 *
 * Skills announce themselves because the player pressed a button; a passive
 * has no button, so without this it changes a rally and leaves no trace. The
 * rule is the same one the skills follow: the mark goes where the talent
 * acted - the contact, the wall, the line, the paddle - in that talent's own
 * branch colour, and a word rises off it naming which talent it was.
 *
 * Presentation only. Nothing here touches the ball, a timer or the gameplay
 * random stream, and everything is raised for the human player's side alone:
 * the runtime that calls in here is shared with the opponent.
 */

const HUES = new Map<TalentId, number>();

/** A talent's colour: its branch's, the one its tile and its HUD chip wear. */
export function talentHue(id: TalentId): number {
  let hue = HUES.get(id);
  if (hue === undefined) {
    const def = talentById(id);
    hue = def ? branchById(def.branch).hue : 150;
    HUES.set(id, hue);
  }
  return hue;
}

/** The colour a critical return flares in - the same gold its sparks always had. */
export const CRIT_HUE = 48;

/** True when `world` is the human player's own side in a match that shows a build. */
function own(world: World): boolean {
  return world.player.side === 'you' && world.match.status !== 'menu' && !world.rules.versus;
}

/**
 * The word a passive puts on the court. Talent names wherever they are
 * short enough to read mid-rally; the two that are not get a short word.
 */
const LABELS: Partial<Record<TalentId, string>> = {
  'critical-strike': 'CRIT',
  'edge-pressure': 'EDGE CRIT',
  'blink-strike': 'BLINK STRIKE',
  'hot-hand': 'HOT HAND',
  counterstrike: 'COUNTERSTRIKE',
  momentum: 'MOMENTUM'
};

/** The word for the passive that charged or crit a return, if one did. */
export function returnLabel(source: TalentId | null): string | null {
  return source ? (LABELS[source] ?? null) : null;
}

interface ReturnFacts {
  readonly crit: boolean;
  readonly overloaded: boolean;
  readonly source: TalentId | null;
  readonly grew: boolean;
  readonly banked: boolean;
  readonly flowed: boolean;
}

/**
 * Everything a player's return earned from the passive half of the build,
 * at the point of contact. Returns true when it named a talent, so the
 * caller can step its own technique word aside.
 */
export function returnFx(
  world: World,
  mods: ReturnFacts,
  x: number,
  y: number,
  angle: number
): boolean {
  if (!own(world)) return false;
  const { motion } = world;

  // Overload's four are criticals by definition and have a strike of their own.
  if (mods.crit && !mods.overloaded) {
    world.casts.spawn('crit', { x, y, hue: CRIT_HUE, life: 0.45, size: 52, dir: angle }, motion);
  }

  if (mods.grew) growFx(world, 'combo-drive');
  if (mods.flowed) {
    const hue = talentHue('flow-state');
    world.rings.spawn(world.player.x, world.player.y, hue, world.player.half + 40, 0.5, 3, 80);
    world.popups.spawn('FLOW STATE', world.player.x + 70, world.player.y - 40, hue, 17);
  }
  if (mods.banked) {
    const hue = talentHue('adrenaline');
    world.casts.spawn('recharge', { x: 0, y: FIELD_H / 2, hue, life: 0.6, size: FIELD_H }, motion);
    world.popups.spawn('SAVE BANKED', 70, world.player.y + 40, hue, 16);
  }

  const label = returnLabel(mods.source);
  if (!label || !mods.source) return false;
  world.popups.spawn(
    label,
    x,
    y,
    talentHue(mods.source),
    mods.source === 'critical-strike' ? 18 : 17
  );
  return true;
}

/**
 * A return Precision (or Flow State) sent wider than a plain paddle ever
 * could: the plain range is ghosted in and the extra wedge lit, so the
 * angle that talent bought is the thing on screen.
 */
export function wideFx(world: World, x: number, y: number, angle: number, by: TalentId): void {
  if (!own(world) || Math.abs(angle) <= MAX_BOUNCE_ANGLE + 0.01) return;
  world.casts.spawn(
    'fan',
    { x, y, hue: talentHue(by), life: 0.42, size: 96, dir: angle },
    world.motion
  );
}

/** Bank Shot steepening a player's return off a wall: a spark, and the line it left on. */
export function bankFx(world: World): void {
  if (!own(world)) return;
  const { ball } = world;
  const wallY = ball.vy > 0 ? BALL_R : FIELD_H - BALL_R;
  world.casts.spawn(
    'bank',
    {
      x: ball.x,
      y: wallY,
      hue: talentHue('bank-shot'),
      life: 0.4,
      size: 64,
      dir: Math.atan2(ball.vy, ball.vx)
    },
    world.motion
  );
}

/** Swerve's late break, the instant it happens: a hook bent the way the ball went. */
export function swerveFx(world: World, side: -1 | 1): void {
  if (!own(world)) return;
  const { ball } = world;
  world.casts.spawn(
    'swerve',
    {
      x: ball.x,
      y: ball.y,
      hue: talentHue('swerve'),
      life: 0.42,
      size: 34 * side,
      dir: Math.atan2(ball.vy, ball.vx)
    },
    world.motion
  );
}

/** Bastion walling a corner: that stretch of the line flares, and says so. */
export function bastionFx(world: World, y: number): void {
  if (!own(world)) return;
  const reach = world.loadout.effects.bastion + BALL_R;
  const top = y < FIELD_H / 2;
  const hue = talentHue('bastion');
  world.casts.spawn(
    'corner',
    { x: 0, y: top ? 0 : FIELD_H, hue, life: 0.55, size: reach, dir: top ? 1 : -1 },
    world.motion
  );
  world.popups.spawn('BASTION', 70, top ? reach + 20 : FIELD_H - reach - 20, hue, 17);
}

/**
 * A Shield charge or Adrenaline's banked save catching a ball at the line.
 * Counterstrike turning it straight back is named instead of the save.
 */
export function saveFx(
  world: World,
  y: number,
  kind: 'shield' | 'adrenaline',
  countered: boolean
): void {
  if (!own(world)) return;
  const hue = kind === 'shield' ? sideHue(world.theme, 'you') : talentHue('adrenaline');
  world.casts.spawn('save', { x: 0, y, hue, life: 0.55, size: 70 }, world.motion);
  const word = countered ? 'COUNTERSTRIKE' : kind === 'shield' ? 'SHIELD' : 'ADRENALINE';
  world.popups.spawn(word, 70, y, countered ? talentHue('counterstrike') : hue, 18);
}

/** A Shield charge coming back: the wall settles in along the whole line. */
export function rechargeFx(world: World): void {
  if (!own(world)) return;
  world.casts.spawn(
    'recharge',
    { x: 0, y: FIELD_H / 2, hue: sideHue(world.theme, 'you'), life: 0.7, size: FIELD_H },
    world.motion
  );
}

/** Second Chance handing a point back: a ring closing on the centre, and its name. */
export function refundFx(world: World): void {
  if (!own(world)) return;
  const hue = talentHue('second-chance');
  world.casts.spawn(
    'refund',
    { x: world.view.w / 2, y: FIELD_H / 2, hue, life: 0.8, size: 180 },
    world.motion
  );
  world.popups.spawn('SECOND CHANCE', world.view.w / 2, FIELD_H / 2 + 40, hue, 22);
}

/** The match turning into a last stand, for a build with Clutch. */
export function clutchFx(world: World): void {
  if (!own(world)) return;
  growFx(world, 'clutch');
  world.popups.spawn('CLUTCH', world.player.x + 80, world.player.y, talentHue('clutch'), 20);
}

/** Unbroken holding part of a drive through a conceded point. */
export function unbrokenFx(world: World, kept: number): void {
  if (!own(world) || kept <= 0) return;
  world.popups.spawn(
    'UNBROKEN',
    world.player.x + 80,
    world.player.y - 30,
    talentHue('unbroken'),
    17
  );
}

/** Afterglow lengthening the paddle the moment a skill is used. */
export function afterglowFx(world: World): void {
  if (!own(world)) return;
  growFx(world, 'afterglow');
}

/** The paddle's two ends flaring outwards: it just got longer, and this is why. */
function growFx(world: World, by: TalentId): void {
  const { player } = world;
  world.casts.spawn(
    'grow',
    {
      x: player.x,
      y: player.y,
      hue: talentHue(by),
      life: 0.5,
      size: player.half,
      dir: PADDLE_W
    },
    world.motion
  );
}
