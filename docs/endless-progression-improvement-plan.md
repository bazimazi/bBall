# bBall endless progression and difficulty improvement plan

Proposed on 6 October 2026. This is the next content and gameplay expansion after
the [player experience review](player-experience-review.md). The quantities,
balance ranges and success thresholds below are proposed design targets, not
implemented features or measured player outcomes.

**Implemented expansion, 7 October:** the
[implementation report](validation/endless-progression-report.md) records the
shipped systems, code-backed counts and validation. This document retains the
original proposal and acceptance targets; proposed human outcomes are not measured
results. Expansion stage definitions use curated templates and generators. The
optional second scoring ball remains gated as described below.

**UI follow-up, 7 October:** the [browser UI review](validation/endless-ui-review.md)
documents the menu and gameplay presentation fixes made after the expansion,
with screenshots and reproducible layout checks.

**Paddle progression proposal, 7 October:** the
[material and upgrade plan](paddle-material-progression-plan.md) proposes a Paddle
Workshop with cores, contact surfaces, bounded tuning and technique contracts.
Its first playable scope has nine core and surface combinations; it is a design
proposal, not an implemented part of this expansion.

Expand bBall around three connected systems: a much larger Journey, a Gauntlet
that can continue indefinitely, and opponents that challenge developed builds
through decisions, placement and skill timing. Every mode should benefit from
the same encounter library. Permanent progression should keep offering goals
after combat power reaches its cap.

The first playable milestone should combine stronger bots, three new mechanics,
48 new Journey stages and an endless Gauntlet prototype. Validate that slice
before multiplying it into the full content targets. A thousand permutations of
an easy match would leave the current problem intact.

## Current limits and opportunities

| System        | Current implementation                                                    | Expansion target                                                                                                                          |
| ------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Journey       | 5 worlds, 30 stages, 90 stars                                             | Preserve those stages; add 25 worlds with 24 stages each, for 630 authored stages and 1,890 stars; then offer unlimited generated sectors |
| Gauntlet      | 9 encounters, 3 acts, 5 Pressure ranks                                    | Retain the short format; add 36-encounter expeditions, endless continuation and 50 designed Pressure ranks                                |
| Courts        | 14 presets                                                                | At least 60 curated layouts and 12 reusable hazard families                                                                               |
| Bosses        | 7 definitions with phases                                                 | 25 distinct bosses in total, plus optional mastery variants                                                                               |
| Challenges    | 14 fixed challenges                                                       | 120 authored challenges, repeatable contracts and generated series                                                                        |
| Boons         | 15, including 3 duo boons                                                 | 72 boons in total, including 24 duos, plus 24 distinct run relics                                                                         |
| Talents       | 40 talents; talent points stop at level 50                                | 64 talents in total; keep a bounded point budget and add mastery choices                                                                  |
| Tournament    | 3 tiers and 3 rounds per cup                                              | 10 cup tiers, selectable formats and an ongoing championship ladder                                                                       |
| Daily         | One date-seeded encounter; Amateur or Pro                                 | Standard and Master cards, a weekly expedition and an archive                                                                             |
| Player levels | Intended to continue beyond power unlocks; implementation guard at 10,000 | Continue useful mastery, collection and records without continual stat growth                                                             |

Source anchors: [Journey](../src/core/campaign/journey.ts),
[Gauntlet](../src/core/run/run.ts), [boons](../src/core/run/boons.ts),
[courts](../src/core/modes/arenas.ts), [bosses](../src/core/modes/bosses.ts),
[challenges](../src/core/modes/challenges.ts),
[talents](../src/core/talents/catalog.ts),
[tournaments](../src/core/tournament/bracket.ts),
[Daily](../src/core/daily/daily.ts) and [levels](../src/core/progression/levels.ts).

Several existing rules explain why adding stages alone is insufficient:

- Player paddle speed grows from 960 to 2,000 before ultimate bonuses; Legend
  moves at 950. Player movement also differs by input method, so this comparison
  identifies a possible balance pressure rather than proving a human win rate.
- Bot placement usually selects the half opposite the player's current position.
  It does not evaluate a sequence of shots or run an active skill economy.
- Prediction handles reflected wall paths and simulates wind, wells and portals,
  but it does not forecast the complete moving-obstacle collision sequence or
  all talent effects. Hazard collisions trigger another read afterward.
- Rally stress increases mistakes, while player talents can add heft, curve,
  automatic saves and cooldown recovery. A patient developed build may benefit
  from several of these at once.
- Pressure mostly changes serve pace, hearts, courts, draft size and starting
  score. It does not itself raise the ordinary encounter bot selection.
- Existing content depends on global stage lists and fixed run lengths. Changing
  the catalog can also change achievement requirements, saves and validation.

These observations come from [bot profiles](../src/core/bots/levels.ts),
[AI](../src/game/ai.ts), [balance](../src/core/balance/config.ts),
[physics](../src/game/physics.ts) and [profile progress](../src/core/profile/progress.ts).
The earlier review's small bot-versus-bot sample showed Legend defeating its Pro
proxy. That does not contradict the reported human experience with skills and
talents: the new benchmark must exercise those builds and actions explicitly.

## Design rules

1. Keep creating new decisions: shot route, timing, opponent pattern, build,
   contract or resource tradeoff should change between encounters.
2. Raise the ceiling substantially while keeping Rookie a useful entry point.
   Journey teaches each mechanic before combining it with other demands.
3. Make every enemy advantage visible. Ordinary bots obey travel limits,
   collision rules, cooldowns and resource costs. Boss exceptions appear in
   their introduction and have a visible counterplay window.
4. Cap physical speed, collision density, automation and cooldown loops. After
   those limits, progression comes from rotating constraints and harder choices.
5. Make long progression resumable. Huge content counts must not require huge
   uninterrupted sessions. Bank earned rewards at defined boundaries.
6. Use fixed, reproducible rules for a selected encounter. Difficulty never
   secretly changes because the player levels, wins a point or equips a talent.

Valve describes replayability through constrained combinations and alternating
intensity. Apply that principle to bBall with seeded encounter schedules and
recovery nodes; it supports the structure, not any particular content count or
promise of retention. [Valve, Replayable Cooperative Game Design](https://steamcdn-a.akamaihd.net/apps/valve/2009/GDC2009_ReplayableCooperativeGameDesign_Left4Dead.pdf).

Difficulty depends on the player as well as the barriers. Keep descriptive
opponent tiers, pausable local play and explicit practice options while making
the upper tiers substantially harder. [Xbox Accessibility Guideline 108](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/108).

Follow [AGENTS.md](../AGENTS.md): ignore operating-system and browser reduced-motion
settings completely on web, desktop and mobile. Full/Calm effects and screen
shake remain explicit in-game choices. Essential hazard warnings must remain
clear under both effects choices. Any later motion-related implementation or
guidance must keep the root README, server README, packaging guide and player
experience review consistent with this policy.

## Stronger opponents and meaningful difficulty tiers

### Rebuild the decision loop

Split bot decisions into observing, predicting, selecting a shot, travelling and
using a skill. Feed observation snapshots into the brain at its permitted reaction
cadence. Use visible ball motion, court state and announced ability effects;
the bot cannot inspect the player's next input or a future random result.

Extract a side-effect-free trajectory model shared with actual movement and
collision rules. Forecast moving bumpers, surviving bricks, portal locks, wind
phase, wells, curve and local time scaling. Predictions must operate on copied
state and leave real bricks, cooldowns and effects untouched. Lower tiers retain
limited horizons and imperfect observations; stronger tiers evaluate more paths.
Share corrected prediction with foresight and path previews so player guidance
and bot reads agree with actual physics.

Evaluate candidate contact offsets and paddle movement for straight placements,
bank shots, flicks, route-through-hazard shots and safer recoveries. Rank them by
the opponent's reachable space, flight time, exposed corner and the bot's own
recovery cost. A strong bot should first draw the player out, then reverse its
placement, rather than repeatedly sending the ball to an obvious open half.

Add six personalities independently of tier: Anchor, Aggressor, Banker, Curver,
Disruptor and Opportunist. Each needs a strength, a weakness and a recognisable
shot pattern. Legend Banker and Legend Aggressor should require different
responses while staying within comparable overall difficulty.

Introduce short memory of observed returns and movement. Elite and Legend can
respond to repeated early dashes, identical serves or constant corner flicks.
Memory decays and observations arrive after the reaction delay. Display a short
scouting description before the match; never turn adaptation into a guaranteed
counter or arbitrary mid-match stat increase.

### Give skilled opponents an actual skill economy

Refactor talent and active runtime from player-only state into side-specific
combatants before granting bots actives. Both sides use the same activation,
resource, cooldown, recast and collision rules. Count their casts separately;
player reward statistics still describe the player.

Amateur occasionally uses one clearly announced basic skill; Pro carries two;
Elite carries three; Legend carries three or four and can coordinate them. These
are proposed loadout budgets. Rookie learns movement and placement first. A
warning should reveal a charged shot or guard, while a persistent opponent bar
shows known skills and recovery. Telegraphing does not pause the ball or expose
an uncommitted future decision.

Bots should save a dash for a physically recoverable gap, guard an anticipated
dangerous return, and create openings before a charged attack. They sometimes
choose incorrectly. Legend's challenge comes from combining good choices, not
from free permanent shields or a paddle that snaps to the ball.

### Initial tuning bands

These values are experiment ranges, not a bulk replacement of the current
catalog. Higher movement changes the existing claim that every bot is slower
than every player; revise those code comments and relevant guidance explicitly.

| Tier    | Proposed behavior                                                         | Reaction band | Paddle speed band in field units per second |
| ------- | ------------------------------------------------------------------------- | ------------- | ------------------------------------------- |
| Rookie  | Returns routine shots, occasionally places deliberately; obvious openings | 300–400 ms    | 550–650                                     |
| Amateur | Reads ordinary bounces and recovers; one simple skill                     | 220–300 ms    | 750–900                                     |
| Pro     | Reliable placements, bank shots and two-skill decisions                   | 150–220 ms    | 950–1,150                                   |
| Elite   | Plans setup shots, handles mixed courts, times three skills               | 110–170 ms    | 1,150–1,400                                 |
| Legend  | Plans reversals, adapts to observed repetition, coordinates skills        | 80–130 ms     | 1,350–1,650                                 |

Do not simultaneously maximize all parameters. Movement, prediction, skill use,
error and recovery should jointly produce the intended tier. Test keyboard's
movement share as well as direct pointer movement before accepting a profile.
Keep competitive assist at zero and The Wall's practice behavior separate.

Replace unbounded fatigue penalties with bounded, tier-specific composure.
Maintain occasional errors, but make positioning and forced travel the main way
to defeat a strong bot. Cap the combined error from fatigue, heft and misreads so
one build cannot turn Legend into a permanently confused opponent. Preserve the
value of curve and heavy returns through delayed information and harder routes.

Quick Match should keep Rookie through Legend as stable identities. Offer
optional Master and Mythic contracts above Legend inside that screen, with their
loadout and restrictions shown. They are endgame variants, not extra XP rank
numbers silently fed into the five-entry rank tables.

## New mechanics and combinations

Keep the single-ball paddle duel as the core. Build the following seven families
on top of existing bumpers, wind, wells, portals and bricks, for 12 families in
total. Start with gates, rails and switches.

| New family           | Player decision                                                 | Warning and limits                                                            | Example combination                                                    |
| -------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Timed gates          | Place a shot through a changing opening or bank around it       | Mark the opening and countdown; never close onto the ball                     | Gate plus shear wind rewards timing rather than raw pace               |
| Angled rails         | Choose a deliberate reflected route to the far corner           | Draw the reflecting face; cap consecutive contacts                            | Rail plus moving bumper offers two changing bank routes                |
| Hit switches         | Strike a target to change a gate, wind direction or brick state | Show linked target and resulting state before activation                      | Switch plus armoured bricks opens a breach instead of brute forcing it |
| Charge zones         | Route through a lane to empower the next contact at a cost      | One marked empowerment at a time; expire it after contact                     | Charge zone plus portal creates a fast route with a dangerous recovery |
| Phase barriers       | Attack during an opening, or reposition during the closed phase | Countdown and shape change; preserve a usable bypass                          | Barrier plus pulsing well changes the preferred route each cycle       |
| Breakable deflectors | Decide whether to use a useful bank surface or destroy it       | Show durability; deterministic debris-free collision removal                  | Deflector plus bricks makes the court evolve during a match            |
| Echo ball            | Track a temporary second scoring threat in advanced encounters  | Distinct outline and owner; at most two real balls; initially exclude portals | Echo plus static rails rewards coverage and prioritisation             |

Echo is a later, optional mechanic. Ship it only after scoring, simultaneous
contacts, shields, replay and goals support multiple balls. A cosmetic decoy
does not satisfy this mechanic. Define one point maximum per rally: after the
first scoring event, remove all balls; resolve same-tick opposing goals using
an explicit deterministic tie rule and replay the serve without awarding a
point. Keep it out of ordinary Quick Match and the teaching campaign.

Add four encounter objectives alongside ordinary wins: hit a marked bank route,
break a designated structure, score through an opening, and win a point after
triggering a switch. These require actual collision events and per-side counters.
Do not infer objective success from generic hit or rally totals. Teach objectives
one at a time; after teaching, use them mainly for optional stars and contracts.

Dynamic courts may change state after a trigger or point, but must announce the
change and protect the current ball path. Prefer structural changes between
points. If a mid-rally change is essential, defer it until safe occupancy and a
minimum response window are satisfied.

### Build encounters from compatible parts

Create a shared encounter recipe with court layout, hazard families, opponent
tier/personality/loadout, objective, match format, contract and seed. Define
collision, attention, pace and sustain budgets separately. A low total budget
must not conceal a lethal spike in one dimension.

Allow one family in teaching encounters, two in consolidation, and normally no
more than three simultaneously active families in mastery. A larger stage can
rotate families across phases. The number of independent timers also has a cap.
Difficulty budget includes boss exceptions, player restrictions and automatic
saves on either side.

Reject intersecting spawn hazards, missing return routes, goals that cannot be
met, near-goal portal exits without enough response time, closed barrier loops
and mutually contradictory contracts. Guarantee clearance for the ball radius
across the supported court widths; scale or select geometry for narrow courts.
Do not distort the court to evade an invalid layout.

Generate from curated templates, then validate. After a bounded number of
rejections, use a known valid template at the requested difficulty. Keep a recent
history of gameplay signatures, including route topology, timing, objective and
opponent strategy; merely changing colours or mirroring coordinates does not
count as a new encounter. Measure actual diversity after filtering rather than
advertising a product of raw option counts.

Examples for the eventual library:

| Encounter      | Combination                                | What makes it different                              |
| -------------- | ------------------------------------------ | ---------------------------------------------------- |
| Crosswind Lock | Shear wind, timed gate, Pro Banker         | Open the bank route just as the wind changes         |
| Siege Relay    | Bricks, hit switch, breakable deflector    | Create a breach while preserving a useful bank       |
| Orbital Needle | Sliding bumpers, portal, Elite Opportunist | Choose the longer safe route or shorter exposed exit |
| Storm Circuit  | Pulsing well, charge zone, Legend Curver   | Trade attack strength against recovery position      |
| False Opening  | Phase barrier, timed gate, Legend Anchor   | Draw out a guard before the scoring window           |
| Twin Pressure  | Echo ball, static rails, Elite Aggressor   | Cover two lanes with one limited dash                |

## Journey with hundreds of stages and an ongoing frontier

### Preserve the existing campaign and add five expansion arcs

Keep the original 30 stage IDs, earned stars and achievement IDs. Present the
original five worlds as the opening chapter. Add worlds 6 through 30: five arcs,
each containing five new worlds with 24 stages. This adds 600 stages and brings
the authored Journey to 630.

| Arc               | Five proposed world themes                                                      | Progression focus                                        |
| ----------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Precision Circuit | Bankworks, Shifting Rails, Crosswind Lock, Timing Grounds, The Gatekeeper       | Placement, rail routes, gates and stronger Pro opponents |
| Reactive Courts   | Switchyard, Siege Relay, Pulse Garden, Charge Circuit, The Architect            | Triggered state changes and court control                |
| Rival Schools     | Anchor Hall, Aggressor Foundry, Curver Basin, Disruptor Ring, Rival Summit      | Distinct personalities, visible skills and counterplay   |
| Fractured Worlds  | Portal Labyrinth, Deflector Ruins, Twin Pressure, Storm Circuit, Fracture Crown | Difficult combinations and optional advanced ball rules  |
| Apex Dominion     | Legend Trials, Resource Crucible, False Opening, Dominion Relay, The Sovereign  | Developed builds, mixed objectives and boss mastery      |

Each world contains 12 core stages, eight branch stages, three mastery trials
and one world boss. Core stages teach and combine the theme; branches offer
alternate courts or opponents; trials impose difficult optional objectives.
Core stages and the boss establish the route forward. Optional stars unlock
trials, rewards and shortcuts without becoming a mandatory perfection grind.

Reuse the seven existing bosses through explicit rematches and introduce 18 new
boss definitions, reaching 25 in total. A world may feature a new boss or a
distinct rematch of an existing one. Count rematches separately from unique
bosses. Start with Gatekeeper, Architect, Duelist and Sovereign; each adds a
different tactical problem and has three readable phases.

For example, Architect first protects a breach with switches, then repositions
deflectors between points, then exposes two alternating routes. Its final phase
reuses learned rules at higher intensity. It never deletes a player's skill or
creates an unavoidable goal simply because the player is close to victory.

### Increase challenge through mastery rules

Offer Story, Veteran and Ascendant variants with separate medals and records.
Story introduces the new mechanics using the strengthened ordinary tier ladder.
Veteran uses stronger personalities, coordinated skills and paired hazards.
Ascendant adds elite enemy loadouts, stricter optional objectives and limited
resource contracts. Disclose differences before starting and allow retries.

Make Veteran available per completed world, so experienced players can move into
harder play without completing hundreds of new teaching stages first. Provide
an explicit placement trial that unlocks appropriate expansion routes; it grants
access, not unearned stars or first-clear rewards. Existing finishers can enter
the frontier immediately and return to authored expansion worlds whenever they
want. Legacy progress never forces them back to the opening stage.

Default duels stay short, normally first to three or five; longer series belong
in boss mastery and selected championship trials. Difficulty should increase
the need to learn, not inflate every health or score target.

### Continue after the authored Journey

Journey Beyond generates numbered 20-encounter sectors: four groups of four
duels and a boss. Each sector has a chosen biome, a scheduled mechanic mix,
optional branches and contracts. Completing it banks a sector medal and opens
the next. Save between encounters; losing retries the current stage rather than
erasing the expedition.

Increase challenge over the initial mastery bands, then rotate difficult
combinations after the physical and cognitive budgets reach their caps. Later
sectors vary route structure, enemy skills and contracts instead of adding
another percentage of speed forever. There is always a next sector; there is
no promise that every sector is mathematically unique or harder than all earlier
ones. Offer repeatable apex trials for players who want a consistent benchmark.

Show the current arc/sector and nearby nodes, with a searchable chapter index.
Do not mount hundreds of stage cards together or show a misleading finite total
for the frontier. Keep authored stars, variant medals and generated sector
records distinct so completion remains understandable.

## Gauntlet with longer runs and endless continuation

### Three lengths within the existing mode

| Format     | Structure                                      | Purpose                                          |
| ---------- | ---------------------------------------------- | ------------------------------------------------ |
| Sprint     | Existing 9 encounters, upgraded recipes and AI | A short complete run and legacy compatibility    |
| Expedition | 36 encounters across 6 acts                    | A substantial build with several strategic turns |
| Endless    | An unbounded sequence of 6-encounter acts      | Depth records and continually renewed challenges |

An Expedition act has four ordinary fights, one elite encounter and one boss.
Place route decisions and a service node between fights; service nodes do not
count toward the 36 encounters. Offer previews for two paths: one emphasises
risk and stronger rewards, the other a safer match or better build support.
Do not require both paths to advance.

Continue a completed Sprint or Expedition into Endless at a declared depth and
challenge band. Record the completed format immediately. At every Endless act
boundary, let the player bank the segment and leave with earned rewards or
continue with the same build. Banking ends that run; suspending preserves it
without granting another clear. Distinguish encounter depth from overall tier.

Retain heart loss and rematches. A defeat cannot reroll the court, draft or
rewards. Restoring a suspended run preserves its pending choice and history.
Determine and display how an unfinished live encounter resumes before launch;
do not make force-closing a free loss cancellation. Initially use deterministic
encounter restarts with an already committed attempt record; consume a heart
when an unfinished committed attempt is discarded, with crash recovery designed
and tested separately.

### Prevent long runs from becoming invulnerable

Expand to 48 ordinary boons and 24 duo boons. Add 24 run relics that change rules
through an explicit benefit and cost. Keep at most three relics equipped; swapping
or recycling belongs at service nodes. Examples include:

- Banker's Compass: more control after a bank, but weaker straight power shots.
- Glass Engine: a stronger charged return with fewer automatic saves.
- Circuit Heart: recharge from hit switches, with slower passive recovery.
- Patient Crown: guard rewards careful timing; an early activation lengthens
  its next cooldown.

Use bounded boon ranks and the existing stat ceilings. Once useful upgrade
choices are exhausted, every draft still offers a legal service choice such as
a reroll token, a relic exchange or repair credit. Never return an empty draft
that blocks progression. Avoid replacing all choices with the same automatic
heart refill.

Give long runs capped recovery credits earned from play. Healing, upgrading and
rerolling compete for them. Guarantee occasional recovery opportunities, not
full recovery. Automatic saves remain charges with finite recovery rates;
time spent in menus or manual serve waiting cannot replenish them.

Later acts introduce enemy build variants, alternative scoring routes and
forecast contracts. Rebalance overtuned sustain combinations directly. Do not
solve them by granting every deep opponent blanket shield immunity.

### Fifty designed Pressure ranks and continuing depth

Keep ranks 0–5 meaningful and migrate their existing clears. Extend to 50 with
five bands. Individual ranks select bounded contracts within their band;
they do not permanently stack 50 punishments.

| Pressure | Main added demand                                                         |
| -------- | ------------------------------------------------------------------------- |
| 1–10     | Stronger ordinary opponents, hazard pairs and resource tradeoffs          |
| 11–20    | Elite loadouts, narrower timing windows and harder boss phases            |
| 21–30    | Legend personalities, route decisions and constrained relic builds        |
| 31–40    | Multi-phase courts, difficult objective combinations and scarcer recovery |
| 41–50    | Mythic recipes that require mastery within fixed speed and density caps   |

Pressure 50 is the top designed difficulty band, not the end of Gauntlet.
Endless depth continues with changing legal combinations within that band.
Show the full active contract set and next act's scheduled change before the
player commits. Keep some recovery acts between peaks rather than holding every
fight at maximum intensity.

## Expand every other game area

| Area               | Proposed expansion                                                                                 | Ongoing goal                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Quick Match        | Tier plus personality selection, optional court, best-of series and Master/Mythic contracts        | Tier mastery records by opponent school and ruleset               |
| Endless rally mode | Classic Wall plus selectable hazard courses and a wave variant that changes courts between rallies | Separate best records by course and wave depth                    |
| Challenges         | 120 authored trials across placement, timing, survival, destruction, skills and mixed courts       | Seeded five-trial series and repeatable contract grades           |
| Tournament         | 10 cup tiers; short knockout, longer bracket and league formats; opponents with scouting cards     | Continuing championship divisions and repeatable title defenses   |
| Daily              | Standard and Master cards on the same date; one weekly expedition                                  | Shared fixed-build medals and separate personal-build records     |
| Practice           | Choose hazard, personality, boss phase and skill loadout; replay a failed scenario                 | Drills for gates, bank routes, switches and skill counterplay     |
| Versus             | Select courts, series format and mutually chosen modifiers                                         | Local rematches, saved presets and mirrored hazard symmetry       |
| Talents and skills | 24 new talents, including six new actives, with free respec and saved builds                       | Unlock tactical alternatives and complete build mastery tasks     |
| Achievements       | New content achievements plus repeatable mastery milestones                                        | Records, titles and collection progress beyond one-off badges     |
| Cosmetics          | Court themes, ball trails, paddle finishes and skill accents tied to demonstrated mastery          | A collection with clear acquisition goals and no combat advantage |
| Profile and Home   | Pinned next Journey stage, active run, recommended drill and chosen personal goal                  | A visible next action after every completion                      |

Keep ranked presets separate from custom Quick Match and Versus configurations.
Custom matches use a declared reward policy rather than automatically inheriting
ranked XP. New tournament formats need format-specific reward checks; the current
third-round final assumption cannot award a trophy early in a longer bracket.

Daily Standard retains the forgiving entry route; Master supplies the requested
expert challenge. For comparable results, a fixed-build card gives everyone the
same temporary build. Personal-build attempts use separate records. Archive
play is available offline and after the date closes, but cannot extend today's
streak or receive the original daily first-clear bonus. Update the server's
current date-window validation rather than sending archived matches as live
dailies. Weekly schedules must not depend on a server operator writing a new
event every week.

Practice needs step and reset tools, visible landing estimates and the ability
to isolate a boss phase. Keep its normal and Relaxed pace options. New mechanics
must work with existing movement and skill controls on mouse, keyboard, pen and
touch; avoid mandatory extra buttons for court switches that can be hit by the
ball.

## Permanent progression after combat power caps

Keep talent points bounded, initially preserving the current 49-point budget.
Expanding the tree to 64 nodes should create more competing builds rather than
eventually let players purchase everything. Preserve active-slot, length,
cooldown, recast and speed limits unless a measured experiment justifies a
specific change. Six new actives compete for existing slots.

Prototype Redirect, which charges a deliberate next-contact angle; Anchor,
which improves a bank during a short committed window; Breach, which adds
structure damage at the cost of a weaker return; Relay, which rewards hitting
a switch; Reserve, which stores a bounded delayed charge; and Rebound, which
trades a guard for a stronger recovery shot. Every prototype needs a clear
trigger, cooldown, visible enemy use and a downside or slot opportunity cost.
Names and exact magnitudes should settle after playtesting.

Add mastery tracks for technique, opponent schools, hazard families and builds.
Earn mastery through the relevant action and increasingly demanding contracts,
not just thousands of easy wins. Rewards include alternate skill behaviors,
cosmetics, titles and preset slots. Alternate behavior is a tradeoff, not a
permanent multiplicative upgrade.

Use numbered mastery cycles after finite reward tracks are complete. Cycles
offer newly seeded contract sets and record milestones without resetting earned
talents, campaign access or cosmetics. An optional fresh-build Gauntlet format
can provide the appeal of restarting without wiping the profile.

Revisit the existing 25-match XP damper when longer formats arrive. Separate
repeatable match XP, first-time content rewards and milestone rewards; make
small run fights and long tournament series comparable by actual effort. Preview
the award policy. Progress should remain useful on a long session without
letting a trivial regenerated recipe pay a fresh first-clear bonus forever.
Never multiply generated-sector rewards directly by an unbounded sector number;
the current world-based star XP formula is for a finite authored campaign.

## Persistence and shared rules required for scale

Build these foundations before raising constants. Otherwise longer runs can be
truncated or rejected even when the client displays them correctly.

| Concern             | Existing coupling                                                                      | Required change                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Journey identity    | Only catalog IDs pass `isStageId`; unlocks depend on world order and the last stage    | Separate legacy stages, authored expansion nodes, explicit boss IDs and generated sector identity; use explicit prerequisites |
| Campaign completion | Achievements and UI consume global totals                                              | Preserve legacy completion; give each expansion/variant its own completion scope                                              |
| Run format          | `RUN_STAGES`, `actOf`, boss positions and three fixed act pools                        | Resolve length, act layout and opponents from a versioned format descriptor                                                   |
| Pressure            | Client clamps at 5; HTTP operation schema also caps at 5                               | Validate selected contract ranks through shared versioned definitions                                                         |
| Encounter depth     | Match HTTP schema allows `runStage` only up to 16                                      | Use a validated segment/depth identity that supports deep play without accepting arbitrary fabricated depth                   |
| Run history         | Profile repair retains only 40 results                                                 | Keep aggregates and bounded recent history; preserve verification state without an ever-growing array                         |
| Content updates     | Court availability is filtered by start date, but other pools and balances remain live | Pin catalog, generator and rules versions, with retained support for active runs and queued results                           |
| Bot combatants      | Skills and several collision saves are player-specific                                 | Generalise runtime, outcomes, replay events and validation by side                                                            |
| Server trust        | Server resolves the encounter but receives reported match metrics                      | Validate route, unlock, draft, casts and reward transitions; do not describe this as full authoritative replay                |
| Offline sync        | Run operations currently cover start, boon pick and abandon                            | Add versioned route, service, bank and continuation operations with idempotent application                                    |

Touchpoints include [mode rules](../src/core/modes/rules.ts),
[profile repair](../src/core/profile/progress.ts),
[account operations](../src/core/account/progression.ts),
[HTTP schemas](../server/src/http/schemas.ts),
[match validation](../server/src/domain/matchValidation.ts),
[server progression](../server/src/services/progression.ts) and
[sync](../server/src/services/sync.ts).

Version recipe generation separately from full simulation. Current encounters
and drafts are seeded, but AI and some arena state use runtime randomness.
Introduce independent seeded streams for gameplay decisions, court events and
drafts; keep visual randomness separate. A cosmetic particle must never consume
the next gameplay decision. Reproducibility claims must state whether they cover
the recipe or a complete simulated attempt.

Persist a compact active segment, its committed choices, pending draft, build,
hearts, aggregate records and seed/version. Re-derive future segments on demand.
Generated Journey progress needs a frontier and sparse records, with bounded
detailed history and explicit replay identity. Do not store every hypothetical
stage in the profile or download the entire endless catalog at startup.

Migrate existing live nine-stage runs to a legacy format descriptor and let them
finish under their original rules. Preserve stars, achievements, cup progress,
talents and XP. Old queued results must resolve against their original supported
rules version; never silently reroll an in-progress encounter after an update.
Handle invalid or unsupported versions with a specific recovery path that keeps
banked progress. The compatibility window must cover long offline runs or provide
an explicit safe archival path.

## Validation and acceptance criteria

### Demonstrate that harder bots challenge developed builds

Extend [the simulation harness](../scripts/sim.ts) with several player controllers:
placement-focused, repeated corner-flick, timing-aware skill user, defensive
sustain, aggressive power, cooldown chaining and mixed play. Exercise levels
1, 15, 30 and 50 with legal builds and real activation policies. Do not give every
controller the same new tactical brain; otherwise the benchmark hides whether
the opponent punishes a particular habit.

Use common seeds across candidates and report point share, match win rate,
attempts, rally duration, error type and automatic-save consumption. Run at least
200 seeded matches per shortlisted tier/build/viewport case and report uncertainty
intervals. Bot proxies establish regressions and exploit resistance, not human
enjoyment or a real player's difficulty category.

For experienced human players using developed builds, use these initial first-
attempt targets in ordinary Quick Match. Keep them separate from novice goals.

| Opponent | Proposed experienced-player win band |
| -------- | ------------------------------------ |
| Rookie   | 85–98%                               |
| Amateur  | 70–90%                               |
| Pro      | 45–65%                               |
| Elite    | 25–45%                               |
| Legend   | 10–25%                               |

Recruit novices separately to check that Rookie and early Journey remain
learnable. Collect at least 30 attempts from at least ten participants in each
skill cohort for a pilot, with input and build recorded; repeated attempts from
one player are not independent samples. Expand the sample if intervals are too
wide to distinguish tiers. Have returning players retry Legend after practice:
successful improvement should come with an explainable tactic, not a lucky
sequence of bot failures.

Record whether players understand why they lost, identify a counter, choose to
retry and find victory satisfying. Target at least 80% correct explanations of
the relevant mechanic in the pilot and investigate repeated reports of
unavoidable points. These are launch decision aids, not retention predictions.
Use the existing [experience validation workflow](player-experience-validation.md)
for trial and device capture.

### Verify content, fairness and endurance

- Validate every authored stage and generated objective before release. Generate
  at least 10,000 sampled recipes across difficulty bands, supported aspect
  ratios and versions; use bounded generation time and a valid fallback.
- Test prediction against actual ball advancement for each hazard family and
  supported pair, including moving collisions and side-specific abilities.
- Check legal bot speed, observation delay, skill costs and absence of free
  competitive assist. Test each boss exception and its counterplay window.
- Simulate at least 1,000 consecutive Gauntlet encounters with save/load,
  exhausted boon pools, repeated losses and act banking. Verify bounded history
  and memory, legal drafts and exact continuation.
- Exercise guest, signed-in, offline, demo and migrated saves; interrupt every
  route/service/draft/bank transition and replay queued operations. Rewards and
  hearts must apply exactly once.
- Cover multi-ball score arbitration, replay and shields before enabling Echo.
- Check portrait touch, keyboard, pointer, resizing, pause and manual serving
  under dense courts. Full and Calm must preserve gameplay and readable warnings;
  both system reduced-motion values must have no effect.
- Measure prediction and recipe costs on lower-end devices using the existing
  diagnostics. Start with a provisional p95 bot-decision budget of 2 ms on the
  chosen baseline device; cap candidate work and stagger thinking if needed.
  Verify actual frame pacing before claiming this budget is sufficient.
- Measure encounter diversity over 100-act samples: no exact gameplay-signature
  repeat within the previous ten eligible encounters unless an announced rematch
  requires it; no personality should dominate the schedule accidentally.

Run the repository's tests, typecheck, lint, production build, experience checks
and seeded soaks as appropriate to each implementation phase. Keep the previous
collision, input, pause, storage and account regressions in the release gates.
Automated passes do not replace physical-device or human difficulty checks.

## Implementation sequence and release gates

Effort below describes relative size. The full expansion is a sequence of
releases, not a credible one-sprint task; schedule estimates should follow the
first slice and actual team capacity.

| Phase | Priority and effort | Deliverable                                                                                                    | Required before proceeding                                                                                    |
| ----- | ------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1     | P0, medium          | Seeded build/skill benchmark; versioned encounter and run descriptors; migration fixtures                      | Baseline exposes developed-build weaknesses; old active saves and queued operations still resolve             |
| 2     | P0, large           | Shared trajectory model, tactical bot loop, six personalities, side-specific skills; stronger five-tier ladder | Clear tier separation, legal behavior, meaningful input/build coverage and measured prediction cost           |
| 3     | P0, large           | Gates, rails, switches, compatible recipe composer and new objective events                                    | All three work in physics, renderer, prediction, replay, tutorial and validation                              |
| 4     | P0, large           | Two new 24-stage Journey worlds, four boss prototypes, endless Gauntlet slice, first boon expansion            | 48 stages play well; a long run resumes correctly, remains challenging and never exhausts choices             |
| 5     | P1, large           | Full Journey expansion through staged arc releases; variants and Journey Beyond                                | Every arc has distinct tactics; legacy completion remains preserved; frontier offers an immediate next sector |
| 6     | P1, large           | 36-encounter Expedition, route/service nodes, 50 Pressure ranks, 72 boons and 24 relics                        | Difficulty caps hold; deep runs resist dominant sustain; banking and offline continuation are reliable        |
| 7     | P1, large           | Remaining hazard families, challenge library, cups, Daily Master and archive, advanced practice                | Each mode uses the shared recipes and has a clear ongoing goal; Echo passes its separate gates                |
| 8     | P1, medium to large | New talents/actives, mastery tracks, cosmetics, improved next-action UI and release documentation              | Progress remains useful after power caps; records and rewards stay understandable and balanced                |

Phases 5 and 6 can release incrementally after the slice succeeds; use one shared
catalog so their work strengthens both modes. Add mechanics, enemy variants and
curated templates in later releases without invalidating active runs. Keep
progression and migration work alongside each feature rather than leaving it
until the final content drop.

### First playable milestone

The first release candidate should contain the following concrete scope:

1. Stronger Rookie-to-Legend behavior, with skills for the upper tiers and a
   benchmark that actively uses player builds.
2. Gates, rails and switches across at least 12 new curated court layouts.
3. Two expansion worlds with 24 stages each, taking Journey from 30 to 78 stages.
4. Gatekeeper and Architect as complete new bosses, with Duelist and Sovereign
   available as development prototypes.
5. Endless Gauntlet acts with resumable choices, banking, bounded history and
   at least ten playable Pressure ranks.
6. At least 30 boons in total and six run relics, including a useful fallback
   after upgrade choices are exhausted.
7. Practice scenarios for every new mechanic and upper-tier skill counterplay.
8. Tested legacy migrations, shared server validation and measured human/device
   results for this slice.

This milestone immediately expands playable content and tests the systems that
will carry the larger release. The long-term result is 630 authored Journey
stages, an ongoing frontier, a Gauntlet with no final encounter, and opponents
whose hardest tiers remain a meaningful goal after the player develops a build.
