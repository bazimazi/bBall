# bBall server

Identity, authoritative progression and cloud saves for bBall.

The game stays exactly what it was: a local simulation that runs at 120 Hz and
never waits for anything. This adds an account behind it, so a player's level,
build and records follow them to another device — and so the numbers that
matter cannot be edited in a browser console.

```bash
npm install            # from the repository root; the server is a workspace
cp server/.env.example server/.env
npm run server         # http://127.0.0.1:8787
npm run server:test
```

| Script                   | What it does                                |
| ------------------------ | ------------------------------------------- |
| `npm run server`         | Dev server with reload (`tsx watch`)        |
| `npm run server:build`   | Bundle to `server/dist/main.js`             |
| `npm run server:start`   | Run the bundle                              |
| `npm run server:migrate` | Bring the database up to the current schema |
| `npm run server:test`    | The whole suite, over an in-memory database |

## What the server owns

Exactly one thing, and it is the whole design: **the client is never the
authority for anything that can be gained.**

| Owned by the client                 | Owned by the server                          |
| ----------------------------------- | -------------------------------------------- |
| The simulation — physics, input, AI | XP, level, talent points                     |
| What happened in a match            | What that match was worth                    |
| Which talent the player wants       | Whether they can afford it                   |
| Cosmetic preferences                | Which cosmetics are unlocked                 |
| Menus and presentation              | Achievements, cup progress, lifetime records |

A match submission carries evidence — score, rally, returns, duration, what
the build did — and no rewards at all. The server re-derives the award from
the same pure functions the client uses to preview it.

## Architecture

```
shared/protocol.ts     the wire contract, imported by client and server alike
server/src/
  main.ts              process entry: config, migrate, listen, shut down
  app.ts               buildApp(deps) -> a Fastify instance that never binds a port
  config/env.ts        the only place process.env is read
  db/                  connection, pragmas, migration runner, the schema
  domain/              errors, the profile aggregate, anti-cheat, guest claims
  repositories/        SQL, one module per aggregate
  services/            auth, progression, sync, mail - where the rules live
    oauth/             one OIDC flow, and the providers as configuration
  http/                routes, plugins, zod schemas
  test/                the suite, including the full guest-to-two-devices run
```

Three rules hold the layers apart:

- **Routes do not contain rules.** A route parses, calls one service, and
  serialises. Anything it decides for itself is a rule that cannot be tested
  without HTTP.
- **Services do not contain SQL.** They open a transaction and call
  repositories, so the storage engine is one layer, not a hundred call sites.
- **The domain does not contain a database.** `domain/` is pure functions over
  plain objects, which is why the anti-cheat validator can be tested without a
  server and the progression rules can be shared with the client.

### The shared domain model

The server does not re-implement progression. It loads its rows into the
client's own `PlayerProfile` shape and runs the client's own pure functions —
`applyMatchResult`, `buyTalent`, `reconcile`, `syncUnlocks` — from
`src/core/`.

That is the single most important decision here. A server whose rules were a
hand-copied approximation of the client's would start rejecting honest matches
within a release or two, and every balance change would become a two-place
edit with a silent failure mode. Instead there is one XP curve, one talent
tree and one achievement list in the repository, and both sides read it.

The production build bundles with esbuild precisely so that this cross-
directory import needs no package boundary.

## Authentication

- **Passwords**: scrypt (OWASP's floor: N=2^14, r=8, p=1), per-password salt,
  parameters stored beside the digest so they can be raised later. Successful
  sign-in re-hashes anything made with weaker parameters. An unknown address
  still burns a comparable amount of CPU, so the endpoint cannot be timed.
- **Access tokens**: short-lived compact JWS (HS256), verified without a
  database read, then checked against the session row so revocation is
  immediate rather than eventual.
- **Refresh tokens**: opaque, stored only as a SHA-256, single use. Rotation
  links each token to its successor; presenting a spent one revokes the whole
  family, on the reasoning that a copy is loose and there is no way to tell
  whose. Delivered as an httpOnly cookie, and in the body for clients that
  have no cookie jar.
- **Enumeration**: wrong password, unknown address, disabled account and
  deleted account all produce the same `INVALID_CREDENTIALS`. Password reset
  answers `202` whether or not the address exists.
- **After a password change or reset**, every other session is revoked — that
  is the action someone takes when they think their account is not theirs any
  more.

## Social sign-in

Google and Apple ship configured-but-off: a provider appears in the game only
when its credentials are present, so turning one on is an environment change
rather than a release, and a half-configured provider can never show a button
that does not work. `GET /v1/auth/oauth/providers` is what the client draws
its buttons from.

The flow is the authorization code flow with PKCE, and it is the same code for
every provider — `createOidcProvider` in `services/oauth/oidc.ts`. Google and
Apple differ in four URLs, a scope string, and how the client authenticates at
the token endpoint. Adding Microsoft, Discord or a corporate IdP is another
config object in `providers.ts` and a line in the registry; there is no second
flow to get wrong.

Two decisions worth knowing:

**Tokens never travel in a URL.** The provider redirects to the callback,
which redirects the browser home with a one-time _handoff code_; the game
exchanges that over POST for a session. A URL ends up in browser history, in a
screenshot and in whatever gets pasted into a bug report — and this also makes
the flow work identically whether or not cookies survived the round trip.

**An unverified address is never linked.** Account matching goes: a linked
`(provider, subject)` wins outright; otherwise an address the provider says it
has _verified_ may be linked to an existing account with that address;
otherwise a new account is created. An unverified address is refused with an
explanation. Skipping that check is the classic pre-hijack attack — register
at the provider with someone else's address, never confirm it, sign in as
them — and there is a test named after it.

The ID token is verified in full before any of that: signature against the
provider's published JWKS (algorithm taken from the key, so `alg: none` and
RS256/HS256 confusion have nowhere to land), then issuer, audience, expiry,
issued-at and nonce. `test/oauth.test.ts` signs tokens with generated keys and
checks each rejection individually.

Apple gets two accommodations it needs and nobody else does: its client secret
is a freshly minted ES256 assertion rather than a static string, and its
callback is a form POST carrying the player's name exactly once, on first
authorization, which is taken there or lost for good.

An account created this way has no password. It cannot be signed in to with
one, and deleting it asks only for confirmation, since there is no password to
re-enter and the live session is the whole proof available. A provider whose
account has no address at all gets a `@no-email.bball.invalid` placeholder —
`.invalid` is reserved by RFC 2606 and can never resolve.

### Callback URLs to register

```
<OAUTH_REDIRECT_BASE>/v1/auth/oauth/google/callback
<OAUTH_REDIRECT_BASE>/v1/auth/oauth/apple/callback
```

`OAUTH_REDIRECT_BASE` is the API's origin and defaults to `PUBLIC_APP_URL`,
which is correct for the usual deployment where the game and the API are
served together. See `.env.example` for where each credential comes from.

### Signing in from the packaged game

The desktop and mobile builds cannot host a provider in their own webview —
providers refuse to render in embedded webviews — so they open the system
browser and come back over a URL scheme. The client says which kind it is when
it starts the flow (`{ "client": "native" }`), that answer is stored on the
flow row, and the callback redirects to `NATIVE_RETURN_URL`
(`bball://oauth?...`) instead of `PUBLIC_APP_URL`.

Both addresses are configuration. The request picks between them and can never
supply one, which is the difference between a scheme handoff and an open
redirect. The shells' own origins — `tauri://localhost` and
`http://tauri.localhost` — are allowed by CORS unconditionally, since no web
page can send a request bearing them. See `docs/packaging.md`.

Both companies publish sign-in button guidelines covering mark, wording and
spacing. `ui/components/ProviderButton.tsx` follows their shape; a production
release should check the current guidelines rather than trust that comment.

## Anti-cheat

The client is untrusted and always will be. Nothing here tries to make it
unmodifiable — that is unwinnable, and chasing it produces false rejections
for honest players on bad connections. What it does is make the server's
numbers impossible to dictate.

Every submission is checked against the rules of the mode it claims to have
been played under, and against physics:

- Scorelines that never reached, or went past, the winning score.
- More returns than the ball could physically have crossed the court for.
- Wins claimed without out-scoring the opponent; shutouts that conceded.
- Endless against anything but the wall; the wall on the ranked ladder.
- A challenge against the wrong opponent, or one that does not exist.
- A cup round that has already been played, or a cup that is not running.
- Abilities fired by a build that does not own them, or more often than the
  cooldowns allow, with the caps taken from `resolveLoadout` so a deeper build
  is allowed more without a number being duplicated.
- More play submitted in an hour than an hour contains.

Duplicates are handled at three levels: the `clientMatchId` unique index, the
applied-operation log, and whole-response idempotency keyed by the caller's
`Idempotency-Key`. Retrying a lost request is always safe.

Everything is shaped so that a server-authoritative simulation could be added
later without moving anything else.

## Local and cloud

The local save is not a fallback; it is where the game reads from. The cloud
is what makes it survive a lost phone.

- **Guest** — everything on the device, no account, no network. The game makes
  no requests at all.
- **Guest becoming an account** — the local save is offered once, validated
  with the client's own repair pass, clamped against its own evidence, and
  merged. Nothing is ever subtracted.
- **Signed in and online** — the server is authoritative; the local copy is a
  cache under that account's own key. The guest save is parked, not destroyed,
  and comes back untouched on sign out.
- **Signed in and offline** — play continues against the cache, every change
  goes into a durable outbox, and `/v1/sync/push` drains it on reconnect.
  Operations carry client-generated ids and apply at most once.

A push is a batch with per-item results rather than an all-or-nothing
transaction: a queue assembled offline will legitimately contain operations
that have gone stale, and refusing the batch over one of them would strand
every match behind it.

### Claiming a guest save

This is the one place the server keeps a number it cannot derive: a guest has
been playing offline, so there are no match records to recompute from. Either
the progress is imported on trust or it is thrown away — and throwing it away
at the exact moment someone is being asked to make an account is a reason
never to make one.

So it is imported, as far as its own evidence supports it. Statistics are
clamped against each other and against time; XP is capped at the most the
save's own match record could have paid, using the real reward ceilings;
talent points, levels and unlocks are re-derived rather than copied. A player
who played honestly keeps everything. A player who edited localStorage keeps
what a real player with the same match record would have had.

## API

Everything is under `/v1`. Full request and response types are in
`shared/protocol.ts`.

| Method   | Path                                     | What it does                                        |
| -------- | ---------------------------------------- | --------------------------------------------------- |
| POST     | `/auth/register`                         | Create an account, optionally claiming a guest save |
| POST     | `/auth/login`                            | Sign in                                             |
| GET      | `/auth/oauth/providers`                  | Which social sign-ins are configured                |
| POST     | `/auth/oauth/:provider/start`            | Begin a social sign-in                              |
| GET/POST | `/auth/oauth/:provider/callback`         | Where the provider returns                          |
| POST     | `/auth/oauth/complete`                   | Exchange the handoff code for a session             |
| POST     | `/auth/refresh`                          | Rotate the session                                  |
| POST     | `/auth/logout`, `/auth/logout-all`       | End this session, or all of them                    |
| POST     | `/auth/verify-email/request\|confirm`    | Email confirmation                                  |
| POST     | `/auth/password/forgot\|reset\|change`   | Password lifecycle                                  |
| GET      | `/me`                                    | The account and its profile                         |
| DELETE   | `/me`                                    | Delete the account, password required               |
| PATCH    | `/profile`                               | Name, avatar, cosmetics, preferences                |
| POST     | `/progression/match`                     | One finished match, one transaction                 |
| POST     | `/progression/talents/purchase\|respec`  | Spend or refund points                              |
| POST     | `/progression/abilities/equip`           | Slot an active skill                                |
| POST     | `/progression/cosmetics/equip`           | Equip an unlocked cosmetic                          |
| POST     | `/progression/tournament/start\|abandon` | Cup lifecycle                                       |
| POST     | `/progression/claim`                     | Grant anything already earned                       |
| GET      | `/sync/pull`                             | The server's copy                                   |
| POST     | `/sync/push`                             | Drain an offline queue                              |
| POST     | `/sync/claim`                            | Import a guest save                                 |
| GET      | `/config`, `/config/talents`             | Catalogues and balance, with a version              |
| GET      | `/health`, `/health/live`                | Readiness and liveness                              |

The grain is chosen around what the game does. Recording a match is one call
carrying the whole post-match batch — stats, XP, level, points, achievements,
unlocks and cup progress land in a single transaction — because the
alternative would put several round trips between the last point and the
result card. Menu actions are small calls because that is how a player
performs them. Nothing here runs during a rally.

## Database

SQLite, with WAL, foreign keys on, and a busy timeout. A single-writer
embedded database is the simplest thing that still gives real transactions,
real constraints and real crash safety, for a game whose write volume is one
row per finished match. Everything above talks to repositories, so Postgres
later is a driver rather than a rewrite.

Migrations live in `src/db/migrations.ts` as ordered SQL, applied once each
inside a transaction and recorded with a checksum. Editing an applied
migration is a startup error; the fix is always a new one.

The schema is normalised rather than a JSON blob: talent ranks, achievements,
unlocks, challenge records, per-mode statistics, cup runs, matches and the
progression event log are all their own tables with their own keys, which is
what lets a leaderboard or a season be a query instead of a migration. A
partial unique index enforces one live cup per player. Every child row
cascades from `users`, so deleting an account really deletes it.

`profiles.version` is an optimistic lock: every accepted write increments it,
and a client can send the version it was looking at to have a stale write
refused rather than applied to state it never saw.

### Backups

The database is one file, so a backup is a copy — but not with `cp`, which can
catch a torn page mid-write. Use SQLite's own online backup:

```bash
sqlite3 ./data/bball.db ".backup '/backups/bball-$(date +%F).db'"
```

Restoring is putting the file back and starting the server, which migrates on
boot. Point-in-time recovery beyond that would mean a different database, and
this one is sized for a game where a day's loss is a day's matches.

## Configuration

Everything is read once, at startup, by `config/env.ts`; nothing else touches
`process.env`. See `.env.example` for the full list. Two rules:

- No secret and no connection string has a production default. A missing or
  short `AUTH_SECRET` in production is a startup failure. In development a
  throwaway key is generated in memory, so a fresh clone runs immediately and
  no default secret has ever been shipped.
- Defaults differ per environment in one place rather than being overridden at
  call sites, so "what does production do" is answerable from that file alone.

`CORS_ORIGINS` is an allowlist. It is never `*` and never reflects the
caller's own origin — with credentials enabled, the first is forbidden by the
specification and the second is the same hole with extra steps.

Production also gets HSTS, a strict CSP (this server returns JSON; it never
needs to load anything), `no-referrer`, and no framing. Rate limits come in
two budgets: a general one sized for a client that syncs after each match, and
a much tighter one on `/v1/auth`, counted per account when there is one and
per address when there is not.

## Logging

Structured, with `authorization`, `cookie`, `set-cookie` and every password
and token field redacted, because a log line is the easiest place in a system
to leak a credential. Every response carries an `x-request-id` a player can
quote. Error bodies contain only what is safe to show them; the operator-
facing detail goes to the log and never to the wire.

## Testing

```bash
npm run server:test
```

181 tests over an in-memory database, driven through `app.inject()` — real
routing, real plugins, real middleware, real SQLite, no sockets. Nothing below
the HTTP boundary is mocked.

| Suite                 | What it covers                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `auth.test.ts`        | Registration, sign-in, rotation, reuse detection, expiry, verification, reset, deletion, authorization, rate limits |
| `oauth.test.ts`       | The whole social flow against a stand-in provider, plus ID token verification with generated keys                   |
| `progression.test.ts` | XP, levels, talents, cosmetics, cups, duplicates, idempotency, version conflicts                                    |
| `antiCheat.test.ts`   | Every rejection rule — and that honest matches still pass                                                           |
| `sync.test.ts`        | Claiming, merging, clamping, pushing, pulling                                                                       |
| `concurrency.test.ts` | Ten matches at once, double-submitted matches, racing purchases                                                     |
| `database.test.ts`    | Migrations, checksums, rollback, constraints, cascades, health                                                      |
| `journey.test.ts`     | The whole flow, with the real client modules                                                                        |

`journey.test.ts` is the one worth reading. It installs a fake browser —
localStorage as a Map, `fetch` routed at `app.inject` with a cookie jar, a
network switch — and then runs the _actual_ client code: the real profile
store, the real outbox, the real fetch wrapper with its retries and token
refresh. Guest play, account creation with a claim, online sync, offline play,
a simulated restart, reconnection, a second device, and sign-out restoring the
guest save. It is the test that would catch the client and the server each
being correct while disagreeing with each other.

## Deploying

```bash
npm ci
npm run server:build
npm run server:migrate     # once, before any instance starts
NODE_ENV=production AUTH_SECRET=... DATABASE_FILE=/var/lib/bball/bball.db \
  node server/dist/main.js
```

Serve it behind TLS. Behind a proxy, set `TRUST_PROXY=true` — and only there,
since a client can otherwise forge its own address and escape rate limiting.
Put `DATABASE_FILE` on a volume that is actually backed up. `SIGTERM` drains
in-flight requests before exiting, so a deploy cannot cut a match submission
in half.

## Extension points

The shape was chosen with these in mind, and each is a feature rather than a
restructuring:

- **Leaderboards** — `profiles(xp DESC)` is already indexed; per-mode
  statistics are already their own table.
- **Friends and social** — `auth_identities` and `profiles` are separate, so a
  relationship table joins to `users` without touching progression.
- **Seasons** — `progression_events` and `matches` are both time-ordered with
  sortable primary keys, so a season is a window over them.
- **Multiplayer and matchmaking** — a match already arrives as one validated
  submission; a server-authoritative result would arrive at the same service
  from a different producer.
- **Cross-device** — already here.
