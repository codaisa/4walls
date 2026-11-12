import { activeBombCount, bombAt, cellOf, createGame, getCell, mineAt, revealAround, stepPlayerMovement, type BombState, type GameEvent, type GameState } from '@4walls/core';
import { applySnapshot, encodeInput, SNAPSHOT_EVERY_TICKS, type InputTuple, type Snapshot, type StartInfo } from '@4walls/protocol';
import { Cell, RULES, secToTicks, TICK_DT, TICK_RATE, type Dir } from '@4walls/shared';
import { sfx } from '../audio/Sfx';
import { HudSync, presentEvent, type MatchView } from '../game/presentation';
import { deviceLabel, devicesOfLocal, type DeviceId, type InputManager } from '../input/InputManager';
import { useHud } from '../store/useHud';
import { online } from './session';

const SNAP_MS = (1000 / TICK_RATE) * SNAPSHOT_EVERY_TICKS;
/**
 * Jitter buffer: snapshots are played back at a steady 30/s, a couple of snapshots behind the
 * newest one. Mobile networks deliver packets in bursts; without this, remote players stutter
 * and teleport. Local players are predicted, so they don't feel this delay.
 */
const JITTER_SNAPS = 2;
const MAX_BUFFERED_SNAPS = 8;
/** A predicted bomb disappears if the server hasn't confirmed it within this time. */
const PREDICTED_BOMB_MS = 900;

interface PredictedBomb {
  seq: number;
  slot: number;
  at: number;
  bomb: BombState;
}

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
  private snapQueue: Snapshot[] = [];
  private buffering = true;
  /** ms of playback time accumulated since the last applied snapshot. */
  private playAcc = 0;
  private predictedBombs: PredictedBomb[] = [];
  /** Cells where we already played the "bomb placed" sound for a predicted bomb. */
  private soundedCells = new Map<string, number>();
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
    // (A mid-journey Adventure join gets its live regions from the first snapshot.)
    if (start.grid.length === this.state.grid.cells.length) for (let i = 0; i < start.grid.length; i++) this.state.grid.cells[i] = start.grid.charCodeAt(i) - 48;
    this.localIds = new Set(this.state.players.filter((p) => locals.some((l) => l.slot === p.slot)).map((p) => p.id));
    this.hud = new HudSync((slot) => {
      const l = locals.find((x) => x.slot === slot);
      return l ? `${deviceLabel(l.device)} · você` : 'Online';
    });
  }

  get tickF() {
    return this.state.tick + Math.min(this.playAcc / SNAP_MS, 1) * SNAPSHOT_EVERY_TICKS;
  }

  /** Local players of this device (the phone camera follows them). */
  isLocal(playerId: string) {
    return this.localIds.has(playerId);
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
    this.offSnap = online.onSnapshot((s) => this.enqueue(s));
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
    if (this.input.consumePause() && this.state.phase !== 'ended') this.toggleMenu();
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= TICK_DT) {
      this.acc -= TICK_DT;
      this.localTick();
    }
    this.localAlpha = this.acc / TICK_DT;
    this.pump(Math.min(dt, 0.25) * 1000);
    this.alpha = Math.min(1, this.playAcc / SNAP_MS);
  }

  private enqueue(snap: Snapshot) {
    const q = this.snapQueue;
    q.push(snap);
    // Way behind (tab was in the background): fast-forward, keeping every event.
    while (q.length > MAX_BUFFERED_SNAPS) this.onSnapshot(q.shift()!);
    // The match end must never wait in the buffer.
    if (snap.ph === 'ended' && this.state.phase !== 'ended') {
      while (q.length) this.onSnapshot(q.shift()!);
      this.playAcc = SNAP_MS;
    }
  }

  /** Plays buffered snapshots at the server's rate, speeding up a little when the buffer grows. */
  private pump(dtMs: number) {
    const q = this.snapQueue;
    if (this.buffering) {
      if (q.length < JITTER_SNAPS && this.state.phase === 'playing') return;
      this.buffering = false;
      this.playAcc = SNAP_MS;
    }
    this.playAcc += dtMs * (q.length > JITTER_SNAPS + 1 ? 1.25 : 1);
    while (this.playAcc >= SNAP_MS && q.length) {
      this.playAcc -= SNAP_MS;
      this.onSnapshot(q.shift()!);
    }
    if (this.playAcc >= SNAP_MS) {
      // Starved: hold the last frame and rebuild the cushion before playing on.
      this.playAcc = SNAP_MS;
      if (this.state.phase === 'playing') this.buffering = true;
    }
  }

  /** Sample + send local inputs, and predict our own players' movement. */
  private localTick() {
    if (this.state.phase !== 'playing') return;
    this.seq++;
    const tuples: InputTuple[] = [];
    const moves = new Map<number, Dir | null>();
    for (const l of this.locals) {
      const inp = this.input.read(l.slot);
      const act = this.campActions.get(l.slot);
      tuples.push(encodeInput(l.slot, this.campEnd || this.campBank || act ? { ...inp, ...(this.campEnd ? { campEnd: true } : {}), ...(this.campBank ? { campBank: true } : {}), ...(act ? { campAction: act } : {}) } : inp));
      moves.set(l.slot, inp.move);
      const p = this.state.players.find((pp) => pp.slot === l.slot);
      if (p) {
        this.predict(p, inp.move);
        if (inp.bomb) this.predictBomb(l.slot, p);
      }
    }
    this.campEnd = false;
    this.campBank = false;
    this.campActions.clear();
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

  /**
   * Shows our own bomb the moment the button is pressed instead of a network round trip later.
   * Mirrors the core placement rules; the server's real bomb replaces it.
   */
  private predictBomb(slot: number, p: GameState['players'][number]) {
    const s = this.state;
    if (!p.alive || s.tick < p.frozenUntil) return;
    const x = cellOf(p.x);
    const y = cellOf(p.y);
    if (getCell(s.grid, x, y) !== Cell.Floor || mineAt(s, x, y)) return;
    if (bombAt(s, x, y)) return; // also covers the glove throw
    if (activeBombCount(s, p.id) >= p.maxBombs) return;
    const remote = p.hasRemote;
    const bomb: BombState = {
      id: -this.seq,
      ownerId: p.id,
      x,
      y,
      range: p.range,
      placedTick: s.tick,
      detonateTick: s.tick + secToTicks(remote ? RULES.remoteMaxSec : RULES.fuseSec),
      kind: p.special && p.special.charges > 0 ? p.special.kind : 'normal',
      remote,
      extra: false,
      slideDir: null,
      nextSlideTick: 0,
      fromX: x,
      fromY: y,
      movedTick: s.tick,
      flightUntil: 0,
    };
    s.bombs.push(bomb);
    p.passBombs.push(bomb.id);
    this.predictedBombs.push({ seq: this.seq, slot, at: performance.now(), bomb });
    this.soundedCells.set(`${x},${y}`, performance.now());
    sfx.bombPlaced();
  }

  /** Re-adds predicted bombs the server hasn't processed yet (snapshots replace the bomb list). */
  private keepPredictedBombs(snap: Snapshot) {
    const now = performance.now();
    this.predictedBombs = this.predictedBombs.filter((pb) => pb.seq > (snap.ack[pb.slot] ?? 0) && now - pb.at < PREDICTED_BOMB_MS);
    for (const pb of this.predictedBombs) {
      if (bombAt(this.state, pb.bomb.x, pb.bomb.y)) continue;
      this.state.bombs.push(pb.bomb);
      const p = this.state.players.find((pp) => pp.id === pb.bomb.ownerId);
      if (p && !p.passBombs.includes(pb.bomb.id)) p.passBombs.push(pb.bomb.id);
    }
  }

  private onSnapshot(snap: Snapshot) {
    applySnapshot(this.state, snap);
    this.keepPredictedBombs(snap);
    // The journey map: what the players have seen is computed locally (it never travels).
    if (this.state.adventure) revealAround(this.state);

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

    const now = performance.now();
    for (const e of snap.ev) {
      // Our predicted bombs already played their sound.
      if (e.type === 'bombPlaced' && this.localIds.has(e.ownerId)) {
        const key = `${e.x},${e.y}`;
        const at = this.soundedCells.get(key);
        if (at !== undefined && now - at < 2000) {
          this.soundedCells.delete(key);
          for (const fn of this.listeners) fn(e, this.state);
          continue;
        }
      }
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

