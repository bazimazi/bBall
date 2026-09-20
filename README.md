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

### Bots

Five levels, from Rookie to Legend. Difficulty is behaviour, not cheating:
every bot moves slower than you can, sees only what the ball shows it, and
differs in reaction time, how well it reads a wall bounce, how tidily it moves,
how much it places its returns, and how quickly it comes apart when the ball is
fast or the rally is long. A return placed wide enough always scores.

### Progression

Matches, wins, rallies, challenges and cup rounds pay XP; XP levels you up, and
levels and achievements unlock **cosmetics only** — colours, ball and paddle
styles, trails and arenas. Nothing you unlock changes how the game plays.
Practice pays nothing, quitting pays nothing, and the award is halved after 25
ranked matches in a day, so there is nothing worth farming.

The profile — name, avatar, level, lifetime stats, achievements, unlocks, the
cup you are part-way through — lives in `localStorage` under `bball.profile`,
in a versioned envelope. A save that is corrupt, half-written or from an older
schema is repaired field by field rather than thrown away; anything genuinely
unreadable is parked under `bball.profile.broken` and the game starts fresh.

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
    match.ts         serving, scoring, match lifecycle, results
    audio.ts         synthesised WebAudio blips
    view.ts          field <-> screen transform, canvas sizing
    particles.ts     fixed-size particle pool
    render/          canvas renderer
  core/              domain model - no React, no canvas
    bots/            difficulty profiles
    modes/           mode rules, modifiers, challenges, objectives
    tournament/      cup tiers and brackets
    progression/     XP curve, awards, applying a result to a profile
    achievements/    achievement catalogue
    cosmetics/       unlockables and the resolved canvas theme
    profile/         profile model, validation, migration, store
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
- **Screen-space HUD.** Score pips live in field space (dots read the same at
  any rotation), while text is drawn unrotated at transformed anchor points so
  it stays upright on a portrait phone.
- **No allocation in the hot loop.** Particles come from a fixed-size ring
  buffer and gradients are cached until the geometry, the theme or the heat
  bucket changes, which keeps low-end phones smooth. Cosmetics are resolved to
  plain numbers once, when they are equipped.

Effects respect `prefers-reduced-motion`: shake, particles, hit-stop, and
slow-motion are scaled down or switched off, and the menu transitions with them.
