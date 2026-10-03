# Project instructions

## Reduced-motion policy

bBall intentionally ignores operating-system and browser reduced-motion settings
completely, on web, desktop and mobile. Do not add `prefers-reduced-motion` CSS
queries, JavaScript `matchMedia` checks or listeners, native preference checks,
or animation/effect/timing overrides based on those settings.

Presentation follows the game's own behavior and explicit in-game controls.
Full/Calm visual effects and screen-shake settings are independent of system
preferences. Regression tests should verify that system settings have no effect.

Keep this policy consistent in the root README, server README, packaging guide
and player experience review when editing motion-related behavior or guidance.
