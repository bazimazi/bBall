# bBall

A fast, minimal bouncing-ball duel. Drag to move your paddle, keep the ball
alive, and take five points off the bot before it takes five off you.

Built with Vite, React and TypeScript. No game assets — every pixel is drawn on
a canvas and every sound is synthesised.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check the project, then build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | ESLint over the whole project |
| `npm run format` | Prettier write |

## Playing

| Input | Action |
| --- | --- |
| Drag / move pointer | Move your paddle (anywhere on screen — the paddle mirrors your finger) |
| `↑` `↓` or `W` `S` | Move your paddle |
| Tap / `Space` | Serve immediately instead of waiting |
| `Esc` or `P` | Pause |
| `M` | Mute |

Your paddle is the aqua one; the bot's is rose. The dots beside each end count
that side's points — first to five wins the match. The faint number in the
middle of the court is the current rally, and a long enough rally lights up a
streak banner. The ball speeds up with every hit and runs hotter the longer a
rally lasts, so rallies tend to end themselves.

Your longest rally is kept in `localStorage`, along with the mute setting.

## How it is built

```
src/
  main.tsx           React entry point
  game/              the simulation - no React, no DOM beyond the canvas
    engine.ts        main loop, input, and the store React subscribes to
    world.ts         all mutable state in one object
    simulation.ts    one fixed timestep
    physics.ts       ball, walls, swept paddle collisions
    ai.ts            the bot
    match.ts         serving, scoring, match lifecycle
    audio.ts         synthesised WebAudio blips
    view.ts          field <-> screen transform, canvas sizing
    particles.ts     fixed-size particle pool
    render/          canvas renderer
  ui/                React components, CSS modules, hooks
  styles/global.css  design tokens and resets
```

The split is the point: `game/` is a plain TypeScript simulation driven by
`requestAnimationFrame`, and `ui/` is a React tree that never sees simulation
state directly. The engine publishes a small immutable `GameSnapshot`
(scores, which card to show, mute state); `useGameEngine` feeds it to React
through `useSyncExternalStore`, so a component re-renders only when something
it displays actually changed — never at 60 Hz.

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
- **The bot is never perfect.** Its aim error is deliberately kept wider than
  its own paddle and widens further as the ball speeds up. If it could not
  miss, two flawless players would rally forever and the match would never end.
- **Screen-space HUD.** Score pips live in field space (dots read the same at
  any rotation), while text is drawn unrotated at transformed anchor points so
  it stays upright on a portrait phone.
- **No allocation in the hot loop.** Particles come from a fixed-size ring
  buffer and gradients are cached until the geometry or the heat bucket
  changes, which keeps low-end phones smooth.

Effects respect `prefers-reduced-motion`: shake, particles, hit-stop, and
slow-motion are scaled down or switched off.
