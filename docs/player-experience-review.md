# bBall player experience review

Reviewed on 3 October 2026. This review covers the current React and canvas game,
its shared physics and mode rules, input handling, first-run flow, menus,
feedback, settings and regression coverage.

**Project policy, updated at the user's request:** completely ignore operating-system
and browser reduced-motion settings on web, desktop and mobile. Do not reintroduce
CSS media queries, JavaScript preference checks/listeners, native preference checks,
or animation/effect/timing overrides for those settings. Explicit in-game controls
remain independent of system preferences. This policy takes precedence over the
motion recommendations discussed below. See [AGENTS.md](../AGENTS.md) and the
[root README](../README.md).

The strongest opportunity is to make the existing game easier to understand and
trust. It already has nine modes, differentiated opponents, hazard courts,
technique through flicks and aimed serves, progression and extensive audiovisual
feedback. Adding more content would not address the reproduced collision and
input issues. That prioritisation is a design inference from the code audit and
the research below; it is not a measured player preference.

## Evidence and limits

The investigation combined primary design research, source inspection, real
simulation runs and targeted regressions. No player interviews, retention data,
device performance profiles or human playtest results were available. Browser
automation reported no available browser or app surfaces, so visual layout,
touch ergonomics and perceived enjoyment remain unverified in this session.

The existing `scripts/sim.ts` drove the real world with a Pro player brain at a
1000-unit field width. Each run used six matches for each of 69 cases: five Quick
Match opponents, 30 Journey stages, 14 challenges, 14 courts and six dailies.
That is 414 matches before the changes and 414 afterward. Both runs reported
zero stalls, broken ball states or stuck closing replays. The script checks
stalls longer than 90 seconds per point; it is a stability soak, not a measure
of human enjoyment. Randomness is unseeded and the sample per case is small,
so before/after win-rate differences cannot establish an improvement.

Selected baseline results show why balance needs human evidence before tuning:

| Quick Match opponent | Pro-brain win rate | Mean simulated match time |
| -------------------- | -----------------: | ------------------------: |
| Rookie               |               100% |                47 seconds |
| Amateur              |                67% |               150 seconds |
| Pro                  |                33% |               154 seconds |
| Elite                |                17% |               142 seconds |
| Legend               |                 0% |               132 seconds |

This proxy usually beat Rookie and struggled against the strongest opponents.
It does not establish how a new player performs, whether those match lengths
feel good, or which boss should be easier. The baseline suite passed all 225
tests, yet three new contact tests failed before the physics fix. Broad soak
testing alone was insufficient to detect those specific fairness problems.

## Research and its application

The game-feel survey by Pichlmair and Johansen separates predictable physical
behaviour, amplification of feedback, and support for player intention.
My inference for bBall is that its substantial effects system makes input
support and collision predictability better first investments than additional
effects. [Designing Game Feel: A Survey](https://arxiv.org/abs/2011.09201).

Apple recommends teaching basic actions in short steps, letting players act,
making introductions skippable, and offering help again when needed. The
existing first-run screen primarily configures identity; the home hint only
explains movement and disappears after three recorded matches. I applied that
guidance through a permanent controls reference, a direct practice route and
an optional lesson that observes movement, a real return and outer-paddle contact.
[Apple: Onboarding for Games](https://developer.apple.com/app-store/onboarding-for-games/).

Xbox's motion guidance recommends options to stop distracting backgrounds and
disable camera motion. Previously bBall offered camera shake choices and
honoured system reduced motion, but point flashes and some page-wide effects
remained. Calm now removes camera motion, screen flashes, ultimate viewport
flares, speed lines and animated ambient backgrounds, and reduces particles.
The attract court stays still when Calm is selected in the game. System and
browser reduced-motion handling has been removed at the user's request; it
does not affect canvas effects, result reveals or UI transitions. The remaining
controls implement selected guidance, not full accessibility compliance.
[XAG 117: Visual distractions and motion settings](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/117).

Xbox's input guidance supports alternative input methods and player control
over demanding timing, including controls that reflect remapped inputs.
My application here is deliberate tap-to-serve pacing, separating drags from
serve requests, remapping each keyboard action with an optional alternate,
and relative touch dragging with adjustable sensitivity. Hints now reflect
the selected keys. Normal UI activation and browser shortcuts remain usable.
Relaxed Practice adds a slower ball without slowing paddle control. The
particular sensitivity range and speed scales are design choices that still
need player testing; remapping alone does not resolve every input barrier.
[XAG 107: Input](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/107).

Xbox's difficulty guidance treats difficulty as a relationship between a
player's abilities and game barriers, and recommends pausable local play.
The five existing bot choices are useful, but their usefulness for different
players still needs validation. I fixed pause continuity and added an optional
resume countdown; the particular 1.5-second duration is a design choice to
playtest, not a duration established by that source.
It also recommends descriptive difficulty language that does not belittle
players. The loss card now offers an optional lesson or technique review using
neutral match facts, without assigning a skill rating or changing difficulty.
[XAG 108: Game difficulty options](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/108).

Xbox recommends combining visual, audio and other cues, with text or shapes
supporting information conveyed through colour. bBall already combines hit
sounds, particles, labels and optional vibration. The added Serve button and
visible countdown make pacing explicit. Existing local skill animations and
button state remain available when full-screen flares are disabled.
[XAG 103: Additional channels for visual and audio cues](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/103).

Xbox's objective guidance recommends objectives that can be reviewed and
on-demand demonstrations of core mechanics. It explicitly distinguishes a
static control reference from an interactive tutorial. The guide now offers a
three-step first-rally lesson. Star goals show live counters and can be reviewed
with their status on pause. The specific lesson pace and placement thresholds
are implementation choices to test with players, not research-established values.
For result coaching, my application of the same guidance is one suggested next
step alongside its match evidence, with a route back to the lesson or guide.
Challenge advice distinguishes losing from missing a timed, shutout or rally
objective. This is a prototype to playtest, not evidence that a post-loss tip
improves enjoyment or retention.
[XAG 109: Objective clarity](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/109).

React documents loading component code on first render, stable lazy declarations
and a Suspense fallback while waiting. Rejected loads reach the nearest error
boundary. Vite documents deferring the associated CSS and loading shared async
dependencies in parallel. I applied those mechanisms to optional menus while
keeping the engine outside the waiting/error boundary. The amount of shared
domain code still needed at startup must be measured, so the investigation
uses Vite's manifest rather than treating a smaller entry file as the entire
initial payload. These sources explain the loading mechanism; they do not
establish a player-perceived speed improvement.
[React: lazy](https://react.dev/reference/react/lazy),
[React: Suspense](https://react.dev/reference/react/Suspense),
[Vite: build optimizations](https://vite.dev/guide/features.html#build-optimizations)
and [Vite: build manifest](https://vite.dev/config/build-options.html#build-manifest).

MDN documents reusing offscreen drawings and separating canvas backing pixels
from its CSS size when handling display density. The code already caches
glows, but an overflow cleared every sprite, including those drawn each frame.
The renderer also always used up to 2.5 backing pixels per CSS pixel in each
dimension. I applied the guidance through bounded, least-recently-used glow
caches and an explicit court image quality choice. The chosen density caps
are implementation options, not research-established optimal values. Lower
density reduces backing pixel counts while softening the court; it does not
establish a frame-time improvement on an unprofiled device.
[MDN: Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
and [MDN: devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio).

## Reproduced problems and implemented changes

| Area                    | Evidence from the original code or regressions                                                                                                   | Resulting behaviour                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wall and paddle contact | The ball was reflected at a wall before the paddle sweep, even when the paddle contact happened first.                                           | Contacts are resolved in time order, and remaining flight continues after each reflection.                                                                                                             |
| Sweep near a wall       | The sweep interpolated a straight chord between positions on either side of a reflected path. A targeted case incorrectly incremented the rally. | Each straight flight segment is tested separately. The regression no longer records the incorrect paddle hit.                                                                                          |
| Moving paddle placement | The return used the paddle's final position for an earlier ball contact. At 960 units/second it can move eight units in a fixed step.            | Reach and return angle use its interpolated position at the contact instant.                                                                                                                           |
| Pause continuity        | Effects and arena updates ran before the paused-status branch. Camera noise also used wall time.                                                 | The paused simulation holds the court, particles, effects and timers. Camera noise stops advancing. Queued steering is discarded.                                                                      |
| Resume                  | A paused live rally resumed immediately.                                                                                                         | A cancellable 3–2–1 gives three half-second beats before play, using real time even after a slow-motion point. Players can disable it. Losing focus cancels the countdown.                             |
| Touch serving           | Pointer-down both positioned the paddle and shortened the serve timer.                                                                           | Dragging positions the paddle. A short tap released within 12 screen pixels requests a serve. Cancellation, a drag that returns to its start, and a long hold do not.                                  |
| Pointer ownership       | A second pointer-down could replace the active pointer.                                                                                          | Each paddle keeps one pointer owner until release or cancellation. Versus still supports independent fingers, even when they cross the midline.                                                        |
| Point pacing            | All serves launched on a timer.                                                                                                                  | Automatic remains the default. When ready holds the point until a tap, Space, Enter or Serve button. After the ordinary delay, extra waiting holds court and skill clocks and does not add match time. |
| Learning                | Movement hints were brief; controls and technique were chiefly documented in README.                                                             | Home offers How to play, return placement advice and a Rookie Practice warm-up. Pause has a reusable controls reference.                                                                               |
| Visual comfort          | Shake settings did not cover every flash or background movement.                                                                                 | Full and Calm effects are explicit game settings. System/browser reduced-motion settings are completely ignored, including canvas effects, result reveals and UI transitions.                          |
| Keyboard behaviour      | Global movement handlers intercepted menu arrow keys and did not distinguish browser shortcut modifiers.                                         | Movement and skill keys are handled during live play. Ctrl, Alt and Meta combinations retain their normal behaviour.                                                                                   |
| Opening card            | A quick serve could leave an intro card over the opening rally.                                                                                  | Launching clears the intro presentation so the ball's first approach stays readable.                                                                                                                   |

The physics retains the existing reach allowance, talent effects, speed caps
and opponent tuning. Incoming talent slowdown is rechecked after a contact so
the outgoing return travels at its full pace. Device settings extend the
existing validated record; old volume, shake, vibration, replay and skill-side
choices survive. Profile and cloud progression formats are unchanged.

## Validation

All 278 tests passed, as did client and server type checking, ESLint and the
production build. The two simulation soaks completed 828 matches in total with
none of their reported stability alerts.

The final automated checks cover the three reproduced physics failures,
frozen pause state, cancellable resume, deliberate manual serving, inability to
farm cooldowns while waiting, automatic serves, versus paddles, calm attract
mode, gesture ownership and cancellation, real engine input listeners,
ignored system motion preferences at startup and on changes, and
loading older device settings. The second batch adds
ten tests for tutorial completion through real contacts on short and long
courts, centre-return retries, misses without results, pause, engine replay and
exit, preserved preferences and build, stable goal snapshots, live rally
progress, impossible goals and agreement with the shared final-star evaluator.

The controls and Practice batch adds eleven tests for conflict validation,
remapped actions and held alternate keys, release after a modifier changes,
independent Versus controls, skill-slot gaps, native UI activation, relative
touch in both orientations, separate drag owners, edge reversal, resize cleanup,
and slower Practice finishing through real physics without progression. The
existing settings test also checks persistence, sensitivity bounds and safe
fallback for malformed bindings while preserving older preferences.

The coaching batch adds eight tests, including a no-return loss completed
through real physics. They cover the inclusive timed-goal boundary, shutout
and rally objectives, a Challenge cleared while losing, Journey/Daily targets
that still require a win, Endless guidance, singular counts and exclusion of
ordinary wins, Versus and abandoned matches. Coaching does not mutate the
result or world. UI navigation, wording and perceived usefulness still need
manual and human checks.

The loading batch adds build-artifact and async React rendering checks without
new dependencies. `check:bundle` walks static dependencies, counts each emitted
file once, verifies all JavaScript/CSS files and manifest links, and checks that
all 16 menu page chunks remain outside the initial graph. `check:menus` resolves
and renders every real lazy page, the Practice variant and a pending menu with
its status and Back button. These Node checks do not execute browser events or
verify CSS application and failed-download recovery. Both the web build and a
desktop-mode build targeting Safari 13 passed the artifact check. No native
installer or running webview was tested.

The rendering batch adds seven tests. They check backing pixel counts, unchanged
court geometry and round-trip input coordinates in portrait and landscape,
fractional display density and unchanged-canvas preservation, circular glow
reuse, independent colour/style keys, both cache bounds and recency eviction.
The real engine retains its complete world state apart from backing density,
both active Versus touches and held keys when quality changes, under Full and
Calm effects. Quality set before startup survives resize/rotation; older
settings pick up High and reject invalid values. The menu rendering check
also verifies each quality's selected button. These checks measure layout and
sprite creation using DOM/context substitutes; they do not rasterize pixels or
measure GPU work, visual quality, frame times or human response.

A final rebuild ran out of available machine memory. Repeating it with two
Rayon workers and a 256 MB Node heap succeeded and passed `check:bundle`.
Earlier standard web builds passed; no persistent build-memory settings were
changed.

Run the checks from the repository root:

```powershell
npm test
npm run typecheck --workspace server
npm run lint
npm run build
npm run check:bundle
npm run check:menus
node --import tsx scripts/sim.ts 6 pro
```

The original single entry was 607.73 kB. After deferring menus and adding the
rendering settings the entry is 462.94 kB and Vite no longer emits its 500 kB
chunk warning. However, the complete initial static graph is **550.78 kB across
17 JS files**, because shared domain
code remains necessary. The comparable web-build measurements from
`check:bundle` are:

| Initial static payload | Before    | After     | Reduction |
| ---------------------- | --------- | --------- | --------- |
| JavaScript             | 607.73 kB | 550.78 kB | 9.4%      |
| JavaScript, gzip       | 189.12 kB | 178.92 kB | 5.4%      |
| CSS                    | 58.94 kB  | 47.37 kB  | 19.6%     |
| CSS, gzip              | 12.22 kB  | 9.91 kB   | 18.9%     |

Gzip totals use Node's `gzipSync` at its default level, summed per unique file
with the same method before and after. These are artifact bytes, not measured
network transfer or time to play. The graph excludes dynamic imports, HTML,
images, fonts and API responses. More files introduce request overhead; cold
starts, menu latency, stylesheet loading and low-end rendering still need
device profiling. Before the rendering batch, the Safari-targeted desktop-mode
graph was 557.86 kB JS and 47.64 kB CSS. Native packaging and visual or on-device
QA remain pending.

## Rendering workload measurements

High preserves the previous default. Balanced and Low cap backing density at
1.5 and 1 respectively; High keeps its 2.5 cap. All choices use the device's
actual ratio when it is below the cap, with the existing lower bound of 1.
At a 1200 × 800 CSS-pixel viewport and device ratio 3, the real layout function
produces these backing stores in either orientation:

| Court image quality | Backing pixels per CSS pixel, per axis | Canvas pixels | Reduction from High |
| ------------------- | -------------------------------------- | ------------- | ------------------- |
| High                | 2.5                                    | 6,000,000     | —                   |
| Balanced            | 1.5                                    | 2,160,000     | 64%                 |
| Low                 | 1                                      | 960,000       | 84%                 |

The percentages apply to this capped density, not all devices. A ratio-1
display has identical backing dimensions at all three qualities. Menu text is
HTML and retains its density; canvas labels share the softer court rendering.
Changing quality does not rescale the world, rebuild hazards or clear input
ownership. It invalidates drawing caches after sizing the backing store. No
automatic density adjustment, frame-rate cap or effect-strength change is added.
The existing policy of ignoring system reduced motion remains in force.

A fixed 600-frame sequence of glow calls uses two paddle colours, two comet-ball
variants warming through the real hue function, and five violet ambient hues.
Before the change it constructed **112** offscreen canvases and lost the initial
paddle sprite after overflow. Afterward it constructs **101** (9.8% fewer) and
retains the frequently used paddle and ambient sprites. This is a constructed
cache workload, not a simulated match or a browser benchmark. Each dot/bar
cache now has a strict 96-entry bound; one old entry leaves on overflow, and
equivalent hue angles reuse the same sprite. Additional Map operations on hits
are a tradeoff to profile. No FPS, input-latency or battery improvement is claimed.

## Next changes to validate with players

The first six follow-ups have now been implemented:

- **First-rally lesson:** optional and replayable from How to play. A stationary
  dashed outline shows where to place the paddle. The learner moves, returns a
  deliberately launched slower shot, then uses outer contact for an angle.
  The return preview uses the real physics; centre returns and misses can be
  retried. No match result, XP or ranked rule is changed. Completing the lesson
  offers Rookie Practice with the selected ball pace and the player's own
  build restored.
- **Score and goal clarity:** the HUD labels You/Bot or P1/P2, the numerical
  score and winning target. Endless displays lives and best rally. Score and
  life changes have a separate polite announcement, while rally and goal
  counters have no live region. Journey and Daily counters include the current
  rally, and selecting Star goals pauses to show the complete objectives.
  Reached targets explicitly require a win; temporary leads stay in progress,
  impossible goals are marked missed, and final states use the shared star
  evaluator. The timer uses the same rounding as match results.
- **Controls and Practice pace:** Settings offers remapping for movement,
  both Versus players, serve, pause, mute and nine skill slots, with alternates,
  conflict feedback and default restoration. Escape and Tab stay reserved;
  movement tracks physical key release so modifier changes cannot leave a
  paddle moving. Home, help, tutorial, serve, Versus and skill hints use the
  actual bindings. Skill buttons retain their real slot when an earlier slot
  is empty and support keyboard activation. Optional relative touch dragging
  has 50–200% sensitivity, preserves two-player pointer ownership and permits
  immediate reversal at the court edge. Practice offers Normal or Relaxed;
  Relaxed scales serve and maximum ball speed to 0.72 and speed growth above
  one to 0.7, through the existing modifiers and central balance config.
  Paddle responsiveness stays the same. Ranked rules and server protocol are
  unchanged; the preference is stored on the device, including for warm-ups.
- **Loss-screen coaching:** one optional Next attempt card follows the match
  stats. No returns recorded leads to the first-rally lesson; other suggestions
  use recorded returns, flicks, rally or objective and offer technique review.
  The guide can be opened and backed out of to return to the same result;
  retry remains in the pinned actions. A late Challenge win explains its time
  target, a conceded point explains a shutout miss, and a rally Challenge
  explicitly counts both paddles and does not require a win. A Journey or Daily
  count target reached during a loss needs that target and a win in the same
  match. Endless advice focuses on keeping a rally alive. Ordinary wins,
  cleared Challenges, Versus and abandoned games receive no loss coaching.
  These suggestions never claim to know why a miss happened: current results
  contain no miss timing, contact accuracy or input history. No result schema,
  match tuning, automatic difficulty change or progression format is added.
  The Challenge result heading's success styling follows the objective too,
  so winning without clearing it does not show a successful Challenge state.
- **Menu loading:** 16 optional page components now load on demand from stable
  declarations; their props and result actions retain the existing flow. Home,
  onboarding, tutorial coaching, the live HUD and simulation remain eager. The
  route boundary has a named loading state and Back button, plus a Back/Reload
  recovery screen for a failed page. It is keyed by the route, with the canvas
  outside it. Opening Results still follows the already-recorded match result.
  There is no automatic reload: React caches rejected lazy loads, so reload is
  an explicit player action. The manifest and repeatable checks record the full
  initial graph and protect the menu boundaries from accidental eager imports.
- **Rendering choices and cache reuse:** Settings offers High, Balanced and
  Low court image quality, stored on the device independently of effects.
  High retains the existing density; lower choices trade court sharpness for
  fewer backing pixels on dense displays. Controls, court geometry and match
  clocks retain their behavior. Dot and bar caches reuse equivalent circular
  hues, enforce their bounds and preserve frequently drawn glows on overflow.

These changes still need newcomer observation, screen-reader checks, and HUD
and Settings/result layout and touch checks in both orientations. The last
browser inventory again returned no available surfaces. Automated lesson
completion is evidence of functionality, not evidence that a human finds the
lesson easy or the game more enjoyable.

| Priority | Proposed work                                                                     | Evidence needed before implementation                                                                                                      |
| -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Medium   | Tune early Journey transitions and boss difficulty.                               | Human win rates and attempts across player skill groups, builds and narrow/wide courts. Six bot matches per case are insufficient.         |
| Medium   | Profile cold starts, first menu loads and low-end rendering after menu splitting. | Cold-start timing, first-input delay and frame times on representative devices, including Full/Calm effects and High/Balanced/Low quality. |

For the next playtest, include newcomers and returning players using a mouse,
keyboard and touch in portrait and landscape. Observe the first three rallies,
pause close to an incoming ball, drag before a manual serve, use two fingers in
Versus and compare Full with Calm. Include keyboard-only players and players
with limited dexterity: remap keys, compare direct and relative touch, adjust
sensitivity, and try both Practice paces. Ask about control, clarity and comfort.
After a loss, ask whether the suggestion accurately describes the attempt and
helps choose a next step, or feels repetitive. Check that guide Back returns to
the result and that retry remains easy to reach.
Use a cold cache and a slow connection to open the menus, press Back while a
page is loading, revisit it, and test a failed JavaScript or CSS request. Check
recovery without losing recorded progress, and try the same flows in a packaged
webview. Record first-input and first-menu delay and frame times separately
from the bundle byte counts.
For rendering comparisons, use the same production build, viewport, cosmetics,
court and input device. Record device/browser/webview version, CSS viewport,
display ratio, refresh rate and selected effects/quality. Warm the drawing caches
before capturing at least 30 seconds of an active rally, then capture dense
skills/hazards and a deciding-point replay separately. Repeat each case under
Full and Calm at all three qualities. Record frame-interval median, 95th and
99th percentiles and missed refresh deadlines; inspect main-thread and raster
work to distinguish simulation, drawing and compositing costs. Browser traces
are diagnostics rather than human latency measurements. Observe whether the
ball, canvas labels and target outline remain readable at lower quality. Use
real lower-end devices as well as any throttled desktop run before changing
defaults or claiming smoother play.
Record failures and completion time before asking for an overall enjoyment
rating. Any improvement in enjoyment or retention remains a hypothesis until
that evidence exists.
