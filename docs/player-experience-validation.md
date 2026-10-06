# Player experience validation and completion

The twenty player-facing fixes in [the review](player-experience-review.md) are
implemented. The final implementation adds local measurement tools and this
protocol for the two remaining evidence-dependent decisions: Journey/boss
difficulty and device performance. Those decisions need human/device results;
automated stability and DOM checks cannot complete them. No player data or
physical-device performance measurements were available on 6 October 2026.

| Work                                                    | Implementation status                         | Validation still required                                                           |
| ------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| Physics, serving, pause, lessons, controls and feedback | Implemented with regressions                  | First-rally observation, physical input, sound and touch reachability               |
| Menus, focus, results, Daily and onboarding             | Implemented with mounted checks               | Layout, browser events, clipboard and assistive technology                          |
| Device saves, accounts and Demo                         | Implemented with local/API checks             | Real cookies/relaunch, storage denial and native OAuth/deep links                   |
| Startup/menu/frame capture and trial summary            | Implemented, explicitly enabled and tested    | Production builds on representative physical devices                                |
| Journey transitions and boss tuning                     | Measurement workflow ready; tuning deferred   | Human attempts and reasons for quitting, separated by skill/input/build/court       |
| Quality defaults and further rendering changes          | Measurement workflow ready; defaults retained | Repeated frame/interaction measurements and readability checks on lower-end devices |

## Local capture

Run a production build, serve it through `npm run preview`, and open the game with
`?experience=1`. Use a disposable browser profile/save for progression experiments.
Leave desktop developer tools undocked so opening/closing them does not resize the
court. Mobile browsers can use their remote inspector. The recorder is deferred;
ordinary play does not install it, attach its listeners or take its extra clocks.

Once the game and recorder have loaded, use the developer console:

```js
const x = window.bballExperience;
x.configure({
  participantCode: 'N01', // Assigned test code, not a player's name/account.
  skillGroup: 'new', // new, returning, experienced or unspecified
  input: 'touch', // mouse, keyboard, touch, pen, mixed or unspecified
  device: 'Test phone / browser version',
  build: 'git revision / candidate label',
  cache: 'cold' // cold, warm or unspecified; declared by the tester
});

// Warm the same court/build first. Resume explicitly if the game is paused.
x.start({ label: 'rally-full-high', refreshHz: 60, seconds: 60 });
x.status(); // Cheap status; does not calculate distributions.
// Capture ends at its duration, or x.stop() ends it manually.
x.download(); // Export after the capture has stopped.
x.json(); // Inspector-copy fallback if the webview cannot download.
x.reset(); // Export first; discard local records for a new block.
x.dispose(); // Detach diagnostics; gameplay continues.
```

Supply the expected refresh rate from the device/display configuration; the tool
does not infer it from a janky sample. Each capture permits 1–120 seconds and at
most 30,000 samples; a recording holds 12 captures, 200 trials and 256 long tasks.
Export/reset between blocks. Reset does not reuse trial/capture identifiers.
No data is sent to a service or written to game storage. Exports contain session
labels, an anonymous recording ID, timing samples and selected game context;
they exclude profile/account IDs, names, emails, credentials, event targets and
URL queries. The inspector output is the durable handoff; closing/reloading loses
unexported records.

For a packaged test build whose initial URL cannot include a query, explicitly
enable capture for that build. In PowerShell:

```powershell
$env:VITE_EXPERIENCE_CAPTURE = '1'
npm run desktop:build:debug
Remove-Item Env:VITE_EXPERIENCE_CAPTURE
```

Use the corresponding native build command for another target and inspect that
debug webview. The environment variable is an explicit diagnostic build option,
not a device preference. Normal release builds leave it unset. Do not edit the
committed packaging configuration or `.env.desktop` to enable capture by default.
The native download/inspector path still needs a physical target check.

## What the measurements mean

Frame intervals use consecutive timestamps from the real engine's animation
frames. Reports include raw samples, median, nearest-rank p95/p99 and maximum,
plus separate phase distributions for play, serve, pause, replay and other
statuses. Median averages the middle two values for an even sample count. The
first sample has no interval. Intervals spanning a phase transition are assigned
to the phase at the sample's end; `sampledIntervalMs` is a coverage estimate, not
the duration of an uninterrupted rally.

`engineUpdateMs` covers the engine callback before drawing, including simulation,
audio updates and snapshot publication. `canvasSubmissionMs` measures submission
of canvas commands. Neither measures later React rendering, GPU raster/compositing
or displayed-frame timing. A late interval exceeds 1.5 times the supplied refresh
budget; estimated missed slots use `max(0, round(interval / budget) - 1)`. These
are scheduling estimates, not a hardware count of dropped frames or input-to-photon
latency. Profiling adds its own clocks/callbacks; compare the same instrumented
build and use an uninstrumented browser trace to investigate overhead.

Hidden/pagehide events stop a capture; return does not restart it. Viewport,
quality/effects, build/level or mode changes end it rather than silently mixing
conditions. The actual engine field width, rotation, resolved effects/abilities
and device settings accompany the record. Wait for settings/layout to settle and
warm the caches before starting again. Export after stopping: sorting/serializing
during a timed capture would perturb it. An engine replacement also ends capture.

Startup exports available navigation/paint entries and the first engine-start
timestamp. `domInteractive` means DOM construction, not time to interactive.
`loadEventEnd` remains unavailable before load finishes. Buffered first-input
timing reports the browser's first event delay and processing time, not every
game gesture's latency, INP or perceived responsiveness. Optional long tasks
remain unavailable when unsupported; an empty/unavailable signal is not zero
delay or a pass. Menu timings cover the first lazy import's request/evaluation
(including dependencies), not the later committed/painted menu or button-to-paint
time. Record actual perceived delay alongside these diagnostics.

These boundaries follow the browser APIs: [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame),
[MDN: PerformanceEventTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming),
[MDN: navigation timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Navigation_timing)
and [MDN: domInteractive](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming/domInteractive).

## Performance session

Use the exact same production revision, court, cosmetics, build and input device.
Record hardware, OS/browser/webview version, viewport, display ratio and expected
refresh rate. A cache label is a tester declaration; the recorder does not clear
caches or certify a cold navigation.

1. Record cold launch, the first interaction and first visits to Settings, Journey,
   Daily and Talents. Export startup/menu data, then repeat with a warm cache.
   Note loading/failure recovery and observed time to a usable control separately.
2. Warm drawing caches, then capture enough time to include at least 30 seconds
   of **play** intervals. Repeat three runs per condition, comparing Full/Calm
   at High/Balanced/Low. Export after each block. Keep changed or short captures
   distinct; do not pool pause/menu time as active-rally performance.
3. Repeat with dense skills/hazards and a deciding-point replay. Check ball,
   paddle, target and canvas-label readability at each quality in both orientations.
4. Repeat on an actual lower-end phone/webview and representative desktop hardware.
   Keep throttled desktop experiments labelled separately. Investigate long
   intervals with a browser performance trace to distinguish scripting from
   raster/compositing. Only change a default after repeatable improvements and
   acceptable readability/input behavior on the target devices.

System/browser reduced-motion preferences are **completely ignored** on every
target. Test the game's explicit Full/Calm and shake choices independently.
Neither the recorder nor this protocol adds preference checks or timing/effect
overrides; compare both system preference values as a regression check only.

## Journey and boss session

Observe newcomers, returning players and experienced players with mouse,
keyboard and touch. Begin with normal first-run/lesson flow and stages `w1-1`
through `w1-6`, then `w2-1`; revisit later bosses in a separate returning-player
block. Keep narrow/wide courts and builds separate. Record the real starting
level/ranks/abilities and any coaching or control changes, rather than assuming
every participant is a level-1 player. Demo trials are labelled separately from
natural progression. A bot brain is not one of these human groups.

The recorder captures starts, completed results, retries/quits and engine
interruptions without awarding or replaying progression. Session/build context
is frozen at the trial's start. A result lacking a captured start is marked
partial. Open, partial and interrupted trials do not enter ended-trial rates;
quits are reported separately from losses. Browser/process closure can lose
unexported trials, so an observer log remains necessary. Explain each quit:
difficulty, unclear objective, unfamiliar control, interruption or another reason.

Use one observation row per task/trial:

| Test code | Stage/task and attempt | Input/court/build                  | Completion/time/quit reason | Control or objective confusion | Ease / comfort / enjoyment (1–5) | Participant's words |
| --------- | ---------------------- | ---------------------------------- | --------------------------- | ------------------------------ | -------------------------------- | ------------------- |
| N01       | w1-1 / 1               | keyboard / narrow / recorded build |                             |                                |                                  |                     |

Collect completion, failures and time before asking for an enjoyment rating.
Observe the first three rallies, manual serve, pause/resume close to an incoming
ball, lesson retries and the loss suggestion. Ask whether players could predict
their actions and choose a useful next step. Rotate/rescale during play, and try
remapping, relative touch and Relaxed Practice with participants who need them.
Use the review's existing flow-specific checklist for the remaining features.

Compare transitions such as `w1-3 → w1-4` and `w1-5 → w1-6` within each group,
with attempts/quit reasons and quotes alongside rates. A single small group or
unpaired bot win rate is not enough to pick a difficulty target. Once observations
identify a consistent barrier, change one relevant rule, replay the same human
tasks and run the seeded stability matrix. Record the actual before/after result
and side effects before claiming a more enjoyable experience.

## Summaries and repeatable stability

Summarize one or more exported recordings locally:

```powershell
npm run summarize:experience -- "capture-one.json" "capture-two.json" --output .temp/experience/summary.json
```

The summary validates timing data and recomputes distributions from raw samples.
Repeated/overlapping exports retain the latest outcome for each recording/trial
ID, so a second download does not double the attempts. Captures remain separate;
Journey groups retain matching build, input, skill group and game/court context.
Distinct participant codes are declared codes, not verified unique people.
Both completed-match win rate and clears per ended attempt (including quits)
are reported, with missing rates unavailable. Data summaries do not automatically
recommend or apply balance changes.

Run the real simulation with reproducible per-case/per-trial randomness:

```powershell
npm run soak -- 6 pro --seed final-review-20261006 --width 750 --output .temp/experience/soak-narrow.json
npm run soak -- 6 pro --seed final-review-20261006 --width 1290 --output .temp/experience/soak-wide.json
# Focus a later experiment:
npm run soak -- 6 amateur --seed candidate-a --width 750 --group journey --output .temp/experience/journey.json
```

Defaults are 40 matches per case, Pro, width 1000 and seed `bball-soak-v1`.
The seeded RNG is scoped to synchronous headless matches and restored afterward;
live-game randomness is unchanged. The soak reports completed matches separately
from stalls, non-finite states, replay failures and 20-minute timeouts, and exits
unsuccessfully on any stability alert. Its default player build is level 1 without
talents. It does not draw pixels, use physical input or establish human difficulty.
Repeatability refers to the same simulation/build/runtime, not identical human play.

The final review ran 414 matches at each width: all 828 completed with zero
stability alerts. Two identical seeded Quick runs also produced identical tallies.
The first boss was cleared in 3/6 trials at each width, with mean simulated match
times about 145 and 221 seconds respectively. These small bot samples support
the need to control court geometry; they do not justify a balance adjustment.

## Closing the validation stage

Run `npm test`, `npm run check:ui`, `npm run check:experience`, `npm run check:menus`,
lint, client/server type checks and web/Safari-targeted asset builds. Keep the
recorder outside the ordinary initial bundle (`check:bundle` verifies this).
The capture checks use substituted timestamps, events and browser timing APIs;
the engine tests exercise the real callback with substituted rendering/audio.
Neither is a physical benchmark.

The implementation stage is complete when those checks pass. The validation
stage remains open until the observation log and physical recordings cover the
matrix above and the review's screen-reader/native/storage/account checks.
Record failures, fix reproduced problems, rerun affected checks and update the
review with actual results. Mark Journey/quality decisions complete only after
that evidence supports a tested decision. No enjoyment, retention or loading-time
improvement is established by implementation or byte counts alone.
