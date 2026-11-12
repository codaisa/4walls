import { createGame, step, type GameEvent, type GameState, type InputMap } from '@4walls/core';
import { EMPTY_INPUT, TICK_DT, type GameConfig } from '@4walls/shared';
import { sfx } from '../audio/Sfx';
import { deviceLabel, type DeviceId, type InputManager, type UiEvent } from '../input/InputManager';
import { useHud } from '../store/useHud';
import { HudSync, presentEvent, type MatchView } from './presentation';

export type EventListener = (e: GameEvent, s: GameState) => void;

export interface LocalPlayerBinding {
  slot: number;
  devices: DeviceId[];
}

/**
 * Drives one local match: fixed-timestep simulation (game-core) + input sampling + event fan-out.
 * React components never mutate game state; they only read it each frame and react to events.
 */
export class GameController implements MatchView {
  state: GameState;
  /** Interpolation factor between the previous and current tick, for smooth rendering. */
  alpha = 0;
  paused = false;
  /** A free device took over a player whose controller was lost (so restarts keep it). */
  onRebind: ((slot: number, device: DeviceId) => void) | null = null;
  private acc = 0;
  private listeners = new Set<EventListener>();
  private resultTimer: number | null = null;
  private bindings: LocalPlayerBinding[];
  /** Slots whose every device is disconnected. */
  private missing = new Set<number>();
  private hud: HudSync;

  constructor(
    public config: GameConfig,
    public input: InputManager,
    bindings: LocalPlayerBinding[],
  ) {
    this.state = createGame(config);
    this.bindings = bindings.map((b) => ({ ...b, devices: [...b.devices] }));
    this.hud = new HudSync((slot) => (this.bindings.find((b) => b.slot === slot)?.devices ?? []).map(deviceLabel).join(' / '));
    input.clearBindings();
    for (const b of this.bindings) input.bind(b.slot, b.devices);
    input.resetLatches();
  }

  get tickF() {
    return this.state.tick + this.alpha;
  }

  /**
   * Called from an effect (never during render): resets the HUD for this match and starts
   * watching controller (dis)connections. Returns the matching cleanup.
   */
  mount() {
    useHud.getState().set({ paused: this.paused, showResult: false, result: null, banner: null, missing: [] });
    this.hud.push(this.state, true);
    const off = this.input.onDeviceChange(() => this.refreshMissing());
    this.refreshMissing();
    return off;
  }

  on(fn: EventListener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  setPaused(p: boolean) {
    if (this.state.phase === 'ended') p = false;
    // Can't resume while a player has no controller.
    if (!p && this.missing.size > 0) return;
    this.paused = p;
    useHud.getState().set({ paused: p });
  }

  private campEnd = false;
  private campBank = false;
  endExpedition() {
    this.campEnd = true;
  }
  bankCoins() {
    this.campBank = true;
  }
  private campActions = new Map<number, number>();
  campAction(slot: number, index: number) {
    this.campActions.set(slot, index);
  }

  update(dt: number) {
    this.input.poll();
    if (this.input.consumePause() && this.state.phase !== 'ended') this.setPaused(!this.paused);
    if (this.paused) return;
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= TICK_DT) {
      const inputs: InputMap = {};
      for (const p of this.state.players) inputs[p.id] = this.input.read(p.slot);
      // Task 3: "end the expedition" from the camp panel, on behalf of the first player near the fire.
      for (const p of this.state.players) {
        const a = this.campActions.get(p.slot);
        if (a) inputs[p.id] = { ...(inputs[p.id] ?? EMPTY_INPUT), campAction: a };
      }
      this.campActions.clear();
      if (this.campEnd || this.campBank) {
        const extra = { ...(this.campEnd ? { campEnd: true } : {}), ...(this.campBank ? { campBank: true } : {}) };
        this.campEnd = this.campBank = false;
        // Only one player banks (all of them would just be a no-op after the first).
        for (const p of this.state.players) inputs[p.id] = { ...(inputs[p.id] ?? EMPTY_INPUT), ...extra };
      }
      step(this.state, inputs);
      for (const e of this.state.events) {
        const timer = presentEvent(e, this.state.tick, () => {});
        if (timer !== null) this.resultTimer = timer;
        this.emit(e);
      }
      this.acc -= TICK_DT;
    }
    this.alpha = this.acc / TICK_DT;
    this.hud.push(this.state);
  }

  /**
   * Menu-level input routed here first: a free device can take over a player whose controller
   * was lost. Returns true when consumed.
   */
  handleUi(e: UiEvent): boolean {
    if (this.missing.size === 0 || e.action !== 'confirm' || this.bindings.some((b) => b.devices.includes(e.device))) return false;
    const slot = Math.min(...this.missing);
    const b = this.bindings.find((bb) => bb.slot === slot)!;
    b.devices = [e.device];
    this.input.bind(slot, b.devices);
    this.onRebind?.(slot, e.device);
    sfx.pickup();
    this.refreshMissing();
    return true;
  }

  private refreshMissing() {
    this.missing.clear();
    for (const b of this.bindings) {
      if (!this.state.players.some((pp) => pp.slot === b.slot)) continue;
      if (!b.devices.some((d) => this.input.isConnected(d))) this.missing.add(b.slot);
    }
    const missing = [...this.missing].map((slot) => {
      const p = this.state.players.find((pp) => pp.slot === slot)!;
      return { slot, name: p.name, colorIndex: p.colorIndex };
    });
    if (missing.length && this.state.phase !== 'ended' && !this.paused) {
      this.paused = true;
      useHud.getState().set({ paused: true });
    }
    useHud.getState().set({ missing });
    this.hud.push(this.state, true);
  }

  private emit(e: GameEvent) {
    for (const l of this.listeners) l(e, this.state);
  }

  dispose() {
    if (this.resultTimer) window.clearTimeout(this.resultTimer);
    this.listeners.clear();
  }
}
