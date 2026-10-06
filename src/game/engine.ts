import { DEFAULT_THEME, type ResolvedTheme } from '../core/cosmetics/theme';
import type { DiagnosticMatchEvent, FrameSample } from '../dev/frameCapture';
import type { MatchRules } from '../core/modes/types';
import { SHAKE_SCALE, type DeviceSettings } from '../core/settings/store';
import {
  DEFAULT_BINDINGS,
  keyAction,
  keyList,
  type KeyAction,
  type KeyBindings
} from '../core/settings/controls';
import type { ResolvedLoadout } from '../core/talents/effects';
import { abilityCooldown, abilityViews, activeUltimate, fireAbility } from './abilities';
import { GameAudio } from './audio';
import {
  FIELD_H,
  FIXED_DT,
  MAX_FRAME_DT,
  MAX_STEPS_PER_FRAME,
  RESUME_BEAT,
  STORAGE_KEYS
} from './constants';
import { PointerTracker } from './input';
import { goalViews, NO_GOALS } from './goals';
import {
  isMatchPoint,
  publishResult,
  pauseMatch,
  resumeMatch,
  requestServe,
  replayHolding,
  returnToMenu,
  skipReplay,
  startMatch
} from './match';
import type { SongId } from './music';
import { Renderer } from './render/renderer';
import { rescaleArena } from './arena';
import { wobble } from './effects';
import { step } from './simulation';
import { playerKeySpeed, resetRuntime } from './talents';
import { advanceTutorial, startTutorial } from './tutorial';
import type { AbilityView, GameSnapshot, GoalView, Paddle, Side } from './types';
import { clamp } from './utils/math';
import { readStored } from './utils/storage';
import { layoutView, screenToFieldX, screenToFieldY, sizeCanvas } from './view';
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

const CALM_EFFECTS_SCALE = 0.25;

/** Shared so an ability-free snapshot never allocates a fresh array. */
const NO_ABILITIES: readonly AbilityView[] = [];

/**
 * The song a match is played to. A boss brings its own, Endless has the
 * hypnotic one and the daily the bright one; everything else takes turns.
 */
function songFor(rules: MatchRules): SongId | null {
  if (rules.boss) return 'showdown';
  if (rules.mode === 'endless') return 'pulse';
  if (rules.mode === 'daily') return 'horizon';
  return null;
}

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
    pauseReason: null,
    resumeIn: 0,
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
    objectiveTouch: null,
    goals: NO_GOALS,
    tutorialStep: null,
    tutorialCleared: false,
    tutorialFeedback: null,
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
  /** Physical key -> value at press time, so Shift/layout changes cannot stick a key. */
  private readonly heldKeys = new Map<string, string>();
  private readonly pointers = new PointerTracker();

  private snapshot: GameSnapshot;
  /** Cached ability view, rebuilt only when what the HUD shows changes. */
  private abilities: readonly AbilityView[] = NO_ABILITIES;
  private abilityKey = '';
  private goals: readonly GoalView[] = NO_GOALS;
  private goalKey = '';
  private frameHandle = 0;
  private layoutHandle = 0;
  private lastTime = 0;
  private accumulator = 0;
  private running = false;
  /** Menus can cover a paused court without handing their keys to the match. */
  private gameplayInputEnabled = true;
  private pauseReason: GameSnapshot['pauseReason'] = null;
  /** Short buzzes on hits and points, where the device can make them. */
  private haptics = true;
  private resumeCountdown = true;
  private preferences: DeviceSettings | null = null;
  private frameObserver: ((sample: FrameSample) => void) | null = null;
  private matchObserver: ((event: DiagnosticMatchEvent) => void) | null = null;

  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, theme: ResolvedTheme = DEFAULT_THEME) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('bBall: this browser has no 2D canvas context.');

    this.canvas = canvas;
    this.renderer = new Renderer(ctx);
    this.world = createWorld(this.audio, 1);
    this.world.theme = theme;
    this.updateMotion();
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
    this.frameObserver = null;
    this.matchObserver = null;
    this.listeners.clear();
  }

  // ----------------------------------------------------------- ui bridge

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): GameSnapshot => this.snapshot;

  /** Read only when the local profiling tool requests comparison context. */
  getDiagnostics() {
    const { view, rules, loadout } = this.world;
    return {
      fieldWidth: view.w,
      rotated: view.rotated,
      stageId: rules.stageId ?? null,
      bot: rules.bot.id,
      level: loadout.level,
      effects: { ...loadout.effects },
      abilities: [...loadout.equipped]
    };
  }

  /** Explicit diagnostic capture only; ordinary frames read no extra clocks. */
  observeFrames(observer: (sample: FrameSample) => void): () => void {
    this.frameObserver = observer;
    return () => {
      if (this.frameObserver === observer) this.frameObserver = null;
    };
  }

  observeMatches(observer: (event: DiagnosticMatchEvent) => void): () => void {
    this.matchObserver = observer;
    return () => {
      if (this.matchObserver === observer) this.matchObserver = null;
    };
  }

  private noteDiagnosticMatch(kind: DiagnosticMatchEvent['kind']): void {
    const observer = this.matchObserver;
    if (!observer || this.world.tutorial) return;
    const { match, rules } = this.world;
    if (kind === 'abandoned' && !['serve', 'play', 'paused', 'resuming'].includes(match.status))
      return;
    try {
      observer({
        kind,
        mode: rules.mode,
        stageId: rules.stageId ?? null,
        bot: rules.bot.id,
        ranked: rules.ranked,
        scoreYou: match.score.you,
        scoreBot: match.score.bot,
        seconds: match.elapsed,
        hits: match.hits,
        bestRally: Math.max(match.rally, match.bestThisMatch)
      });
    } catch (error) {
      if (this.matchObserver === observer) this.matchObserver = null;
      console.warn('bBall attempt capture stopped after an observer failure.', error);
    }
  }

  // ------------------------------------------------------------ commands

  /** Start a match under `rules`. Every mode goes through here. */
  play = (rules: MatchRules): void => {
    this.noteDiagnosticMatch('abandoned');
    this.audio.unlock();
    this.clearInput();
    this.audio.startMusic(songFor(rules));
    startMatch(this.world, rules);
    this.publish();
    this.noteDiagnosticMatch('started');
  };

  /** Replay the match that just finished, with the same rules. */
  replay = (): void => {
    if (this.world.tutorial) {
      this.learn();
      return;
    }
    this.play(this.world.rules);
  };

  learn = (): void => {
    this.noteDiagnosticMatch('abandoned');
    this.audio.unlock();
    this.clearInput();
    this.audio.startMusic(null);
    startTutorial(this.world);
    this.publish();
  };

  nextLesson = (): void => {
    this.clearInput();
    advanceTutorial(this.world);
    this.publish();
  };

  pause = (reason: GameSnapshot['pauseReason'] = null): void => {
    if (!pauseMatch(this.world)) return;
    this.pauseReason = reason;
    this.clearInput();
    this.accumulator = 0;
    this.audio.ui();
    this.publish();
  };

  resume = (): void => {
    if (!resumeMatch(this.world, this.resumeCountdown)) return;
    this.audio.unlock();
    this.audio.ui();
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.publish();
  };

  serve = (): void => requestServe(this.world);

  /** The UI owns this switch. Mute remains available outside blocking dialogs. */
  setGameplayInputEnabled = (enabled: boolean): void => {
    if (this.gameplayInputEnabled === enabled) return;
    this.gameplayInputEnabled = enabled;
    if (!enabled) this.clearInput();
  };

  /** Leave the match and go back to the attract-mode demo behind the menus. */
  quitToMenu = (): void => {
    this.noteDiagnosticMatch('abandoned');
    this.audio.ui();
    this.clearInput();
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

  /**
   * This device's input, pacing and presentation settings. Safe to call at
   * any time; React calls it whenever one of them changes.
   */
  setPreferences = (settings: DeviceSettings): void => {
    const qualityChanged = this.preferences?.canvasQuality !== settings.canvasQuality;
    if (
      JSON.stringify(this.bindings) !== JSON.stringify(settings.keyBindings) ||
      this.preferences?.touchMode !== settings.touchMode ||
      this.preferences?.touchSensitivity !== settings.touchSensitivity
    )
      this.clearInput();
    this.preferences = settings;
    if (qualityChanged && this.running) {
      sizeCanvas(this.world.view, this.canvas, settings.canvasQuality);
      this.renderer.invalidate();
    }
    this.audio.setVolumes(settings.musicVolume, settings.sfxVolume);
    this.updateMotion();
    this.haptics = settings.haptics;
    this.world.replays = settings.replays;
    this.world.autoServe = settings.autoServe;
    this.resumeCountdown = settings.resumeCountdown;
    this.publish();
  };

  private updateMotion(): void {
    // Project policy: only explicit game settings control effects, never OS preferences.
    const calm = this.preferences?.effects === 'calm';
    this.world.motion = calm ? CALM_EFFECTS_SCALE : 1;
    this.world.camera = calm ? 0 : SHAKE_SCALE[this.preferences?.shake ?? 'full'];
  }

  /** The player's name, for the versus card a match opens on. */
  setPlayerName = (name: string): void => {
    this.world.playerName = name.trim() || 'You';
  };

  /** A star landing on the result card: the reward's own sound. */
  chime = (index: number): void => {
    this.audio.unlock();
    this.audio.star(index);
  };

  previewMusic = (): void => this.audio.previewMusic();
  stopAudioPreview = (): void => this.audio.stopPreview();

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
    for (const [index, slot] of this.world.talents.slots.entries()) {
      if (!slot.id) continue;
      const { ready, progress, cooldownLeft } = abilityCooldown(slot);
      // The whole second is in the key too: the HUD prints it, so a ring that
      // has not moved a step is still a re-render when the digit changes.
      key += `${index}:${slot.id}:${progress}:${cooldownLeft}:${ready}:${slot.castId}:${slot.refreshId};`;
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
      pauseReason: status === 'paused' ? this.pauseReason : null,
      resumeIn: status === 'resuming' ? Math.ceil(match.resumeTimer / RESUME_BEAT) : 0,
      mode: match.mode,
      label: match.label,
      scoreYou: match.score.you,
      scoreBot: match.score.bot,
      winScore: match.winScore,
      bestThisMatch: status === 'menu' ? 0 : Math.max(match.bestThisMatch, match.rally),
      lives: match.lives,
      maxLives: match.maxLives,
      winner: match.winner,
      muted: this.audio.muted,
      canPause:
        this.world.tutorial?.step !== 'complete' &&
        (status === 'play' || status === 'serve' || status === 'resuming'),
      objective: rules.versus
        ? `P1: ${keyList(this.bindings, 'up')} / ${keyList(this.bindings, 'down')} · P2: ${keyList(this.bindings, 'p2Up')} / ${keyList(this.bindings, 'p2Down')}`
        : (rules.objective?.label ?? null),
      objectiveTouch: rules.objective?.touchLabel ?? null,
      goals: this.goalView(),
      tutorialStep: this.world.tutorial?.step ?? null,
      tutorialCleared: this.world.tutorial?.cleared ?? false,
      tutorialFeedback: this.world.tutorial?.feedback ?? null,
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

  private goalView(): readonly GoalView[] {
    const { rules, match } = this.world;
    if (!rules.goals) return NO_GOALS;
    const clock = rules.goals?.some((goal) => goal.id === 'fast') ? Math.round(match.elapsed) : 0;
    const key = JSON.stringify([
      rules.goals,
      match.status === 'over',
      match.winner,
      match.score.you,
      match.score.bot,
      match.winScore,
      Math.max(match.bestThisMatch, match.rally),
      match.hits,
      match.flicks,
      clock
    ]);
    if (key !== this.goalKey) {
      this.goalKey = key;
      this.goals = goalViews(this.world);
    }
    return this.goals;
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
    this.pauseForResize();
    const { w, scale, rotated, cx, cy } = this.world.view;
    const k = layoutView(this.world.view, this.canvas, this.preferences?.canvasQuality ?? 'high');
    const view = this.world.view;
    // Only a changed input transform invalidates drags; viewport notifications
    // can arrive without changing the court (for example on browser chrome).
    if (
      w !== view.w ||
      scale !== view.scale ||
      rotated !== view.rotated ||
      cx !== view.cx ||
      cy !== view.cy
    )
      this.pointers.clear();
    rescaleField(this.world, k);
    placePaddles(this.world);
    this.world.grid.resize(this.world.view.w);
    rescaleArena(this.world);
    this.renderer.invalidate();
  };

  private scheduleLayout = (): void => {
    // Hold play before the next animation frame can advance the old court.
    this.pauseForResize();
    if (this.layoutHandle) return;
    this.layoutHandle = requestAnimationFrame(() => {
      this.layoutHandle = 0;
      this.layout();
    });
  };

  private pauseForResize(): void {
    const { view } = this.world;
    if (this.world.tutorial?.step === 'complete') return;
    if (view.vw > 0 && (view.vw !== window.innerWidth || view.vh !== window.innerHeight))
      this.pause('resize');
  }

  // ----------------------------------------------------------- main loop

  private frame = (now: number): void => {
    const observer = this.frameObserver;
    const startedAt = observer ? performance.now() : 0;
    this.frameHandle = requestAnimationFrame(this.frame);
    const { world } = this;
    const { fx, match } = world;

    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!isFinite(dt) || dt <= 0) dt = FIXED_DT;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT; // tab was hidden or stalled

    // Ease slow-motion back to normal in real time.
    const held = match.status === 'paused' || match.status === 'resuming';
    if (!held) fx.timeScale += (1 - fx.timeScale) * Math.min(1, dt * 3);
    if (fx.timeScale > 0.999) fx.timeScale = 1;

    const live = match.status === 'play' || match.status === 'serve';
    if (live) this.applyKeys(dt);
    // The soundtrack plays through a match only: never behind the menus, and
    // it drops out on pause and when the final point lands. It hears how hot
    // the rally is, and whether the next point could end it.
    const tension = isMatchPoint(world) || (match.maxLives > 0 && match.lives === 1);
    this.audio.updateMusic(live, fx.heat, live && tension);

    // Countdown beats use real time, even if the point was paused in slow motion.
    this.accumulator += dt * (held ? 1 : fx.timeScale);
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      step(world, FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps >= MAX_STEPS_PER_FRAME) this.accumulator = 0;

    if (!held && fx.shake > 0 && world.camera > 0) {
      // Smooth noise rather than a fresh random offset per frame: a shudder
      // the eye can follow instead of a picture that merely jitters.
      const t = now * 0.038;
      const shake = fx.shake * world.camera;
      fx.shakeX = wobble(t, 1.3) * shake * 0.55;
      fx.shakeY = wobble(t, 7.9) * shake * 0.55;
      fx.shakeRot = wobble(t * 0.7, 4.2) * shake * 0.0011;
    } else if (!held || world.camera === 0) {
      fx.shakeX = 0;
      fx.shakeY = 0;
      fx.shakeRot = 0;
    }

    // The result card waits a beat so the winning point can be seen - and
    // for the whole of its replay, when it has one.
    if (match.status === 'over' && !match.overShown && !replayHolding(world)) {
      match.overTimer -= dt;
      if (match.overTimer <= 0) publishResult(world);
    }

    // The simulation asks for a buzz by writing how long it wants one; the
    // engine is the only part of the game that may touch the device.
    if (fx.buzz > 0) {
      if (this.haptics && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(Math.round(fx.buzz));
        } catch {
          /* a blocked vibration is not worth a crash */
        }
      }
      fx.buzz = 0;
    }

    this.publish();
    const drawAt = observer ? performance.now() : 0;
    this.renderer.render(world);
    if (observer) {
      try {
        observer({
          timestampMs: now,
          updateMs: drawAt - startedAt,
          drawMs: performance.now() - drawAt,
          steps,
          phase: replayHolding(world) ? 'replay' : match.status
        });
      } catch (error) {
        if (this.frameObserver === observer) this.frameObserver = null;
        console.warn('bBall frame capture stopped after an observer failure.', error);
      }
    }
  };

  // -------------------------------------------------------------- input

  private clearInput(): void {
    this.heldKeys.clear();
    this.pointers.clear();
    const humans = this.versus ? [this.world.player, this.world.bot] : [this.world.player];
    for (const paddle of humans) {
      paddle.target = paddle.y;
      paddle.vy = 0;
    }
  }

  private get versus(): boolean {
    return this.world.rules.versus === true;
  }

  private get bindings(): KeyBindings {
    return this.preferences?.keyBindings ?? DEFAULT_BINDINGS;
  }

  private applyKeys(dt: number): void {
    const speed = playerKeySpeed(this.world);
    const pressed = (action: KeyAction) =>
      [...this.heldKeys.values()].some((key) => this.bindings[action].includes(key));
    const steer = (paddle: Paddle, up: boolean, down: boolean) => {
      if (!up && !down) return;
      const dir = (down ? 1 : 0) - (up ? 1 : 0);
      paddle.target = clamp(paddle.target + dir * speed * dt, paddle.half, FIELD_H - paddle.half);
    };
    steer(
      this.world.player,
      pressed('up') || (!this.versus && pressed('p2Up')),
      pressed('down') || (!this.versus && pressed('p2Down'))
    );
    if (this.versus) steer(this.world.bot, pressed('p2Up'), pressed('p2Down'));
  }

  /** The paddle on whichever half of the court a point on screen falls. */
  private sideAt(event: PointerEvent): Side {
    const { view } = this.world;
    return screenToFieldX(view, event.clientX, event.clientY) < view.w / 2 ? 'you' : 'bot';
  }

  private trackPointer(event: PointerEvent, side: Side = 'you'): void {
    const { view } = this.world;
    const paddle = side === 'you' ? this.world.player : this.world.bot;
    const fieldY = screenToFieldY(view, event.clientX, event.clientY);
    const relative = event.pointerType !== 'mouse' && this.preferences?.touchMode === 'relative';
    paddle.target = clamp(
      relative
        ? this.pointers.dragTarget(
            event.pointerId,
            fieldY,
            paddle.target,
            this.preferences?.touchSensitivity ?? 1
          )
        : fieldY,
      paddle.half,
      FIELD_H - paddle.half
    );
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.gameplayInputEnabled || event.button !== 0) return;
    this.audio.unlock();
    const { match } = this.world;
    // A tap during the closing replay skips it.
    if (skipReplay(this.world)) return;
    if (match.status !== 'play' && match.status !== 'serve') return;
    const side = this.versus ? this.sideAt(event) : 'you';
    if (
      !this.pointers.begin(
        event.pointerId,
        event.clientX,
        event.clientY,
        event.timeStamp,
        side,
        match.status === 'serve'
      )
    )
      return;

    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* capture is a nicety, not a requirement */
    }
    this.trackPointer(event, side);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.gameplayInputEnabled) return;
    const { status } = this.world.match;
    if (status !== 'play' && status !== 'serve') return;
    const side = this.pointers.move(event.pointerId, event.clientX, event.clientY);
    if (side) this.trackPointer(event, side);
    else if (event.pointerType === 'mouse')
      this.trackPointer(event, this.versus ? this.sideAt(event) : 'you');
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.gameplayInputEnabled) return;
    if (this.pointers.end(event.pointerId, event.clientX, event.clientY, event.timeStamp))
      this.serve();
  };

  private onPointerCancel = (event: PointerEvent): void => this.pointers.cancel(event.pointerId);

  private onContextMenu = (event: Event): void => event.preventDefault();

  /**
   * Every menu button, heard: a soft tick on any button click outside the
   * court. One listener on the document rather than a sound in every
   * component, and it is a click - so keyboard activation ticks too.
   */
  private onDocumentClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('button')) return;
    // In a live match the buttons are skills and pause, and they have sounds
    // of their own; a tick on top would only muddy them.
    const { status } = this.world.match;
    if (status === 'play' || status === 'serve') return;
    this.audio.unlock();
    this.audio.click();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.repeat || !event.key) return;
    // The name field is a real text input: while it has focus the game gets
    // no keys at all, or typing "1" would fire an ability and "m" would mute.
    if (isTyping(event.target)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const { match } = this.world;
    const action = key === 'escape' ? 'pause' : keyAction(this.bindings, key);
    if (!this.gameplayInputEnabled && action !== 'mute') return;
    // Space and Enter activate the focused UI even when mapped to another action.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.closest('[data-game-modal="blocked"]')) return;
    if (
      (key === ' ' || key === 'enter') &&
      (focused instanceof HTMLButtonElement ||
        (focused instanceof HTMLElement &&
          (focused.tagName === 'SUMMARY' || focused.tagName === 'A')))
    )
      return;

    // Menu navigation belongs to the focused UI, including its arrow keys.
    const moving = match.status === 'play' || match.status === 'serve';
    if (action === 'up' || action === 'down' || action === 'p2Up' || action === 'p2Down') {
      if (!moving) return;
      this.heldKeys.set(event.code || key, key);
      event.preventDefault();
      this.audio.unlock();
    } else if (action === 'serve') {
      this.audio.unlock();
      if (skipReplay(this.world)) {
        event.preventDefault();
      } else if (match.status === 'paused') {
        event.preventDefault();
        this.resume();
      } else if (match.status === 'serve') {
        event.preventDefault();
        this.serve();
      }
    } else if (action === 'pause') {
      if (match.status === 'menu') return;
      event.preventDefault();
      if (skipReplay(this.world)) return;
      if (match.status === 'play' || match.status === 'serve' || match.status === 'resuming')
        this.pause();
      else if (match.status === 'paused') this.resume();
    } else if (action === 'mute') {
      this.toggleMute();
    } else if (action?.startsWith('skill')) {
      const slot = Number(action.slice(5)) - 1;
      if (moving) {
        event.preventDefault();
        this.useAbility(slot);
      }
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (!event.key) return;
    this.heldKeys.delete(event.code || event.key.toLowerCase());
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

  private addListeners(): void {
    const { canvas } = this;
    canvas.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    canvas.addEventListener('pointermove', this.onPointerMove, { passive: true });
    canvas.addEventListener('pointerup', this.onPointerUp, { passive: true });
    canvas.addEventListener('pointercancel', this.onPointerCancel, { passive: true });
    canvas.addEventListener('lostpointercapture', this.onPointerCancel, { passive: true });
    canvas.addEventListener('contextmenu', this.onContextMenu);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('click', this.onDocumentClick, { capture: true });
    window.addEventListener('resize', this.scheduleLayout);
    window.addEventListener('orientationchange', this.scheduleLayout);
    window.visualViewport?.addEventListener('resize', this.scheduleLayout);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private removeListeners(): void {
    const { canvas } = this;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    canvas.removeEventListener('lostpointercapture', this.onPointerCancel);
    canvas.removeEventListener('contextmenu', this.onContextMenu);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('click', this.onDocumentClick, { capture: true });
    window.removeEventListener('resize', this.scheduleLayout);
    window.removeEventListener('orientationchange', this.scheduleLayout);
    window.visualViewport?.removeEventListener('resize', this.scheduleLayout);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }
}
