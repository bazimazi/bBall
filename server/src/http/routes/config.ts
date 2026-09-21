/**
 * /v1/config - the game's data, served from the authority that enforces it.
 *
 * The client ships with its own copy of every catalogue, which is what makes
 * the game playable offline and instant on first load. These endpoints are
 * not a replacement for that; they exist so a client can *notice* that the
 * server is running different numbers, and so tooling (a balance sheet, a
 * wiki, a future web dashboard) has one place to read the truth from.
 *
 * `configVersion` is a hash of everything returned. A client that sees a
 * version it does not recognise knows its local copy may be stale; there is
 * no need to diff the payloads to find out.
 *
 * Responses are cacheable, and deliberately public: none of this is
 * per-player, and none of it is secret.
 */

import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

import { ACHIEVEMENTS } from '../../../../src/core/achievements/catalog';
import { BALANCE } from '../../../../src/core/balance/config';
import { BOT_LEVELS } from '../../../../src/core/bots/levels';
import { COSMETICS } from '../../../../src/core/cosmetics/catalog';
import { MODES } from '../../../../src/core/modes/catalog';
import { CHALLENGES } from '../../../../src/core/modes/challenges';
import { ABILITY_DEFS } from '../../../../src/core/talents/abilities';
import { TALENT_BRANCHES, TALENTS } from '../../../../src/core/talents/catalog';
import { TOURNAMENT_ROUNDS, TOURNAMENT_TIERS } from '../../../../src/core/tournament/bracket';
import { PROTOCOL_VERSION, type GameConfigResponse } from '../../../../shared/protocol';
import type { ServiceContext } from '../../services/context';

/** Catalogue entries carry functions; only their data crosses the wire. */
const talentData = TALENTS.map((talent) => ({
  id: talent.id,
  branch: talent.branch,
  name: talent.name,
  blurb: talent.blurb,
  maxRank: talent.maxRank,
  costs: talent.costs,
  tier: talent.tier,
  column: talent.column,
  requires: talent.requires,
  ability: talent.ability ?? null,
  ranks: Array.from({ length: talent.maxRank }, (_, index) => talent.rankText(index + 1))
}));

const abilityData = ABILITY_DEFS.map((ability) => ({
  id: ability.id,
  name: ability.name,
  blurb: ability.blurb,
  talent: ability.talent,
  ultimate: ability.ultimate ?? false,
  hue: ability.hue
}));

const achievementData = ACHIEVEMENTS.map((achievement) => ({
  id: achievement.id,
  name: achievement.name,
  description: achievement.description,
  group: achievement.group,
  xp: achievement.xp
}));

const gamePayload = {
  balance: BALANCE,
  bots: BOT_LEVELS,
  modes: MODES,
  challenges: CHALLENGES,
  tournaments: { tiers: TOURNAMENT_TIERS, rounds: TOURNAMENT_ROUNDS },
  cosmetics: COSMETICS,
  achievements: achievementData
};

const talentPayload = { branches: TALENT_BRANCHES, talents: talentData, abilities: abilityData };

/**
 * One version over both payloads.
 *
 * Deriving it rather than maintaining it by hand is the point: a balance
 * change cannot ship with a stale version number, because there is no version
 * number to forget to bump.
 */
export const CONFIG_VERSION = createHash('sha256')
  .update(JSON.stringify(gamePayload))
  .update(JSON.stringify(talentPayload))
  .digest('hex')
  .slice(0, 16);

export function registerConfigRoutes(app: FastifyInstance, context: ServiceContext): void {
  app.get('/v1/config', async (_request, reply) => {
    const payload: GameConfigResponse = {
      configVersion: CONFIG_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      serverTime: context.now(),
      ...gamePayload
    };
    return reply.header('cache-control', 'public, max-age=300').send(payload);
  });

  app.get('/v1/config/talents', async (_request, reply) => {
    return reply
      .header('cache-control', 'public, max-age=300')
      .send({ configVersion: CONFIG_VERSION, ...talentPayload });
  });
}
