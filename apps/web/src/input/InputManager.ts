import type { Dir, PlayerInput } from '@4walls/shared';

/**
 * Each physical device keeps its own state. Player slots are bound to one or more devices,
 * so local multiplayer never shares a single input between players.
 */
export type DeviceId = 'kb1' | 'kb2' | 'touch' | `gp${number}`;

/** Buttons of the on-screen (touch) gamepad. */
export type TouchButton = 'bomb' | 'ability' | 'roll' | 'jump' | 'pause';

/** Phones and tablets: a coarse primary pointer (or `?touch=1` to force the on-screen pad). */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // `?touch=1` forces the on-screen pad for the rest of the tab session (desktop testing).
    if (new URLSearchParams(window.location.search).get('touch') === '1') sessionStorage.setItem('4walls.touch', '1');
    if (sessionStorage.getItem('4walls.touch') === '1') return true;
  } catch {
    /* storage blocked */
  }
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

export interface KeyProfile {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  bomb: string[];
  ability: string[];
  roll: string[];
  jump: string[];
  pause: string[];
}

/** Default (configurable) keyboard layouts, using KeyboardEvent.code. */
export const KEY_PROFILES: Record<'kb1' | 'kb2', KeyProfile> = {
  kb1: {
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    bomb: ['Space'],
    ability: ['ShiftLeft'],
    roll: ['KeyE'],
    jump: ['KeyQ'],
    pause: ['Escape'],
  },
  kb2: {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    bomb: ['Enter', 'NumpadEnter'],
    ability: ['ControlRight'],
    roll: ['ShiftRight'],
    jump: ['Numpad0', 'Slash', 'IntlRo'],
    pause: ['Backspace'],
  },
};

/** Menu-level actions, emitted once per press (never while held). */
export type UiAction = 'confirm' | 'back' | 'pause' | Dir;
export interface UiEvent {
  device: DeviceId;
  action: UiAction;
}

export const GP = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;
const STICK_DEADZONE = 0.45;
const UI_QUEUE_MAX = 64;

class DeviceState {
  /** Held directions, most recent last — the newest press wins, like classic arcade sticks. */
  dirs: Dir[] = [];
  bombLatch = false;
  abilityLatch = false;
  rollLatch = false;
  jumpLatch = false;
  pauseLatch = false;
  connected = true;

  press(d: Dir) {
    this.dirs = this.dirs.filter((x) => x !== d);
    this.dirs.push(d);
  }
  release(d: Dir) {
    this.dirs = this.dirs.filter((x) => x !== d);
  }
  get dir(): Dir | null {
    return this.dirs.length ? this.dirs[this.dirs.length - 1] : null;
  }
  clearLatches() {
    this.bombLatch = this.abilityLatch = this.rollLatch = this.jumpLatch = this.pauseLatch = false;
  }
}

class GamepadDevice extends DeviceState {
  prevButtons: boolean[] = [];
  prevDir: Dir | null = null;
  name = 'Controle';
}

type DeviceListener = (id: DeviceId, connected: boolean) => void;

export class InputManager {
  private devices = new Map<DeviceId, DeviceState>();
  private bindings = new Map<number, DeviceId[]>();
  private ui: UiEvent[] = [];
  private deviceListeners = new Set<DeviceListener>();
  private attachCount = 0;

  constructor(private readonly target: Window = window) {
    this.devices.set('kb1', new DeviceState());
    this.devices.set('kb2', new DeviceState());
    // The touchscreen is a device of its own; it shows up once it is actually used (or on phones).
    const touch = new DeviceState();
    touch.connected = isTouchDevice();
    this.devices.set('touch', touch);
  }

  /** On-screen stick: the dominant direction (or none inside the dead zone). */
  touchDir(dir: Dir | null) {
    const dev = this.ensureTouch();
    if (dir && dir !== dev.dir) this.pushUi('touch', dir);
    dev.dirs = dir ? [dir] : [];
  }

  /** On-screen button press (edge-triggered, like a gamepad button). */
  touchPress(button: TouchButton) {
    const dev = this.ensureTouch();
    switch (button) {
      case 'bomb':
        dev.bombLatch = true;
        this.pushUi('touch', 'confirm');
        break;
      case 'ability':
        dev.abilityLatch = true;
        this.pushUi('touch', 'back');
        break;
      case 'roll':
        dev.rollLatch = true;
        break;
      case 'jump':
        dev.jumpLatch = true;
        break;
      case 'pause':
        dev.pauseLatch = true;
        this.pushUi('touch', 'pause');
        break;
    }
  }

  private ensureTouch() {
    const dev = this.devices.get('touch')!;
    if (!dev.connected) this.setConnected('touch', dev, true);
    return dev;
  }

  /** Ref-counted so the lobby and a match can both hold the manager safely. */
  attach() {
    if (this.attachCount++ > 0) return;
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', this.onBlur);
    this.target.addEventListener('gamepadconnected', this.onPadConnected as EventListener);
    this.target.addEventListener('gamepaddisconnected', this.onPadDisconnected as EventListener);
  }

  detach() {
    if (this.attachCount === 0 || --this.attachCount > 0) return;
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.target.removeEventListener('gamepadconnected', this.onPadConnected as EventListener);
    this.target.removeEventListener('gamepaddisconnected', this.onPadDisconnected as EventListener);
  }

  onDeviceChange(fn: DeviceListener) {
    this.deviceListeners.add(fn);
    return () => {
      this.deviceListeners.delete(fn);
    };
  }

  bind(slot: number, devices: DeviceId[]) {
    this.bindings.set(slot, devices);
  }

  clearBindings() {
    this.bindings.clear();
  }

  boundSlots(): number[] {
    return [...this.bindings.keys()];
  }

  devicesOf(slot: number): DeviceId[] {
    return this.bindings.get(slot) ?? [];
  }

  /** Forget pending presses (e.g. the "ready" press in the lobby must not drop a bomb). */
  resetLatches() {
    for (const d of this.devices.values()) d.clearLatches();
    this.ui = [];
  }

  /** Polls gamepads. Call once per rendered frame. */
  poll() {
    const nav = this.target.navigator;
    const pads = nav && nav.getGamepads ? nav.getGamepads() : [];
    const seen = new Set<DeviceId>();
    for (const pad of pads) {
      if (!pad) continue;
      const id: DeviceId = `gp${pad.index}`;
      seen.add(id);
      let dev = this.devices.get(id) as GamepadDevice | undefined;
      if (!dev) {
        dev = new GamepadDevice();
        dev.connected = false;
        this.devices.set(id, dev);
      }
      if (!dev.connected) this.setConnected(id, dev, true);
      dev.name = pad.id;
      const btn = (i: number) => !!pad.buttons[i]?.pressed;
      const rising = (i: number) => btn(i) && !dev!.prevButtons[i];
      if (rising(GP.A)) {
        dev.bombLatch = true;
        this.pushUi(id, 'confirm');
      }
      if (rising(GP.B)) dev.abilityLatch = true;
      // X / RB roll, Y / LB jump.
      if (rising(GP.X) || rising(GP.RB)) dev.rollLatch = true;
      if (rising(GP.Y) || rising(GP.LB)) dev.jumpLatch = true;
      if (rising(GP.B)) this.pushUi(id, 'back');
      if (rising(GP.START)) {
        dev.pauseLatch = true;
        this.pushUi(id, 'pause');
      }
      dev.prevButtons = pad.buttons.map((b) => b.pressed);

      // D-pad has priority; otherwise use the dominant stick axis.
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      let d: Dir | null = null;
      if (btn(GP.UP)) d = 'up';
      else if (btn(GP.DOWN)) d = 'down';
      else if (btn(GP.LEFT)) d = 'left';
      else if (btn(GP.RIGHT)) d = 'right';
      else if (Math.max(Math.abs(ax), Math.abs(ay)) > STICK_DEADZONE) {
        d = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up';
      }
      if (d && d !== dev.prevDir) this.pushUi(id, d);
      dev.prevDir = d;
      dev.dirs = d ? [d] : [];
    }
    // Pads that vanished from the list without an event (some browsers) count as disconnected.
    for (const [id, dev] of this.devices) {
      if (id.startsWith('gp') && dev.connected && !seen.has(id) && pads.length > 0) this.setConnected(id, dev, false);
    }
  }

  /** Builds this tick's input for a player slot and consumes its one-shot actions. */
  read(slot: number): PlayerInput {
    const ids = this.bindings.get(slot) ?? [];
    let move: Dir | null = null;
    let bomb = false;
    let ability = false;
    let roll = false;
    let jump = false;
    for (const id of ids) {
      const d = this.devices.get(id);
      if (!d || !d.connected) continue;
      move ??= d.dir;
      bomb ||= d.bombLatch;
      ability ||= d.abilityLatch;
      roll ||= d.rollLatch;
      jump ||= d.jumpLatch;
      d.bombLatch = false;
      d.abilityLatch = false;
      d.rollLatch = false;
      d.jumpLatch = false;
    }
    return { move, bomb, ability, roll, jump };
  }

  /** True once if any device requested pause since the last call. */
  consumePause(): boolean {
    let p = false;
    for (const d of this.devices.values()) {
      p ||= d.pauseLatch;
      d.pauseLatch = false;
    }
    return p;
  }

  /** Returns and clears menu events (join, ready, navigate...). */
  drainUi(): UiEvent[] {
    const out = this.ui;
    this.ui = [];
    return out;
  }

  isConnected(id: DeviceId): boolean {
    return !!this.devices.get(id)?.connected;
  }

  connectedGamepads(): DeviceId[] {
    return [...this.devices.entries()].filter(([id, d]) => id.startsWith('gp') && d.connected).map(([id]) => id);
  }

  private pushUi(device: DeviceId, action: UiAction) {
    this.ui.push({ device, action });
    if (this.ui.length > UI_QUEUE_MAX) this.ui.splice(0, this.ui.length - UI_QUEUE_MAX);
  }

  private setConnected(id: DeviceId, dev: DeviceState, connected: boolean) {
    if (dev.connected === connected) return;
    dev.connected = connected;
    if (!connected) {
      dev.dirs = [];
      dev.clearLatches();
    }
    for (const l of this.deviceListeners) l(id, connected);
  }

  private keyAction(code: string): { id: 'kb1' | 'kb2'; dev: DeviceState; kind: keyof KeyProfile } | null {
    for (const id of ['kb1', 'kb2'] as const) {
      const prof = KEY_PROFILES[id];
      for (const kind of Object.keys(prof) as (keyof KeyProfile)[]) {
        if (prof[kind].includes(code)) return { id, dev: this.devices.get(id)!, kind };
      }
    }
    return null;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    const a = this.keyAction(e.code);
    if (!a) return;
    // Let the browser keep focus navigation on buttons, but never scroll the page.
    e.preventDefault();
    if (e.repeat) return;
    switch (a.kind) {
      case 'bomb':
        a.dev.bombLatch = true;
        this.pushUi(a.id, 'confirm');
        break;
      case 'ability':
        a.dev.abilityLatch = true;
        this.pushUi(a.id, 'back');
        break;
      case 'roll':
        a.dev.rollLatch = true;
        break;
      case 'jump':
        a.dev.jumpLatch = true;
        break;
      case 'pause':
        a.dev.pauseLatch = true;
        this.pushUi(a.id, 'pause');
        break;
      default:
        a.dev.press(a.kind);
        this.pushUi(a.id, a.kind);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const a = this.keyAction(e.code);
    if (!a) return;
    // Space activates focused buttons on keyup: block it, menus are driven by our own events.
    if (!isTyping(e)) e.preventDefault?.();
    if (a.kind === 'up' || a.kind === 'down' || a.kind === 'left' || a.kind === 'right') a.dev.release(a.kind);
  };

  private onBlur = () => {
    for (const d of this.devices.values()) d.dirs = [];
  };

  private onPadConnected = (e: GamepadEvent) => {
    const id: DeviceId = `gp${e.gamepad.index}`;
    let dev = this.devices.get(id);
    if (!dev) {
      dev = new GamepadDevice();
      dev.connected = false;
      this.devices.set(id, dev);
    }
    this.setConnected(id, dev, true);
  };

  private onPadDisconnected = (e: GamepadEvent) => {
    const id: DeviceId = `gp${e.gamepad.index}`;
    const dev = this.devices.get(id);
    if (dev) this.setConnected(id, dev, false);
  };
}

/** Keys typed into a text field belong to that field, not to the game. */
function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable === true);
}

/** Room slot localId → the devices that drive it ("me" = this computer's main devices). */
export function devicesOfLocal(localId: string): DeviceId[] {
  return localId === 'me' ? ['kb1', 'gp0', 'touch'] : [localId as DeviceId];
}

export function deviceLabel(id: DeviceId | 'me'): string {
  if (id === 'me') return isTouchDevice() ? 'Toque · celular' : 'Teclado · controle';
  if (id === 'touch') return 'Toque · celular';
  if (id === 'kb1') return 'Teclado · WASD';
  if (id === 'kb2') return 'Teclado · Setas';
  return `Controle ${Number(id.slice(2)) + 1}`;
}
