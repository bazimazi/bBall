# bBall player experience review

Reviewed on 3 October 2026; continued on 4–6 October 2026. This review covers the current React and canvas game,
its shared physics and mode rules, input handling, first-run flow, menus,
feedback, settings and regression coverage.

**Implementation status, 6 October:** the twenty experience fixes and the final
capture/validation tooling are implemented. All automated checks listed below
pass. Human Journey/boss tuning, physical performance comparisons and the
existing native/assistive-technology checks remain validation work; no player
or physical-device evidence was available to justify changing difficulty or
quality defaults. The [validation guide](player-experience-validation.md)
provides the exact collection, comparison and decision workflow.

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
simulation runs, mounted React DOM checks and targeted regressions. No player interviews, retention data,
device performance profiles or human playtest results were available. Browser
automation reported no available browser or app surfaces, so visual layout,
touch ergonomics and perceived enjoyment remain unverified in this session.

The existing `scripts/sim.ts` drove the real world with a Pro player brain at a
1000-unit field width. Each run used six matches for each of 69 cases: five Quick
Match opponents, 30 Journey stages, 14 challenges, 14 courts and six dailies.
That is 414 matches before the changes and 414 afterward. Both runs reported
zero stalls, broken ball states or stuck closing replays. The script checks
stalls longer than 90 seconds per point; it is a stability soak, not a measure
of human enjoyment. Those historical runs used unseeded randomness and the sample per case is small,
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

W3C's dialog pattern describes initial focus, contained Tab navigation,
Escape dismissal and return to the invoking control. The code had no focus
handling for menu changes or Pause/Exit overlays; talent details had a dialog
role but no containment and no visible Close button. I applied the pattern
through a shared focus scope, safe initial actions, background blocking and
an explicit details close. New menu headings receive focus without focusing
a text field. This is an implementation of selected behaviors, not a claim
of accessibility compliance.
[W3C: Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

W3C also recommends focusing the least destructive action when a dialog precedes
a difficult-to-reverse process. Its alert-dialog pattern connects the visible
title and brief message to the dialog's accessible name and description. The
audit found that giving up a cup took one click, while Gauntlet abandonment and
guest reset used an armed second click without an explicit Cancel action. I
applied that guidance through a shared confirmation with the consequence stated,
Keep focused first, and Escape/Back cancellation. Guest reset is unavailable
during account restoration as well as for signed-in and demo profiles. These
changes make the decision explicit; reduced accidental loss or improved enjoyment
still needs player evidence.
[W3C: Dialog initial focus](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
and [W3C: Alert Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/).

The overlay stylesheet also used only `dvh` to limit card height. MDN's
compatibility data dates Safari support to 15.4, newer than the Safari 13 asset
target. The shared card now declares a `vh` limit before the `dvh` override,
retaining its existing scroll behavior on older webviews. This is a compatibility
fix inferred from the stylesheet and supported-unit data; short-screen layout
still needs physical-device verification.
[MDN: Viewport lengths](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length#relative_length_units_based_on_viewport)
and [MDN: Length compatibility data](https://github.com/mdn/browser-compat-data/blob/main/css/types/length.json).

Xbox's error-message guidance supports distinguishable errors with an explanation
and a correction route. MDN documents that storage access can be blocked and
that writes can fail when storage fills. The audit found that `saveRecord`
returned failure without informing players, while Exit and offline status still
claimed device persistence. Menus and Pause/Exit now explain an actual failed
write and offer a retry. The latest failed profile, settings or outbox record
stays in memory; retry writes it without repeating its domain operation. The
notice stays outside live rallies. A targeted regression also reproduced retry
overwriting an existing save after an unreadable startup. Writes now check for
existing data in that case and protect it for the session; the notice explains
reopening to restore it and losing changes made to that temporary data. This is
a design application to test with players, not evidence of fewer lost saves or
improved enjoyment.
[XAG 115: Error messages and destructive actions](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/115),
[MDN: localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
and [MDN: Storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

SpecialEffect recommends making settings available throughout play so players
can adjust them when they discover a need. Xbox's UI guidance also supports
consistent navigation and a persistent route back. The audit found that Pause
offered no Settings route, so correcting touch sensitivity, effects or court
quality required leaving a match. I applied that guidance through Pause →
Settings → Pause, preserving the frozen rally and requiring an explicit resume.
The engine disables gameplay input while any menu covers the court, including
pending or failed downloads. Escape first cancels an active key change; otherwise
it returns to Pause. This is a design application to test with players, not
measured evidence of improved comfort or enjoyment.
[SpecialEffect DevKit: Settings Information](https://specialeffectdevkit.info/gameplay/5_information/5_5_settings_information/)
and [XAG 112: UI navigation](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112).

MDN describes `inert` as preventing focus and interaction with a subtree.
The game also needs JavaScript containment for older webviews. The compatibility
audit found three `Array.at` calls in routing and Gauntlet score display,
although MDN's compatibility data places Safari support at 15.4 and the asset
target is Safari 13. Those calls now use indexed access. Removing the method
in a DOM check reproduces the missing capability, not an entire Safari runtime.
[MDN: inert](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert)
and [MDN: Array compatibility data](https://github.com/mdn/browser-compat-data/blob/main/javascript/builtins/Array.json).

The final validation workflow uses the real engine's animation-frame timestamps,
scoped engine/canvas-submission costs, available browser startup/first-input
signals and measured lazy imports. Each timing has a defined boundary; unavailable
signals remain unavailable. The protocol and primary browser API references are
in the [validation guide](player-experience-validation.md#what-the-measurements-mean).
This supplies the evidence collection missing from the two remaining tuning tasks,
without inferring human latency or enjoyment from browser diagnostics.

## Reproduced problems and implemented changes

The Demo audit reproduced a background account pull replacing a level-40 demo
with the account's level-1 profile, while the old real profile remained parked.
The replacement skipped persistence because Demo was active, so Exit could also
discard the incoming update. A real client/API registration regression reproduced
a level-400 guest demo importing 1,760 XP instead of the real guest's 270 XP;
server validation clamped the throwaway claim but did not make it the right save.
Source tracing found registration, social completion and manual claims sharing
the same guest accessors, and all authoritative sync paths using `applyCloud`.

Guest accessors now return the real parked guest throughout Demo. Incoming account
data updates and persists the parked account separately, leaving the demo's
snapshot, chosen level, build, draft and focus intact. Exit reveals the latest
real account; switching demo levels builds from that updated source. Existing
device-save retry retains only the latest failed real cache write, and forgetting
the account cancels it. Demo edits still bypass persistence and the account queue.
These fixes make the existing preview/claim promises consistent; they do not
establish improved enjoyment, and reward/validation/profile/API formats retain
their rules.

The account recovery regression reproduced a removed cloud cache leaving the
guest profile loaded while the account reported authenticated and synced. The
server profile was sent to `applyCloud`, which deliberately ignores data without
matching cloud metadata. Restoration now adopts that verified profile when the
cache is absent, parking the guest instead of silently continuing against it.
Source inspection also found connection/server refresh failures returning the
same false result as an ended session; boot then cleared the remembered account
and outbox. Temporary failures now retain the session, cache and queue. Matching
cached accounts can queue changes while restoration is pending; uncached play
stays guest, and those edits are not automatically imported into the account.

Online/visible-return events and explicit Account retry resume recovery. Boot
and request-time token refresh share one rotation, and account changes invalidate
old refresh/profile/sync results; obsolete requests cannot retry using the new
account's credentials. A confirmed authentication refusal still returns to the
parked guest and explains signing in again. The uncached status explicitly says
the player is a guest, retry remains available after failure, and focused recovery
hands focus to Sync now without taking it from another control. MDN documents
that the browser's online hint cannot establish server reachability. Explicit
retry therefore attempts the server even when that hint says offline; automatic
ordinary sync retains its existing hint-based scheduling. The mechanisms are
covered with the real client and in-memory API, not a measured improvement in
enjoyment or physical-device recovery.
[MDN: Navigator.onLine](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)
and [MDN: Online event](https://developer.mozilla.org/en-US/docs/Web/API/Window/online_event).

The onboarding audit reproduced Back from Account reopening first-run editing
after a late sign-in. A second regression delivered a restored profile and an
old Start click before React committed; the old guest draft replaced the account
name and avatar. Cached restoration in `main.tsx` already precedes the initial
render, so the fix concerns completed profiles arriving after launch. Routing
now subscribes to the saved onboarding flag and replaces an obsolete onboarding
root with Home before commit, preserving pages above it and their control focus.
Start and Skip read the current profile and only operate on their own unfinished
owner; onboarding drafts are keyed by owner. Normal completion still uses the
existing identity/cosmetic operations, while a later sign-out preserves navigation.
This applies React's external-store subscription and guarded render adjustment
guidance. Real sign-in/deep-link behavior and player enjoyment remain unverified.
[React: useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
and [React: Adjusting state when props change](https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).

The Home audit reproduced yesterday's cleared Daily tile remaining visible after
local midnight without an unrelated rerender. Home and Daily now share a local
presentation clock. The tile refreshes its title, cleared stars and displayed
streak at midnight and on visible return, retaining its node and the player's
focus. Foreground clock corrections are picked up by the existing 30-second poll;
hidden pages stop polling and catch up on return. MDN documents background timer
throttling and visibility events, so return refresh is necessary even with a
midnight timer. The next midnight uses local calendar hours rather than adding
24 elapsed hours, following `setHours`' documented daylight-saving behavior.
Refreshing changes no saved medals, rewards or freezes. This is a consistency
fix; perceived enjoyment and real webview timer delivery remain unmeasured.
[MDN: Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
and [MDN: Date.setHours](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/setHours).

The Profile audit reproduced a name field remaining on `Before sync` after the
real profile store received `After sync`. The old blur and avatar handlers used
that stale local value, risking a later identity write that reverted the update.
The field now tracks its saved source and profile owner: an untouched value follows
new profile names, an unfinished edit survives updates for the same player, and
guest/account/Demo/reset ownership changes discard the old draft. The input node
and focus remain stable. Handlers also read the current store and reject a changed
owner before writing, covering a restore that precedes React's next commit. An
untouched avatar choice uses the latest saved name; a name commit keeps the latest
avatar. Equivalent names/avatars do not issue another identity operation, and
successful edits show the existing `cleanName` result, including the Player default.
This applies React's guidance for adjusting local state before DOM commit rather
than briefly rendering stale state and repairing it in an effect. Preserving a
same-player draft is a design choice, not a measured player preference.
[React: Adjusting state when props change](https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
and [React: Controlled inputs](https://react.dev/reference/react-dom/components/input#controlling-an-input-with-a-state-variable).

The Profile Enter handler also blurred unconditionally, including an IME
confirmation key. It now leaves composition Enter alone, checking `isComposing`
and the 229 key-code boundary case documented by MDN. Ordinary Enter and blur
retain the existing save behavior. These fixes change only the editor; identity
validation, profile/cache formats, sync operations and reward rules retain their
behavior. System reduced-motion preferences remain completely ignored.
[MDN: Keydown during IME composition](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event#keydown_events_with_ime).

The Results audit found that its custom card bypassed the shared menu shell:
the finished page had neither heading focus nor the device-save notice, although
the pending Results download inherited both from its loading page. The earlier
save-navigation check mounted a generic screen instead of the actual Results
component. Results now focuses its named outcome heading on entry and includes
the shared notice and retry in scrolling content, above the rewards. Ordinary
rerenders and retry preserve the player's control focus; successful focused retry
uses the existing saved-status focus handoff. This applies the menu's existing
orientation behavior and W3C's named-region guidance; actual announcements and
short-screen layout still need device checks.
[W3C: Region landmarks](https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/region.html).

A mounted regression reproduced a star reveal delayed by an unrelated rerender.
App supplies a fresh chime callback on rerender, and React cleans up an effect
when a dependency changes, cancelling the reveal's timers. Chime delivery now
uses an Effect Event to read the latest callback without restarting the schedule,
following React's documented timer pattern. Changed star masks reset their
presentation, unearned stars remain dark/silent, and navigation cancels remaining
chimes. The star graphic has an image role and a stable total label from entry.
Duration formatting also rounds the whole elapsed time before splitting minutes
and seconds, so 119.6 seconds reads `2m 0s` rather than `1m 60s`. These changes
preserve reward calculation, match records, animation timings and the complete
system reduced-motion exclusion.
[React: useEffect cleanup](https://react.dev/reference/react/useEffect),
[React: Effect Events with timers](https://react.dev/reference/react/useEffectEvent#using-a-timer-with-latest-values)
and [W3C: aria-label for objects](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA6).

The Daily copy audit reproduced silent clipboard refusal: the old Share result
button caught the error and offered no outcome or fallback. MDN documents that
`writeText` requires a secure context, can refuse access, and resolves after the
clipboard has been updated. Copy result now reports pending/success/failure and
offers the exact result text for manual copying after refusal. A synchronous
guard stops duplicate pending requests, and record changes/navigation discard
late responses. Success has no reset timer. An already-requested API write cannot
be cancelled; ignoring its response protects the UI, not the system clipboard
from eventual completion of that original write.
[MDN: Clipboard writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText).

W3C's status technique supplies a polite live region for outcomes without requiring
focus on the message. The copy and rollover messages have `role="status"` and
explicit atomic updates. A failed copy selects its manual field only while the
copy button still owns focus, preserving a player's move to another control.
Successful retry returns focus before removing a focused manual field. This
applies the technique; actual announcements still require assistive-technology
checks. The fallback sits in scrolling content with Play pinned below.
[W3C: ARIA22 status messages](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22).

The same audit reproduced a midnight mismatch: the preview could remain on the
previous day for 30 seconds while Play independently chose the new day's rules.
Background timer throttling can prolong stale data, as MDN documents. Daily now
schedules local-midnight refresh, retains its 30-second countdown updates, and
refreshes on visible return or window focus. Play rechecks the day; a stale press
updates the preview with an explanation and waits for a new press. The reviewed
key is passed to the existing rules builder, and quests share the preview date.
Rollover also returns focus to Play if it removes the focused copy controls.
The server's daily acceptance window, streak/reward logic, results and stored
profile formats retain their rules. System reduced motion remains completely ignored.
[MDN: Page visibility and timer throttling](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

The skill-control audit reproduced secondary/auxiliary presses invoking a skill
and ordinary cooldown updates cancelling the feedback ring's cleanup timer.
React documents running effect cleanup before changed dependencies; the old
timer lived in the cooldown-dependent effect, so the next ring update cancelled
it. It now follows the feedback event instead. Pointer activation accepts button
zero (the configured primary action, including touch/pen contact), with keyboard
activation retained and unavailable buttons still focusable for their state.
[React: useEffect cleanup](https://react.dev/reference/react/useEffect)
and [MDN: MouseEvent button](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button).

Cast and Echo feedback now use match-local counters rather than guessing from
cooldown jumps. Only accepted casts and Echo clearing a spent cooldown advance
them. A cast takes precedence if both counters change in one UI update. Ordinary
recharge and return bonuses cannot imitate Echo, and reopening the bar does not
replay an old cast. A separate engine regression reproduced a stale unavailable
label after an Echo-style reset: its cache omitted recast lockout and readiness.
The key now uses the same quantised cooldown state as the view, including readiness,
and the event counters. Unchanged displayed state retains the cached array.
Cooldown durations, lockout, talent balance, saved profiles and API results retain
their existing rules. System reduced-motion preferences remain completely ignored.

MDN documents the `interrupted` audio state, including iOS Safari page changes,
and distinguishes it from app-requested suspension. It also documents that
`resume()` returns a promise which rejects for a closed context. The audit found
that the unlock path only resumed an existing `suspended` context, ignored
`interrupted`, and never resumed a newly created suspended context on its first
gesture. Two simulated-context regressions reproduced those missing requests.
Both paths now request recovery; lifecycle throws and rejected promises remain
contained, with later gestures free to retry. Hidden pages also suspend an
interrupted context, mute/volume choices survive recovery, and graph construction
failure attempts to close its partial context. This implements lifecycle
handling, not a guarantee of audible recovery under browser/device policy.
[MDN: Audio context state](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state)
and [MDN: AudioContext resume](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume).

The resize audit reproduced another contact problem: `rescaleField` multiplied
the ball's x coordinate by the width ratio while paddle insets stayed fixed.
Shrinking from 1290 to 750 field units moved a ball just before either contact
plane behind it. Expanding also moved an imminent contact away from the paddle.
All four incoming-contact regressions failed before the fix. The recorder kept
old absolute coordinates, so a later closing replay could use the wrong court
width. Both now map the space between contact planes and retain the fixed end
zones; this also keeps existing misses behind their paddle. Velocity direction
adapts to the stretched interior while ball speed stays constant.

MDN documents window resize events when the document view changes, including
their non-cancelable behavior. I applied the existing pause/resume mechanism
before queued layout when CSS viewport dimensions change, with a short Pause
explanation and an explicit resume. This is a design decision to let the player
find the ball after reflow, not a requirement from that source. Notifications
without changed court/input coordinates retain touch ownership and held keys.
Real browser chrome and keyboard behavior, interruption frequency and player
comfort need physical-device testing.
[MDN: Window resize event](https://developer.mozilla.org/en-US/docs/Web/API/Window/resize_event).

| Area                    | Evidence from the original code or regressions                                                                                                              | Resulting behaviour                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Demo continuity         | Background pulls replaced the demo and skipped its real cache; registration claimed throwaway XP instead of parked guest progress.                          | Sync updates the parked real save/cache while Demo stays visible; Exit uses the latest account, and claims/previews use only the real guest.                                                           |
| Account recovery        | A missing cache left guest data loaded under a synced account; temporary refresh failures followed the sign-out path and cleared queued work.               | Verified restoration adopts a missing cache, temporary failures retain the account/outbox, uncached guest edits remain separate, retries recover, and obsolete account requests are cancelled.         |
| Onboarding continuity   | Back reopened first-run editing after sign-in; an old Start action replaced a restored identity before React committed.                                     | Home replaces obsolete onboarding in the stack, active pages keep focus, and Start/Skip reject another or already completed profile.                                                                   |
| Home Daily continuity   | Yesterday's cleared tile remained visible after midnight without an unrelated rerender.                                                                     | Title, stars and displayed streak refresh at midnight/visible return, with stable focus, no hidden polling and no saved-progress changes.                                                              |
| Profile editing         | A mounted field retained its initial name after cloud replacement; handlers could reuse it. Enter also ended editing during composition.                    | Untouched names follow updates, same-player drafts survive, changed owners discard drafts, identity actions read the current store, and IME confirmation retains editing.                              |
| Results continuity      | The custom card omitted menu heading focus/save notices; callback rerenders restarted star timers; minute-boundary rounding displayed 60-second remainders. | A named focused outcome, actual save failure/retry, uninterrupted star reveals using the latest callback, labelled star totals and correct duration formatting.                                        |
| Daily copying           | Clipboard refusal produced no feedback or fallback, and overlapping requests used unmanaged reset timers.                                                   | Pending/success/failure status, manual text and retry; duplicate pending requests are blocked and stale UI responses ignored.                                                                          |
| Daily rollover          | A 30-second-old preview could launch a different day's challenge; removing copy controls lost focus.                                                        | Midnight/return refresh, matching quest date, a stale-press review step, explicit preview key at launch and focus return to Play.                                                                      |
| Skill controls/feedback | Non-primary pointer presses invoked skills; cooldown updates cancelled feedback cleanup; the cached view omitted lockout readiness.                         | Primary pointer/keyboard activation respects readiness. Cast/Echo rings follow actual events, expire independently, and the HUD updates when lockout ends.                                             |
| Audio recovery          | Unlock omitted interrupted contexts and newly created suspended contexts; lifecycle promises had no rejection handling.                                     | First use and later gestures request recovery, with failed operations contained and preferences retained. Returning to an unfinished match still requires explicit Resume.                             |
| Court resize            | Scaling absolute ball coordinates crossed fixed paddle contact planes; recorded replay frames retained old widths.                                          | Position mapping preserves pending returns and existing misses; trails and recorded replays adapt to the new court. Changed viewport dimensions pause until explicit resume.                           |
| Wall and paddle contact | The ball was reflected at a wall before the paddle sweep, even when the paddle contact happened first.                                                      | Contacts are resolved in time order, and remaining flight continues after each reflection.                                                                                                             |
| Sweep near a wall       | The sweep interpolated a straight chord between positions on either side of a reflected path. A targeted case incorrectly incremented the rally.            | Each straight flight segment is tested separately. The regression no longer records the incorrect paddle hit.                                                                                          |
| Moving paddle placement | The return used the paddle's final position for an earlier ball contact. At 960 units/second it can move eight units in a fixed step.                       | Reach and return angle use its interpolated position at the contact instant.                                                                                                                           |
| Pause continuity        | Effects and arena updates ran before the paused-status branch. Camera noise also used wall time.                                                            | The paused simulation holds the court, particles, effects and timers. Camera noise stops advancing. Queued steering is discarded.                                                                      |
| Resume                  | A paused live rally resumed immediately.                                                                                                                    | A cancellable 3–2–1 gives three half-second beats before play, using real time even after a slow-motion point. Players can disable it. Losing focus cancels the countdown.                             |
| Touch serving           | Pointer-down both positioned the paddle and shortened the serve timer.                                                                                      | Dragging positions the paddle. A short tap released within 12 screen pixels requests a serve. Cancellation, a drag that returns to its start, and a long hold do not.                                  |
| Pointer ownership       | A second pointer-down could replace the active pointer.                                                                                                     | Each paddle keeps one pointer owner until release or cancellation. Versus still supports independent fingers, even when they cross the midline.                                                        |
| Point pacing            | All serves launched on a timer.                                                                                                                             | Automatic remains the default. When ready holds the point until a tap, Space, Enter or Serve button. After the ordinary delay, extra waiting holds court and skill clocks and does not add match time. |
| Learning                | Movement hints were brief; controls and technique were chiefly documented in README.                                                                        | Home offers How to play, return placement advice and a Rookie Practice warm-up. Pause has a reusable controls reference.                                                                               |
| Visual comfort          | Shake settings did not cover every flash or background movement.                                                                                            | Full and Calm effects are explicit game settings. System/browser reduced-motion settings are completely ignored, including canvas effects, result reveals and UI transitions.                          |
| Keyboard behaviour      | Global movement handlers intercepted menu arrow keys and did not distinguish browser shortcut modifiers.                                                    | Movement and skill keys are handled during live play. Ctrl, Alt and Meta combinations retain their normal behaviour.                                                                                   |
| Opening card            | A quick serve could leave an intro card over the opening rally.                                                                                             | Launching clears the intro presentation so the ball's first approach stays readable.                                                                                                                   |
| Saved cup               | Giving up a cup immediately ended it with one click.                                                                                                        | A confirmation explains the lost cup attempt and preserved XP/unlocks. Keep, Escape and Back cancel.                                                                                                   |
| Saved run               | The same End run button stayed armed for a second click, without an explicit Cancel action.                                                                 | A confirmation explains the lost run, focuses Keep and requires a separate acceptance. A changed run discards the pending request.                                                                     |
| Guest reset             | Reset used an armed second click and remained available while an account was restoring.                                                                     | A confirmation explains the irreversible guest-profile loss and retained settings. Account restoration, signed-in profiles and Demo do not offer reset.                                                |
| Device save failure     | Failed storage writes were silently ignored; Exit and offline text could still claim progress was saved.                                                    | Menus and Pause/Exit show a save notice with retry. Only the latest record is retried; failed writes remain visible until saved or the record is explicitly forgotten.                                 |

The physics retains the existing reach allowance, talent effects, speed caps
and opponent tuning. Incoming talent slowdown is rechecked after a contact so
the outgoing return travels at its full pace. Device settings extend the
existing validated record; old volume, shake, vibration, replay and skill-side
choices survive. Profile and cloud progression formats are unchanged.

## Validation

All 360 tests passed, along with 56 mounted UI checks, nine capture checks,
all 16 menu renders, client/server type checking, ESLint and web/Safari-targeted
asset builds. The original simulation pair completed 828 matches; the final
seeded narrow/wide pair completed another 828. Both pairs reported no stability
alerts. These results verify the stated automated boundaries, not physical play.

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

The navigation batch adds an engine regression for already-handled keys and
blocking dialogs, plus **ten mounted UI interaction checks** in `check:ui`.
These use the real components and React DOM under Strict Mode in Happy DOM,
with asynchronous updates wrapped in React's `act`. They check heading focus
without stealing focus on ordinary rerenders; Pause Tab wrapping and focus
return; Exit's safe initial action and background blocking; all three talent
details dismissal routes; hidden/disabled controls; dynamic backgrounds;
nested dialog ownership; empty dialogs and a disappeared opener;
pending/completed/failed menu focus and explicit
reload; and navigation/Back/Gauntlet score display with `Array.at` removed.
Happy DOM is a development dependency and is not shipped
to players. Its substitute layout boxes and dispatched events do not verify
CSS stacking, native Tab defaults, actual downloads or screen-reader output.
[React: act](https://react.dev/reference/react/act)
and [Happy DOM: Getting started](https://github.com/capricorn86/happy-dom/wiki/Getting-started).

The paused-settings batch adds three engine tests and two UI checks, bringing
`check:ui` to **12 checks**. The real engine holds paused serve and play states
while preferences change and gameplay keys or pointers arrive. Score, ball,
paddles, skill cooldowns, hazards, bot state, rules and build stay frozen.
Backing density, effects, manual serving, touch controls and bindings update;
returning to the court stays paused, and explicit resume uses the new countdown
choice. Covering gameplay clears held keys and touch owners, prevents new mouse
or touch steering and retains the global mute shortcut. Mounted components and
the real route stack exercise footer, header, Escape and Back returns, retained
score, preview cleanup, key-capture cancellation, and pending/failed Settings
recovery. The UI fixture uses command spies; frozen-world behavior is checked
separately through the real engine. It does not mount the entire App or verify
physical webview Back behavior, actual downloads or visual layout.

The saved-progress batch adds four UI checks, bringing `check:ui` to **16 checks**.
They exercise the shared alert dialog's title/description references, Keep focus,
Tab wrapping, focus return, button/Escape/Back cancellation and single acceptance
even when its consumer leaves the dialog mounted. The real guest profile and
progression stores verify that cancellation preserves saved progress, confirmed
abandonment parks the finished cup/run without removing earned XP or unlocks,
and explicit reset clears the guest profile while preserving device settings.
Earned progress is seeded by publishing a constructed winning result through
the real match/progression pipeline, rather than playing that match through
physics. A replaced cup/run needs a fresh confirmation. Rendered account and
demo transitions close a reset request, and returning to guest does not reopen
it. Storage is isolated in the DOM fixture; no user save or live account is
changed. These checks do not verify physical keyboard defaults, actual Android
Back delivery, screen-reader announcements or card layout. Both production asset
builds retain the `vh` declaration before `dvh`; that confirms emitted CSS, not
scrolling behavior on a physical webview.

The device-save batch adds seven domain tests and four UI checks, bringing
`check:ui` to **20 checks**. Injected `SecurityError` and `QuotaExceededError`
exercise denied access, full storage, partial recovery and the latest pending
record. A successful unrelated write cannot clear another record's failure;
forgetting an account cache cancels its pending write so retry cannot restore
it. An invalid circular record remains a reported failure rather than throwing.
Mounted Exit, menus, Home and sync badges verify truthful text, retry feedback,
safe initial focus and focus on the success message after the retry button
disappears. Real guest progression and settings stores verify that retry retains
their current values, does not award the constructed match twice, and does not
persist Demo. An unreadable startup followed by recovery preserves an existing
record and reports how to restore it; without an older record, retry saves the
temporary data normally. The lazy-page rendering check also covers the external
store's server snapshot. No real storage quota, browser permissions or user save was
changed. Full App mounting, physical-device layout and actual assistive-technology
announcements remain unverified. Protected existing data is not merged with the
temporary session: restoring it requires reopening and drops temporary changes
to that record. Authentication/session storage, corrupt-payload repair and
best-effort cache deletion retain their existing behavior.

The resize batch adds thirteen regressions and one mounted UI check, bringing
`check:ui` to **21 checks**. Seven physics/replay tests cover incoming returns at
both paddles under shrink/expand, existing misses that still award their point,
speed and trail round trips, and wrapped replay records resized before and
during playback without changing its clock or publishing a result. Six real
engine tests cover immediate pause before queued layout, serving, live play,
countdown cancellation, held-key and gesture cleanup, Versus, retained lesson
state, manual pause and menu behavior, and unchanged viewport notifications.
The test clock now runs all queued animation-frame callbacks rather than
overwriting the render callback with the layout callback. The UI check verifies
the explanation, Resume focus and its action. Existing quality-change and
system reduced-motion regressions still pass. These fixtures do not verify
physical orientation events, browser chrome, virtual keyboards or perceived
interruption frequency. Completed matches continue their resized replay; a
completed lesson and menus do not open a resize Pause.

The audio recovery batch adds nine audio lifecycle tests and one engine
visibility test. Real `GameAudio` builds its graph against substitute nodes and
context methods, covering first-use resume, interrupted recovery without a graph
rebuild, interrupted suspension, mute and both buses, running/closed states,
synchronous throws, rejected promises, later retry, pending requests and late
completion after disposal, partial graph cleanup, missing/refused audio and the
WebKit constructor. The engine test separately uses command spies to check that
serve/play/countdown states stay paused after a hidden page returns, and that
explicit Resume requests audio unlock. `check:ui` passed **21 checks** at that point.
These checks do not render samples, reproduce actual autoplay restrictions or
establish hardware recovery. The offline mix-rendering check was not run in
this batch; browser inventory returned no available surfaces. Physical Safari,
packaged webview and listening checks remain required. Audio refusal does not
become a permanent retry lock; closed contexts are left alone until disposal.

The skill-control batch adds six domain/engine regressions and four mounted UI
checks, bringing `check:ui` to **25 checks**. The timer and non-primary input checks
failed before their fixes. Restoring the previous cache key reproduced both the
stale lockout readiness and missing event updates. Real talent runtime tests cover
accepted/refused casts, spent/ready/empty Echo targets, lockout retention, natural
and return-driven recharge, and match reset. Engine fixtures check reference
retention and readiness even when the quantised ring already reads one. Mounted
Strict Mode checks cover mouse/touch/pen and keyboard activation without a second
pointer-click cast, slot gaps, focusable unavailable state, expiration through
cooldown updates, successive events, natural recharge, hiding and match reset.
The clock and event sequences are substitutes; these checks do not run CSS
animations, physical pointer defaults or screen-reader announcements. Browser
inventory again returned no available surfaces. Physical-device feedback and
control checks remain required.

The Daily batch adds nine mounted UI checks, bringing `check:ui` to **34 checks**;
the domain/API suite remains at **318 passing tests**. Rejected clipboard and
stale Play checks failed before their fixes, and a midnight check reproduced
focus loss before the handoff was added. Clipboard substitutes cover missing API,
synchronous refusal, rejected/pending/fulfilled promises, duplicate presses before
a rerender, retry, selected manual text, moved focus, record changes and late
completion after navigation. A controlled local clock covers a year-end midnight,
multi-day background return, window focus, quest agreement, stale-press review,
explicit/default rule dates, and timer/listener cleanup. Real rules are built
against a command spy; these fixtures do not play the Daily through physics.
One initial failing assertion tried to diff a React event graph and exhausted
Node memory; comparing the launch count corrected that diagnostic. The standard
UI command then passed without warnings. No system clipboard, player save, device clock
or browser preference was changed. Browser inventory returned no surfaces, so
clipboard permission/selection, status announcements, real timer delivery and
short-screen layout remain physical-device checks.

An earlier rebuild ran out of available machine memory. Repeating it with two
Rayon workers and a 256 MB Node heap succeeded and passed `check:bundle`.
Earlier standard web builds passed; no persistent build-memory settings were
changed.

The Results batch adds four mounted checks, bringing `check:ui` to **38 passing
checks**, with **318 domain/API tests** still passing. The star-schedule check
failed before the callback fix. Controlled timeouts and animation frames cover
ordinary callback replacement, latest/removed callbacks, unearned stars, changed
awards, no replay after completion, navigation cleanup and the existing XP
count-up reaching its actual award. Heading/region attributes, initial focus,
action focus across rerenders and minute-boundary durations are checked on the
real Results component. The existing save-navigation test now mounts that
component and verifies failed/successful retry there, saved XP and match count,
unchanged profile/settings snapshots, and later failure recovery after navigating
to Home and entering Demo. These remain synthetic UI checks; visible reveals,
physical sound, screen-reader output and touch layout are unverified.

The Profile batch adds five mounted checks, bringing `check:ui` to **43 passing
checks**, with **318 domain/API tests** still passing. The untouched-name regression
failed before the fix. Tests use the real local profile store's sign-in, authoritative
replacement, sign-out, Demo and reset paths with constructed cloud DTOs and isolated
Happy DOM storage; no account is contacted. Native input-setter/event substitutes
exercise typing, draft preservation, focus, canonical/empty names, unchanged-write
avoidance, latest-avatar retention, changed owners and actions in the same batch as
a restore/rename. Synthetic Enter events cover ordinary commit, `isComposing` and
key code 229. The click helper includes its focus/blur events in React's `act`
scope. These checks do not verify physical IME event ordering, mobile keyboard
behavior or real account/network transitions.

The Home Daily batch adds four mounted checks, bringing `check:ui` to **47 passing
checks**, with **318 domain/API tests** still passing. The year-end midnight
regression failed before the fix with the previous cleared tile still visible.
Controlled dates, timeouts and visibility events cover the new title/stars/streak,
matching Daily preview and launch, multi-day return with/without saved freezes,
foreground clock corrections in both directions, stable tile/other-control focus,
hidden initial mounts and timer/listener cleanup after navigation. Repeated return
events retain one calendar timeout; hidden pages retain none. Profile snapshots
remain unchanged, including saved freezes. Existing Daily copy, stale-Play and
quest-date checks pass with the shared hook. These substitutes do not change a
device clock or player save and do not verify actual OS clock/timezone changes,
daylight-saving transitions or physical browser/webview visibility delivery.

The onboarding batch adds four mounted checks, bringing `check:ui` to **51 passing
checks**, with **318 domain/API tests** still passing. Both Back reopening the form
and a pre-commit Start overwriting the restored name failed before the fix. Tests
use the real routing hook, onboarding component and isolated profile store with
constructed cloud DTOs. They cover stale Start/Skip actions without profile writes,
active/dormant onboarding, Account focus, cached restoration before/after mount,
later sign-out/navigation, ordinary profile updates and normal Start with cleaned
name, selected avatar/colour, heading focus and duplicate-activation protection.
Guest progress comparisons exclude the store's normal commit timestamp. No actual
account is contacted; OAuth, native deep-link delivery and assistive technology
remain physical-browser/device checks. Existing match, pause and Results checks
also pass with the routing subscription.

The account recovery batch adds **13 client/API regressions** and **three mounted
UI checks**, bringing the totals to **331 tests and 54 UI checks**. The missing-cache
test failed before the fix with absent cloud metadata despite a synced account.
The real client, in-memory SQLite/API and simulated cookie jar cover cached and
uncached recovery, network failure, a 503 refresh response, retained queued edits
and offline match rewards applied once. Reload fixtures forget in-memory access
tokens/cloud metadata while retaining storage/cookies; they do not launch another
browser process. A network return without an online notification exercises visible
return, while explicit retry is checked against a false connectivity hint with an
actually reachable API. Delayed boot/request responses cover sign-out and a newer
sign-in, including cancellation without an obsolete retry or resolving newer queued
work. Concurrent return/retry and authenticated requests use one token rotation.
A queued push held in network backoff is cancelled before another request can
send its old body under a newer sign-in. Account checks surround authenticated
retries and response reads as well as token refresh.
Genuine server session expiry still clears account-only queued work and restores
the guest. Mounted Account checks substitute store updates/promises to cover
status text, blocked pending retry, failure focus, focused-success handoff, moved
focus, manual Sync and ended-session explanations without contacting an account.
Physical cookie persistence, process relaunch, native connectivity/visibility and
assistive technology remain manual checks. Server reward/API/storage formats and
the complete exclusion of system reduced-motion settings retain their rules.

The Demo batch adds **10 client/API regressions** and **two mounted UI checks**,
bringing the totals to **341 tests and 56 UI checks**. Background replacement and
registration importing throwaway XP both failed before the fix. The real client,
in-memory API/SQLite and cookie jar cover profile pulls crossing Demo entry/exit,
background identity updates, real offline rewards applied once, demo talent/edit
exclusion, current cloud metadata/cache, level switching, real guest registration
and repeated manual claims. Injected cache-write failures cover blocked retry,
latest-write recovery while Demo remains visible and cancellation when forgetting
an account. Cache restoration models the profile boundary, not a process relaunch.
Mounted Account/Profile checks use constructed store data to cover a fresh guest
with no import offer, a real-progress preview, retained demo name draft/input/focus
during background sync and the latest real name after Exit. This batch does not
perform OAuth sign-in, native deep links, physical focus or browser persistence.
The shared guest accessors serve those claim paths by source inspection; their
physical behavior remains a device check. System motion preferences remain ignored.

The final evidence batch adds **19 domain/engine/summary tests** and **nine capture
checks**, bringing the totals to **360 tests, 56 UI checks and nine capture checks**.
The real engine takes additional clocks only with an attached frame probe;
observer failures leave play running, old disposers cannot clear replacement
probes, and retry/quit events preserve the unfinished trial's counters before
reset. Capture fixtures cover duration/visibility/context segmentation, cleanup,
unsupported/refused browser timing APIs, frozen attempt labels, the 200th trial,
immutable exports, privacy field selection and no profile/settings/API writes.
Summary tests recompute raw distributions, reject missing/non-finite/inconsistent
intervals, deduplicate repeated exports and keep different starting contexts
separate. The real CLI handles paths with spaces and rejects malformed reports.
These use substituted rendering/audio, events and clocks; they are not benchmarks.

Seeded soaks use the final revision at widths 750 and 1290, six matches for each
of 69 cases, with seed `final-review-20261006`. All **828/828** completed with
zero stalls, broken states, replay failures or timeouts. Two small Quick runs
with identical seed/options also produced identical tallies. The first boss
cleared in 3/6 matches at both widths, with mean times around 145/221 seconds.
This is controlled bot stability evidence; it does not supply a human tuning
target. The [validation guide](player-experience-validation.md) defines how to
collect and compare real attempts and physical timings before making that decision.

Run the checks from the repository root:

```powershell
npm test
npm run typecheck --workspace server
npm run lint
npm run build
npm run check:bundle
npm run check:menus
npm run check:ui
npm run check:experience
npm run soak -- 6 pro --seed final-review-20261006 --width 750 --output .temp/experience/soak-narrow.json
npm run soak -- 6 pro --seed final-review-20261006 --width 1290 --output .temp/experience/soak-wide.json
```

The original single entry was 607.73 kB. With menu deferral and the subsequent
rendering, focus, paused-settings, confirmation, device-save, resize, audio,
skill-control, Daily recovery, Results continuity, Profile editing, Home Daily,
onboarding, account recovery, Demo continuity and opt-in evidence capture the entry is 460.27 kB and Vite no longer emits its
500 kB chunk warning.
The complete initial static graph is **566.29 kB across
19 JS files**, because shared domain
code remains necessary. The comparable web-build measurements from
`check:bundle` are:

| Initial static payload | Before    | After     | Reduction |
| ---------------------- | --------- | --------- | --------- |
| JavaScript             | 607.73 kB | 566.29 kB | 6.8%      |
| JavaScript, gzip       | 189.12 kB | 185.01 kB | 2.2%      |
| CSS                    | 58.94 kB  | 48.01 kB  | 18.5%     |
| CSS, gzip              | 12.22 kB  | 11.12 kB  | 9.0%      |

Gzip totals use Node's `gzipSync` at its default level, summed per unique file
with the same method before and after. These are artifact bytes, not measured
network transfer or time to play. The graph excludes dynamic imports, HTML,
images, fonts and API responses. More files introduce request overhead; cold
starts, menu latency, stylesheet loading and low-end rendering still need
device profiling. The focus behavior adds 3.85 kB initial JS (1.48 kB gzip)
relative to the rendering batch. Shared screen CSS now occupies a separate
initial file, so the same 47.37 kB raw CSS compresses to 11.00 rather than
9.91 kB across two files. Paused settings adds another 1.02 kB initial JS
(0.26 kB gzip), with unchanged initial CSS. These are costs of the two batches,
not further byte reductions. Saved-progress confirmation adds another 0.28 kB
initial JS (0.12 kB gzip) and 0.21 kB CSS (0.04 kB gzip), compared with the
paused-settings build. Its shared component remains deferred with the menus.
Device-save recovery adds 2.32 kB initial JS (1.14 kB gzip) and 0.47 kB CSS
(0.28 kB gzip), compared with the confirmation build. Initial CSS now spans
three files. The smaller entry reflects shared-chunk movement; the complete
initial graph grows, and these costs are not a speed improvement.
Resize continuity adds 1.12 kB initial JS (0.45 kB gzip), compared with the
device-save build, with unchanged initial CSS.
Audio recovery adds 0.13 kB initial JS (0.07 kB gzip), compared with the resize
build, with unchanged initial CSS.
Skill-control feedback adds 0.27 kB initial JS (0.09 kB gzip), compared with the
audio build, with unchanged initial CSS.
Daily recovery leaves initial raw JS unchanged at the reported precision;
removing the unused copied-state colour rule reduces initial CSS by 0.04 kB
(0.01 kB gzip). At that point its deferred web page grew from 4.15 to 6.28 kB JS (1.84 to
2.61 kB gzip) and added a deferred 0.19 kB CSS file (0.16 kB gzip).
Results continuity grows the deferred web Results chunk from 11.46 to 11.64 kB
JS (3.90 to 4.00 kB gzip). Sharing its existing focus/save components also changes
chunk placement: initial JS falls by 0.25 kB (0.41 kB gzip), while unchanged raw
initial CSS compresses to 0.19 kB less across two files instead of three. The entry
itself grows by 0.81 kB. These are bundler artifact measurements, not evidence of
faster loading or better frame times.
Profile editing grows its deferred web page from 4.54 to 4.91 kB JS (1.76 to
1.92 kB gzip). The initial web graph and CSS retain their reported byte totals;
the additional behavior remains deferred. No load-time improvement is claimed.
Home Daily continuity adds 0.64 kB initial JS (0.17 kB gzip) compared with the
Profile build, with unchanged initial CSS. Extracting the shared clock shrinks
the deferred Daily page from 6.25 to 5.80 kB JS (2.59 to 2.44 kB gzip). These
are artifact costs and code placement, not measured loading or battery gains.
Onboarding continuity adds about 0.20 kB initial JS (0.09 kB gzip) compared with
the Home Daily build, with unchanged initial CSS. No load-time gain is claimed.
Account recovery adds 2.42 kB initial JS (0.60 kB gzip) compared with the
onboarding build, with unchanged initial CSS. The deferred Account page grows
from 10.00 to 10.64 kB JS (3.66 to 3.83 kB gzip). These are artifact costs, not
measured load-time or recovery-latency gains.
Demo continuity adds about 0.08 kB initial JS (0.02 kB gzip) compared with account
recovery, with unchanged initial CSS and all 16 menus still deferred. These are
artifact costs, not a measured loading or player-experience improvement.
Local capture adds 3.44 kB initial JS (2.02 kB gzip) compared with Demo continuity,
with unchanged initial CSS. Shared code moves into three more initial files;
the smaller entry is not a startup improvement. The 9,259-byte recorder chunk
is deferred and requested only with the explicit URL/build opt-in; ordinary
play installs no recorder/listeners or additional frame clocks. All 16 menus
remain deferred. Physical performance remains unmeasured.
The Safari-targeted desktop-mode graph passed its check at
574.47 kB JS (187.39 kB gzip) across 19 files and 48.27 kB CSS (11.15 kB gzip)
across two files. An explicitly capture-enabled Safari asset build also passed
its bundle check; normal assets retain the URL opt-in. The final
`dist/` was regenerated as the web build. Native packaging and visual or
on-device QA remain pending.

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

The twenty fixes and final evidence workflow have now been implemented:

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
- **Keyboard navigation and dialog ownership:** opening a menu focuses its
  heading; ordinary rerenders preserve control focus. Pause starts on Resume,
  Exit on Keep playing, and talent details on their name. Dialogs contain Tab
  and Shift+Tab, skip unavailable controls, block background interaction and
  restore a connected invoker or a logical heading/playfield fallback. Escape
  resumes/cancels/closes the top dialog and is consumed before the engine.
  Exit and details also block raw game shortcuts; Pause keeps its usual game
  shortcuts. Dialogs are named, mounted over the HUD, and have visible dismissal
  controls. Existing transitions and the system-motion policy retain their
  behavior. Routing and Gauntlet's last score also avoid `Array.at` so those
  paths do not require an API newer than the native asset target.
- **Settings without abandoning a match:** Pause offers Settings, with a
  persistent Return to paused game action. The existing route stack preserves
  the match while sound, effects, quality and controls are adjusted. Header Back,
  browser/Android Back and Escape return to Pause before Resume. Key remapping
  consumes its first Escape to cancel. Raw gameplay input stays disabled while
  Settings loads or shows; mute remains available. Pending and failed pages
  retain a return route, and recovery explains that Reload ends the match.
  Audio previews stop on leaving Settings. Preferences retain their existing
  device storage and system reduced motion remains completely ignored.
- **Saved-progress decisions:** giving up a cup, ending a Gauntlet run and
  resetting guest progress require a separate acceptance after the consequence
  is explained. Keep receives focus first and cancels alongside Escape and Back.
  The trigger cannot double as acceptance; each request can execute only once.
  A changed cup/round or run context discards its pending confirmation. Guest
  reset is unavailable during account restoration, while signed in or in Demo;
  returning to guest requires a fresh request. Abandonment retains earned XP and
  unlocks, while guest reset erases the guest profile and keeps device settings.
  Existing save formats, cloud operations and account-deletion behavior retain
  their rules. The shared card has a `vh` height fallback before `dvh` for older
  webviews. The system reduced-motion policy remains unchanged.
- **Truthful device-save feedback:** failed writes of profiles, settings and
  offline queues show a notice in menus and Pause/Exit. The latest pending record
  remains in memory; retry persists it without repeating rewards or purchases.
  Partial recovery and unrelated successful writes leave other failures visible.
  A normal successful write also clears that record's failure. Forgetting a cache
  cancels its pending write, and retry during Demo preserves the parked real save.
  Exit and offline/guest text stop claiming device persistence during failure.
  If a startup read failed and an older record is later found, bBall protects it
  from replacement and explains reopening to load it, with temporary changes
  to that data lost. Retry can still save other pending records. With no older
  record, the temporary data can save normally after storage access returns.
  Success moves focus from the removed retry button to its status message.
  Account sync retains its separate status, and no automatic reload, record
  deletion or storage-permission change is added.
- **Resize continuity:** changing CSS viewport dimensions pauses the active
  match, serve or countdown before the queued layout. Pause explains the changed
  court and requires an explicit Resume, using the player's countdown choice.
  Ball and trail positions stretch between fixed paddle contact planes, so
  pending contacts remain ahead and existing misses remain behind. Recorded
  replay frames use the same mapping before and during playback. Score, lesson
  state and cooldowns retain their values. Actual resizing clears steering and
  gestures; unchanged notifications and court quality changes retain input.
  Menus, completed lessons and finished matches do not enter resize Pause.
  The system reduced-motion policy remains unchanged.
- **Audio lifecycle recovery:** the first gesture resumes a new suspended
  context, and subsequent gestures also handle interrupted audio. Recovery
  retains the same graph, mute and both volume choices. Refused resume/suspend/
  close calls cannot throw through input or leave an unhandled promise; later
  gestures can retry. Failed graph construction attempts cleanup. Hidden pages
  suspend interrupted audio too, and unfinished games require explicit Resume
  after returning. Actual sound output remains subject to browser/device policy
  and needs physical verification. No system motion preference handling is added.
- **Skill-control and feedback consistency:** secondary/auxiliary pointer presses
  cannot spend a skill, while primary mouse/touch/pen and keyboard activation
  retain their actual slot and fire once. Unavailable buttons remain focusable
  but cannot request a cast. Readiness includes the real recast lockout in both
  the view and its cache. Cast and Echo rings use accepted match events, expire
  despite ongoing cooldown updates, and clear on hiding/reset without replaying
  old casts. Recharge and return bonuses do not create an Echo ring. The counters
  are never saved or submitted to the server. System motion settings have no effect.
- **Daily copy and day continuity:** Copy result reports the outcome, preserves a
  manual fallback and permits retry after refusal. Pending requests are guarded;
  late responses cannot describe a changed record or alter focus after navigation.
  The fallback scrolls with the content while Play stays pinned. The preview and
  quests refresh together at midnight and on return. A stale Play press shows
  the new goals before launch, and the next press passes the reviewed date to
  match rules. Removing focused copy controls hands focus to Play. Daily rewards,
  server acceptance, saved profiles and the system-motion policy retain their rules.
- **Results continuity:** The custom result card now shares the menus' heading
  orientation and device-save notice/retry, keeping footer actions reachable.
  Chime callback changes do not postpone or replay the star reveal. Changed awards
  start a fresh reveal; leaving cancels pending chimes. The graphic has a stable
  labelled star total, and elapsed time rounds correctly across minute boundaries.
  XP, record formats and the complete exclusion of system motion settings remain
  unchanged. The save regression now exercises this real page.
- **Profile edit continuity:** untouched name fields follow new profile data,
  while a same-player draft survives ordinary updates. Changed profile owners
  discard the draft; a late old-owner action cannot edit the new save. Commit
  keeps the latest avatar, avatar selection keeps an untouched latest name, and
  the field shows the existing cleaned/default name afterward. Equivalent saves
  do not queue another identity operation. Enter confirms the edit outside IME
  composition. Profile formats, identity validation, sync and motion policy retain
  their behavior.
- **Home Daily continuity:** the tile and Daily preview use the same local-calendar
  hook, refreshing at midnight and visible return while preserving focus. The
  tile follows the current title, stars and displayed streak; hidden pages stop
  calendar polling. A 30-second foreground check also handles clock changes.
  The display never awards rewards, consumes freezes or rewrites saved progress.
- **Onboarding continuity:** a completed profile arriving after launch replaces
  the obsolete first-run root with Home, keeping active pages and their focus.
  Start/Skip reject a restored or already completed profile before applying draft
  choices. Drafts are keyed by owner, normal first-run completion remains optional,
  and later sign-out does not interrupt navigation. Identity/cosmetic operations,
  profile/cache formats and the system-motion policy retain their rules.
- **Account recovery continuity:** verified restoration loads a missing cache;
  transient connection/server failure retains remembered sessions and queued work.
  Cached players can keep queueing while restoration waits, while uncached guest
  edits remain separate. Return and explicit retry recover without duplicate rewards;
  token rotation is shared across boot/request paths. Old responses and request
  retries cannot cross account changes. Account distinguishes guest fallback from
  cached offline play, explains ended sessions and preserves retry/control focus.
  Explicit retry can attempt the server despite an offline browser hint.
- **Demo continuity:** account sync updates and caches the parked real save while
  preserving the visible demo level, build and edits. Exit reveals the latest
  account; switching levels uses that updated source. Guest import previews and
  payloads use the real guest throughout Demo. Real queued rewards sync once,
  failed cache writes retry the latest account data and forgetting cancels them.
  Demo edits remain throwaway; server reward and record formats retain their rules.
- **Evidence workflow:** explicitly enabled local startup/menu/frame capture and
  started/completed/abandoned trial records retain their actual starting context.
  JSON summaries deduplicate repeated exports, preserve unavailable measurements
  and separate unlike comparison groups. Seeded narrow/wide stability runs and
  the human/device protocol make the remaining validation reproducible. Ordinary
  play remains uninstrumented; no balance or quality default is changed without
  the human/physical evidence needed to support it. System motion remains ignored.

These changes still need newcomer observation, screen-reader checks, and HUD
and Settings/result/confirmation/save-notice layout and touch checks in both orientations. The last
browser inventory again returned no available surfaces. Automated lesson
completion is evidence of functionality, not evidence that a human finds the
lesson easy or the game more enjoyable.

The code implementation stage is complete. The remaining decisions are validation
tasks with an implemented [collection and decision workflow](player-experience-validation.md):

| Decision                                     | Current status                                  | Evidence still needed                                                                                                                                             |
| -------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Early Journey transitions and bosses         | Trial capture/summary ready; tuning deferred    | Human attempts, quit reasons and observations across skill/input/build and narrow/wide courts. Six bot matches per case are insufficient.                         |
| Startup, first menus and lower-end rendering | Timing capture ready; quality defaults retained | Cold/warm launches and repeated physical frame/input/readability checks under Full/Calm at High/Balanced/Low. Browser diagnostic timing is not perceived latency. |

For the next playtest, include newcomers and returning players using a mouse,
keyboard and touch in portrait and landscape. Observe the first three rallies,
pause close to an incoming ball, drag before a manual serve, use two fingers in
Versus and compare Full with Calm. Include keyboard-only players and players
with limited dexterity: remap keys, compare direct and relative touch, adjust
sensitivity, and try both Practice paces. Ask about control, clarity and comfort.
After a loss, ask whether the suggestion accurately describes the attempt and
helps choose a next step, or feels repetitive. Check that guide Back returns to
the result and that retry remains easy to reach.
Rotate or resize during an incoming shot, before serving and during a resume
countdown. Check the resize explanation, retained score/lesson state, explicit
resume and fresh drag. Repeat in Versus and with countdown disabled. Watch a
closing replay after changing the width and during playback; its returns should
remain aligned with the paddles. Include desktop window drags, mobile browser
chrome and virtual keyboards, and record whether actual size-change pauses are
helpful or too frequent. Unchanged viewport notifications must preserve play
and input. Check the Pause explanation on short landscape screens.
Check sound from the first gesture and after switching tabs/apps, locking the
screen or another app interrupting audio. Return to the same paused match and
choose Resume; repeat during a serve and countdown. Verify the chosen mute and
each volume setting, including zero, before and after interruption. Test music
preview recovery in Settings as well, and stop it by leaving the page. On Safari
and native webviews, record whether sound returns, whether a second gesture is
needed, and any delayed sounds or unexpected background output. The browser may
refuse recovery; gameplay input should still work. Keep these listening checks
separate from the simulated lifecycle and device-save tests.
Use equipped skills during a rally and before serving with mouse, touch, pen and
keyboard. Primary presses should activate once; middle/right clicks, back/forward
mouse buttons and pen barrel presses should not spend a skill. Check focusable
cooling buttons and their name, shortcut and remaining-time announcement. Use
Echo just after another cast: it clears cooldown but keeps the 1.5-second recast
floor. Check that readiness updates as soon as that floor ends, ordinary recharge
does not flash Echo, and successive cast rings replay and disappear. Pause and
resume during feedback, then restart; neither should replay old feedback. Repeat
in portrait/landscape, Full/Calm and with both system motion preference values.
After clearing a Daily, copy its result and verify the actual pasted date, court,
stars and streak. Deny clipboard access or use a context where it is absent;
check the explanation, selectable read-only text, manual copying and later retry.
Move focus to Play or Back before a delayed refusal and ensure it stays there.
Try repeated presses during a pending request, then navigate away or change the
displayed result before it completes; the old response must not announce a new
success or move focus. Test status announcements and manual-field focus/selection
with keyboard and touch, especially on short landscape screens with a keyboard
or selection controls open. Leave Daily across local midnight, including year-end,
and background it across several days. On return, preview, quests and attempts
should agree on the current date. Press Play before a delayed refresh: it should
show the new goals and explanation before a fresh press starts that day. Check
focus after copy controls disappear and confirm that existing saved medals,
streak and server-window behavior still follow their rules.
Leave Home open across midnight and background it for several days, then compare
its Daily title, stars, New today tag and streak with the Daily page. Check focus
on the tile and on another control during refresh. With disposable data, test
foreground clock corrections, timezone changes and a daylight-saving boundary
where applicable. Hidden pages should stop calendar polling and visible return
should catch up promptly without consuming freezes or changing saved records.
Record actual browser/webview timer and visibility delivery separately from the
controlled DOM checks.
On Results, check that the outcome heading receives focus and the star graphic
announces its earned total immediately, while visual stars and chimes complete
once. Change audio/settings or allow account updates during the reveal; they
must not delay it or replay completed chimes. Leave before completion and verify
remaining chimes stop. Simulate blocked storage with a disposable save: the real
Results page must show the failure and allow unsuccessful/successful retry
without adding another match or reward. Check notice/rewards/footer reachability
in short landscape, keyboard focus after retry and both system motion values.
Navigate menus using only the keyboard. Check that new headings announce the
page, Tab moves into its controls, and ordinary updates preserve focus. Open
Pause, Exit and talent details; try Tab and Shift+Tab at both ends, Escape,
visible close controls and background clicks. Verify focus return after every
close, including when the opener has disappeared, and confirm that Exit starts
on Keep playing. Repeat with a screen reader and in an older packaged webview;
check dialog names, background exclusion, scroll position and touch activation.
During an incoming rally and before a serve, use Pause → Settings. Adjust court
quality, touch mode/sensitivity, effects, serve pacing, keyboard bindings and the
resume countdown. Return through each available route, verify the same paused
score and positions, then resume. Check that a remapped pause/serve key cannot
restart play behind Settings, and that the changed controls work after resuming.
Repeat during the lesson and in Versus, and with pending/failed Settings loads.
Check that the extra Pause action fits short landscape screens and that the
pinned return action stays reachable while scrolling the Settings page.
With a disposable guest save, open cup/run abandonment and guest reset. Confirm
that Keep starts focused, the title and consequence are announced, Tab stays
inside, and Keep/Escape/Back preserve the save and return focus. Accept a fresh
request and check the stated result. Use touch and keyboard in both orientations,
including short landscape screens; ensure both actions remain reachable while
scrolling. Change the saved run/cup or account/demo state during confirmation
and verify that the previous request closes and cannot reappear on return.
On Profile, leave the name untouched during a real account refresh and check that
it follows the updated name without moving focus or reverting it on blur/avatar
selection. Repeat with an unfinished draft; it should survive for that player,
then save with the latest avatar. Sign in/out, enter/leave Demo or reset while an
edit is pending: the old draft must not reach the new owner. Test trimmed/empty
names and IMEs using physical and virtual keyboards; composition confirmation
must keep editing, while ordinary Enter/blur saves the displayed cleaned name.
Use disposable accounts and saves for these transitions.
With a disposable first-run guest, launch an account link and complete sign-in
after the game mounts. Verify Account focus stays on the current control and
Back reaches Home, with no first-run identity form beneath it. Repeat a profile
arrival while onboarding is visible, cached relaunch, sign-out and later profile
updates. Check that the restored name/avatar/colour are preserved and normal
fresh Start/Skip still reach Home. Include actual web OAuth return and native
deep-link delivery; these account transitions were substituted in the DOM checks.
Using a disposable account, relaunch offline with and without its cloud cache.
Check displayed identity, remembered session, saved outbox and guest/account
separation. Reconnect without a browser online event, return visibly, and try
manual recovery with a stale offline hint. Record one offline match and verify
its rewards once after repeated retry. Test a temporary server fault and a truly
ended session separately. Delay refresh/profile/sync responses while signing out
or changing accounts; older responses must not restore the old account or consume
new queued work. Check retry status, failure focus, success handoff and a player
who moved focus elsewhere. Include actual cookie persistence and process relaunch
in browsers and packaged webviews; the automated fixtures model those boundaries.
With disposable saves, enter Demo while real account work is queued, then reconnect
or return visibly. Check that the demo level/build/name draft and focus stay in
place, and that Exit reveals the latest real progress with rewards counted once.
Switch demo levels after an account update and check the new preview's identity.
Open Account during a guest demo with and without real guest progress; import
offers must describe only the real guest. Register or complete an actual social
sign-in and verify that no throwaway XP/matches were claimed. Deny cache writes,
retry during Demo, then Exit/relaunch and check that only the latest real account
save persists. Forget the account before retry and ensure its cache stays removed.
Include web OAuth and native deep-link/visibility delivery, touch and keyboard;
the API/DOM checks do not exercise those physical paths.
In a disposable test profile, deny storage access or force a full-storage write
error, change settings and record a result. Check the save notice in Results,
Home, Profile, Pause and Exit; offline text must not falsely reassure. Navigate
away and back, retry while the failure remains, restore storage and retry again.
Verify the latest profile, device preferences and offline queue after relaunch,
with rewards counted once. Repeat while Demo is active and ensure only the real
parked save persists. Check status announcements, focus after recovery, and
notice/button reachability on short landscape screens. Keep this separate from
network-offline testing: a device write and a cloud sync can succeed independently.
Repeat with storage unreadable at startup while an older save remains on the
device. Retry after access returns must preserve the existing data and explain
restoring it by reopening. Verify the restored progress after reopening. Also
test a genuinely first launch with no stored record: retry should keep its
temporary progress after storage returns.
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
