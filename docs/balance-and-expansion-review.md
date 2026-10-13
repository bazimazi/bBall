# Gameplay balance and extension review

Reviewed 13 October 2026. This review covers all nine modes, the shared engine,
opponent ranks and skills, court generation, goals, progression, equipment,
research, rewards, onboarding, results, and the client/server rule boundary.
It combines source inspection, regression tests and seeded engine simulations.
There were no human playtests or physical-device measurements in this session.

**First continuation, 13 October:** contextual encounter rehearsal was implemented. Completed
ranked solo duels offer **Practise this encounter** on their result card. It opens
a repeatable, unranked, first-to-three rehearsal of that court and opponent,
carrying the equipment, Gauntlet boons and any fixed Daily build. Boss rehearsals
hold the phase reached in the finished encounter, including its court, opponent
rank, hazard intensity and bend. The scoreboard starts at 0–0 and destructible
objects start fresh; this is a rehearsal, not a replay of the missed shot.

The pause menu and practice result offer **Back to result**, returning to the
original result and its original continuation actions. Hardware/browser Back
pauses active play first; another Back returns to the original result. Practice
does not award progression, consume a Gauntlet heart, advance a cup or count as
a series game. A new match or leaving the result clears the temporary return;
it is not saved across reloads. Practice, Versus and Endless results do not offer
this duel rehearsal. The new controls are translated into Persian.

Both contextual rehearsals and the existing isolated boss-phase picker now use
the encounter's opening rank for base ball tuning while retaining the reached
phase's stronger opponent. Ranked ball tuning remains rank-driven. Point-based
serve acceleration begins afresh with the rehearsal's own scoreboard.

## Assessment

The game has substantial breadth: 630 Journey stages across 30 worlds, 120
catalogue challenges plus contracts and research trials, ten cup tiers, three
Gauntlet formats, continuing progression, and 60 court presets. Its strongest
extension opportunity is making those encounters feel more distinct and making
it easier to practise the skill that just caused trouble. More generated stages
alone would amplify repetition and navigation demands.

The main reproducible balance problems were local difficulty cliffs and rules
carrying into places where they did not belong. This pass repairs those before
changing global paddle speed, ball speed, talent prices or XP rates. A bot's
win rate is not a substitute for a person's reaction time, learning or enjoyment.

## Mode-by-mode review

| Mode        | Findings and current action                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Next validation or extension                                                                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quick Match | Five selectable opponents, schools, contracts, courts and series already provide variety. Rank-based pace, opponent skills and symmetric rally pressure make higher ranks demanding. No demonstrated global speed defect justified retuning them.                                                                                                                                                                                                                                                 | Contextual encounter practice is implemented. Measure losses and match duration by rank, build, input and width. Keep Master/Mythic explicitly optional.                                                                                                                                                   |
| Journey     | The first five worlds teach mechanics; later worlds add optional branches, mastery variants and Frontier. The 600 expansion stages reuse court templates and common objective patterns; expansion bosses mostly share phase thresholds at two and four points. Optional branches already avoid blocking the core route.                                                                                                                                                                           | Curate a few recognisable encounters per world: introduce one mechanic, combine it, then test it with a distinctive boss. Check early Needle/Colossus completion and star-gate friction with new players before weakening them.                                                                            |
| Daily       | Fixed cards, retryable attempts, archives, a separate Master card and streak freezes are useful. A point-down twist could replace a shutout star with a margin star **after** the second star was selected, producing two identical goals. Fixed by normalising the first goal before filtering the second.                                                                                                                                                                                       | Distinct/attainable goals checked across 730 dates, including archive parity. Add occasional authored daily puzzles with a clear shot-learning purpose. Standard cards still use personal talent progression; only Master has a fixed talent build, so standard results are not equal-loadout competition. |
| Gauntlet    | At Pressure 0, all three Sprint acts previously used Amateur ordinary opponents while the first expansion boss could finish at Legend. Regular opponents now progress Amateur → Pro → Elite across the first three acts. Early bosses are Colossus, then an Orbiter/Tempest/Singularity encounter; expansion bosses arrive from the Elite band. Later acts reach Legend and high Pressure still starts there. The initial format is now the nine-match Sprint instead of the 36-match Expedition. | Validate complete drafted runs, not just isolated encounters. Check first-boss clear rates and whether safe/risk choices produce useful decisions. Full act previews and credit tradeoffs are implemented; measure route choice diversity and deaths per act.                                              |
| Endless     | Three-life survival and Waves serve different goals. Wave transitions previously merged modifiers over the previous court: the short paddle at depth 12 persisted into depth 13, and a later melting rule could persist indefinitely. Each wave now resolves a complete rule set from neutral values. Lives, cumulative returns and spent cooldowns survive transitions.                                                                                                                          | Track player returns separately from total rally hits. Test whether the Wall's own misses interrupt flow too often. Keep survival records separate from Waves and equipment categories; measure late-wave reach before changing the pace ceiling.                                                          |
| Challenge   | Short, explicit objectives, repeatable attempts and first-clear rewards work well. Rally challenges can be cleared on a loss; court-action challenges require a win. Generated destruction goals already respect structure capacity. No new impossible objective was reproduced.                                                                                                                                                                                                                  | Add small authored technique trials with repeatable setups and ghost examples. Use completion rates per objective, not match wins alone, when tuning Blitz, Flawless and the expert research trials.                                                                                                       |
| Tournament  | Classic cups correctly use three escalating opponents. Marathon and ladder reused the raw round index, reaching the final opponent by round three and then repeating it. Opponents now fill the whole bracket: Bronze Marathon is Rookie ×3, Amateur ×2, Pro ×2; ladder is two rounds at each rank. Classic cups retain their sequence.                                                                                                                                                           | Measure seven-round session length and frustration after late elimination. Consider an optional unranked bracket rehearsal. Ladder seasons currently vary seeded courts at higher tiers but do not add a new rank ladder beyond Legend.                                                                    |
| Versus      | Equal paddle rules and no progression rewards are appropriate for couch play. Mirrored courts copied a central gate but failed to mirror its off-centre switch, giving one approach easier access. Both sides now get a corresponding switch linked to that same gate; centre switches are not duplicated.                                                                                                                                                                                        | Human side-swapped games are needed to assess all hazard layouts, touch overlap and keyboard ergonomics. A match-series side swap and optional cooperative rally target would add social variety.                                                                                                          |
| Practice    | Relaxed pace, paused stepping, landing estimates, isolated boss phases, the first-rally lesson and the Workshop bench already cover useful practice tasks. Long rallies here are expected. No pressure was added to force them to finish.                                                                                                                                                                                                                                                         | Contextual result rehearsal is implemented. Isolated boss phases now preserve the live encounter's base ball tuning. Authored bank-shot, gate-timing and placement drills are implemented. Measure transfer to the next ranked attempt with new players.                                                   |

## Shared systems and remaining gaps

- **Physics and input:** fixed-step physics, swept contacts, shared forecasts,
  paused-state handling, manual serves and input ownership have extensive
  regressions. Wider courts allow more travel time and longer rallies. Preserve
  tests at both 750 and 1290 units; one width cannot establish human balance.
- **Builds and skills:** hard limits, cooldown floors, attack-pace bleed and
  spent-defense preservation bound stacking. The headless Pro pilot does not
  play a human build well enough to justify talent nerfs. Compare equal-budget
  Power, Control, Defense, Momentum and Utility builds with deliberate skill use
  before changing branch strength. Permanent power ends while levels continue.
- **Rewards and economy:** losses can earn XP, Workshop marks and deterministic
  research loot; the three-mode circuit supplies cores without an Elite victory.
  Free full/branch resets reduce experimentation cost. Several parallel systems
  still compete for attention: levels, stars, mastery, materials and research.
  Measure time to a useful choice and cost comprehension before repricing them.
- **Teaching and feedback:** result coaching uses actual outcomes, but it cannot
  yet explain a miss as late movement, insufficient reach or a misread hazard.
  Record a small local contact/miss snapshot before adding such explanations;
  do not infer a cause from the final score alone.
- **Content identity:** the expansion's names and counts outpace its distinctive
  authored patterns. Boss-specific telegraphs and counterplay would offer more
  novelty than another layer of higher speed and shorter reach.
- **Persistence:** rule builders are shared with server validation. Ship client
  and server changes together. Pre-expansion Gauntlet saves retain their old
  encounter path. Existing expansion runs and long cups use the revised rules
  for the encounter at their saved position; already queued results from an
  older deployment need compatibility testing before a live rollout.
- **Presentation:** Full/Calm, shake and graphics settings remain explicit game
  controls. System/browser reduced-motion settings are completely ignored on
  web, desktop and mobile, as required by `AGENTS.md`. No motion behavior was
  changed in this balance pass.

## Prioritised extensions

All five implementation items are complete. The measures of learning,
readability and enjoyment below still require human playtests; implementation
and automated checks do not establish those outcomes.

1. **Contextual drills and a retry path — implemented.** Results offer the
   original encounter rehearsal plus bank-shot, gate-timing and placement
   drills. Practice also lists the drills with example paths. Each uses a
   neutral paddle/build, identical incoming feeds and a visible target line;
   bank and gate success requires actual collision events. Placement targets
   alternate ends. Three targets clear a drill; three misses end the attempt.
   Drills entered from a ranked solo result return to that result without
   changing rewards, run hearts, series scores or route progress. Example paths
   are instructional sketches, not recorded ghosts. Pause/step remains available.
2. **Distinctive boss encounters — implemented for three bosses.** Gatekeeper
   changes its passage from centre to high to low; Architect reverses its rail
   before offering two banks; Duelist blocks alternate lanes. Each announces
   guard rise, guard and recovery in the HUD, including when match details are
   collapsed. Recovery reduces only the opponent's reach, smoothly, for a bounded
   window. Existing skills, spent cooldowns and player reach are preserved. The
   normal geometry drives collision, forecast and rendering. Isolated Practice
   now carries forward earlier phase upgrades when a later phase omits them.
   Human validation: can players explain and exploit the recovery without a menu?
3. **Short session routes — implemented.** More modes → Short sessions offers
   Find the corners, Learn the bank and Read the opening. Each has three steps
   drawn from drills, ordinary Quick Match/Challenge and isolated boss Practice.
   Wins clear ordinary steps; challenge objectives clear challenge steps. A loss
   retries that step. Finished steps, attempts, clears and voluntary replay
   starts persist per profile on this device; interrupted matches restart.
   Practice grants no rewards and ordinary matches retain normal rewards, with
   no route bonus or new currency. Demo routes stay in memory and clear on exit.
4. **More expressive Gauntlet routing — implemented.** Both choices preview all
   remaining encounters in the act: court, opponent and boss. They state the
   one-credit/two-credit tradeoff, free wallet capacity and the act's potential
   payout. The nine-credit cap and final-clear exception are explicit. Risk
   raises the opponent band only up to Legend, then still offers different
   courts. Existing server-derived route rules, commit locks, repairs and
   drafting remain authoritative; the preview uses those same rule builders.
5. **Social replay challenges — implemented as shared seeded targets.** More
   modes → Shared rally challenge accepts a bounded, versioned code such as
   BB1-FRIENDS. Both players get the same seeded court and neutral paddle/build.
   The target is 30 player returns before three misses; reaching it ends the
   challenge. Results provide copyable code, returns, best rally, build and
   field-width summaries. These unranked attempts award nothing and do not
   replace Endless records. Compare equal court widths and game versions;
   scores are local, unverified reports. Persistent ghosts, online PvP and
   side-swapped couch series were alternatives or separate projects, and are
   not part of this implementation.

The three boss rhythms and all new UI continue to ignore operating-system and
browser reduced-motion preferences completely. Full/Calm and screen-shake
controls remain independent of system settings; gameplay timing is unchanged
by presentation preferences.

## Evidence and reproduction

The five new behavior regressions were run before the fixes and failed on the
specific problems above. They pass after the fixes. Existing phase/replay tests
now explicitly select an expansion boss, because the opening Gauntlet boss no
longer changes courts. The initial balance pass had 506 passing tests; the continuation has 509.

The new `modes` simulation group samples every mode, both Gauntlet lengths,
bosses, two Daily variants, legacy and advanced challenges,
Marathon rounds, Waves, relaxed/boss Practice and three Versus setups. The pilot
uses a Pro brain with the default player build except where rules mandate a
fixed build. Run probes start encounters without accumulated boons. Versus
probes drive both paddles; this is not a human side-fairness experiment.

```sh
npm run soak -- 1 pro --seed balance-2026-10-13 --width 750 --group modes --output .temp/balance-750.json
npm run soak -- 1 pro --seed balance-2026-10-13 --width 1290 --group modes --output .temp/balance-1290.json
npm test
npm run build
npm run server:build
npm run typecheck --workspace server
npm run lint
npm run check:menus
npm run check:ui
```

On a memory-constrained host, Node's `--max-semi-space-size=2` and
`--max-old-space-size=192` were used for the headless simulation. The initial
unbounded run exhausted host memory; its partial output was not treated as a
completed result.

The simulation now reports rallies over 90 seconds separately. A stability
stall requires 90 seconds without a player contact or a new rally; sustained
returns in Endless or Relaxed Practice do not count as a trapped ball. The
20-minute match timeout and non-finite/replay checks remain in place.

The checked-in reports retain individual case results. Single matches per case
are coverage/stability evidence only; their win percentages do not establish
that a mode became easier, fairer or more enjoyable. Human tests should compare
new and experienced players, pointer/keyboard/touch, narrow/wide courts and
realistic builds. Record retries, quits, objective completion, duration and one
short description of what felt unfair using the existing
[player-experience validation workflow](player-experience-validation.md).

| Report/check                                                          | Result                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Catalogue baseline, 750](validation/balance-catalog-before-750.json) | 821/821 matches completed, zero stability alerts; all 630 fixed Journey stages, 120 challenges, 60 courts, five ranks and six Daily cards.                                                                                                                   |
| [Nine-mode baseline, 750](validation/balance-before-750.json)         | 41/41 completed, zero alerts.                                                                                                                                                                                                                                |
| [Nine-mode result, 750](validation/balance-after-750.json)            | 41/41 completed, zero alerts.                                                                                                                                                                                                                                |
| [Nine-mode result, 1290](validation/balance-after-1290.json)          | 41/41 completed, zero alerts; two long but active rallies.                                                                                                                                                                                                   |
| Regression suite                                                      | 509 passing tests, including contextual practice rules and the existing tests that system motion preferences are ignored.                                                                                                                                    |
| UI checks                                                             | All 18 lazy menus render in English/Persian; 77 mounted DOM interaction checks pass. These are not browser geometry or physical touch tests.                                                                                                                 |
| Builds and static checks                                              | Web build, server build, lint and server typecheck pass. The server typecheck also exposed an existing optional-field mismatch for `specializationsUsed`; its declaration now matches the schema's allowed `undefined`, without changing runtime validation. |

The contextual-practice continuation also passed translation coverage (644 UI
messages and 2,736 generated descriptions), 124 Persian browser viewport checks
and 80 Workshop highlight checks, including language switching, persistence and
a real match. Regression coverage checks fixed boss phases and pace, retained
equipment, no progression from rehearsals, returning after completion or an early
exit, and preserving Gauntlet hearts and series scores. The simulation reports
above belong to the preceding balance pass; they were not rerun for this UI and
unranked-practice extension.

A focused Chromium check passed all 40 result layouts: Quick Match, Journey,
Daily and a Gauntlet loss in English and Persian at desktop, phone, narrow-phone,
landscape and tablet sizes. The new practice action remained visible after
scrolling and clickable in every case, with no browser errors. The broader
English layout run passed its desktop checks but stopped before completion;
it is not counted as a full-suite pass.

## Completed-roadmap validation, 13 October

- Full engine/server suite: **515 tests pass**. New regressions find real,
  achievable drill shots at 750 and 1290 units; check deterministic feeds,
  actual court-event requirements, neutral builds and reward exclusion; check
  boss guard/recovery, phase inheritance and pause behavior; verify shared-code
  reproducibility and both success/failure endings; verify route progress,
  persistence, replay counters and canonical Gauntlet previews.
- **78 mounted UI checks pass**, including ranked-result → targeted drill →
  original-result restoration, route failure/retry/completion, saved-step resume
  after remount, per-profile storage repair, Demo isolation and shared results.
- **20 lazy menus render in English and Persian**. Translation checks pass for
  674 UI messages and 2,736 generated descriptions.
- **[90 Chromium roadmap layouts pass](validation/roadmap-layout.json)** across five viewport sizes in English
  and Persian, including expanded drills, both Gauntlet route previews, the new
  menus and results, boss cues, the live shared-target counter, and valid/invalid
  shared-code controls. The real app also passed shared-challenge launch,
  pause/quit, short-route launch and persisted unfinished-step reload checks.
  Reproduce with `npm run check:roadmap`. Screenshots and geometry results are
  written under `.temp/roadmap-layout/`; these are browser checks, not native
  device or human-playtest evidence.
- [750-unit simulation](validation/roadmap-750.json) and
  [1290-unit simulation](validation/roadmap-1290.json): **49/49 complete at each
  width, zero stability alerts**. Coverage adds all three drills, all three
  authored bosses and two shared codes to the prior nine-mode sample. The
  pilot does not deliberately solve the drills; the separate collision tests
  establish achievability. Single samples are not difficulty estimates.
- Web/server builds, web/server typechecks, lint and bundle checks pass. The
  server typecheck required a 512 MB heap after a 256 MB run exhausted its heap.
  The web build retains Vite's advisory for a chunk over 500 kB; optional menus
  remain deferred and the bundle regression passes.

Human follow-up remains: first-attempt comprehension, learning transfer,
frustration after misses, use of boss recovery, route completion/replay rates,
and friend score comparisons on matched devices. The local route counters and
existing experience capture support this work; no telemetry is uploaded.

## Actual-app Playwright follow-up

The follow-up tests run the real React app and engine in Chromium, extending the
earlier layout fixtures and start/quit smoke checks through match results,
retries, successful progression and real local account requests. Five bugs were
found and fixed:

- **Gate preparation jumped at serve.** Its hazard clock advanced while waiting,
  then reset at launch. Drill preparation now resets the court, events and ball
  interpolation and holds the hazard clock until the fixed feed begins. Ordinary
  Practice keeps its existing timing.
- **Encounter rehearsals changed the talent build.** XP rewards could level up
  the profile, and a switched specialization was lost on rehearsing the court.
  Rehearsals now capture the completed encounter's resolved build before rewards
  change the profile, keeping boons applied once. Ranked rules ignore that
  unranked-only override.
- **Old matches could survive an account change.** Match ownership is now checked
  against the live profile before recording rewards. A different profile cancels
  the old court, result, rehearsal and route context; same-account sync preserves
  the current encounter.
- **Incoming email links opened the exit prompt.** Same-document verification,
  password-reset and OAuth hashes emit `popstate` as well as `hashchange`. The
  history handler now lets those incoming links reach the account-link handler
  without treating them as Back. Actual browser Back remains covered.
- **Demo levels were parsed only up to the first non-digit.** A fractional level
  such as `1.5` launched level 1, while `1e2` displayed 100 but launched 1. The
  complete numeric value is now parsed and validated as an integer from 1–999.

| Browser suite                                                    | Validation                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [check:browser:pages](validation/browser-pages.json)             | **60 scenarios and 184 page checks pass**: all menu entry paths, setup choices, dialogs, settings persistence, Workshop crafting/equipping/saved builds, talents, Lab, Demo isolation, onboarding and tutorial launch in English/Persian on desktop/phone. The [Demo input follow-up](validation/browser-demo.json) passes another 8 focused checks across those contexts. |
| [check:browser:gameplay](validation/browser-gameplay.json)       | **292 flows pass** across all nine modes, all 60 selectable courts, every isolated boss phase and all 120 challenges, plus series, contracts, Daily variants, results/rehearsals, pause/step/restart, route failure/reload, touch mapping and automatic orientation pause.                                                                                                 |
| [check:browser:drills](validation/browser-drills.json)           | **12 scenarios pass**: three genuinely aimed targets, replay and three genuine misses for all three drills on desktop and rotated phone, including a held gate preview. No rewards change.                                                                                                                                                                                 |
| [check:browser:bosses](validation/browser-bosses.json)           | **3 scenarios pass**: authored rhythm/reach, pause and real scored phase transitions for Gatekeeper, Architect and Duelist.                                                                                                                                                                                                                                                |
| [check:browser:progression](validation/browser-progression.json) | **9 scenarios pass**: all three routes through completion/replay and saved-step reload; Sprint wins, drafts and committed Risk route; complete Bronze cup/trophy; shared 30 returns; first Endless wave; level-up rehearsal and account isolation.                                                                                                                         |
| [check:browser:account](validation/browser-account.json)         | **10 scenarios pass** against a real local API and isolated in-memory SQLite: registration, cookie session/reload, profile sync, guest restoration, failed sign-in, offline queue flush, email verification, password reset, cancelled OAuth link/Back, two accounts and test-account deletion. Email delivery uses the memory mailer.                                     |
| `check:layout`                                                   | **512 browser geometry/interaction checks pass** at desktop, phone, narrow phone, landscape and tablet, including expanded menus/HUD, fullscreen and actual-app Workshop bench/rally flows.                                                                                                                                                                                |

Catalogue gameplay checks launch variants through the app's internal flow
commands, deliberately lose, and check finite physics, selected canonical rules
and published results. They do not independently clear every challenge objective
or every Journey stage. Long completion/progression probes automate paddle input
and accelerate production engine frames with canvas drawing suspended; they never
inject scores or results. Separate UI/layout checks cover rendering, and drill
tests use real pointer aiming and keyboard serves. Phone checks use a real
touchscreen tap plus synthetic pointer events for relative and simultaneous
controls; physical device multitouch is still unverified. Successful progression
uses prepared legal guest builds and a precise automated input driver, so these
results are functional coverage, not difficulty estimates.

The local account suite exercises actual HTTP requests and storage, with no
external account or production database. Real Google/Apple provider sign-in,
native packages and physical webviews still need their own environment checks.
System/browser reduced-motion preferences remain completely ignored; regression
checks emulate both settings and preserve explicit Full/Calm and shake controls.

Supporting checks pass: **518 engine/server tests**, **78 mounted UI checks**,
web/server typechecks and builds, ESLint and the deferred-bundle regression.
Vite still reports the existing advisory for the main chunk over 500 kB.
Reports are retained under `docs/validation/browser-*.json`; screenshots and
working logs stay under `.temp/` and ignored `artifacts-browser-*.log` files.
Run the six `check:browser:*` commands above and `npm run check:layout` to reproduce.
