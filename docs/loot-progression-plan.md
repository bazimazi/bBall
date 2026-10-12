# Resonance Lab: research, design and implementation

Implemented 12 October 2026. This document records the research, the bBall-specific decisions, the shipped rules and the remaining balance questions.

## Requirement and repository findings

Players should earn items through several parts of bBall, spend those items on permanent progression, and use that progression to experiment with builds or take on new challenges. The requested examples were individual talent refunds, dual/triple specializations, switching on the court, advanced features and new skills.

The repository already has a substantial progression system: levels, talents, four/six/eight free saved builds depending on level, free full and branch resets, Journey stars, Daily challenges, Gauntlet boons, Endless waves, cups, cosmetics and the Paddle Workshop. The game simulates locally at 120 Hz; the account server validates evidence and calculates rewards. Guests have persistent local saves; demos use a parked real save and temporary progression.

The new system therefore needs to add another reason to explore these modes without selling back existing functionality. It must preserve old saves, retain free build storage and resets, cooperate with equipment snapshots and offline sync, respect fixed Daily builds, and avoid turning failures into lost progress.

## Research and lessons

These are historical design references, not claims about the latest release state of another game. The links are primary sources, consulted during this implementation.

| Reference                                                                                                                                                                            | Relevant observation                                                                                                                                                      | Decision for bBall                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ArenaNet: build and equipment templates](https://www.guildwars2.com/en/news/learn-all-about-build-and-equipment-templates/)                                                         | Stored configurations and active templates serve different purposes; previewing a build helps selection, while switching has combat and competitive restrictions.         | Keep the existing free library. Research pins two or three configurations and, separately, enables court switching between rallies. Freeze the legal configurations when a match begins. |
| [ArenaNet: templates launch](https://www.guildwars2.com/en/news/build-and-equipment-templates-are-live/)                                                                             | A free template allowance makes build experimentation available before additional capacity.                                                                               | Do not replace bBall's existing free slots with a paid unlock. Naming and ordinary loading also remain free.                                                                             |
| [Blizzard: Dragonflight talent preview](https://worldofwarcraft.blizzard.com/en-us/news/23814291?cmsMode=live)                                                                       | Utility choices and specialization choices support different player goals.                                                                                                | Offer convenience research alongside situational skills, with separate costs and clear dependencies. Neither increases the talent point budget.                                          |
| [Blizzard: profession specialization preview](https://worldofwarcraft.blizzard.com/en-us/news/23876529)                                                                              | Permanent knowledge can come from several activities rather than one repeated action.                                                                                     | Use three understandable items with different sources, plus first-visit, first-clear and Journey bonuses.                                                                                |
| [Blizzard: historical hotfixes](https://worldofwarcraft.blizzard.com/en-us/news/23800887/hotfixes-july-8-2022)                                                                       | The October 2022 entries include dual-specialization availability and an effect that must end on switching. Switching has correctness consequences beyond changing ranks. | Carry cooldowns and spent defensive resources across switches, clear temporary buffs, and test repeated switches explicitly.                                                             |
| [Motion Twin: Dead Cells update 5](https://dead-cells.com/patchnotes/5)                                                                                                              | Earned cells and blueprints connect play to permanent capabilities, with explicit acquisition changes in the patch.                                                       | Research purchases are permanent and source descriptions are visible. There is no random blueprint bottleneck, reroll or consumable activation fee.                                      |
| [Supergiant: Hades II Olympic Update](https://www.supergiantgames.com/blog/hades2-olympic-update/) and [Warsong Update](https://www.supergiantgames.com/blog/hades2-warsong-update/) | Expansion updates combine new combat content with usability changes; Warsong also discusses gathering and Arcana improvements.                                            | Ship a complete loop containing rewards, convenience, build management, two usable skills and optional challenges. Resource collection should be automatic.                              |

The design judgments in the last column are ours. These sources do not demonstrate an ideal bBall price, retention improvement or win rate. Those require bBall playtests.

## The identity: Resonance Circuits

The Lab's central mechanic is a repeating three-mode circuit. A player completes a meaningful ranked attempt in three different modes, in any order, and receives one Resonance Core and two Tactic Threads. The circuit immediately begins again. Repeating one mode still pays its ordinary loot, but does not fill another circuit position.

This fits bBall's many courts and formats: an evening can combine Quick Match, a Journey stage and a challenge, or any other three supported modes. A loss counts. Players can obtain the rare item without defeating an Elite, maintaining a login streak or waiting for a calendar reset. The Lab displays the occupied circuit positions and its guaranteed reward.

This is the feature's distinctive hook within bBall. We are not claiming that activity circuits are unprecedented in gaming.

## Implemented loot rules

Eligible modes are Quick Match, Journey, Challenges, Daily, Gauntlet, Endless and Tournament. A result must be ranked, not abandoned, last at least **15 seconds**, and contain at least **two player returns**. Practice, Versus, previews, demos and Daily archives do not increase the real inventory. Demo progression can change in memory and is discarded when Demo ends.

Loot is banked automatically on the result screen, including qualifying defeats. There is no pickup collision, chest animation to wait through, random roll, inventory weight, equipment replacement or per-use payment.

| Item            | Ordinary award                                                                     | Additional sources                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Rally Shards    | `3 + min(6, floor(player returns / 8)) + (won ? 2 : 0)`                            | First challenge/Daily clear: +5. First Resonance trial clear: a further +7.                                                  |
| Tactic Threads  | Each supported non-Quick mode: +1, plus +1 for a win or achieved objective         | First visit to each mode: +2. Circuit: +2. First challenge/Daily clear: +2. Newly earned Journey stars: up to +3 per result. |
| Resonance Cores | A win against Elite/Legend: +1; or an Endless result with at least three waves: +1 | Circuit: +1. First Resonance trial clear: +2.                                                                                |

The ordinary core conditions share one award: satisfying both does not yield two ordinary cores. Other bonuses stack. A completed trial's first-clear bonus is **12 shards, 2 threads and 2 cores**, in addition to ordinary loot and applicable discovery/circuit awards. Repeating it does not repeat the first-clear bonus.

Lifetime earnings are bounded at 1,000,000 of each item. The spendable wallet is derived from lifetime earnings minus the catalog costs of owned research; clients cannot submit wallet values or claimed drop amounts. Result summaries report the amount actually credited at the cap.

## Research catalog

Research is a one-time purchase. All later uses are free. The Lab shows a short benefit on each upgrade card. Tapping opens a detail sheet with exact prices, missing quantities and prerequisite links; the separate Unlock permanently action spends the loot. Dismissing the sheet spends nothing.

| Research              |  Shards | Threads | Cores | Prerequisite        | Result                                                                                                                                       |
| --------------------- | ------: | ------: | ----: | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Precision Refund      |      18 |       2 |     0 | None                | Refund exactly one talent rank and its actual point cost. Refuse a refund if it would invalidate another investment; explain the dependency. |
| Dual Specialization   |      30 |       5 |     1 | None                | Pin two favorites from the free saved-build library and load them from the Lab.                                                              |
| Triple Specialization |      45 |       8 |     2 | Dual Specialization | Add a third pinned build.                                                                                                                    |
| Courtside Switch      |      40 |       6 |     2 | Dual Specialization | Select a captured pinned build from Pause between rallies, once per point. A serve-screen button opens the same panel.                       |
| Pulse Brake           |      28 |       4 |     1 | None                | Permanently own a new skill: reduce an approaching ball's speed by 28%, subject to the existing speed floor. Base cooldown: 18 seconds.      |
| Phase Lens            |      35 |       6 |     2 | None                | Permanently own a new skill: straighten an approaching ball to within ±0.3 radians and clear its curve. Base cooldown: 22 seconds.           |
| Resonance Trials      |      35 |       5 |     1 | Pulse Brake         | Open three expert challenges and their first-clear loot bonuses.                                                                             |
| **All research**      | **231** |  **36** | **9** |                     |                                                                                                                                              |

Both skills consume an ordinary skill slot and use the existing cooldown, talent interaction and input systems. Unlocking one fills an available legal empty slot; otherwise the player equips it in Talents. Activation requires a live incoming ball. An invalid cast does not spend cooldown or count as a cast. Neither skill adds a talent point, extra slot or an always-on damage multiplier.

Free full/branch resets and the four/six/eight existing saved-build slots remain available. Saved builds can be named, and overwriting an occupied slot takes a second click. The name applies to the complete stored configuration of talent ranks and equipped skills.

## Expert challenges

| Trial              | Rules                                                                                                  | Recommended preparation                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Velocity Crucible  | Beat Elite to five points with a 70% paddle, 150% serve speed, 150% hit growth and 120% maximum speed. | Time Pulse Brake to buy a recovery window.                         |
| Parallax Chamber   | Beat Elite to five points on Rift Tide's gravity/portal court, with a 75% paddle and 130% serve speed. | Phase Lens helps turn a steep curved approach into a readable one. |
| Convergence Engine | Beat Legend to five points through Storm Gates, with a 70% paddle and 115% maximum speed.              | Prepare contrasting specializations and switch between points.     |

All three are optional and accessed from the Lab. They reuse authoritative challenge rules, objective checks, XP, challenge records and result screens. They do not inflate the original challenge completion catalog. Research unlocks access; the player still has to win. Phase Lens and Courtside Switch are recommendations, not additional entry locks.

The modifiers intentionally raise difficulty and connect to the new skills. Automated tests verify the rules and skill effects, not that these trials are impossible without a skill or fun at every level. The intended difficulty needs human playtesting.

## Switching contract

1. At match preparation, capture the starting XP/build, equipment and up to three legal pinned builds. The client and server use the same build reconstruction and research ownership rules.
2. During play, names and captured configurations stay stable. Editing a saved preset or receiving a later profile update affects the next match.
3. Only serve or Pause returning to serve allows switching. Live rallies, tutorials, Versus and fixed-build Master Daily do not allow it. One switch is permitted per point; selecting the active build does nothing.
4. Match statistics and best drive remain cumulative. Ability cooldowns, recast lockouts and cast identifiers are kept by ability ID, even when that ability is temporarily absent. Benched cooldowns continue to elapse during simulation, and Pause freezes them as usual.
5. Temporary buffs and current drive are cleared. Spent Second Chance and Zenith refunds remain spent. Missing shield charges use a debt ledger that survives smaller or shieldless builds; only actual recharge or an existing shield-grant effect reduces that debt. The recharge timer carries over and freezes on a shieldless build.
6. Results name the indices actually used. The server permits only captured legal configurations; editing future presets cannot authorize different abilities retroactively. Mastery credit remains with the starting branch, preventing multi-branch credit from one match.

As in the existing game, the account server validates submitted evidence and plausible ceilings rather than replaying the whole simulation. The client enforces the precise serve boundary and once-per-point rule. An ordered input log or a fully authoritative multiplayer simulation is outside this change.

## Persistence and account safeguards

- Profile schema advances from v4 to **v5**. Old saves receive an empty loot state, with no retrospective grant. Existing ranks, builds, records and Workshop content remain intact. No new SQLite table or database migration is needed because progression is an existing JSON aggregate.
- Raw saves are repaired: unknown IDs, duplicate pins, invalid circuit modes, non-finite or negative quantities and unaffordable/prerequisite-breaking unlocks are removed. Research licenses are derived from paid research; a raw `licensed` list cannot unlock a skill.
- The shared `loot.action` sync operation handles research, rank refunds and pins. Strict request schemas reject extra reward fields. Purchases derive current funds on the server, so simultaneous purchases cannot double-spend. Existing operation and match deduplication prevents replayed rewards.
- A refund includes the expected rank, so retrying a stale action cannot refund a second rank accidentally.
- Offline signed-in actions use the existing queue and optimistic local state; authoritative sync may correct a stale purchase or pin. Guests persist locally. Demo changes never write to the real save or account queue.
- Guest claims cap loot against supported play counts. Merges retain paid upgrades and the better remaining wallet, never sum two spendable wallets. This prevents repeatedly claiming the same stockpile. New licenses are recomputed after merging.
- Client and server releases must be paired: an older API cannot understand `loot.action` or alternate-build evidence. The client should be updated alongside the existing compatible Workshop server.

## Implementation map

| Area                                                                                 | Files                                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared economy/catalog/repair/actions/trials                                         | `src/core/loot/{catalog,state,rewards,ops,trials}.ts`                                                                                                                    |
| Profile migration, awards and guest persistence                                      | `src/core/profile/{schema,progress,store}.ts`, `src/core/progression/apply.ts`                                                                                           |
| Talent refunds, build reconstruction and research skill ownership                    | `src/core/talents/{save,builds,effects,abilities,types}.ts`                                                                                                              |
| Offline queue and wire contract                                                      | `src/core/account/progression.ts`, `shared/protocol.ts`                                                                                                                  |
| Server schema, transactions, snapshots, validation, ownership restoration and claims | `server/src/http/schemas.ts`, `server/src/services/{progression,sync}.ts`, `server/src/domain/{profile,matchValidation,claim}.ts`, `server/src/repositories/profiles.ts` |
| Court switching and skill effects                                                    | `src/game/{engine,talents,abilities,world,match,types}.ts`                                                                                                               |
| Lab, build names, refunds, result rewards and navigation                             | `src/ui/screens/{LootScreen,TalentScreen,ResultScreen,HomeScreen}.tsx`, `src/ui/{App.tsx,hooks/useGameFlow.ts,panels/PausePanel.tsx}`                                    |
| English/Persian UI and deferred bundle                                               | `src/core/i18n/fa.json`, `src/ui/screens/deferred.ts`, `scripts/check-bundle.mjs`                                                                                        |
| Focused verification                                                                 | `server/test/loot.test.ts`, `scripts/check-loot.mjs`; existing UI, language, layout and server checks                                                                    |

Presentation uses the game's explicit Full/Calm and shake controls. Web, desktop and mobile completely ignore operating-system and browser reduced-motion preferences, including the Lab, Pause and new skill effects. Gameplay values do not depend on presentation settings.

## Economy checks and playtest plan

The prices are an initial design, not a measured optimal economy. A conservative arithmetic example uses losses with 24 returns: each pays six shards. Repeated three-mode circuits using Quick, Journey and Challenges pay 18 shards, at least four threads and one core per circuit after discovery bonuses. Thirty-nine such qualifying results provide enough items to buy the whole catalog (234 shards, at least 52 threads and 13 cores), without assuming a win, a new star or a first clear. This is an existence proof of a reachable path, not an estimate of minutes played; players may need longer to record those returns. Other routes and victories can shorten it.

Precision Refund deliberately has no core cost. A first three-mode circuit of those 24-return attempts supplies its 18-shard price and enough threads. Buying all convenience research costs 133 shards, 21 threads and five cores. Players can choose skills and trials first instead; purchases do not expire and entry consumes nothing.

Before tuning prices or adding another tier, recruit beginners and experienced players for matched sessions. Record locally exported experience traces where players consent; do not add unsolicited network telemetry. Compare:

- Attempts and active minutes to the first useful unlock, first core and a chosen specialization setup.
- Whether source descriptions and missing costs make the next action obvious.
- Voluntary mode variety versus obligation or repetitive farming.
- Trial win rate by level/build, with and without recommended skills, and the reasons for failures.
- Frequency of Pulse Brake/Phase Lens use, invalid cast attempts and whether slot tradeoffs feel worthwhile.
- Court-switch discovery, selection mistakes, saved-build naming and phone touch reach.

Success means players understand the loop and make useful choices, and experts find the trials demanding but learnable. No retention, enjoyment or genre-leading claim is supported merely by passing tests.

## Deliberately deferred ideas

A later **Circuit Composer** could let players pick a three-mode route with declared court modifiers, finish it for a cosmetic resonance trail, and share its seed. This would build on the shipped circuit, arena rules and seeded Daily infrastructure. Prototype it only after the basic economy is understood.

Other candidates are mastery-specific trial variants, a build preview comparing reach/skill roles before a court switch, and cosmetic-only sinks for surplus loot. Do not silently introduce perpetual power tiers, expiry, paid randomness or costs for basic controls. Research costs currently live in one shared catalog; changing costs for existing purchases would change derived wallets, so future rebalance work must version prices or migrate the paid-cost ledger explicitly.

## Verification record

Focused tests cover eligibility, losses, seven-mode coverage, circuits, caps, first clears, migration/repair, prerequisites, licenses, dependent refunds, preset legality, guest claims, cooldown and shield debt preservation, initial mastery, skill physics, prepared-build validation and real HTTP sync deduplication/concurrent spending. Browser checks exercise purchases, naming/overwrite, refunds, pins, trial entry, reload persistence, and court switching, with English/Persian layouts and both system motion preference values.

Verified on 12 October 2026:

| Check                                                           | Result                                                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`, `npm run lint`                             | Pass                                                                                                      |
| `npm test`                                                      | 454 tests pass, including 16 focused loot tests and a court switching engine regression                   |
| `npm run build`, `npm run server:build`, `npm run check:bundle` | Pass; 18 deferred menu pages including the Lab                                                            |
| `npm run check:menus`, `npm run check:i18n`                     | Pass; English/Persian messages and generated descriptions validated                                       |
| `npm run check:ui`                                              | 76 existing DOM interaction checks pass                                                                   |
| `npm run check:layout`                                          | 512 real browser layout checks pass, including the actual app                                             |
| `npm run check:i18n:layout`                                     | 124 Persian viewport checks and 80 Workshop highlight checks pass                                         |
| `npm run check:loot`                                            | 113 browser checks pass, including real application navigation and a reachable court switch above its HUD |
| `npm run check:rtl`                                             | 206 Persian screen/dialog reviews and 592 pointer-reachability checks pass                                |

The dedicated `check:loot` also verifies the Lab and court flow across four viewports, both languages and both system motion preferences, followed by Home/Lab/Talents navigation and court switching in the actual app. Screenshots were inspected at phone, narrow Persian, landscape and desktop sizes. Browser fixture balances are test data and are not grants in real saves.

Automated checks do not replace physical webview/controller testing or the balance playtest above.
