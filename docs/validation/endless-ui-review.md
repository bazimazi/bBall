# Endless expansion UI review

Reviewed and corrected on 7 October 2026, following the
[expansion implementation](endless-progression-report.md).

The expansion made several menus behave like long configuration forms. The review
keeps the next playable choice prominent, uses small groups for meaningful choices,
and puts optional rules, records and services in native expandable sections.

## Issues corrected

| Area                           | Finding and resulting behavior                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| More modes / Quick Match       | Five selectors pushed the mode list below the fold. Court/couch and match setup now have concise collapsed summaries; play choices appear immediately. Master/Mythic show their actual Legend opponent instead of four unusable alternatives.                                                                     |
| Shared controls                | Labels, select spacing, contrast and target sizes varied. Controls now share consistent styling, paired fields and at least 44px picker/disclosure targets. Small-screen headers reserve space for sound.                                                                                                         |
| Journey                        | Expanded worlds required scrolling through 24 tiles before reading the chosen stage. Six tiles appear per page, the next stage opens on its page, and world tabs support arrow/Home/End navigation. Frontier explicitly displays Story rules.                                                                     |
| Gauntlet setup                 | Fifty Pressure ranks, rules and a weekly alternative crowded the start flow. Three format cards, a Pressure selector and expandable rules expose the current choice clearly. Weekly Expedition states its fixed Pressure 0.                                                                                       |
| Active Gauntlet                | Six encounters wrapped incorrectly in a grid designed for three; long boon lists and services buried route choices. The current act fits in one row, route cards appear first, and build/services/future acts expand separately. Final finite acts omit nonexistent future acts.                                  |
| Practice drills                | Difficulty buttons implied choices the boss phase overrides; an ordinary court could leak into a plain boss drill. The phase now displays its real opponent and has one Start button. Its court stays fixed, while ordinary configuration returns when leaving the drill.                                         |
| Daily / Tournament / Challenge | Tier and format choices lacked clear selection state; archive and playlists competed with the main encounter. Compact pressed-state cards and expandable secondary flows reduce clutter. Twelve Challenge trials per page have direct group selection.                                                            |
| Profile / Talents              | Mastery lists and saved builds crowded the main view. They now expand on demand; mastery has progress bars, and talent guidance accounts for the new tiers beyond ultimates.                                                                                                                                      |
| Match HUD                      | Long opponent names, four written skill states and objective copy covered too much court, including the portrait starting paddle. The HUD has a bounded portrait width, compact skill glyphs/statuses and goal pips. Rules/goals pause for full details; pointer use releases focus so Space can serve afterward. |
| Court cues                     | Gate timers and rail durability rotated with the portrait court and shrank below useful reading size. They remain upright at 12 CSS pixels with a dark backing in Full and Calm.                                                                                                                                  |
| Results                        | Expedition/Endless still displayed progress out of nine. Finite results use the selected length, Endless shows the upcoming depth, and run status precedes coaching. Wave statistics use a balanced two-by-two grid. Very large depth labels wrap within the card.                                                |

## Choice-panel follow-up

The first pass styled the closed native selects, but the browser still drew their
open menus. The follow-up replaces every native dropdown and the archive date
picker with a shared game choice panel. It uses neon selected cards, option
descriptions, locked-choice explanations, scrollable lists and search for long
catalogs. Phones present the panel as a bottom sheet; larger screens center it.
Choosing applies immediately. Escape, Back, the close button and the backdrop
cancel without changing the setting and restore focus to its trigger.

The list initially receives keyboard focus, so opening a long list does not
automatically summon the phone keyboard. Arrows, Home/End and typeahead navigate
the choices; Enter or Space commits. Search remains available through its field.
Game shortcuts and the background menu are blocked while the panel is open.

The panels now animate their full lifetime: phone sheets slide up over 340ms
and slide down over 220ms, while centered panels lift/fade in over 320ms and
fade out over 220ms. The backdrop fades with them, using 28% darkness instead
of 80%, without blur, so the underlying menu stays readable. An early dismissal
starts from the current animation frame. Focus and background blocking remain
in place until the exit finishes; repeated input cannot apply another choice.
A cleanup timer releases the panel if a webview drops the animation-end event.
These transitions follow the project's policy of ignoring system reduced-motion
preferences, as verified with the browser preference enabled.

[Journey rules](endless-ui/choice-rules-phone.png),
[chapter choices](endless-ui/choice-chapter-phone.png),
[searchable courts](endless-ui/choice-court-phone.png), and
[small-screen locked Pressure](endless-ui/choice-pressure-small.png)
show the open state that was missing from the initial review.
The [opening frame](endless-ui/choice-opening-phone.png) records the sheet in motion.

## Mobile fullscreen follow-up

Mobile Settings now exposes Fullscreen On/Off with device-only persistence and
an Off default. Android uses native [immersive mode](https://developer.android.com/develop/ui/views/layout/immersive)
for both system bars, restores the choice on launch, and keeps edge-swipe access
and cutout insets. The iOS command hides the status bar and requests Home-indicator
auto-hiding; [iOS decides when that indicator fades](https://developer.apple.com/documentation/uikit/uiviewcontroller/prefershomeindicatorautohidden).

Supporting browsers use the [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)
directly from On and play/replay/tutorial gestures. Leaving fullscreen preserves
the preference; a reload waits for the next play gesture. Unsupported environments
show an explanation, and rejected requests remain retryable. The
[mobile settings capture](endless-ui/fullscreen-settings-phone.png) uses actual
Chromium fullscreen with touch emulation, rather than a CSS approximation.

## Browser evidence

Playwright used Chromium with actual CSS and React components at these viewport
sizes: 1280×800, 390×844, 320×568, 844×390 and 768×1024. Fixtures cover the home,
menus, expanded controls, fresh/developed profiles, Frontier, Pressure 50, active
and committed runs, final acts, deep Endless runs, drafts and result variants.
Account layout uses an empty provider response without submitting credentials.

The actual app was also navigated from onboarding through Quick Match, a served
Legend rally, paused opponent skill details, menu return and a configured
Gatehouse/Banker match. The mode-menu comparison below uses the actual app before
and after the changes. Other menu/result examples use isolated fixture profiles;
gameplay and pause captures use the actual engine. No existing save was edited.

| Screenshot                                                                                              | Evidence                                                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Modes before](endless-ui/modes-before.png) / [after](endless-ui/modes-desktop.png)                     | All six modes now fit without opening optional configuration.       |
| [Phone modes](endless-ui/modes-phone.png)                                                               | Play choices and shared header spacing.                             |
| [Journey](endless-ui/journey-phone.png)                                                                 | Compact expansion stage browsing.                                   |
| [Active Gauntlet](endless-ui/gauntlet-run-phone.png)                                                    | Six-node act, route selection and collapsed build/services.         |
| [Boss drill](endless-ui/practice-phone.png)                                                             | Real phase opponent and direct start action.                        |
| [Live match](endless-ui/match-phone.png) / [gate court](endless-ui/gate-phone.png)                      | HUD leaves the starting paddle clear; gate countdown reads upright. |
| [Paused skills](endless-ui/pause-skills-phone.png)                                                      | Full opponent skill names, states and descriptions.                 |
| [Endless result](endless-ui/endless-result-small.png) / [wave result](endless-ui/wave-result-phone.png) | Correct progress and balanced statistics on small screens.          |

## Verification

| Check                                           | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check:layout`                          | 303 real-browser checks passed across five sizes; no browser runtime errors. Checks include clipping, fixed header/footer bounds, reachable play choices, Journey navigation, six-node acts, boss launch options, result progress, choice-panel geometry/search/selection, intermediate entrance/exit frames, interrupted openings, system-preference independence, portrait HUD/paddle separation and mobile fullscreen On/Off/reload/re-entry/unsupported states. |
| `npm run check:ui`                              | 70 DOM interaction checks passed, including choice search, locked-option navigation, commit/cancel, Back handling, exit focus containment, missing-animation-event cleanup, configuration preservation, pointer/keyboard focus, browser fullscreen rejection/exit and native bridge preference restoration.                                                                                                                                                         |
| `npm run check:menus`                           | All 16 deferred menus and pending states render.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `npm test`                                      | 401 tests passed, including upright/readable court labels in both orientations and effects modes.                                                                                                                                                                                                                                                                                                                                                                   |
| `npm run typecheck` / `npm run lint`            | Passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Web and desktop asset builds / `check:bundle`   | Passed; all 16 menus remain deferred.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `npm run check:experience` / `git diff --check` | Passed.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Android `:app:compileUniversalDebugKotlin`      | Passed, including the native fullscreen and insets bridges.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Native Rust / iOS                               | Rust shell compilation could not complete because this Windows installation lacks MSVC's `msvcrt.lib`. iOS compilation and device behavior remain unverified; they need macOS/Xcode.                                                                                                                                                                                                                                                                                |

Reproduce the browser review:

```sh
npx playwright install chromium
npm run check:layout
```

`CHROME_PATH` can select an existing Chromium executable. `LAYOUT_SCREENSHOTS`
can point to a directory for all captured states. The checker starts and closes
its own local server and isolated browser context; fixtures are absent from the
production build. Playwright is a development dependency.

These checks establish browser presentation and tested interactions. Physical
touch/pen input, screen-reader output, native device frame times and human
difficulty/enjoyment measurements still need the
[player experience validation workflow](../player-experience-validation.md).
