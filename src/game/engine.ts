import { DEFAULT_THEME, type ResolvedTheme } from '../core/cosmetics/theme';
import type { MatchRules } from '../core/modes/types';
import type { ResolvedLoadout } from '../core/talents/effects';
import { abilityViews, activeUltimate, fireAbility } from './abilities';
import { GameAudio } from './audio';
import { FIELD_H, FIXED_DT, MAX_FRAME_DT, MAX_STEPS_PER_FRAME, STORAGE_KEYS } from './constants';
import { publishResult, returnToMenu, startMatch } from './match';
import { Renderer } from './render/renderer';
import { rescaleArena } from './arena';
import { wobble } from './effects';
import { step } from './simulation';
import { playerKeySpeed, resetRuntime } from './talents';
import type { AbilityView, GameSnapshot, Paddle, Side } from './types';
import { clamp } from './utils/math';
import { readStored } from './utils/storage';
import { layoutView, screenToFieldX, screenToFieldY } from './view';
import {
  applyPaddleSizes,
  centreBall,
  centrePaddles,
  createWorld,
  placePaddles,
  rescaleField,
  type World
} from './world';

type Listener = () => void;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const REDUCED_MOTION_SCALE = 0.25;

/** Shared so an ability-free snapshot never allocates a fresh array. */
const NO_ABILITIES: readonly AbilityView[] = [];

/**
 * Keys that fire an equipped ability, in slot order.
 *
 * The digit row covers every slot the build could ever grow to; the letters
 * are the reach-friendly alternative for the first five, which is as many as
 * a build carries today.
 */
const ABILITY_KEYS: readonly string[][] = Array.from({ length: 9 }, (_, slot) => {
  const keys = [String(slot + 1)];
  const letter = ['q', 'e', 'r', 'f', 'v'][slot];
  if (letter) keys.push(letter);
  return keys;
});

/** True when the key belongs to whatever the player is typing into. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

let idle: GameSnapshot | null = null;

/**
 * The snapshot to show before an engine exists - one render at most, while the
 * canvas mounts. Cached so React sees a stable value.
 */
export function idleSnapshot(): GameSnapshot {
  idle ??= {
    status: 'menu',
    mode: 'quick',
    label: '',
    scoreYou: 0,
    scoreBot: 0,
    winScore: 0,
    bestThisMatch: 0,
    lives: 0,
    maxLives: 0,
    winner: null,
    muted: readStored(STORAGE_KEYS.muted, '0') === '1',
    canPause: false,
    objective: null,
    abilities: NO_ABILITIES,
    ultimateCastId: 0,
    ultimateHue: 0,
    ultimateActive: false,
    result: null,
    resultId: 0
  };
  return idle;
}

/**
 * Owns the canvas, the main loop and every DOM listener the game needs.
 *
 * React drives it through the command methods and reads it through
 * {@link subscribe} / {@link getSnapshot}, so the simulation never re-renders
 * a component and the UI never reaches into simulation state.
 */
export class GameEngine {
  private readonly renderer: Renderer;
  private readonly audio = new GameAudio();
  private readonly world: World;
  private readonly listeners = new Set<Listener>();
  private readonly motionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  private readonly keys = { up: false, down: false };
  /** The second player's keys in a versus match: the arrows. */
  private readonly keys2 = { up: false, down: false };
  /** Which paddle each finger is steering, in a versus match. */
  private readonly fingers = new Map<number, Side>();

  private snapshot: GameSnapshot;
  /** Cached ability view, rebuilt only when what the HUD shows changes. */
  private abilities: readonly AbilityView[] = NO_ABILITIES;
  private abilityKey = '';
  private frameHandle = 0;
  private layoutHandle = 0;
  private lastTime = 0;
  private accumulator = 0;
  private pointerId: number | null = null;
  private running = false;

  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, theme: ResolvedTheme = DEFAULT_THEME) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('bBall: this browser has no 2D canvas context.');

    this.canvas = canvas;
    this.renderer = new Renderer(ctx);
    this.world = createWorld(this.audio, this.motionQuery.matches ? REDUCED_MOTION_SCALE : 1);
    this.world.theme = theme;
    this.snapshot = this.buildSnapshot();
  }

  // ------------------------------------------------------------ lifecycle

  /** Wire up listeners and start the loop. Returns a disposer. */
  start(): () => void {
    if (this.running) return () => this.stop();
    this.running = true;

    this.layout();
    applyPaddleSizes(this.world);
    centreBall(this.world);
    centrePaddles(this.world);
    this.world.match.serveTimer = 0.4;

    this.addListeners();
    this.lastTime = performance.now();
    this.frameHandle = requestAnimationFrame(this.frame);
    return () => this.stop();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    if (this.layoutHandle) cancelAnimationFrame(this.layoutHandle);
    this.removeListeners();
    this.audio.dispose();
    this.listeners.clear();
  }

  // ----------------------------------------------------------- ui bridge

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): GameSnapshot => this.snapshot;

  // ------------------------------------------------------------ commands

  /** Start a match under `rules`. Every mode goes through here. */
  play = (rules: MatchRules): void => {
    this.audio.unlock();
    this.audio.ui();
    this.clearInput();
    this.audio.restartMusic();
    startMatch(this.world, rules);
    this.publish();
  };

  /** Replay the match that just finished, with the same rules. */
  replay = (): void => {
    this.play(this.world.rules);
  };

  pause = (): void => {
    const { match } = this.world;
    if (match.status !== 'play' && match.status !== 'serve') return;
    match.resumeTo = match.status;
    match.status = 'paused';
    this.clearInput();
    this.audio.ui();
    this.publish();
  };

  resume = (): void => {
    const { match } = this.world;
    if (match.status !== 'paused') return;
    this.audio.unlock();
    this.audio.ui();
    match.status = match.resumeTo;
    if (match.status === 'serve') match.serveTimer = Math.max(match.serveTimer, 0.5);
    this.publish();
  };

  /** Leave the match and go back to the attract-mode demo behind the menus. */
  quitToMenu = (): void => {
    this.audio.ui();
    returnToMenu(this.world);
    applyPaddleSizes(this.world);
    this.publish();
  };

  toggleMute = (): void => {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    if (!this.audio.muted) this.audio.ui();
    this.publish();
  };

  /** Swap the equipped cosmetics. Safe to call mid-match. */
  setTheme = (theme: ResolvedTheme): void => {
    if (this.world.theme === theme) return;
    this.world.theme = theme;
    this.renderer.invalidate();
  };

  /**
   * Swap in the player's build.
   *
   * A build change outside a match re-arms the runtime straight away, so the
   * HUD shows the new abilities before the next serve. Mid-match it is only
   * stored - a match is always played with the build it started under.
   */
  setLoadout = (loadout: ResolvedLoadout): void => {
    if (this.world.baseLoadout === loadout) return;
    this.world.baseLoadout = loadout;
    const { status } = this.world.match;
    if (status === 'menu') {
      this.world.loadout = loadout;
      resetRuntime(this.world);
    }
    this.publish();
  };

  /** A star landing on the result card: the reward's own sound. */
  chime = (index: number): void => {
    this.audio.unlock();
    this.audio.star(index);
  };

  /** Fire the ability in `slot`. Ignored when it is empty or cooling down. */
  useAbility = (slot: number): void => {
    this.audio.unlock();
    if (fireAbility(this.world, slot)) this.publish();
  };

  // --------------------------------------------------------------- state

  /**
   * The equipped abilities, as the HUD sees them.
   *
   * Cooldown is a continuous number, and the HUD is React: rebuilding the
   * array every frame would re-render the bar sixty times a second for a ring
   * that moves a pixel. The quantised key below is compared instead, so the
   * array reference - and therefore the render - changes a couple of dozen
   * times per cooldown.
   */
  private abilityView(): readonly AbilityView[] {
    let key = '';
    for (const slot of this.world.talents.slots) {
      if (!slot.id) continue;
      const left = slot.span > 0 ? Math.ceil((slot.cooldown / slot.span) * 24) : 0;
      // The whole second is in the key too: the HUD prints it, so a ring that
      // has not moved a step is still a re-render when the digit changes.
      key += `${slot.id}${left}:${Math.ceil(slot.cooldown)};`;
    }
    // Every live effect, at a tenth of a second - the resolution the HUD's
    // own countdowns are shown at, and no finer.
    const runtime = this.world.talents;
    const tenth = (value: number) => Math.ceil(value * 10);
    key += `|${tenth(runtime.strikeArmed)},${tenth(runtime.guardWindow)},${tenth(runtime.dashFx)}`;
    key += `,${runtime.overload},${tenth(runtime.slipstream)}`;
    key += `,${tenth(runtime.aegis)},${runtime.aegisSaves}`;
    key += `,${tenth(runtime.zenith)},${runtime.zenithRefunds},${tenth(runtime.echo)}`;

    if (key !== this.abilityKey) {
      this.abilityKey = key;
      const views = abilityViews(this.world);
      this.abilities = views.length > 0 ? views : NO_ABILITIES;
    }
    return this.abilities;
  }

  private buildSnapshot(): GameSnapshot {
    const { match, rules, fx } = this.world;
    const status = match.status;
    const live = activeUltimate(this.world);

    return {
      status,
      mode: match.mode,
      label: match.label,
      scoreYou: match.score.you,
      scoreBot: match.score.bot,
      winScore: match.winScore,
      bestThisMatch: match.bestThisMatch,
      lives: match.lives,
      maxLives: match.maxLives,
      winner: match.winner,
      muted: this.audio.muted,
      canPause: status === 'play' || status === 'serve',
      objective: rules.objective?.label ?? null,
      abilities: this.abilityView(),
      // The chrome sits above the canvas, so it is the one part of the page a
      // capstone cannot reach from the renderer. These four scalars are what
      // it flares on; `ultimateCastId` changes exactly once per cast.
      ultimateCastId: fx.castId,
      ultimateHue: live ? live.hue : fx.castHue,
      ultimateActive: live !== null,
      result: match.result,
      resultId: match.resultId
    };
  }

  /** Re-publish only when something the UI shows actually changed. */
  private publish(): void {
    const next = this.buildSnapshot();
    const previous = this.snapshot;
    const changed = (Object.keys(next) as (keyof GameSnapshot)[]).some(
      (key) => next[key] !== previous[key]
    );
    if (!changed) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  // -------------------------------------------------------------- layout

  private layout = (): void => {
    const k = layoutView(this.world.view, this.canvas);
    rescaleField(this.world, k);
    placePaddles(this.world);
    this.world.grid.resize(this.world.view.w);
    rescaleArena(this.world);
    this.renderer.invalidate();
  };

  private scheduleLayout = (): void => {
    if (this.layoutHandle) return;
    this.layoutHandle = requestAnimationFrame(() => {
      this.layoutHandle = 0;
      this.layout();
    });
  };

  // ----------------------------------------------------------- main loop

  private frame = (now: number): void => {
    this.frameHandle = requestAnimationFrame(this.frame);
    const { world } = this;
    const { fx, match } = world;

    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!isFinite(dt) || dt <= 0) dt = FIXED_DT;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT; // tab was hidden or stalled

    // Ease slow-motion back to normal in real time.
    fx.timeScale += (1 - fx.timeScale) * Math.min(1, dt * 3);
    if (fx.timeScale > 0.999) fx.timeScale = 1;

    const live = match.status === 'play' || match.status === 'serve';
    if (live) this.applyKeys(dt);
    // The soundtrack plays through a match only: never behind the menus, and
    // it drops out on pause and when the final point lands.
    this.audio.updateMusic(live);

    this.accumulator += dt * fx.timeScale;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      step(world, FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps >= MAX_STEPS_PER_FRAME) this.accumulator = 0;

    if (fx.shake > 0) {
      // Smooth noise rather than a fresh random offset per frame: a shudder
      // the eye can follow instead of a picture that merely jitters.
      const t = now * 0.038;
      fx.shakeX = wobble(t, 1.3) * fx.shake * 0.55;
      fx.shakeY = wobble(t, 7.9) * fx.shake * 0.55;
      fx.shakeRot = wobble(t * 0.7, 4.2) * fx.shake * 0.0011;
    } else {
      fx.shakeX = 0;
      fx.shakeY = 0;
      fx.shakeRot = 0;
    }

    // The result card waits a beat so the winning point can be seen.
    if (match.status === 'over' && !match.overShown) {
      match.overTimer -= dt;
      if (match.overTimer <= 0) publishResult(world);
    }

    this.publish();
    this.renderer.render(world);
  };

  // -------------------------------------------------------------- input

  private clearInput(): void {
    this.keys.up = false;
    this.keys.down = false;
    this.keys2.up = false;
    this.keys2.down = false;
    this.pointerId = null;
    this.fingers.clear();
  }

  private get versus(): boolean {
    return this.world.rules.versus === true;
  }

  private applyKeys(dt: number): void {
    const speed = playerKeySpeed(this.world);
    const steer = (paddle: Paddle, keys: { up: boolean; down: boolean }) => {
      if (!keys.up && !keys.down) return;
      const dir = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      paddle.target = clamp(paddle.target + dir * speed * dt, paddle.half, FIELD_H - paddle.half);
    };
    steer(this.world.player, this.keys);
    if (this.versus) steer(this.world.bot, this.keys2);
  }

  /** The paddle on whichever half of the court a point on screen falls. */
  private sideAt(event: PointerEvent): Side {
    const { view } = this.world;
    return screenToFieldX(view, event.clientX, event.clientY) < view.w / 2 ? 'you' : 'bot';
  }

  private trackPointer(event: PointerEvent, side: Side = 'you'): void {
    const { view } = this.world;
    const paddle = side === 'you' ? this.world.player : this.world.bot;
    paddle.target = clamp(
      screenToFieldY(view, event.clientX, event.clientY),
      paddle.half,
      FIELD_H - paddle.half
    );
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.audio.unlock();
    const { match } = this.world;
    if (match.status !== 'play' && match.status !== 'serve') return;

    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* capture is a nicety, not a requirement */
    }
    if (this.versus) {
      // Each finger steers the paddle on the half it first landed on, for as
      // long as it stays down - two thumbs, two paddles, no crossed wires.
      const side = this.sideAt(event);
      this.fingers.set(event.pointerId, side);
      this.trackPointer(event, side);
    } else {
      this.pointerId = event.pointerId;
      this.trackPointer(event);
    }
    if (match.status === 'serve' && match.serveTimer > 0.05) match.serveTimer = 0;
  };

  private onPointerMove = (event: PointerEvent): void => {
    const { status } = this.world.match;
    if (status !== 'play' && status !== 'serve') return;
    if (this.versus) {
      const side = this.fingers.get(event.pointerId);
      if (side) this.trackPointer(event, side);
      else if (event.pointerType === 'mouse') this.trackPointer(event, this.sideAt(event));
      return;
    }
    if (
      event.pointerType === 'mouse' ||
      this.pointerId === null ||
      event.pointerId === this.pointerId
    ) {
      this.trackPointer(event);
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.pointerId = null;
    this.fingers.delete(event.pointerId);
  };

  private onContextMenu = (event: Event): void => event.preventDefault();

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || !event.key) return;
    // The name field is a real text input: while it has focus the game gets
    // no keys at all, or typing "1" would fire an ability and "m" would mute.
    if (isTyping(event.target)) return;
    const key = event.key.toLowerCase();
    const { match } = this.world;

    // In a versus match the arrows belong to the second player.
    const second = this.versus && (key === 'arrowup' || key === 'arrowdown');
    if (second) {
      if (key === 'arrowup') this.keys2.up = true;
      else this.keys2.down = true;
      event.preventDefault();
      this.audio.unlock();
    } else if (key === 'arrowup' || key === 'w') {
      this.keys.up = true;
      event.preventDefault();
      this.audio.unlock();
    } else if (key === 'arrowdown' || key === 's') {
      this.keys.down = true;
      event.preventDefault();
      this.audio.unlock();
    } else if (key === ' ' || key === 'enter') {
      // Never steal the key from a focused button - it would double-fire, and
      // the menus are React's to drive.
      if (document.activeElement instanceof HTMLButtonElement) return;
      this.audio.unlock();
      if (match.status === 'paused') {
        event.preventDefault();
        this.resume();
      } else if (match.status === 'serve') {
        event.preventDefault();
        match.serveTimer = 0;
      }
    } else if (key === 'escape' || key === 'p') {
      event.preventDefault();
      if (match.status === 'play' || match.status === 'serve') this.pause();
      else if (match.status === 'paused') this.resume();
    } else if (key === 'm') {
      this.toggleMute();
    } else {
      // Digits (and q/e/r) fire the equipped abilities. Deliberately separate
      // from the movement keys so a rally never turns into a chord.
      const slot = ABILITY_KEYS.findIndex((keys) => keys.includes(key));
      if (slot >= 0) {
        event.preventDefault();
        this.useAbility(slot);
      }
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (!event.key) return;
    const key = event.key.toLowerCase();
    if (key === 'arrowup') this.keys2.up = false;
    if (key === 'arrowdown') this.keys2.down = false;
    if (key === 'arrowup' || key === 'w') this.keys.up = false;
    else if (key === 'arrowdown' || key === 's') this.keys.down = false;
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.pause();
      this.audio.suspend();
    } else {
      this.lastTime = performance.now();
      this.accumulator = 0;
      if (this.world.match.status !== 'paused') this.audio.resume();
    }
  };

  private onBlur = (): void => this.pause();

  private onMotionPreference = (event: MediaQueryListEvent): void => {
    this.world.motion = event.matches ? REDUCED_MOTION_SCALE : 1;
  };

  private addListeners(): void {
    const { canvas } = this;
    canvas.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    canvas.addEventListener('pointermove', this.onPointerMove, { passive: true });
    canvas.addEventListener('pointerup', this.onPointerUp, { passive: true });
    canvas.addEventListener('pointercancel', this.onPointerUp, { passive: true });
    canvas.addEventListener('contextmenu', this.onContextMenu);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.scheduleLayout);
    window.addEventListener('orientationchange', this.scheduleLayout);
    window.visualViewport?.addEventListener('resize', this.scheduleLayout);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.motionQuery.addEventListener('change', this.onMotionPreference);
  }

  private removeListeners(): void {
    const { canvas } = this;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('contextmenu', this.onContextMenu);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.scheduleLayout);
    window.removeEventListener('orientationchange', this.scheduleLayout);
    window.visualViewport?.removeEventListener('resize', this.scheduleLayout);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.motionQuery.removeEventListener('change', this.onMotionPreference);
  }
}
