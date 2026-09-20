/** The five selectable opponents, plus the endless-mode wall. */
export type BotLevelId = 'rookie' | 'amateur' | 'pro' | 'elite' | 'legend' | 'wall';

/**
 * A bot is described by how it *behaves*, never by what it is allowed to
 * cheat at. Every field below maps onto something a human player also has:
 * how fast they notice, how well they read a bounce, how tidily they move.
 *
 * All values are 0..1 unless noted.
 */
export interface BotProfile {
  readonly id: BotLevelId;
  readonly name: string;
  /** One line the UI can show under the name. */
  readonly blurb: string;
  /** Rank 1..5, used for sorting and for "beat a stronger bot" goals. */
  readonly rank: number;
  /** Scales the XP a ranked match against this bot is worth. */
  readonly xpFactor: number;

  /** Seconds before the bot commits to a read, at ordinary ball speed. */
  readonly reaction: number;
  /** How well wall bounces are predicted. 0 reads a straight line only. */
  readonly prediction: number;
  /** Half-spread of the aim error, in field units, at ordinary ball speed. */
  readonly aimError: number;
  /** Paddle travel speed, in field units per second. */
  readonly speed: number;
  /** Field units of slack before the bot bothers to correct its position. */
  readonly deadzone: number;
  /** Chance of a clean read. The rest of the time the bot misjudges. */
  readonly consistency: number;
  /** How purposefully it returns to a useful resting position. */
  readonly recovery: number;
  /** How much it aims returns away from the player's paddle. */
  readonly placement: number;
  /** Resistance to fast balls: 1 barely degrades, 0 falls apart. */
  readonly pressure: number;
  /**
   * Endless mode only. A small amount of extra reach so the wall keeps the
   * rally alive; competitive bots always leave this at 0.
   */
  readonly assist: number;
}
