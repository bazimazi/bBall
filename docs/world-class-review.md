# World-class comparison review, 6 November 2026

A whole-game review against genre leaders: Pong-likes and ball duels (Lethal League
Blaze, Windjammers 2), build systems (Hades, Slay the Spire, Path of Exile keystones,
Brawl Stars gadgets), mobile progression and first-time flow (Brawl Stars, Clash
Royale, Rocket League), and difficulty design (Celeste and Hades assists, Peggle
stars). Five audits ran on the real engine and the running app: core play and bot
behaviour, talents, content difficulty, progression economy, and UX in Playwright.

**Evidence and limits.** Balance numbers come from headless matches on the real
engine with bot pilots and scripted human models (late reads, pace- and
bounce-dependent aim error, contact-timing error, skill-press jitter, tiers from
beginner to expert). Two independent human models were used and they disagree on
absolute strength at the very top (see Champion below). Model evidence is not
playtest evidence; every number here wants confirming with people. System and
browser reduced-motion settings remain completely ignored; nothing in this pass
changes presentation timing.

## What was wrong, and what changed

### 1. Bots lost points to themselves, never to the player (core)

Instrumenting every bot miss showed that, after allowing for the bot's deadzone,
**no miss came from a bot failing to reach the ball**. Bots never needed more than
half of their available travel (Legend at most a third). 79% (Pro) to ~100%
(Legend) of the points a player won were the bot aiming an off-centre contact for
an angle and mis-hitting it. Miss probability was flat across shot difficulty
(Elite 1.8%, 2.1%, 2.5%, 1.1% across strain buckets), and top tiers' composure made
them nearly immune to pace. Consequences: placing the ball well earned a person
nothing (the human model won _more_ points by centring everything), bots looked
clumsy when they lost, and builds won through the bots' gambles.

World-class sports and duel AI ties errors to shot difficulty, so errors are caused
and legible. `src/game/ai.ts` now does that:

- read spread = aim × pace × heft × (0.6 + 8 × strain²) + |vy| × 0.08 s × (1 − 0.8 ×
  composure), where strain is the paddle speed the crossing demands against a fixed
  1000 u/s, judged at the first read and kept for later reads.
- Pro and up keep a little of their likely error from the paddle end (`caution`);
  Elite and up partly read contact at the paddle face (`contactRead`).

Result (same human model, 40 matches per cell): misses now climb with strain at
every tier (Pro 2% → 18%, Elite 0.7% → 12%, Legend 1% → 10%), easy-ball whiffs fell
3–4×, and typical-player win rates for Rookie to Elite stayed close to before.

### 2. Rallies at the top never ended (core)

Skilled-versus-Elite points averaged about 40 returns; a built expert against
Champion took 9–10 minutes for a first-to-5 and about a third of matches did not
finish in 15. The README promised rallies "end themselves", but the speed ceiling
never moved. Rally pressure (ranked, from return 25, symmetric, reset each serve)
now lifts the ball's top speed by the same share it narrows the paddles.
Elite matches: 357 s → 265 s; Legend 316 s → 209 s; Champion now ~4 minutes.

### 3. Difficulty walls (content)

Measured with a level-appropriate human model (casual / skilled win %):

| Step                                    | Before     | After         |
| --------------------------------------- | ---------- | ------------- |
| Original Journey W5 stages / Apex boss  | 3/19 / 0/0 | 31/73 / 21/75 |
| Journey W16–30 core (L50)               | 0–8 / 4–17 | 29–42 / 46–57 |
| Frontier sector 1 at L28                | 0/8        | 23/58         |
| Gauntlet Sprint P0 clear, L25           | 0/0        | 12/52         |
| Bronze cup clear at L1                  | 3/21       | 54/96         |
| Gold and later cups at unlock (skilled) | 0          | 26–52         |

Causes were stacked levers: a tier step (Pro → Elite → Legend), growing opponent
builds and rising pace all at once, plus Frontier sector 1 opening at full
strength beside world 6 with no ramp. The Story road now keeps a Pro opponent and
lets builds and pace climb; Journey boss phases cap at Pro; Veteran/Ascendant keep
the higher tiers; Frontier ramps over 30 sectors with Elite from sector 31;
Pressure 0 Gauntlet opens a band lower; cups end against Pro at most. Star goals
that were automatic (finish in 140 s: 96%) or near-impossible (30 returns: 7%) were
retuned toward a graded curve. Exact edits are in `src/core/campaign`,
`src/core/modes/{bosses,challenges,rules}.ts`, `src/core/run/run.ts`,
`src/core/tournament/bracket.ts` and `BALANCE.opponents` / `BALANCE.pace`.

### 4. Farming beat honest play (economy)

- Losses earned the opponent's full XP factor: a novice made 357 XP/min losing to
  Champion against 51–73 playing honestly. Losses now earn the share of the factor
  their score earned.
- Victory XP ignored the win target, so first-to-3 paid ~1.6× per minute; it now
  follows the winning score.
- Repeat challenge clears paid the full bonus × Legend's ×5 every time (up to
  1,895 XP); repeats keep a quarter.
- Starting a cup or Gauntlet run and leaving after one easy win paid about 2× Quick
  Match; opening rounds/encounters now pay as matches.
- Frontier stars paid the top rate from sector 1 (29k XP in one sector); they now
  ramp from the world-16 rate.
- The daily damper used the server's timezone; it now uses the match's own day and
  never rolls back.
- Quick-only players earned 2 Tactic Threads in total and could never buy some Lab
  research; Quick wins now pay one. Endless now pays for waves.
- Level rewards stopped at 30 until 50, then nothing until 100: Mastery balls and
  trails now arrive at 35, 40, 45, 55, 60, 70, 80 and 90.

### 5. Talent bugs and outliers

- **Dash was aim-assist**: a still paddle dashed onto the exact bounce-aware
  crossing (with Blink Strike it lifted a build from 28% to 70% of points against
  Legend). An idle dash now heads towards the ball as it is.
- **The server rejected honest Bulwark matches** (6 of 10 against Legend): its
  shield-save ceiling now counts Bulwark's parry refill.
- **Second Chance spent both refunds at 0–0**; it now needs the player to be behind.
- **Overdrive rank 2 was a cliff** (~4× rank 1 per point); rank 2 keeps its second
  charged return but no second cooldown cut.
- **Flow State** sat well above the per-point band for both pilots (heft 0.02 →
  0.012, angle 0.015 → 0.01). **Aegis** (cooldown 50 → 38) and **Echo** (45 → 35)
  measured as near-dead buys. **Slipstream and Zenith** were clipped by the
  everyday paddle cap; they may now reach 1.8× while running.

### 6. First-time experience and HUD (UX)

- "Start playing" led to Home and the first match was three screens away. It now
  opens the three-step lesson, which ends by offering Journey 1-1; Home leads with
  a "Play 1-2 · The Flick" style button for the next stage.
- The Resonance Lab appears on Home once there is loot; the "neutral paddle" line
  appears once there is a paddle choice to describe.
- Stage and boss banners covered the serve; they now sit in the opponent's half.
- The live objective line was cut off on phones; it wraps between goals, missed
  goals keep their words, and the margin goal reads "Win by 2" everywhere.
- Five skill buttons covered a fifth of the player's half in portrait; large
  loadouts step down a size there.
- Pause on short landscape screens hid Restart/Quit below the fold; it now uses two
  columns.
- Locked Journey stages show a lock; disabled primary buttons read as unavailable.
- Talent tiles carry their names; the result card puts new cosmetics (with an
  Equip button) and achievements up front and folds the XP breakdown away.

## Still open

These were found and measured but not resolved in this pass:

- **Champion strength is model-dependent.** With the final traits, one human model's
  fully built expert wins 92–100%; the other model found earlier traits unwinnable
  for everyone. Champion is set between the two; Mythic remains the harder apex.
  This needs real expert playtests.
- **Court width depends on the screen** (750–1290 units for a 600-unit height). Win
  rates barely move, but a first-to-5 against Pro lasts about twice as long on a
  portrait phone as on a 5:4 screen, and shared daily/endless results compare
  different courts.
- **Placement still does not pay for a person who aims at the paddle end**: the
  human model's own contact risk outweighs the bot's forced errors beyond moderate
  offsets. The miss mechanism is now right; the size of the reward needs playtests.
- **Talents:** length and placement talents scale super-linearly for bots, and
  opponent builds buy them first; Control+Defense and Control+Momentum dominate
  level-50 hybrids; Mastery has no native active; four ultimates fit in 48 of 49
  points; Dash, Blink Strike, Time Slip, Talent Synergy, Fast Start, Counterstrike,
  Chain Casting and Foresight rank 2 measure inside noise; several rank texts
  overstate capped values. Fixing these needs an opponent-build retune and, for
  `pointsPerTier`, a save migration.
- **Content:** casual players clear Sprint 0–12% (the act-1 boss), casual cup
  clears past Bronze are 1–7%, a few expansion bosses sit below band, the Frontier
  ramp is shallow, expansion matches are short (median 32–54 s), and Daily
  difficulty swings 0–100% by date with no difficulty cue.
- **Economy:** Workshop Marks have nothing to buy after about 100 matches and Lab
  loot piles up once research is complete; both need sinks. Marathon cups pay a
  Classic trophy for more than twice the wins.
- **UX:** progressive feature unlocks beyond the Lab, More modes grouping and plain
  copy, boon draft framing and synergy tags, Lab price chips, desktop two-column
  menus, a boss plate, popups that land on HUD panels, the HUD during the closing
  replay, world names that collide with other worlds' bosses, and the Persian
  score order on the result card.
- **Against genre leaders**, the largest gaps are structural rather than tuning:
  no online or asynchronous play against people, no leaderboards for the Daily,
  weekly seed or Endless, and no win-by-two or set structure for close games.
