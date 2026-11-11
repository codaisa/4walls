import { createGame, stepPlayerMovement, type GameEvent, type GameState } from '@4walls/core';
import { applySnapshot, encodeInput, SNAPSHOT_EVERY_TICKS, type InputTuple, type Snapshot, type StartInfo } from '@4walls/protocol';
import { TICK_DT, TICK_RATE, type Dir } from '@4walls/shared';
import { HudSync, presentEvent, type MatchView } from '../game/presentation';
import { deviceLabel, devicesOfLocal, type DeviceId, type InputManager } from '../input/InputManager';
import { useHud } from '../store/useHud';
import { online } from './session';

const SNAP_MS = (1000 / TICK_RATE) * SNAPSHOT_EVERY_TICKS;

interface Pending {
  seq: number;
  moves: Map<number, Dir | null>;
}

export interface LocalSlot {
  slot: number;
  device: DeviceId;
}

/**
 * Client side of an online match. The server is authoritative; this mirrors its snapshots,
 * sends this computer's inputs (one per local slot, every tick) and predicts the movement of
 * local players so controls feel instant, reconciling with the server's acknowledged inputs.
 */
export class OnlineController implements MatchView {
  state: GameState;
  alpha = 0;
  paused = false; // the server never pauses; the menu overlay is purely local
  private listeners = new Set<(e: GameEvent, s: GameState) => void>();
  private acc = 0;
  private localAlpha = 0;
  private seq = 0;
  private pending: Pending[] = [];
  private lastSnapAt = performance.now();
  private resultTimer: number | null = null;
  private offSnap: (() => void) | null = null;
  private hud: HudSync;
  private localIds: Set<string>;

  constructor(
    start: StartInfo,
    private input: InputManager,
    private locals: LocalSlot[],
  ) {
    this.state = createGame(start.config);
    for (let i = 0; i < start.grid.length; i++) this.state.grid.cells[i] = start.grid.charCodeAt(i) - 48;
    this.localIds = new Set(this.state.players.filter((p) => locals.some((l) => l.slot === p.slot)).map((p) => p.id));
    this.hud = new HudSync((slot) => {
      const l = locals.find((x) => x.slot === slot);
      return l ? `${deviceLabel(l.device)} · você` : 'Online';
    });
  }

  get tickF() {
    const elapsed = ((performance.now() - this.lastSnapAt) / 1000) * TICK_RATE;
    return this.state.tick + Math.min(elapsed, SNAPSHOT_EVERY_TICKS);
  }

  alphaFor(playerId: string) {
    return this.localIds.has(playerId) ? this.localAlpha : this.alpha;
  }

  /** Called from an effect: binds this computer's devices to its slots and listens to snapshots. */
  mount() {
    this.input.clearBindings();
    for (const l of this.locals) this.input.bind(l.slot, devicesOfLocal(l.device));
    this.input.resetLatches();
    useHud.getState().set({ paused: false, showResult: false, result: null, banner: null, missing: [] });
    this.hud.push(this.state, true);
    this.offSnap = online.onSnapshot((s) => this.onSnapshot(s));
    return () => this.offSnap?.();
  }

  on(fn: (e: GameEvent, s: GameState) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  toggleMenu(open = !useHud.getState().paused) {
    useHud.getState().set({ paused: open });
  }

  update(dt: number) {
    this.input.poll();
    if (this.input.consumePause() && this.state.phase !== 'ended') this.toggleMenu();
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= TICK_DT) {
      this.acc -= TICK_DT;
      this.localTick();
    }
    this.localAlpha = this.acc / TICK_DT;
    this.alpha = Math.min(1, (performance.now() - this.lastSnapAt) / SNAP_MS);
  }

  /** Sample + send local inputs, and predict our own players' movement. */
  private localTick() {
    if (this.state.phase !== 'playing') return;
    this.seq++;
    const tuples: InputTuple[] = [];
    const moves = new Map<number, Dir | null>();
    for (const l of this.locals) {
      const inp = this.input.read(l.slot);
      tuples.push(encodeInput(l.slot, inp));
      moves.set(l.slot, inp.move);
      const p = this.state.players.find((pp) => pp.slot === l.slot);
      if (p) this.predict(p, inp.move);
    }
    online.send('input', { seq: this.seq, i: tuples });
    this.pending.push({ seq: this.seq, moves });
    if (this.pending.length > 120) this.pending.shift();
  }

  /** Same locomotion function the server runs (ice floor, freezing, kicks included). */
  private predict(p: GameState['players'][number], move: Dir | null) {
    p.px = p.x;
    p.py = p.y;
    stepPlayerMovement(this.state, p, { move, bomb: false, ability: false });
  }

  private onSnapshot(snap: Snapshot) {
    applySnapshot(this.state, snap);
    this.lastSnapAt = performance.now();

    // Reconciliation: start from the server's position and replay inputs it hasn't processed yet.
    for (const l of this.locals) {
      const p = this.state.players.find((pp) => pp.slot === l.slot);
      if (!p || !p.alive || snap.ph !== 'playing') continue;
      const ack = snap.ack[l.slot] ?? 0;
      const displayed = { x: p.px, y: p.py };
      for (const pend of this.pending) {
        if (pend.seq <= ack) continue;
        stepPlayerMovement(this.state, p, { move: pend.moves.get(l.slot) ?? null, bomb: false, ability: false });
      }
      // Keep rendering continuous from where the player was drawn.
      p.px = displayed.x;
      p.py = displayed.y;
    }
    const minAck = Math.min(...this.locals.map((l) => snap.ack[l.slot] ?? 0));
    this.pending = this.pending.filter((pd) => pd.seq > minAck);

    for (const e of snap.ev) {
      const t = presentEvent(e, snap.t, () => {});
      if (t !== null) this.resultTimer = t;
      for (const fn of this.listeners) fn(e, this.state);
    }
    this.hud.push(this.state);
  }

  dispose() {
    this.offSnap?.();
    if (this.resultTimer) window.clearTimeout(this.resultTimer);
    this.listeners.clear();
    this.input.clearBindings();
  }
}

