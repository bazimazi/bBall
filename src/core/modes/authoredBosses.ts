import type { ArenaSpec, BossSpec, MatchModifiers } from './types';
import type { BotLevelId } from '../bots/types';

const gate = (center: number): ArenaSpec => ({
  gates: [{ x: 0.58, center, gap: 0.34, period: 5.5, amplitude: 0.1 }]
});
const rails = (flip: boolean): ArenaSpec => ({
  rails: [{ ax: 0.38, ay: flip ? 0.76 : 0.24, bx: 0.68, by: flip ? 0.58 : 0.42 }]
});
const posts = (y: number): ArenaSpec => ({ bumpers: [{ x: 0.6, y, r: 28 }] });
/** Three authored encounters; all hazards use the normal collision/forecast geometry. */
export const AUTHORED_BOSSES: readonly {
  spec: BossSpec;
  bot: BotLevelId;
  winScore: number;
  modifiers: Partial<MatchModifiers>;
}[] = [
  {
    spec: {
      id: 'gatekeeper',
      name: 'Gatekeeper',
      title: 'Read the opening, then punish the shrinking guard',
      hue: 195,
      rhythm: { period: 7, windup: 1.4, guard: 2.2, recoveryScale: 0.68 },
      phases: [
        { at: 2, label: 'High passage', arena: gate(0.3), bot: 'elite' },
        { at: 4, label: 'Low passage', arena: gate(0.7), botPaddleScale: 1.05 }
      ]
    },
    bot: 'pro',
    winScore: 5,
    modifiers: { arena: gate(0.5), botPaddleScale: 1.18 }
  },
  {
    spec: {
      id: 'architect',
      name: 'Architect',
      title: 'Bank around the rail while the guard recovers',
      hue: 38,
      rhythm: { period: 8, windup: 1.5, guard: 2.5, recoveryScale: 0.7 },
      phases: [
        { at: 2, label: 'The bank reverses', arena: rails(true), bot: 'elite' },
        {
          at: 4,
          label: 'Choose either bank',
          arena: { rails: [...rails(false).rails!, ...rails(true).rails!] },
          botPaddleScale: 1
        }
      ]
    },
    bot: 'pro',
    winScore: 5,
    modifiers: { arena: rails(false), botPaddleScale: 1.15 }
  },
  {
    spec: {
      id: 'duelist',
      name: 'Duelist',
      title: 'Hold the rally, then place a wide recovery shot',
      hue: 318,
      rhythm: { period: 6.5, windup: 1.3, guard: 2, recoveryScale: 0.66 },
      phases: [
        { at: 2, label: 'Lower lane blocked', arena: posts(0.7), bot: 'elite' },
        { at: 4, label: 'Upper lane blocked', arena: posts(0.3), botPaddleScale: 1 }
      ]
    },
    bot: 'pro',
    winScore: 5,
    modifiers: { arena: posts(0.5), botPaddleScale: 1.12 }
  }
];
