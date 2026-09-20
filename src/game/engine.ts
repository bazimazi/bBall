import { DEFAULT_THEME, type ResolvedTheme } from '../core/cosmetics/theme';
import type { MatchRules } from '../core/modes/types';
import { GameAudio } from './audio';
import {
  FIELD_H,
  FIXED_DT,
  KEY_SPEED,
  MAX_FRAME_DT,
  MAX_STEPS_PER_FRAME,
  STORAGE_KEYS
} from './constants';
import { publishResult, returnToMenu, startMatch } from './match';
import { Renderer } from './render/renderer';
import { step } from './simulation';
import type { GameSnapshot } from './types';
import { clamp } from './utils/math';
import { readStored } from './utils/storage';
import { layoutView, screenToFieldY } from './view';
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

  private snapshot: GameSnapshot;
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
    this.keys.up = false;
    this.keys.down = false;
    this.pointerId = null;
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
    this.keys.up = false;
    this.keys.down = false;
    this.pointerId = null;
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

  // --------------------------------------------------------------- state

  private buildSnapshot(): GameSnapshot {
    const { match, rules } = this.world;
    const status = match.status;

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

    if (match.status === 'play' || match.status === 'serve') this.applyKeys(dt);

    this.accumulator += dt * fx.timeScale;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      step(world, FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps >= MAX_STEPS_PER_FRAME) this.accumulator = 0;

    if (fx.shake > 0) {
      fx.shakeX = (Math.random() - 0.5) * fx.shake;
      fx.shakeY = (Math.random() - 0.5) * fx.shake;
    } else {
      fx.shakeX = 0;
      fx.shakeY = 0;
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

  private applyKeys(dt: number): void {
    if (!this.keys.up && !this.keys.down) return;
    const { player } = this.world;
    const dir = (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0);
    player.target = clamp(player.target + dir * KEY_SPEED * dt, player.half, FIELD_H - player.half);
  }

  private trackPointer(event: PointerEvent): void {
    const { player, view } = this.world;
    player.target = clamp(
      screenToFieldY(view, event.clientX, event.clientY),
      player.half,
      FIELD_H - player.half
    );
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.audio.unlock();
    const { match } = this.world;
    if (match.status !== 'play' && match.status !== 'serve') return;

    this.pointerId = event.pointerId;
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* capture is a nicety, not a requirement */
    }
    this.trackPointer(event);
    if (match.status === 'serve' && match.serveTimer > 0.05) match.serveTimer = 0;
  };

  private onPointerMove = (event: PointerEvent): void => {
    const { status } = this.world.match;
    if (status !== 'play' && status !== 'serve') return;
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
  };

  private onContextMenu = (event: Event): void => event.preventDefault();

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || !event.key) return;
    const key = event.key.toLowerCase();
    const { match } = this.world;

    if (key === 'arrowup' || key === 'w') {
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
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (!event.key) return;
    const key = event.key.toLowerCase();
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
