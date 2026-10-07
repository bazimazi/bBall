# Endless progression expansion: implementation and validation

Implemented on 7 October 2026 in response to the request for substantially more
content, continuing progression and harder developed-build opponents. This is the
execution record for the [expansion plan](../endless-progression-improvement-plan.md).
The plan's numerical human-success targets remain playtest targets.

## Implemented systems

| Area             | Implemented behavior                                                                                                                                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journey          | Original 30 stages preserved; 25 additional worlds of 24 stages give 630 Story stages and 1,890 stars. Twelve core nodes, eight optional branches, three trials and a boss per expansion world. Veteran and Ascendant records are separate.                                              |
| Frontier         | Twenty-node generated sectors, bosses every fifth node, stronger tier floors and rotating bounded restrictions. Opens after the original fifth-world boss. Completed sectors compact into a cursor; replay cannot re-award compacted first-clear stars.                                  |
| Gauntlet         | Sprint 9, Expedition 36 and continuing six-encounter Endless acts. Pressure 0–50. Safe/risk routes, capped service credits, repair, reroll, upgrade, relic recycling, act banking and finite-run continuation.                                                                           |
| Run builds       | 72 boons including 24 duos, plus 24 relics with tradeoffs and three sockets. Saturated drafts remain useful; stats, saves, automation, cooldowns and speed retain caps.                                                                                                                  |
| Courts           | Sixty layouts, including 46 expansion layouts from twelve templates. Reflecting/breakable rails, moving/phase gates, ball-hit switches and pace zones combine with existing bumpers, wind, wells, bricks and portals.                                                                    |
| Recipes          | Seeded geometry, timing, opponent schools and compatible secondary hazards. Density, serve corridors, minimum forward progress and bounded difficulty constrain combinations. Future encounters are generated on demand.                                                                 |
| Bosses           | Twenty-five definitions; new bosses change courts and announce phases between points. Phases preserve spent enemy cooldowns and cannot downgrade a stronger tier.                                                                                                                        |
| Opponents        | Stronger Rookie–Legend profiles, candidate shot evaluation, observed-motion placement/reversals, six schools and tiered skill budgets. Shared side runtime handles activation, return effects, guards, cooldowns and recast lockouts. Known skill readiness and active cues are visible. |
| Challenges       | 120 catalog trials, new court objectives, continuing seeded contracts and five-trial playlists. Contract order and compact records prevent repeated first-clear rewards. Destruction targets respect available structure durability.                                                     |
| Cups             | Ten tiers, Classic 3 rounds, Marathon 7 and continuing 6-round Ladder seasons. Format-aware finals, next-opponent scouting and separate archived-season/active-defense persistence.                                                                                                      |
| Daily            | Standard and fixed-level-50 Control Master cards, separate medals/streaks, previous-30-day unranked archive and Monday-UTC weekly Expedition seed. Weekly attempts use ordinary run rewards.                                                                                             |
| Quick/Versus     | Court and school choices, declared Master/Mythic Quick contracts, best-of-three/five sessions, per-game rewards. Versus has equal-side speed/reach modifiers, mirrored obstacle pairs and four device-only presets; it stays unranked.                                                   |
| Survival         | Classic Wall or twelve-return wave courses with safe serve transitions and separate course/wave records. Three misses still end the attempt.                                                                                                                                             |
| Practice         | Normal/Relaxed pace, courts/schools, isolated boss phases, current equipped build, retry, paused 0.1-second stepping and a bounded landing estimate; no rewards.                                                                                                                         |
| Talents          | Sixty-four nodes, including six new actives and eighteen passives. Four saved builds, six at level 50, eight at level 100; loading follows real purchase gates and the existing 49-point budget.                                                                                         |
| Continuing goals | Twenty-seven technique/school/court/build mastery tracks with 250-mark cycles; mastery/content achievements and 51 additional rendered cosmetic variants. XP levels continue past 10,000 with a constant-cost tail and bounded permanent combat power.                                   |
| Menus            | Paged Journey/trials, compact act previews, current Frontier sector, next-stage and active-run Home cards, scouting, declared constraints and result continuation. Essential cues remain visible with explicit Calm effects.                                                             |
| Cloud            | Shared identities and rewards, validated run/build operations, retry-safe sync, bounded records and additive database migration 6. Real HTTP/database tests cover long cups, continuing seasons and idempotent service operations.                                                       |

Expansion stages and trials use curated templates and generated definitions. They
are not 600 individually scripted campaign puzzles or twelve new physics
algorithms. The four new primitive groups are rails, gates, switches and zones;
the twelve templates combine them with existing mechanics.

## Fairness, limits and compatibility

- Competitive bots have no Wall assist and cannot read the player's movement
  target. They have travel limits, reaction delays, imperfect reads and visible
  skills. The present presets avoid unlimited permanent shields or free casts.
- Prediction copies mutable court and runtime data. It shares force, bumper,
  rail/gate/switch/zone and bank/curve behavior, including short skill-window
  expiry. The horizon is three simulated seconds; it is an estimate, not a full
  future-input or match replay.
- Moving gates have a visible release beat and an occupancy grace period. Rail
  endpoints use swept circular contacts. Mirrored couch rails are breakable so
  paired layouts cannot form permanent reflecting pockets. Pace zones cannot boost ordinary pace
  beyond the encounter ceiling or compound an already higher charged return.
- Ranked scored rallies narrow both paddles after 24 returns, capped at 40%.
  Practice, Versus and survival do not apply this rule.
- Completed-run history keeps 40 entries; credits cap at nine and relic slots at
  three. Frontier, contracts, mastery and wave records have bounded identities or
  compact aggregates. Practical endless progression uses safe numeric limits.
- New run attempts commit their encounter before play. Pause freezes the live
  state; closing the app preserves choices and progression. Restarting an
  unfinished attempt costs one heart without XP. There is no persisted
  mid-rally checkpoint.
- Existing stage/court/talent IDs, earned stars, legacy achievements, XP, cups
  and nine-match saves remain readable. Legacy runs and dated Standard Daily
  pools retain their original selection path. Recipe version 2 pins identities
  and choices; this release intentionally changes global bot/gameplay balance
  and does not freeze every historical simulation constant.
- Match validation checks plausible evidence and legal transitions. It does not
  execute an authoritative input replay. Mastery tags, fixed builds, finals and
  rewards are derived on the server rather than trusted from client tags.
- Every platform continues to completely ignore operating-system/browser
  reduced-motion preferences. Full/Calm and screen shake remain explicit,
  independent game settings.

The proposal's optional second scoring **Echo ball** stays disabled pending its
separate scoring/replay/shield tests. The existing **Echo ultimate**, which
refreshes skills, remains available. Mastery currently rewards records,
achievements, cosmetics and preset capacity; separate alternate-behavior skill
variants and an equippable title system are not included. The repeatable match
XP damper remains at 25 daily matches; first-time rewards retain their separate
rules. No leaderboard or server telemetry service was added.

## Automated evidence

| Check                                            | Result                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                       | 400 passing tests, including 40 expansion regressions; no failures/skips                                                              |
| `npm run typecheck` / server workspace typecheck | Pass                                                                                                                                  |
| `npm run lint`                                   | Pass                                                                                                                                  |
| `npm run build`                                  | Web production assets pass                                                                                                            |
| `npm run build:desktop`                          | Desktop/Safari-targeted production assets pass; no installer/device claim                                                             |
| `npm run server:build`                           | Pass                                                                                                                                  |
| `npm run check:bundle`                           | All 16 menu pages and optional capture remain deferred; web initial JS 624.29 kB / 206.72 kB gzip, desktop 636.33 kB / 210.50 kB gzip |
| `npm run check:menus`                            | All 16 lazy menus plus pending states render                                                                                          |
| `npm run check:ui`                               | 63 passing DOM interaction checks                                                                                                     |
| `npm run check:experience`                       | 9 passing checks with substitute clocks/events                                                                                        |
| `npm run test:audio`                             | Effects, four songs, stacked mix, volume-off and mute checks pass                                                                     |
| `git diff --check`                               | Pass                                                                                                                                  |

The final retained simulations total **812 completed matches and zero stability
alerts**. Each width's 92 expansion cases cover 46 new layouts, nine Frontier
encounters (sectors 1, 100 and 10,000), twelve Gauntlet combinations (Pressure
0/25/50; depths 0/5/35/999), and 25 expansion-world boss stages. Mirrored layouts
add 60 cases per width; survival waves add eight matches. The developed-build
matrix contributes the remaining 500.

| Artifact                                                                                                                                                                                              | Samples |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------: |
| [Expansion, width 750](endless-expansion-750.json)                                                                                                                                                    |      92 |
| [Expansion, width 1290](endless-expansion-1290.json)                                                                                                                                                  |      92 |
| [Mirrored courts, width 750](endless-couch-750.json)                                                                                                                                                  |      60 |
| [Mirrored courts, width 1290](endless-couch-1290.json)                                                                                                                                                |      60 |
| [Survival waves](endless-waves.json)                                                                                                                                                                  |       8 |
| [Power build](endless-build-power.json), [Defense](endless-build-defense.json), [Control](endless-build-control.json), [Momentum](endless-build-momentum.json), [Utility](endless-build-utility.json) |     500 |

Reproduce the seeded runs with the following commands; change width to 1290 for
the wide cases, and build/policy according to the matrix below.

```sh
npm run soak -- 1 pro --seed bball-expansion-release --width 750 --group expansion --output expansion.json
npm run soak -- 1 pro --seed bball-couch-release --width 750 --group couch --output couch.json
npm run soak -- 2 pro --seed bball-wave-release --width 750 --group waves --output waves.json
npm run soak -- 20 pro --seed bball-build-release --width 750 --group quick --build power --level 50 --policy balanced --output power.json
```

The wide mirrored Bankworks 4 seed initially trapped a ball in a reflecting
pocket. Mirrored rails now have finite durability, the exact seed has a committed
regression, and both full mirrored-court reruns pass. Earlier wide gate stalls
were resolved with endpoint contacts, occupancy grace and visible release beats.
The suite also validates 10,000 generated recipes and 1,000 continuing run wins,
without relying on match simulation to establish bounded save size.

DOM assertions and headless simulations do not verify visible layout, native
input, hardware performance or enjoyment.

### Developed-build benchmark

Twenty matches per Quick tier for each of five legal level-50 builds, using the
Pro player controller: 500 matches. Policies include balanced activation, early
rush, edge placement and late movement. All artifacts explicitly identify the
controller as a proxy. Results are descriptive; cells have only 20 trials and no
paired pre-expansion baseline.

| Build/policy       | Pro wins | Elite wins | Legend wins |
| ------------------ | -------: | ---------: | ----------: |
| Power / balanced   |      95% |         5% |          0% |
| Defense / balanced |     100% |        10% |          0% |
| Control / edge     |     100% |        10% |          0% |
| Momentum / late    |     100% |        25% |         15% |
| Utility / rush     |     100% |        10% |          5% |

These samples show that developed builds do not trivialize the upper opponents
for these controllers. They do not establish human win rates or enjoyable
challenge. Rookie/Amateur remain easier routes. Pro remains readily beatable by
the developed-build proxy; Elite/Legend and declared high-tier contracts provide
the expert ceiling.

### Human and physical validation

No browser/app surface was available to perform visual review in this session.
Use the [existing validation guide](../player-experience-validation.md) to collect
actual first-clear, retry, fairness and difficulty ratings across undeveloped and
developed builds, the six schools, early expansion worlds and deep Pressure.
Compare mouse, keyboard, pen and touch; include short landscape layouts,
Full/Calm cues, paused stepping, process restart and offline account sync.

The asset builds do not verify native installers or device rendering time.
The forecast workload and denser courts need physical frame-time captures,
especially on mobile. Treat this as an implemented expansion with automated
stability evidence, with final experiential balance still subject to playtesting.
