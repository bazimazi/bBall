# bBall

A fast, minimal bouncing-ball duel. Drag to move your paddle, keep the ball
alive, and take the points off the bot before it takes them off you.

Built with Vite, React and TypeScript. No game assets — every pixel is drawn on
a canvas and every sound is synthesised. No runtime dependencies beyond React.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script              | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Vite dev server with hot reload               |
| `npm run build`     | Type-check the project, then build to `dist/` |
| `npm run preview`   | Serve the production build locally            |
| `npm run typecheck` | Type-check without emitting                   |
| `npm run lint`      | ESLint over the whole project                 |
| `npm run format`    | Prettier write                                |

## Playing

| Input               | Action                                                                 |
| ------------------- | ---------------------------------------------------------------------- |
| Drag / move pointer | Move your paddle (anywhere on screen — the paddle mirrors your finger) |
| `↑` `↓` or `W` `S`  | Move your paddle                                                       |
| Tap / `Space`       | Serve immediately instead of waiting                                   |
| `1` `2` `3` `4` or `Q` `E` `R` `F` | Use the ability in that slot (or tap the buttons in the corner) |
| `Esc` or `P`        | Pause                                                                  |
| `M`                 | Mute                                                                   |

Your paddle is the aqua one (or whatever colour you equip); the bot's is rose.
The dots beside each end count that side's points. The faint number in the
middle of the court is the current rally, and a long enough rally lights up a
streak banner. The ball speeds up with every hit and runs hotter the longer a
rally lasts, so rallies tend to end themselves.

### Modes

| Mode            | What it is                                                         |
| --------------- | ------------------------------------------------------------------ |
| **Quick Match** | The classic duel, first to five, against any of five bots          |
| **Endless**     | Three lives, one growing rally, a wall that barely misses          |
| **Challenge**   | Six short matches with a twist: small paddle, fast ball, 0-2 down… |
| **Tournament**  | Three rounds against progressively stronger bots, for a trophy     |
| **Practice**    | Any bot, nothing recorded, no XP                                   |

### Demo mode

Home screen → **Demo a level** takes a level typed into a number field (1 to
999) and drops you into the game as it is there: the talent points that level
has earned, its skill slots, its cup tiers and its cosmetics. Nothing a demo
does is kept — matches, XP, builds and cosmetic changes all live in memory
only, and **Exit** hands your real save back exactly as it was.

It works by parking the real profile and swapping in a throwaway one whose `xp`
sits at the chosen level (`core/profile/demo.ts`). Every screen, gate and mode
reads level from `xp` and nothing else, so none of them need to know a demo is
running; the profile store simply refuses to write to storage while one is.

### Bots

Five levels, from Rookie to Legend. Difficulty is behaviour, not cheating:
every bot moves slower than you can, sees only what the ball shows it, and
differs in reaction time, how well it reads a wall bounce, how tidily it moves,
how much it places its returns, and how quickly it comes apart when the ball is
fast or the rally is long. A return placed wide enough always scores.

### Progression

Matches, wins, rallies, challenges and cup rounds pay XP; XP levels you up.
Levels and achievements unlock cosmetics — colours, ball and paddle styles,
trails and arenas — which change nothing about how the game plays. Levels also
pay **one talent point each** up to level 50, which very much do. Practice pays
nothing, quitting pays nothing, and the award is halved after 25 ranked matches
in a day, so there is nothing worth farming.

Levelling itself has no cap — the curve just keeps going — but what a level
buys does: talent points stop at level 50 and paddle speed reaches its ceiling
at level 53. Past that a level is a record of how much you have played, never
an advantage over someone who has played less.

Three things are kept strictly apart, and the whole balance model rests on it:

> Difficulty makes the ball harder to handle. Progression makes your paddle
> more capable. Talents decide how you handle that difficulty.

A stronger opponent means a faster ball — never a slower paddle for you, and
never a secret nerf to something you earned. Your paddle speed comes from your
level and your build, and from nothing else. Every number behind all three
lives in `src/core/balance/config.ts`; nothing outside that file hard-codes a
speed, a cooldown or a cap.

### Talents

One point per level to level 50 — 49 in total — against 27 talents that cost 86
points to fill. A build is a set of choices, not a checklist. Five short
branches:

| Branch       | What it makes you                                                    | Ultimate       |
| ------------ | -------------------------------------------------------------------- | -------------- |
| **Power**    | Heavy returns: charged strikes, criticals, a ball that keeps climbing | **Overload**   |
| **Control**  | A faster, tidier paddle with wider deliberate angles                  | **Slipstream** |
| **Defense**  | Saves at your own line, steadier returns, a comeback in hand          | **Aegis**      |
| **Momentum** | Streaks that pay: drives, adrenaline, clutch, flow                    | **Zenith**     |
| **Mastery**  | Cooldowns, XP, and bonuses shaped by whatever else you picked         | **Echo**       |

Each branch ends in an **ultimate** on its bottom row — eight points of
commitment to reach, four more to buy. Twelve of your twenty-nine, for one
talent, which is the point: an ultimate is the reason a build goes deep rather
than wide. Two is the most any player can hold, and only by giving up almost
everything else.

| Ultimate       | What it does                                                            |
| -------------- | ----------------------------------------------------------------------- |
| **Overload**   | Your next four returns are charged, critical, and driven into a corner  |
| **Slipstream** | Seven seconds of a paddle that is longer *and* faster than any cap       |
| **Aegis**      | The next two balls to reach your line are saved for you                  |
| **Zenith**     | Peak form: full Flow, and once a match the point you drop is given back  |
| **Echo**       | Clears every other equipped skill's cooldown, then recharges them faster |

Each branch is a grid, and depth is bought with commitment rather than with
level: a row only opens once two points per row already sit in *that* branch,
so the bottom of a tree costs six points before you may spend the seventh.
Arrows run from a talent to whatever it unlocks. Points spent elsewhere never
open a row here, which is what stops a max-level player simply owning the
bottom of all five.

Eight talents unlock **active skills** — Power Strike, Dash and Perfect Guard,
plus the five ultimates — of which you equip two, three from level 15, four
from level 30 and five from level 50. Each has a cooldown, a ring on its button, and a distinct
reaction on the court. Everything else is passive. With more skills than slots,
which ones you carry is a decision in its own right.

Certain pairs turn into named **synergies** (Power Strike + Momentum, Quick
Hands + Dash, Perfect Guard + Stabilizer, Combo Drive + Adrenaline, Cooldown
Mastery + two actives). They are additive rewards for committing to an idea,
never a gate: every branch works on its own. Respec is free — one branch at a
time from its own panel, or the lot from the footer — because a build is meant
to be tried rather than regretted.

Three rules keep builds from collapsing the game. Every multiplier a build can
stack is capped once, in the balance config, so no combination escapes the
ranges the simulation is tested against. The pace a Power build *adds* mostly
bleeds off when the opponent returns the ball — otherwise the extra speed comes
straight back at the player who chose it, and the aggressive build is a trap
rather than a style. And every ultimate is bounded by a count as well as a
clock: four returns, two saves, one refunded point. A window on its own turned
out to be worth more than any four points should buy.

The profile — name, avatar, level, lifetime stats, achievements, unlocks, your
talent ranks, unspent points and equipped skills, the cup you are part-way
through — lives in `localStorage` under `bball.profile`, in a versioned
envelope (currently v2; v1 saves migrate and are handed the points their level
already earned). A save that is corrupt, half-written or from an older schema
is repaired field by field rather than thrown away; anything genuinely
unreadable is parked under `bball.profile.broken` and the game starts fresh.
Unspent points are never trusted from the file — they are recomputed from your
level and what you have spent, every time the profile is read.

## How it is built

```
src/
  main.tsx           React entry point
  game/              the simulation - no React, no DOM beyond the canvas
    engine.ts        main loop, input, and the store React subscribes to
    world.ts         all mutable state in one object
    simulation.ts    one fixed timestep
    physics.ts       ball, walls, swept paddle collisions
    ai.ts            bot behaviour: reaction, reads, placement, pressure
    talents.ts       the build at runtime: buffs, drives, shields, returns
    abilities.ts     what each active skill does to the world
    match.ts         serving, scoring, match lifecycle, results
    audio.ts         synthesised WebAudio blips
    view.ts          field <-> screen transform, canvas sizing
    particles.ts     fixed-size particle pool
    render/          canvas renderer
  core/              domain model - no React, no canvas
    balance/         every tuning number in the game, in one file
    bots/            difficulty profiles
    talents/         the tree, the actives, synergies, and resolving a build
    modes/           mode rules, modifiers, challenges, objectives
    tournament/      cup tiers and brackets
    progression/     XP curve, awards, applying a result to a profile
    achievements/    achievement catalogue
    cosmetics/       unlockables and the resolved canvas theme
    profile/         profile model, validation, migration, store, demo mode
    storage/         versioned localStorage envelope
  ui/                React components, CSS modules, hooks
  styles/global.css  design tokens and resets
```

The split is the point. `game/` is a plain TypeScript simulation driven by
`requestAnimationFrame`; `core/` is framework-free domain logic that never
touches the canvas; `ui/` is a React tree that sees neither directly. The engine
publishes a small immutable `GameSnapshot` and `useGameEngine` feeds it to React
through `useSyncExternalStore`, so a component re-renders only when something it
displays actually changed — never at 60 Hz. The profile store is the same shape:
a plain observable object the UI subscribes to.

A match flows one way: the UI hands the engine a `MatchRules`, the engine plays
it and publishes a `MatchResult` exactly once, and `applyMatchResult` folds that
result into a new profile. That function is pure, which is why XP, achievements,
unlocks and cup progress can be tested without a browser.

A few decisions worth knowing before changing things:

- **One orientation, internally.** The simulation always runs in a landscape
  "field" whose short axis is a fixed 600 units, so the game plays identically
  on every screen. A portrait viewport just rotates that field a quarter turn
  when drawing, which keeps a single physics path for all orientations. The
  field's length is clamped between 1.25:1 and 2.15:1 so no aspect ratio gets
  an unfair amount of reaction time.
- **Fixed timestep.** Physics advances in 1/120 s steps from an accumulator, so
  behaviour is identical at 30, 60, or 144 Hz. Rendering is per frame.
- **Swept collisions.** The ball is tested against the paddle face along its
  path rather than at its final position, so it cannot tunnel through at speed.
  Both paddles also get a circle-vs-rectangle rescue each step, because a
  paddle can slide sideways into a ball that is travelling away from it.
- **The bot is never perfect.** Its aim error widens as the ball speeds up and
  as a rally drags on. If it could not miss, two flawless players would rally
  forever and the match would never end.
- **Modes change rules, not code paths.** Win score, lives, paddle sizes and
  ball speeds come from the mode's `MatchRules`, so a new mode is data rather
  than a new branch inside the physics.
- **Talents are data too.** A talent is a catalogue entry describing what a
  rank costs, where it sits in its branch's grid, and what it changes.
  `resolveLoadout` turns a saved build into a flat bag of pre-capped numbers
  once, when the build changes; the simulation only ever reads fields off that
  bag and never looks a talent up by id. A new talent is an object in
  `core/talents/catalog.ts` and one line in `effects.ts` — its tile, its rank
  badge, its arrows and its tier gate all fall out of the `tier`/`column` it
  declares. A new active skill adds one `case` in `game/abilities.ts` and gets
  its HUD button, cooldown, equip slot and persistence for free.
- **The tree draws itself from one set of numbers.** Tile size and gap live in
  `ui/components/TalentTree.tsx`, and both the absolutely-positioned tiles and
  the SVG arrows drawn under them are laid out from those, so the connectors
  cannot drift out of alignment with the icons.
- **The build never reaches into the UI, or the other way round.** React
  resolves the loadout and hands it to the engine exactly the way it hands
  over the cosmetic theme. The HUD reads a quantised view of the cooldowns, so
  an ability ring re-renders a couple of dozen times per cooldown rather than
  sixty times a second.
- **Screen-space HUD.** Score pips live in field space (dots read the same at
  any rotation), while text is drawn unrotated at transformed anchor points so
  it stays upright on a portrait phone.
- **No allocation in the hot loop.** Particles come from a fixed-size ring
  buffer and gradients are cached until the geometry, the theme or the heat
  bucket changes, which keeps low-end phones smooth. Cosmetics are resolved to
  plain numbers once, when they are equipped.

Effects respect `prefers-reduced-motion`: shake, particles, hit-stop, and
slow-motion are scaled down or switched off, and the menu transitions with them.
