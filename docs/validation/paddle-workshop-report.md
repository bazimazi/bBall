# Paddle Workshop implementation and validation

Implemented on 7 October 2026 at the user's request to complete the
[paddle progression proposal](../paddle-material-progression-plan.md), including
its advanced materials, frames and conditional insert.

## Shipped feature

**Home → Workshop** opens the paddle lab with four focused views: **Build**,
**Practice**, **Progress** and **Saved**. The main views fit the tested screen sizes
without vertical scrolling. Build shows two material tiles at a time, with page
arrows and a position indicator; four part buttons and a fifth **Tune** button
switch the inventory. Tiles show material symbols, names, ownership and Mark
prices. Comparison and crafting remain visible; detailed gains, trade-offs,
techniques and paddle response open in a bounded popup with Escape dismissal and
focus restoration. Equip and **Test paddle** stay pinned across all views. Parts
remain loanable before their crafting gate, and switching views keeps the trial kit.

A schematic paddle preview changes its surface pattern, core, frame and insert
as parts are selected. Reach, moving grip and bonus damping appear on the preview.
Practice has three drills and a return-path popup with stationary/moving choices.
Progress shows the unlock path and one technique contract at a time with paging.
Saved shows one of three presets at a time; long names stay bounded in the slot
buttons and appear in full on the selected card. Gauntlet service opens from Saved
when an equipment-enabled run exists. Detailed explanatory popups can scroll on
short screens without turning the equipment view into a long page.
The diagrams use the shared ordinary surface/angle response; they are explanatory
examples rather than full talent or charge forecasts. The assembly illustration
does not change collision geometry or show a live stored charge.

The visual and compact-layout revisions follow the user's feedback on 7 October.
The Workshop uses a neon court backdrop, material symbols, a five-step unlock path
and three practice drills. Wide and short landscape screens put the paddle beside
its inventory; phones stack them with compact readouts. Material and part choices are ordinary keyboard
buttons with selected state; colour is supplemented by symbols and outlines.
The comparison button retains focus when the introduction reward is granted.
Navigation now has sliding active highlights for views, parts, tuning, presets
and contact motion. View/material/contract/preset panels enter in the navigation
direction over 260ms; the paddle responds to assembly changes over 240ms. Detail
popups open over 280ms and close over 180ms, continuing from their current pose
when dismissed early. Stable controls retain focus and input drafts; the dialog
keeps the background blocked until exit completes and cancels its fallback timer
on unmount. Repeated dismissal cannot start another exit or replay a service action.
All transitions run identically in Full and Calm and ignore system/browser
reduced-motion preferences.

See the inspected [desktop](workshop-compact/desktop-workshop.png),
[phone](workshop-compact/phone-workshop.png),
[advanced build](workshop-compact/desktop-workshop-advanced.png),
[contracts](workshop-compact/phone-workshop-contracts.png) and
[saved paddles](workshop-compact/phone-workshop-presets.png).
The [small-phone build](workshop-compact/small-workshop.png),
[long preset name](workshop-compact/small-workshop-long-preset.png),
[landscape build](workshop-compact/landscape-workshop-advanced.png) and
[return-path popup](workshop-compact/phone-workshop-paths.png) show the compact
layout and bounded details.

The live bench repeats routine, incoming attack and edge approaches through the
actual game engine. Practice uses the chosen loan kit and current skills, awards
no Marks, and never grants ownership. Compare neutral with a different core or
surface for a one-time 12-Mark grant. Crafted parts are permanent, owned changes
are free between matches, and three named equipped-paddle presets are saved.
Exiting a bench session returns to its originating Workshop, restores the trial
kit (including loaned parts and tuning), and retains the Workshop's parent menu.
The pause action reads **Back to Workshop**; browser/native Back pauses first and
then returns there. Restart retains this behavior. Opening a fresh Workshop starts
from equipped gear, and ordinary Practice, tutorials and scored games still quit
to Home.
Inspected returns: [Full, after Restart and Back](workshop-compact/app-phone-workshop-return-full.png)
and [Calm, from the pause action](workshop-compact/app-phone-workshop-return-calm.png).
Ranked rematches resolve the current equipment policy again; runs and cups retain
their session kit.

| Slot    | Free alternative | Crafted parts and prices                                     |
| ------- | ---------------- | ------------------------------------------------------------ |
| Core    | Balanced         | Springsteel 12, Cork 12, Memory gel 30                       |
| Surface | Balanced         | Rubber 12, Ceramic 12, Graphite 24, Woven fibre 24, Split 30 |
| Frame   | Balanced         | Extended 20, Compact 20                                      |
| Insert  | Empty            | Copper 24                                                    |

The 11 functional recipes cost **220 Marks** in total. Standard tuning is always
available; Firm/Grip tuning unlock after the first contact contract. No part has
random quality, deterioration, repair bills, crafting failure or recurring cost.

Springsteel adds 0.04 ordinary centre growth at the cost of 10% motion transfer.
Rubber adds 20% motion transfer and flattens stationary offset by 6%. Ceramic has
a continuous central dead band and 20% less motion transfer. Cork bleeds 80% of
tracked incoming surge, while weakening newly generated attack surplus by 10%.
Ordinary untracked pace remains intact.

Memory gel stores only extra absorption above normal bleed, up to 80 speed units,
and releases half on a later return; its new attack surplus is 15% weaker.
Graphite varies grip from 85% at centre to 125% at the edge. Woven fibre uses a
gentler outer response with a lower geometric endpoint. Split continuously blends
a reduced ceramic centre into reduced rubber ends. Extended/Compact contribute
±6 percentage points of reach; Extended loses moving grip and Compact gains
placement authority. Copper arms on the owner's actual switch event, spends one
4%-of-ordinary-pace return bonus, and costs passive attack surplus and grip.
Copper and gel cannot share a kit. Both charges expire at serve boundaries.

All effects use [shared definitions](../../src/core/equipment/catalog.ts) and
[central balance](../../src/core/balance/config.ts). Shared contact pace resolution
serves physics and outgoing AI inspection; previews copy runtime state and do not
spend charges, increment real counters or draw gameplay randomness. Frames join
the ordinary talent reach budget before rally pressure and challenge shrink.
Material grip is bounded to 0.70–1.35 and combined spin to 3. Existing passive,
active, angle, speed and absolute geometry limits remain enforced.

## Progression rules

Completed eligible scored matches with at least three player contacts pay 4 Marks
for a win and 2 for a loss. Abandoned play, tutorial, attract play, Practice,
Versus, Daily archive and survival Endless pay no Marks. Gauntlet pays 4 per
cleared act with qualifying cumulative contacts, rather than per short encounter.
A failed run with qualifying play receives 2 consolation Marks only if no act
award has been banked. The run preserves award and eligibility state across saves.

| Contract        | Target                      | Per-match cap / eligibility              | One-time Marks |
| --------------- | --------------------------- | ---------------------------------------- | -------------- |
| Clean contact   | 30 ordinary centre contacts | 8; at least 3 contacts in the match      | 6              |
| Moving craft    | 20 moving contacts          | 6; actual paddle velocity                | 6              |
| Edge craft      | 20 outer contacts           | 6; actual collision offset               | 6              |
| Material craft  | 12 bonus-pace absorptions   | 4; Pro or harder                         | 8              |
| Opponent craft  | 6 material encounters       | 1; Pro or harder, nonneutral kit         | 8              |
| Signature craft | 10 hazard wins              | 1; Pro or harder with a real court event | 8              |

Qualifying losses can advance contact, absorption and opponent contracts. Each
contract pays once. Clean **or** Moving unlock tuning; Clean **and** Moving with
two used surfaces unlock frames; Edge **and** Opponent unlock advanced parts;
Signature unlocks the final engraving. Four milestone achievements grant actual
decorative paddle chevrons. Later qualifying signature encounters continue as
bounded records in ten-encounter cycles, without new combat coefficients.
Marks cap at 9,999. Results display earned Marks, current contracts and an exact
next available recipe/price or the next unlock requirement.

## Modes, persistence and accounts

Quick, Journey, Frontier, Practice and survival Endless resolve personal
equipment. Challenges and Versus use neutral equipment. Daily/Master Daily
supply the same date-defined kit to everyone; archive play reuses that date's kit.
Opponent schools have fixed declared materials and share the same contact rules.
Material choices never change opponent tier, errors or court secretly.

New runs/cups pin version 1 equipment. Gauntlet's act-service menu links to the
Workshop: an owned kit can replace the run paddle for 2 credits at a noninitial
boundary after resolving its boon offer and before committing the next attempt.
Legacy sessions without equipment use version 0 neutral rules. Unsupported future
session versions remain visible with play disabled and an end-session recovery
path; previously banked rewards remain intact.

Profile schema 4 repairs old/malformed saves, clones nested equipment and bounds
collections. Workshop state uses the existing progress JSON storage. Database
migration 7 adds nullable tournament equipment snapshots; legacy cups retain
neutral rules and new cup snapshots survive round advancement and completion.
New Endless records retain neutral/Workshop categories and a best-kit
snapshot; old records stay visible as Legacy. Replay frames record charge and
contact position, so closing playback uses the recorded material presentation.

The sync protocol adds `workshop.action` and `match.prepare`. Craft prices come
from trusted recipes. Accepted preparations bind equipment, version, encounter
identity, talents and XP to a bounded attempt ID. Match evidence must match that
accepted start, the fixed/session mode policy and plausible material counters.
Active nonneutral sessions reject results without their starting equipment;
gearless legacy neutral results remain compatible.
Database transactions and operation IDs prevent double spending/rewards on
retries and competing purchases. Offline operations replay in order. If crafting
or preparation is refused, the dependent match cannot grant rewards; its score
and reason remain in **Account → Device practice history**, capped at 20 entries.

A blank Workshop can adopt a bounded guest Workshop. Existing accounts keep
spendable Marks and purchased functional ownership while supported technique,
cosmetic and equipment records carry over. Repeated/older claims cannot overwrite
crafted account parts. Date-supplied surfaces can support guest technique progress
without being crafted. Deploy the new client and server together and apply
migration 7: older servers do not recognize the new operations. Match counters
retain the project's existing
plausibility-validation model; they are not authoritative input replay evidence.

## Automated evidence

- `npm test`: **426 passing tests**, including 24 focused Workshop tests.
- Focused contacts exercise 216 core/surface/frame/tuning combinations, both
  sides, stateful pace preview equality, charge resets, replay restoration and
  288 low/capped Power/Control/Defense contacts with saturated boon effects.
- Real account tests cover ordered crafting/preparation/results, duplicate
  purchases/rewards, competing purchases, encounter mismatch, impossible material
  evidence, rejected dependent matches and guest bounds. Cup snapshots round-trip
  through all three rounds, including completion and a changed personal kit;
  a migration-6 save upgrades without changing legacy cup rules.
- `npm run check:ui`: **74 passing DOM interaction checks**, including comparison,
  permanent crafting, equip, preset save/load, loan selection, ranked rematch policy
  and bounded rejection history. The redesigned inventory also checks selected
  state, kit retention across views, material/contract paging, popup dismissal and
  focus, tuning and the reciprocal Copper/gel incompatibility while preserving
  owned equipment and Marks during loans.
  Routing coverage launches Test paddle and all three drills, restarts them,
  returns to the original Workshop with the loan kit, and checks the parent menu,
  fresh-entry reset and ordinary Practice/tutorial/scored-game exits.
  Detail exit coverage also checks repeated Escape, focus/background blocking,
  suspended-animation fallback, timer cleanup and operation without Web Animations.
- `npm run check:layout`: **432 browser checks** at 1280×800, 390×844, 320×568,
  844×390 and 768×1024, plus Workshop breakpoint checks at 701×568 and 699×660.
  Workshop checks assert that the main body needs no vertical scroll, every
  control fits the visible body, and touch targets stay at least 44px tall. Long
  named presets and an active equipment-enabled Gauntlet run are included.
  Checks include choice-panel focus/dismissal, screen/HUD
  geometry, all four Workshop inventories and tuning, keyboard material selection,
  paged contracts/presets, ignored system reduced-motion emulation, actual crafting and
  live gel charge presentation with muted sound in Full and Calm.
  Live-app return checks exercise **Back to Workshop**, the pinned Test paddle
  action, Restart and browser/native-style Back, preserving loan materials and
  tuning without changing equipped gear or Marks.
  Workshop motion checks sample start/middle/end frames, sliding active markers,
  direction, interrupted navigation and early popup dismissal, plus preservation
  of the trial kit, preset-name draft and keyboard focus. System motion emulation
  produces identical frames and durations. A separate browser probe confirmed
  identical frames in Full/Calm crossed with both system motion settings; desktop
  and phone screenshots were visually inspected.
- Lint, client/server type checks, web/desktop asset builds, server bundle,
  deferred-menu/bundle checks, real offline-audio rendering (including firm/soft
  contact timbres), and experience-capture checks pass.

Four reproducible bot matrices completed **792/792 matches with zero stability
alerts**: [low/default](workshop-soak-low.json), [capped Control](workshop-soak-control.json),
[capped Power](workshop-soak-power.json), [capped Defense](workshop-soak-defense.json).
Each matrix includes all 81 ordered pairs of the initial nine configurations and
18 advanced-material hazard cases, at two matches per case. Widths span 750–1290
field units. Ordered pairs swap the kit's side; talent/movement budgets are equal
within each comparison. Small bot samples are stability diagnostics, not human
win rates or proof of balanced choices.

Reproduce a matrix with:

```powershell
npm run soak -- 2 pro --group workshop --width 750 --seed workshop-low --output docs/validation/workshop-soak-low.json
npm run soak -- 2 pro --group workshop --width 1290 --build control --level 50 --seed workshop-control --output docs/validation/workshop-soak-control.json
```

Initial implementation screenshots (before the visual redesign):
[phone Workshop](workshop-ui/phone-workshop.png),
[material choices](workshop-ui/phone-workshop-material-choices.png),
[advanced desktop kit](workshop-ui/desktop-workshop-advanced.png),
[Full, muted gel charge](workshop-ui/app-phone-workshop-full-muted.png),
[Calm, muted gel charge](workshop-ui/app-phone-workshop-calm-muted.png).

## Remaining measurement

The proposal's 8–12-player recognition/choice study, 75% comprehension target and
human balance thresholds have not been measured. Physical keyboard/pointer/touch
feel, native webview/process-resume behavior, assistive technology and device
performance still need player/device QA. Automated contact, DOM and browser
evidence do not establish those outcomes.

All material animation, flex, effects and timing completely ignore operating-system
and browser reduced-motion settings on web, desktop and mobile. Full/Calm and
screen shake remain explicit independent game controls, consistently documented
in the root README, server README, packaging guide and player experience review.
