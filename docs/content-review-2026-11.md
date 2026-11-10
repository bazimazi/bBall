# Content and retention review, 10 November 2026

Why players stop: a review of every mode's content, the progression loop and the
first hours of play, run in the real app with Playwright and on the real engine
in headless matches. It led to two new mechanics, 22 rewritten or new bosses, a
reworked Journey from world 6 to 30, ten new challenges, and a set of removals.

**Evidence and limits.** Win rates below come from bot pilots on the real engine
(a Pro or Elite brain driving the player's paddle, with and without a benchmark
build). They show stability and relative difficulty, before against after on
the same stages and seeds. They are not playtest evidence. Bots do not see the
new mechanics the way a person does: a pilot's aim ignores the Warden, so Warden
bosses read harder for bots than they are likely to be for people. System and
browser reduced-motion settings remain completely ignored. Every new visual
follows the Full/Calm and shake settings like the rest of the court.

## What the investigation found

### Content collapses into repetition after the first 30 stages

- Journey worlds 1 to 5 are 30 hand-made stages. Worlds 6 to 30 are 600
  generated stages built from 12 court templates (46 near-identical variants
  named "Bankworks 2/3/4"), all against the same Pro bot.
- Their names read as generated filler: "Core 7 · Bankworks 3", "Branch 14 ·
  Rail Slalom". About 54 distinct blurbs covered 600 stages.
- 15 of the 18 expansion bosses were generated: a name from the id, a title
  copied from a court blurb, and phase banners like "Bankworks 4 opens".
- Names contradicted content. Switchmaster had no switches, Riftkeeper no
  portals, Stormcaller no wind. World 10 "The Gatekeeper" fought the Railwarden.
  The final world, "The Sovereign", fought the Switchmaster.
- Bosses repeated across worlds 24 to 30 (`n % 18`). In the Gauntlet, the
  late-act boss was `(act + pressure) % 18`, with no seed. A Pressure-0 Sprint
  met Colossus twice. Bastion, Trickster and Apex could never appear in a new
  run.
- 106 of the 120 challenges, every Frontier stage and every Gauntlet encounter
  come from the same templates.
- Nothing ever happened inside a rally beyond the court's hazards. From world
  7 on, the player met no new idea.

### Broken or misleading goals

- "Cross N gate openings" counted every crossing of the gate line. Any four
  returns met it.
- "Win inside 60 seconds" was set on first-to-five boss stages and trials.
- Teaching stages ("Learn the route…") could carry unannounced handicaps:
  starting a point down, a shrinking paddle, or a shorter paddle.
- Achievements asked for level 1,000 (about 7,900 hours) and 1,000 Frontier
  sectors. "Council Breaker" counted 25 bosses. "Nemesis — Beat every boss"
  checked only the first five worlds' bosses.

### Progression and economy (audit summary)

- Talent points, skill slots, cups and paddle speed all stop between levels 48
  and 53. That is around hour 8 to 15 of play.
- Resonance Lab loot and Workshop Marks run out of things to buy within about
  30 to 50 matches.
- 71 of 98 cosmetics are tuned variants or hues, and they show identical
  swatches.
- Profile → **Demo a level** let any player, from day one, play any level up to
  999 with all its talent points, slots, cups and cosmetics. It is kept on
  every build by decision; a demo never touches the real save.

## What changed

### New: Sparks (`src/game/sparks.ts`)

Pickups that pop in around midfield on spark courts. The ball collects a spark
for the side that touched it last, so the bot can take them too, and Pro and
stronger bots aim for them. The four sparks:

- **Wide**: a longer paddle for 8 seconds.
- **Fire**: a charged next return, within the hard speed limit.
- **Ward**: a one-shot save at your own goal line.
- **Hex**: a shorter paddle for the opponent, for 6 seconds.

Sparks are court effects, never talents. They count as neither a skill nor a
save. The server rejects spark evidence from a court without sparks, and accepts
older clients that send no spark count. A Reckless build collects Fire instead
of a Ward. Bot pilots and the bots they played took sparks at close to an even
rate (for example 88 against 82).

The spark content:

- Six hand-built spark courts. They join the Daily rotation only from 11
  November 2026, so no Daily already played changes.
- A new "Collect N sparks" star goal and challenge objective.
- Sparks on a third of Journey branches from world 7.

### New: boss traits (`src/game/bossTraits.ts`)

Six behaviours: **Warden**, **Surge**, **Stutter**, **Mason**, **Gust** and
**Lockdown** (see the README). Phases add to a boss's traits rather than
replacing them. The Warden can turn back at most one ball per player return.
This came from a stall found in simulation: a bumper bounced the ball back
into the Warden indefinitely.

### Rewritten: bosses and Journey worlds 6 to 30

- 25 bosses, one per world and all authored. 15 generated bosses were
  rewritten and 7 are new: Cyclone, Forgemaster, Squall, The Twins, Alchemist,
  Mirage and Regent. Each boss's name, court, title and phases match its trait.
- Each world is now a chapter. It has a theme, a court pool chosen for that
  theme, a fixed school on its core stages and trials, and its namesake boss.
  "Pulse Garden", "Legend Trials" and "Resource Crucible" became "Spark Garden",
  "Tempo Halls" and "Spark Crucible" to match their content.
- Stage ids, counts and stars are unchanged, so saves are unaffected.
- The core chain is now 8 stages instead of 12. That makes 9 matches to a
  world's boss instead of 13. The other stages remain as optional branches.
- Stages are named for their courts, and all 46 court variants have names of
  their own.
- Core stages carry no handicap. A gate crossing counts only through a narrowed
  gap. First-to-five stages never set a 60-second goal.
- The Frontier names its boss stages after the boss alone; the stage code
  already carries the sector.

### New: challenges and Gauntlet order

- Ten hand-made challenges, five on sparks and five boss rematches. A boss's
  phases are held at the challenge's own opponent tier.
- Every Gauntlet run meets its bosses in a seeded, non-repeating order. The
  three legacy bosses that new runs could never reach are back in the pool.

### Removed or fixed

- Removed the level 250/500/1000 and Frontier 1000 achievements, and added
  level 150 and 200. "Council Breaker" now counts every boss. "Nemesis" now
  says what it actually checks.

## Evidence

Same seeds and stages, before (the `HEAD` snapshot) against after. Matches are
first to five boss stages.

| Pilot                         | Old bosses w6–30 | New bosses w6–30 |
| ----------------------------- | ---------------- | ---------------- |
| Elite, level-50 Control build | 91% (100)        | 84% (300)        |
| Pro, no build                 | 29% (150)        | 33% (150)        |

The early worlds (6 to 9) were checked at level 28, roughly where a player
arrives there:

- The new world-6 boss wins 42% against the old one's 33%.
- World 6's core stages win 73%.
- The first Warden boss was softened after a first run, from 3/12 to 10/16.

The Anchorite and Stormcaller were also softened after measuring outside their
band.

No match in more than 700 simulated games produced a non-finite ball or a
stalled point once the Warden fix was in.

Checks that passed:

- The full test suite: 621 tests, including 22 new tests for sparks, traits,
  boss rehearsals, Journey structure and the Gauntlet boss order.
- `check:i18n`: every new string has Persian.
- `check:menus` and `check:ui`.
- `check:browser:bosses`.
- `check:browser:gameplay`: 329 real-app flows, including every challenge.
- `check:bundle`, and a production build in which Profile shows no Demo button.
- `check:layout`: 512 real-browser layout checks at five sizes.

## Still open

- **Human playtests.** The Warden, Stutter and Surge bosses and the spark courts
  need real players. Bots under-rate going round the Warden, and they read a
  Stutter more patiently than a person might.
- **Past level 50.** XP buys nothing once points, slots and cups cap. The Lab
  and Workshop need repeatable sinks. That changes the server's economy, so it
  was left out of this pass.
- **Cosmetics** are mostly recolours, and their swatches are identical.
- **Generated content.** The 106 generated court challenges and the Frontier
  remain template-based. They now read better, because the courts have names.
- **Multi-ball** was considered and left out. The engine assumes one ball in
  about 120 places across 20 files.
- **Profile "Mastery Rank 0"** still shows for everyone under level 55.
