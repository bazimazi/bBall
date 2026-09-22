/**
 * /v1/auth/oauth - social sign-in.
 *
 * Four endpoints, and the shape is chosen for a browser game that is a single
 * page with no router:
 *
 * - `GET  /providers`          what this deployment offers, so the buttons are data
 * - `POST /:provider/start`    returns the URL to send the browser to
 * - `GET|POST /:provider/callback`  where the provider comes back; redirects home
 * - `POST /complete`           exchanges the handoff code for a session
 *
 * The callback redirects rather than responding, because the browser arrives
 * there by navigation and a JSON body would simply be rendered as text. It
 * carries a one-time code in the URL and never a token: a URL ends up in
 * history, in a screenshot, and in whatever gets pasted into a bug report.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type {
  OAuthCompleteResponse,
  OAuthProvidersResponse,
  OAuthStartResponse
} from '../../../../shared/protocol';
import { isAppError } from '../../domain/errors';
import { toCloudProfile } from '../../domain/profile';
import { loadProfile } from '../../repositories/profiles';
import { toUserDto } from '../../services/auth';
import type { ServiceContext } from '../../services/context';
import { completeCallback, redeemHandoff, startOAuth } from '../../services/oauth/service';
import type { OAuthClient } from '../../repositories/oauth';
import { flowClient } from '../../repositories/oauth';
import { oauthCompleteSchema, oauthProviderParamSchema, oauthStartSchema } from '../schemas';
import { parse } from '../validate';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH, requestMeta } from '../plugins/auth';
import { authRateLimit } from '../plugins/security';

/**
 * Where the game is sent back to, with the outcome on the hash.
 *
 * A browser goes to the game's own URL. A packaged build goes to its URL
 * scheme, because the sign-in happened in the system browser and the answer
 * has to cross back into the app; the operating system hands `bball://...`
 * to the running game, which turns it into the same hash route the web build
 * reads. Both targets come from configuration - the request only ever picks
 * between them.
 */
function returnUrl(
  context: ServiceContext,
  client: OAuthClient,
  params: Record<string, string>
): string {
  const query = new URLSearchParams(params).toString();
  if (client === 'native') return `${context.config.http.nativeReturnUrl}?${query}`;
  return `${context.config.http.publicAppUrl}/#/oauth?${query}`;
}

export function registerOAuthRoutes(app: FastifyInstance, context: ServiceContext): void {
  const limited = authRateLimit(context.config);
  const ttl = context.config.auth.refreshTtlSeconds;

  app.get('/v1/auth/oauth/providers', async (_request, reply) => {
    const payload: OAuthProvidersResponse = { providers: context.oauth.list() };
    // Not per-player and not secret, but it does change with configuration,
    // so a short cache rather than a long one.
    return reply.header('cache-control', 'public, max-age=60').send(payload);
  });

  app.post('/v1/auth/oauth/:provider/start', { config: limited }, async (request, reply) => {
    const { provider } = parse(oauthProviderParamSchema, request.params);
    const { client } = parse(oauthStartSchema, request.body ?? {});
    const started = startOAuth(context, context.oauth, provider, client);

    const payload: OAuthStartResponse = {
      authorizeUrl: started.authorizeUrl,
      state: started.state,
      expiresAt: started.expiresAt
    };
    return reply.send(payload);
  });

  /**
   * The provider's return leg.
   *
   * Registered for both verbs because Apple posts a form when name or email
   * are requested and everyone else redirects with a query string.
   */
  const callback = async (request: FastifyRequest, reply: FastifyReply) => {
    const { provider } = parse(oauthProviderParamSchema, request.params);
    const fields = {
      ...((request.query ?? {}) as Record<string, string>),
      ...((request.body ?? {}) as Record<string, string>)
    };

    // A player who presses "cancel" at the provider is not an error worth a
    // stack trace; they are simply back where they started.
    const state = typeof fields.state === 'string' ? fields.state : '';
    // Read before the flow is spent, because every branch below needs to know
    // which of the two return addresses this player can actually be reached
    // at - including the ones that never get as far as consuming the flow.
    const client = state ? flowClient(context.db, state) : 'web';

    if (typeof fields.error === 'string') {
      context.log.info({ provider, error: fields.error }, 'oauth: provider returned an error');
      return reply.redirect(returnUrl(context, client, { status: 'cancelled', provider }));
    }

    const code = typeof fields.code === 'string' ? fields.code : '';
    if (!state || !code) {
      return reply.redirect(returnUrl(context, client, { status: 'failed', provider }));
    }

    try {
      const result = await completeCallback(context, context.oauth, {
        providerId: provider,
        state,
        code,
        formFields: fields
      });
      return reply.redirect(
        returnUrl(context, result.client, { status: 'ok', provider, code: result.handoffCode })
      );
    } catch (error) {
      // The player is mid-navigation, so they get sent home with a reason
      // rather than an error document they cannot act on.
      const message = isAppError(error) ? error.message : 'That sign-in did not complete.';
      context.log.warn(
        { provider, err: isAppError(error) ? error.internal : error },
        'oauth: callback failed'
      );
      return reply.redirect(
        returnUrl(context, client, { status: 'failed', provider, reason: message })
      );
    }
  };

  app.get('/v1/auth/oauth/:provider/callback', { config: limited }, callback);
  app.post('/v1/auth/oauth/:provider/callback', { config: limited }, callback);

  app.post('/v1/auth/oauth/complete', { config: limited }, async (request, reply) => {
    const input = parse(oauthCompleteSchema, request.body);
    const result = redeemHandoff(context, input.code, requestMeta(request), input.claim);

    const profile = loadProfile(context.db, result.user.id);
    if (!profile) throw new Error('profile missing after social sign-in');

    void reply.setCookie(REFRESH_COOKIE, result.tokens.refreshToken, {
      httpOnly: true,
      secure: context.config.http.cookieSecure,
      sameSite: context.config.http.cookieSameSite,
      path: REFRESH_COOKIE_PATH,
      maxAge: ttl,
      ...(context.config.http.cookieDomain ? { domain: context.config.http.cookieDomain } : {})
    });

    const payload: OAuthCompleteResponse = {
      user: toUserDto(context.db, result.user),
      tokens: result.tokens,
      profile: toCloudProfile(profile),
      provider: result.provider,
      created: result.created,
      ...(result.claimed ? { claim: result.claimed } : {})
    };
    return reply.send(payload);
  });
}
