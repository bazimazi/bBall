# bBall paddle materials and upgrade progression proposal

Proposed on 7 October 2026 as a follow-up to the
[endless progression expansion](endless-progression-improvement-plan.md).
**Implemented on 7 October 2026 at the user's request:** the complete functional
catalogue, bench, crafting, tuning, frames, Copper insert, advanced materials,
presets, contracts, engravings and mode/account integration now ship together.
The [implementation report](validation/paddle-workshop-report.md) records the
actual rules, automated evidence and remaining human/device validation.
This document retains the original proposal, phased rollout suggestions and
unmeasured acceptance targets as design history.

Add a **Paddle Workshop** where players build a paddle from a core and a contact
surface, then develop it through new materials, tuning choices and technique
contracts. A firm paddle should reward clean attacking contact; a rubber surface
should reward moving flicks; a damped core should help control incoming attack
pace. Players should feel their choices on the next return.

Start with four unlockable parts and neutral alternatives, giving nine core and
surface combinations. Prove that these combinations feel distinct before adding
frames, inserts or more demanding material mechanics. Keep permanent combat
power bounded: upgrading expands useful configurations and control over their
tradeoffs. Mastery continues through contracts, finishes and records.

## What the current game already supports

The current working tree includes the endless expansion. The historical counts
in the earlier plan describe its starting point; the
[implementation report](validation/endless-progression-report.md) describes the
expanded systems. Design this feature against the current code.

| Existing system                                        | Opportunity and constraint                                                                                                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Paddle geometry](../src/game/paddle.ts)               | Length already combines match base, lasting shrink and build growth. Equipment must join that calculation without overwriting challenge shrink or rally pressure.                                        |
| [Contact physics](../src/game/physics.ts)              | Return direction uses contact offset and paddle velocity. This is the natural place for firmness, grip and damping to become observable.                                                                 |
| [Talent returns](../src/game/talents.ts)               | Talents already change pace, angle, grip, guards and attack surge. Materials need one explicit composition order and shared limits.                                                                      |
| [Balance configuration](../src/core/balance/config.ts) | Ordinary player movement caps at 2,000 field units per second, ultimate movement at 2,900, ball speed at 1,720, and ordinary length bonuses at 30%. Equipment should use these limits.                   |
| [Geometry constants](../src/game/constants.ts)         | Base paddle length is 108 field units; absolute scale stays between 0.42 and 1.5. Decorative flex currently has no separate collision shape.                                                             |
| [Combatants](../src/game/combatant.ts)                 | Bots already resolve talents through a view of their own side. Material resolution should follow the same side rules.                                                                                    |
| [Cosmetics](../src/core/cosmetics/catalog.ts)          | Paddle finishes are explicitly cosmetic. Workshop components need separate ownership and equipment fields.                                                                                               |
| [Mastery](../src/core/progression/mastery.ts)          | Technique, school, court and build tracks exist. Current training requires successful Pro-or-harder scored encounters and excludes Endless survival. Workshop learning needs its own stated eligibility. |
| [Profile and sync](../src/core/profile/progress.ts)    | Progress is repaired, cloned and shared with the server. Adding only a local screen would lose equipment or diverge from cloud rewards.                                                                  |

The distinction between existing systems should remain understandable: levels
provide base capability, talents provide skills and tactics, Workshop components
change contact behavior, and Gauntlet boons provide temporary run changes.
Cosmetic finishes provide appearance. Give each system a clear place in the UI.

## The proposed paddle construction

| Part            | Player choice                                                                | Release stage                                         |
| --------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| Core            | Firm attacking response, balanced response or damping of incoming bonus pace | First playable release                                |
| Contact surface | Moving grip, steady placement or balanced response                           | First playable release                                |
| Frame           | Reach versus precision or motion transfer                                    | Later, after length composition is validated          |
| Insert          | One conditional behavior with a visible trigger and a cost                   | Later, after the basic combinations are balanced      |
| Finish          | Colour, texture and mastery marks                                            | Existing cosmetic system plus future cosmetic rewards |

Equip one component in each available functional slot. A neutral component is
always available in every slot. Switching owned parts and loading presets is
free between matches. Crafting grants permanent ownership; swapping never
destroys a part or requires a consumable.

Use five readable properties in the Workshop: **rebound**, **grip**, **damping**,
**placement response** and **reach**. Show the actual effects below each label,
including conditions and costs. Flex can describe the visible contact response,
but must not imply an enlarged collision area or a delayed release.

Do not introduce a movement penalty called mass in the first release. Pointer
movement and keyboard movement currently work differently; acceleration and
inertia would need their own input and accessibility study. A firm paddle can
feel firm through its returns, contact shape and sound without adding input lag.

## Four materials for the first playable release

These are arcade interpretations of materials. Their names explain the intended
feel; the game does not simulate real material elasticity or conservation of
energy. The numerical effects below are starting values for a prototype.

| Component        | Benefit                                                                                                                | Cost                                                                                                | Intended technique                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Springsteel core | An ordinary, uncharged contact within the central 25% of half-length adds 0.04 to the passive return growth multiplier | Paddle-motion transfer is multiplied by 0.90                                                        | Move into position early and strike cleanly through the centre           |
| Cork core        | Bleed 80% of surviving incoming opponent surge instead of the current 60%                                              | Newly generated outgoing attack bonus above ordinary pace is 10% weaker                             | Absorb attacks and win with placement rather than maximum pace           |
| Rubber surface   | Paddle-motion transfer is multiplied by 1.20                                                                           | Ordinary geometric contact offset is multiplied by 0.94 before talent aiming                        | Keep moving through contact to recover the lost angle and create a flick |
| Ceramic surface  | A small central band produces a straight geometric return; motion transfer is multiplied by 0.80                       | Moving flicks have less influence; contacts just outside the central band change angle more sharply | Settle into position and place deliberate shots                          |

Neutral core and neutral surface each preserve existing contact behavior.
Springsteel's qualification uses the actual collision offset, before any talent
aiming or material remapping. A charged, critical or guard-enhanced return does
not receive its clean-contact bonus. This avoids stacking a free automatic
attack onto an already empowered shot.

For ceramic, prototype a continuous response curve on the ordinary geometric
offset `u`: return zero when `abs(u) <= 0.08`; otherwise return
`sign(u) * (abs(u) - 0.08) / 0.92`. The response reaches the same endpoints
without a discontinuity. Keep talent-imposed charged-shot directions intact by
applying that talent aiming after the surface response.

Rubber changes the influence of paddle motion at the instant of contact. It does
not attach the ball to the paddle, delay the next physics step or automatically
award a flick. The existing flick classification still uses actual contact and
actual paddle velocity. Decorative bending follows that resolved contact.

Cork acts only on the opponent's tracked bonus speed. It cannot slow ordinary
rank-based rally pace, remove an untracked portion of speed, or generate a guard,
shield save or critical return. Its offensive cost applies to the new bonus
attributable to this return, including material-generated attack bonuses.
It does not reduce ordinary difficulty tuning.

## Builds that should play differently

| Build            | Parts                                | How to play it                                                              | Weakness to exploit                                                         |
| ---------------- | ------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Clean Striker    | Springsteel core and neutral surface | Arrive early, centre the return, build attacking pace                       | Firmness costs moving angle control; edge contacts do not receive the bonus |
| Rubber Whip      | Neutral core and rubber surface      | Sweep into outer contacts and reverse the opponent's coverage               | Stationary returns are flatter; movement at contact needs care              |
| Ceramic Needle   | Springsteel core and ceramic surface | Alternate settled centre attacks with deliberate wide placements            | Late moving flicks have little authority                                    |
| Soft Catch       | Cork core and neutral surface        | Survive empowered returns and send the next shot into an opening            | Generates less new attacking pace                                           |
| Cushioned Curver | Cork core and rubber surface         | Remove incoming surge, then attack through motion and existing curve skills | Added attack pace is weaker and ordinary stationary angle is flatter        |

At an incoming speed of 600 with ordinary growth of 1.042 and no active bonus,
an uncapped neutral return is 625.2 field units per second. A qualifying
Springsteel return is 649.2. This gives a visible first-contact difference;
it does not increase the match or absolute speed ceiling. Subsequent effects
must still respect surge accounting and the opponent's return.

A stationary rubber contact gains no motion benefit. That limitation is useful:
the surface should encourage a technique instead of improving every shot.
The Workshop bench should demonstrate this directly with paired stationary and
moving contacts.

## Progression and meaningful upgrades

Use a single new resource, **Workshop Marks**, for permanent crafting. Components
are reusable recipes with fixed prices. Material quality has no random stat roll,
repair bill or chance to fail. A player should know exactly what completing the
next match will make possible.

Prototype economy: award a one-time 12-Mark introduction grant; price each of the
four initial parts at 12 Marks; award 4 Marks for an eligible scored win and
2 for an eligible scored loss. One additional part then takes three wins or six
losses. The full initial catalogue costs 48 Marks, of which the grant covers 12.
These are encounter counts, not a promised number of minutes.

An eligible match must be completed, recorded under the mode's reward rules,
contain at least three actual player paddle contacts and pass existing score and
time validation. Practice, tutorial, attract play, local versus, abandoned games
and Daily archive practice award no Marks. Do not add a minimum time that asks
players to prolong a won match. Replaying easy matches can earn the bounded
completion award; it cannot repeatedly earn a contract's first completion.

For the first release, survival Endless awards no Workshop Marks. Gauntlet
awards Marks once per completed act, at the same 4-Mark rate for an act clear,
instead of once per short encounter. A failed run with qualifying play earns a
single 2-Mark consolation award only if it has earned no act award. Store that
eligibility on the run. This initial rule prevents short encounters from becoming
the obvious crafting farm; longer-run pacing needs measurement before expansion.

Workshop technique contracts can grant one-time Marks and tuning choices. Use
a finite catalogue of contract IDs; generating a new encounter seed never makes
the same reward new again. Credit capped technique progress on meaningful losses
as well as wins, so learning a difficult surface does not stop progression.

| Workshop milestone | Upgrade earned                                                   | Example requirement                                                       |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Introduction       | Core and surface slots, one part of the player's choice          | Open the bench and compare two loaned configurations                      |
| Contact craft      | Alternate tuning for an owned part                               | Land clean centre returns or genuine moving flicks in eligible encounters |
| Frame craft        | A neutral, extended or compact frame                             | Complete placement and recovery contracts with two different surfaces     |
| Material craft     | One insert slot and advanced recipes                             | Complete a material contract against a selected Pro-or-harder school      |
| Signature craft    | A named preset, engraved finish and continuing technique records | Finish a mixed-court contract with a declared kit                         |

Treat these as Workshop milestones, independent of XP level and talent points.
Prototype tuning offers a choice such as extra rebound with lower motion transfer
or extra grip with flatter ordinary placement. It never removes the component's
downside for free. Each part has a small finite set of variants; switching an
unlocked variant is free. Avoid a ladder where material level 100 strictly
outclasses level 1.

Preserve earned ownership and technique progress. After the functional catalogue
is complete, award finishes, engravings, challenge records and titles. A mastery
cycle may renew contracts within fixed gameplay limits; it does not add length,
cooldown recovery or speed indefinitely. Keep balances as bounded safe integers
and stop showing a crafting goal once there is nothing left to craft.

## Materials and upgrades for later releases

The next additions should create a new decision that can be demonstrated on the
bench. Ship each only after its own composition and validation rules are defined.

| Idea                | Proposed behavior                                                                 | Required cost or limit                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Graphite surface    | Preserve more moving angle control on a full edge contact                         | Weaker motion transfer near the centre; no extra curve unless a curve skill supplies it                                             |
| Woven fibre surface | Gentler change of geometric angle near the outer contact band                     | Lower maximum ordinary angle; no wider hitbox or automatic rescue                                                                   |
| Memory gel core     | Absorb a bounded amount of incoming bonus pace and spend part on one later return | One visible stored charge, expires at the next serve, reduced ordinary attack bonus; cannot stack with another stored-impact source |
| Copper insert       | A real switch contact charges one deliberate next-return bonus                    | Lower passive rebound, one pending charge, no material-generated skill cast or cooldown loop                                        |
| Extended frame      | Add up to six percentage points of everyday reach                                 | Reduced motion transfer; shares the existing ordinary length budget with talents and boons                                          |
| Compact frame       | Reduce reach by six percentage points for more placement authority                | Existing hard angle limit applies; no movement-speed increase                                                                       |
| Split surface       | Ceramic centre and rubber ends, selected by actual contact position               | Smooth blending across a marked transition; one surface slot, reduced strengths, no additional hitbox                               |

Memory gel is a particularly promising later feature: visibly absorb an incoming
attack, carry one readable charge, then choose where to return it. It needs
runtime, preview, replay and surge ownership support, so it should follow the
stateless materials.

Physical ball capture, rotating paddles, changing collision thickness, breakable
equipment and temperature-driven stat decay would change the core simulation or
add maintenance. Keep them as separate experiments with explicit rules rather
than quietly bundling them into material upgrades.

## Workshop and match presentation

Add a Workshop entry near Talents and Customise. Opening it shows the currently
equipped paddle, its core and surface, a short playstyle description and the next
available recipe. Additional slots appear when their milestone is available.

Selecting a part compares the complete resulting kit with the current kit. Show
benefit, cost, condition and any limit already reached. For example, rubber can
say: "Moving contact adds more angle. Stationary contact is flatter." Exact
coefficients belong in optional detail. A capped bonus should say "At limit"
instead of showing a misleading larger number.

The bench is a no-reward practice scene with three repeatable serves: a routine
return, a fast incoming attack and an edge approach. Offer stationary contact
and moving-contact demonstrations using the same serve. Loan every recipe here,
including locked parts. Let the player move and use their preferred input before
spending Marks. Show the outgoing route and the relevant contact condition.

Save three named paddle presets. A later complete-kit preset can also reference
a talent build; loading it must validate both sets of unlocks. Match preparation
shows the active kit and whether that mode uses it. Results show earned Marks,
contract progress and the exact next craftable part without opening the Workshop
automatically.

Use contact texture, a small persistent material mark and sound timbre to make
parts readable. Preserve the existing cosmetic accent and ball visibility.
Do not rely on colour alone to identify a rubber surface or stored charge.
On narrow mobile layouts, stack the paddle preview, parts and comparison;
keep actions reachable without horizontal scrolling.

Follow [AGENTS.md](../AGENTS.md): operating-system and browser reduced-motion
settings have no effect on materials, animation, effects or timing. Full/Calm
effects and screen shake remain explicit in-game controls. Keep material identity
readable under both effects choices and with sound muted. Any implementation
that adds motion guidance must keep the [root README](../README.md),
[server README](../server/README.md), [packaging guide](packaging.md) and
[player experience review](player-experience-review.md) consistent with that policy.

## Rules for every game mode

| Mode                            | Proposed equipment rule                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Tutorial and attract menu       | Neutral kit; teach the original contact behavior                                                                             |
| Practice and Workshop bench     | Any chosen or loaned kit; no rewards                                                                                         |
| Quick Match                     | Owned equipped kit; opponent kit declared before play                                                                        |
| Journey and Frontier            | Owned kit by default; teaching contracts may supply a clearly declared loan kit                                              |
| Challenges                      | Each definition declares owned, neutral or supplied equipment; existing precision challenges initially use neutral equipment |
| Standard Daily and Master Daily | A date-defined kit available equally to everyone; never derive it from personal collection                                   |
| Daily archive                   | Reuse the archived card's kit and supported rules version; practice only                                                     |
| Tournament                      | Snapshot the kit at cup start and preserve it through every round                                                            |
| Gauntlet                        | Snapshot the starting kit; temporary modifications only at declared service nodes in a later release                         |
| Survival Endless                | Owned kit; store records by equipment rules version and separate neutral from Workshop records                               |
| Local versus                    | Neutral equipment initially; later allow equal access to all parts with both players choosing explicitly                     |

Existing Endless bests remain visible as legacy neutral records. Do not silently
compare a new damped or stored-charge kit with a historical plain-paddle record.
Avoid one record key per imaginable combination: retain separate neutral and
Workshop categories, each storing its best result and the winning kit snapshot.

Bots can use the same material rules with fixed loadouts selected by encounter
definition. Introduce one readable opponent material at a time. An Anchor can use
Cork, an Aggressor Springsteel and a Curver Rubber, with the consequences visible
before serving. Equipping a player part never secretly changes the opponent's
tier, kit, court or error rate. Materials must not create extra hidden AI misread.

## Physics composition and integration

Add a shared equipment domain under `src/core/equipment/` for catalogue IDs,
ownership, variant validation, pure operations and resolved coefficients.
Keep tunable material coefficients and limits in the central balance
configuration. The proposed resolution sequence is:

1. Resolve match equipment policy, then snapshot a validated kit for each side.
2. Resolve permanent talents, temporary boons and equipment against shared
   budgets. With frames, include their signed reach contribution inside the
   everyday length clamp before rally pressure and challenge shrink.
3. At contact, preserve the actual offset and paddle velocity for hit, flick and
   contract classification. Apply existing length compensation to the ordinary
   geometric response, then the surface response, then talent-imposed aiming.
4. Compose passive growth sources, including qualifying core rebound, before
   `BALANCE.talents.maxHitGrowth`; apply the active attack layer afterward under
   existing attack and absolute speed limits. Neutral equipment reproduces the
   existing calculation exactly.
5. Resolve incoming surge separately from this return's new bonus. Apply Cork's
   absorption only to the surviving incoming bonus and its attack cost only to
   the newly created bonus. Update both owners' surge tracking once.
6. Combine material motion-transfer coefficients with talent spin, calculate the
   outgoing direction, and enforce the shared angle limit. Prototype a separate
   equipment multiplier range of 0.70 to 1.35; multiplication by talent spin still
   needs a tested overall limit that does not reduce current valid talent builds.
7. Emit contact events, then update material state and presentation. Cosmetic
   randomness never changes contact results or consumes gameplay randomness.

Keep these calculations shared by both sides. Extract a pure contact-response
calculation from the existing mutation-heavy talent return path where needed;
inspection on the bench must not consume guards, charges, random criticals or
technique progress. Deterministic inputs can include an already resolved critical
decision rather than asking the preview to draw another random value.

The current [forecast](../src/game/trajectory.ts) predicts incoming travel through
copied arena state. Stateless material effects need no new in-flight force once
the outgoing velocity is resolved. Shot selection and outgoing bench previews
must use the same contact response. If a later material adds an in-flight effect
or stored state, copy that state into forecasts and leave the real state intact.

The [replay recorder](../src/game/replay.ts) stores presentation frames; it is not
an authoritative input replay. Stateless kits can remain a match snapshot.
Stored gel charges and split-surface cues would need recorded presentation state
to avoid showing today's runtime state over an earlier contact.

## Saving rewards and synchronizing accounts

Store a versioned Workshop state in `profile.progress.workshop`: bounded Marks,
owned component IDs, unlocked variants, equipped kit, up to three presets,
finite contract progress and the introduction-grant flag. Resolve numeric stats
from trusted definitions; never persist or accept client-authored coefficients.
Match results carry the kit snapshot and equipment rules version actually used.

| Area            | Required work                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local profile   | Extend [progress defaults, cloning and repair](../src/core/profile/progress.ts), [profile schema](../src/core/profile/schema.ts), store operations and result summaries. Unknown parts fall back to neutral; malformed counts are clamped.                                |
| Cloud shape     | Extend [shared protocol](../shared/protocol.ts), [cloud mapping](../src/core/profile/cloud.ts), [server profile mapping](../server/src/domain/profile.ts) and repository round trips.                                                                                     |
| Operations      | Add craft, equip, variant and preset operations through [account progression](../src/core/account/progression.ts), [HTTP schemas](../server/src/http/schemas.ts), [server progression](../server/src/services/progression.ts) and [sync](../server/src/services/sync.ts). |
| Match evidence  | Extend [match validation](../server/src/domain/matchValidation.ts) for kit ownership, supplied kits, declared versions, plausible material counters and reward eligibility.                                                                                               |
| Guest claims    | Update [claim sanitization and merge](../server/src/domain/claim.ts) so imports cannot duplicate starter grants, recipes or spendable currency.                                                                                                                           |
| Active sessions | Add compact kit snapshots to run and tournament saves; defer Workshop changes to the next session unless a service explicitly changes the run kit.                                                                                                                        |

Crafting names a recipe, variant and expected ownership state. The server computes
the price and deducts it transactionally, logs the result, and uses operation IDs
to make retries idempotent. A concurrent purchase on another device must not spend
Marks twice. Equip requests require owned compatible components or an explicit
mode-provided loan; a bench loan never becomes permanent ownership.

Guest merging needs a currency policy beyond the current maximum-of-records
approach. For the first release, a blank account may adopt a sanitized guest
Workshop. When an account already has Workshop progress, keep its spendable Marks
and purchased functional ownership; carry supported guest technique records and
cosmetic progress under the existing claim bounds. Explain the outcome before
claiming: "Your account keeps its Workshop Marks and crafted parts. Guest
technique records and eligible cosmetic progress will carry over." This
deliberately avoids minting currency or merging purchases that
could have spent the same starting grant twice. Supporting combined spending
histories later requires a deduplicated award and purchase ledger.

Signed-in offline operations replay in order. A kit used after an optimistic
craft must follow that craft operation; if the server rejects the craft, surface
the dependent match rejection and preserve its local practice record. Do not
accept an unowned kit merely because it appears in a submitted match snapshot.
For equipment and talent changes made during an attempt, bind validation to the
accepted attempt's build snapshot rather than the profile's current build.

New runs and cups must pin their equipment rules version. Existing active
sessions and results queued before the feature use the legacy neutral rule set.
Keep supported coefficients available for offline submissions and archived cards;
an unsupported version needs an explicit recovery path preserving banked rewards.
Include a rollout check for older clients whose repair logic drops unknown
progress fields, so an old guest claim cannot overwrite a newer Workshop.

The server currently validates reported match evidence and derives progression;
it does not replay all inputs. Material counters can have consistency bounds
such as qualifying contacts not exceeding hits, but that is not proof that every
reported centre contact occurred. Keep reward claims within that trust model.

## First release scope and implementation order

| Step | Deliverable                                                                 | Completion condition                                                                                           |
| ---- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1    | Contact prototype with neutral parts, Springsteel, Cork, Rubber and Ceramic | All nine combinations run through the actual engine and both sides; neutral behavior matches existing behavior |
| 2    | Workshop bench and material comparisons                                     | Players can feel and describe the benefit and cost with their usual input before crafting                      |
| 3    | Ownership, Marks, four recipes and three presets                            | Local and server reward decisions agree; craft retries, offline order and guest adoption are checked           |
| 4    | Mode policies, opponent kits and session snapshots                          | Fixed Daily cards, challenges, legacy saves and continued runs resolve the intended kit                        |
| 5    | Technique contracts and first cosmetic rewards                              | Progress is based on real events, works on qualifying losses and pays first rewards once                       |
| 6    | Frame and tuning expansion                                                  | Combined reach and angle remain bounded; a new part creates a useful competing choice                          |
| 7    | Advanced inserts and materials                                              | Every stateful trigger has preview, replay, reset, sync and fairness coverage                                  |

Steps 1 through 5 form the recommended first playable release. Steps 6 and 7
should follow evidence from that release. A database-connected Workshop UI by
itself does not demonstrate that material changes improve the game.

## Validation and release criteria

Run focused engine and domain coverage with the existing
[physics](../server/test/physics.test.ts), [talent](../server/test/talents.test.ts),
[progression](../server/test/progression.test.ts), [sync](../server/test/sync.test.ts)
and [experience](../server/test/experience.test.ts) suites; add equipment cases
where the existing suites cannot express them. Use the existing simulation and
layout scripts for combined builds and mobile presentation.

- Neutral parts reproduce current returns, including empowered shots, flicks,
  surge bleed, angle caps, shields, serves and rally pressure.
- Each part passes centre, edge, stationary, moving, charged and capped contacts
  from either side. Cork never removes ordinary pace; surplus attribution cannot
  become negative or leave speed above the hard limit.
- Forecast and bench reads leave live charges, counters and random state alone.
  A component cannot widen the collision surface through decorative bending.
- All nine kits are exercised with low and capped player levels, power, control
  and sustain talents, saturated boons, moving hazards and both narrow and wide
  courts. Include keyboard, mouse, touch follow and relative drag checks.
- Tutorial, fixed Daily kits, archives, couch play, challenged reach, long rallies
  and resumed runs obey their declared equipment policy. Legacy records remain
  labelled and visible.
- Retried and concurrent crafts, reordered dependent operations, duplicate grants,
  rejected purchases, malformed saves, old clients and repeated guest claims
  cannot increase ownership or available Marks incorrectly.
- Toggling system reduced-motion settings leaves material parameters, animation
  selection and timing unchanged. Full/Calm and screen-shake controls still behave
  according to their explicit in-game settings; material cues remain readable.

For feel testing, start with 8 to 12 players across keyboard, pointer and touch.
After trying neutral and one alternative on identical bench serves, target at
least 75% correctly describing that part's intended advantage and cost. Ask which
kit they choose for a centre-placement trial and a moving-edge trial, then observe
whether the choice changes their play. These are proposed acceptance targets,
not measured outcomes.

In a balanced simulation matrix, flag a kit that wins more than 60% of mirrored
comparisons against most alternatives for review. Vary side, seed, talents and
court; a scripted controller is a diagnostic tool, not a human win-rate estimate.
A material should offer a reason to equip it and a reason to switch away. The
first release succeeds when players can explain and use those differences while
the existing game remains readable and progression stays bounded.
