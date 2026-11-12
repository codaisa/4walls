import { randomBytes } from 'node:crypto';
import { Room, type Client } from 'colyseus';
import { createGame, step, type GameEvent, type GameState, type InputMap } from '@4walls/core';
import { ARENAS, CHARACTER_IDS, EMPTY_INPUT, SLOT_COLORS, STARTER_CHARACTERS, levelInfo, type CharacterId, type ArenaId, type BossId, type Dir, type MatchPerformance } from '@4walls/shared';
import type { AccountStore } from './accounts';
import {
  AUTO_START_MS,
  MAX_ROOM_SLOTS,
  RECONNECT_SECONDS,
  RESULTS_MS,
  SERVER_TICK_HZ,
  SNAPSHOT_EVERY_TICKS,
  encodeGrid,
  encodeSnapshot,
  generateRoomCode,
  isArenaId,
  isCharacterId,
  isOnlineMode,
  sanitizeName,
  parseInputBatch,
  type CreateOptions,
  type LobbyInfo,
  type LobbySlot,
  type OnlineMode,
  type StartInfo,
} from '@4walls/protocol';

/** Every mode can start with a single player (Versus alone becomes practice against Magmitos). */
const MIN_PLAYERS: Record<OnlineMode, number> = { versus: 1, solo: 1, adventure: 1, bossrush: 1 };
/** Modes with their own world (the arena choice does not apply). */
const OWN_WORLD: OnlineMode[] = ['adventure', 'bossrush'];
/** Pending inputs per slot; beyond this the oldest are dropped (protects against flooding / lag build-up). */
const MAX_QUEUED_INPUTS = 8;
/**
 * Inputs buffered beyond this are latency, not protection against jitter: when a client's queue
 * stays longer, the server consumes two inputs in one tick (buttons are never lost) until it
 * catches up, so a burst after a network hiccup doesn't leave that player lagging for good.
 */
const TARGET_QUEUED_INPUTS = 3;
/** Per-connection message budget per second (inputs arrive at ~60/s). */
const MAX_MESSAGES_PER_SEC = 150;

interface QueuedInput {
  seq: number;
  move: Dir | null;
  bomb: boolean;
  ability: boolean;
  roll: boolean;
  jump: boolean;
  campEnd?: boolean;
}

/**
 * Authoritative 4Walls room. Clients only send intentions (inputs, lobby requests);
 * the server runs the same deterministic @4walls/core simulation and broadcasts snapshots.
 */
export class ArenaRoom extends Room {
  /** Account store shared by every room (set by createServer). */
  static accounts: AccountStore | null = null;
  maxClients = MAX_ROOM_SLOTS;

  private isPublic = false;
  private mode: OnlineMode = 'versus';
  private arena: ArenaId = 'caldeira';
  private phase: LobbyInfo['phase'] = 'lobby';
  private hostId = '';
  private slots: LobbySlot[] = [];
  private startsAt: number | null = null;
  private startTimer: { clear(): void } | null = null;

  private game: GameState | null = null;
  private queues = new Map<number, QueuedInput[]>();
  private held = new Map<number, Dir | null>();
  private acks: Record<number, number> = {};
  private pendingEvents: GameEvent[] = [];
  private msgBudget = new Map<string, { windowStart: number; count: number }>();
  /** Account behind each slot (only the logged-in profile player of a connection has one). */
  private slotAccount = new Map<number, string>();
  /** Per-player tallies of the running match (counted from game events). */
  private tally = new Map<string, { kills: number; enemies: number; powerups: number; mimics: number; elites: number }>();
  private bossesDown: BossId[] = [];
  private bossFights: { boss: BossId; level: number; tier: number }[] = [];

  onCreate(options: CreateOptions = {}) {
    this.roomId = generateRoomCode((n) => new Uint8Array(randomBytes(n)));
    this.isPublic = options.public === true;
    if (!this.isPublic) void this.setPrivate(true);
    this.setPatchRate(null); // no Schema state: everything travels as explicit messages
    this.setSimulationInterval(() => this.tick(), 1000 / SERVER_TICK_HZ);

    this.on('join_slot', (client, msg: { localId?: unknown; name?: unknown; characterId?: unknown; colorIndex?: unknown; auth?: unknown }) => this.joinSlot(client, msg));
    this.on('leave_slot', (client, msg: { slot?: unknown }) => {
      const s = this.ownedSlot(client, msg?.slot);
      if (!s || this.phase !== 'lobby') return;
      this.slots = this.slots.filter((x) => x !== s);
      this.lobbyChanged();
    });
    this.on('ready', (client, msg: { slot?: unknown; ready?: unknown }) => {
      const s = this.ownedSlot(client, msg?.slot);
      if (!s || this.phase !== 'lobby') return;
      s.ready = msg.ready === true;
      this.lobbyChanged();
    });
    this.on('color', (client, msg: { slot?: unknown; step?: unknown }) => {
      const s = this.ownedSlot(client, msg?.slot);
      if (!s || this.phase !== 'lobby' || s.ready) return;
      s.colorIndex = this.nextColor(s.colorIndex, msg.step === -1 ? -1 : 1, s.slot);
      this.lobbyChanged();
    });
    this.on('character', (client, msg: { slot?: unknown; step?: unknown }) => {
      const s = this.ownedSlot(client, msg?.slot);
      if (!s || this.phase !== 'lobby' || s.ready) return;
      // Cycle through the heroes this player may use (starters + the ones their account rescued).
      const pool = this.playableFor(s.slot);
      const i = Math.max(0, pool.indexOf(s.characterId));
      const n = pool.length;
      s.characterId = pool[(((i + (msg.step === -1 ? -1 : 1)) % n) + n) % n];
      this.lobbyChanged();
    });
    this.on('arena', (client, msg: { arena?: unknown }) => {
      if (client.sessionId !== this.hostId || this.phase !== 'lobby' || !isArenaId(msg?.arena)) return;
      this.arena = msg.arena;
      this.lobbyChanged();
    });
    this.on('mode', (client, msg: { mode?: unknown }) => {
      if (client.sessionId !== this.hostId || this.phase !== 'lobby') return;
      if (!isOnlineMode(msg?.mode)) return;
      this.mode = msg.mode;
      this.lobbyChanged();
    });
    this.on('start', (client) => {
      if (client.sessionId !== this.hostId || this.phase !== 'lobby' || !this.canStart()) return;
      this.startMatch();
    });
    this.on('input', (client, raw) => this.receiveInput(client, raw));
  }

  /** onMessage with a per-connection rate limit. */
  private on(type: string, handler: (client: Client, msg: any) => void) {
    this.onMessage(type, (client: Client, msg: unknown) => {
      if (!this.withinBudget(client.sessionId)) return;
      handler(client, msg);
    });
  }

  onJoin(client: Client) {
    if (!this.hostId) this.hostId = client.sessionId;
    this.sendLobby(client);
  }

  /** Unexpected disconnect: keep the players for a while and let the SDK reconnect. */
  async onDrop(client: Client) {
    this.setConnected(client.sessionId, false);
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
    } catch {
      // Timed out: onLeave() performs the cleanup.
    }
  }

  onReconnect(client: Client) {
    this.setConnected(client.sessionId, true);
    this.sendLobby(client);
    if (this.game) client.send('start', this.startInfo());
  }

  onLeave(client: Client) {
    const mine = this.slots.filter((s) => s.owner === client.sessionId);
    if (this.game && this.phase === 'playing') {
      // Players of a departed connection are knocked out (they can't be controlled any more).
      for (const s of mine) {
        const p = this.game.players.find((pp) => pp.slot === s.slot);
        if (p) p.left = true;
        if (p?.alive) {
          p.alive = false;
          p.diedTick = this.game.tick;
          this.pendingEvents.push({ type: 'playerDied', playerId: p.id, byId: null, x: p.x, y: p.y });
        }
        s.connected = false;
      }
    } else {
      this.slots = this.slots.filter((s) => s.owner !== client.sessionId);
    }
    this.msgBudget.delete(client.sessionId);
    if (this.hostId === client.sessionId) this.hostId = this.clients.find((c) => c.sessionId !== client.sessionId)?.sessionId ?? '';
    this.lobbyChanged();
  }

  // ─────────────────────────────── Lobby ───────────────────────────────

  private joinSlot(client: Client, msg: { localId?: unknown; name?: unknown; characterId?: unknown; colorIndex?: unknown; auth?: unknown }) {
    const localId = typeof msg?.localId === 'string' ? msg.localId.slice(0, 16) : '';
    if (!localId || this.phase !== 'lobby' || this.slots.length >= MAX_ROOM_SLOTS) return;
    if (this.slots.some((s) => s.owner === client.sessionId && s.localId === localId)) return;
    const used = new Set(this.slots.map((s) => s.slot));
    const slot = [0, 1, 2, 3].find((i) => !used.has(i))!;
    // The player's own profile (name, character, favourite color) when they send it; the color
    // falls back to the next free one if somebody already wears it.
    const wanted = Number.isInteger(msg?.colorIndex) && (msg.colorIndex as number) >= 0 && (msg.colorIndex as number) < SLOT_COLORS.length ? (msg.colorIndex as number) : slot;
    const colorIndex = this.slots.some((s) => s.colorIndex === wanted) ? this.nextColor(wanted, 1, slot) : wanted;
    const name = sanitizeName(msg?.name, `P${slot + 1}`);
    // A logged-in player brings their level and cosmetics; one account drives one slot at most.
    const acc = ArenaRoom.accounts?.auth(msg?.auth) ?? null;
    const taken = acc && this.slots.some((s) => this.slotAccount.get(s.slot) === acc.id);
    if (acc && !taken) this.slotAccount.set(slot, acc.id);
    else this.slotAccount.delete(slot);
    const extra = acc && !taken ? { level: levelInfo(acc.xp).level, loadout: acc.loadout } : {};
    // Rescued heroes need an account that owns them; guests play the starters.
    const wantedHero = isCharacterId(msg?.characterId) ? msg.characterId : 'bombito';
    const allowed = ArenaRoom.accounts ? ArenaRoom.accounts.canPlay(acc && !taken ? acc : null, wantedHero) : STARTER_CHARACTERS.includes(wantedHero);
    const characterId = allowed ? wantedHero : 'bombito';
    this.slots.push({ slot, owner: client.sessionId, localId, name, colorIndex, characterId, ready: false, connected: true, ...extra });
    this.slots.sort((a, b) => a.slot - b.slot);
    this.lobbyChanged();
  }

  /** Heroes a slot may pick in the lobby. */
  private playableFor(slot: number): CharacterId[] {
    const accId = this.slotAccount.get(slot);
    const acc = accId ? (ArenaRoom.accounts?.get(accId) ?? null) : null;
    return CHARACTER_IDS.filter((id) => STARTER_CHARACTERS.includes(id) || !!acc?.characters.includes(id));
  }

  /**
   * A hero rescued in Adventure joins the collection of the account behind that player (the
   * player's own slot, or the logged-in player on the same device for local guests).
   */
  private unlockHero(playerId: string, characterId: string) {
    const store = ArenaRoom.accounts;
    const p = this.game?.players.find((pp) => pp.id === playerId);
    const slot = p && this.slots.find((s) => s.slot === p.slot);
    if (!store || !slot) return;
    const own = this.slotAccount.get(slot.slot);
    const accId = own ?? this.slots.map((s) => (s.owner === slot.owner ? this.slotAccount.get(s.slot) : undefined)).find(Boolean);
    const acc = accId ? store.get(accId) : null;
    if (!acc || !store.unlockCharacter(acc, characterId)) return;
    this.clients.find((c) => c.sessionId === slot.owner)?.send('account', store.view(acc));
  }

  private ownedSlot(client: Client, slot: unknown) {
    return this.slots.find((s) => s.slot === slot && s.owner === client.sessionId);
  }

  private nextColor(from: number, stepDir: 1 | -1, self: number) {
    const used = new Set(this.slots.filter((s) => s.slot !== self).map((s) => s.colorIndex));
    const n = SLOT_COLORS.length;
    for (let i = 1; i <= n; i++) {
      const c = (((from + stepDir * i) % n) + n) % n;
      if (!used.has(c)) return c;
    }
    return from;
  }

  private canStart() {
    const connected = this.slots.filter((s) => s.connected);
    return connected.length >= MIN_PLAYERS[this.mode] && connected.length === this.slots.length;
  }

  private setConnected(sessionId: string, connected: boolean) {
    for (const s of this.slots) if (s.owner === sessionId) s.connected = connected;
    this.lobbyChanged();
  }

  private lobbyChanged() {
    // Auto-start once every player is ready; any change re-evaluates (and may cancel) it.
    const allReady = this.phase === 'lobby' && this.canStart() && this.slots.every((s) => s.ready);
    if (allReady && this.startsAt === null) {
      this.startsAt = Date.now() + AUTO_START_MS;
      this.startTimer = this.clock.setTimeout(() => this.startMatch(), AUTO_START_MS);
    } else if (!allReady && this.startsAt !== null) {
      this.startTimer?.clear();
      this.startTimer = null;
      this.startsAt = null;
    }
    this.broadcast('lobby', this.lobbyInfo());
  }

  private lobbyInfo(): LobbyInfo {
    return {
      code: this.roomId,
      isPublic: this.isPublic,
      hostId: this.hostId,
      mode: this.mode,
      arena: this.arena,
      phase: this.phase,
      slots: this.slots,
      startsAt: this.startsAt,
      serverNow: Date.now(),
    };
  }

  private sendLobby(client: Client) {
    client.send('lobby', this.lobbyInfo());
  }

  // ─────────────────────────────── Match ───────────────────────────────

  private startMatch() {
    if (this.phase !== 'lobby' || !this.canStart()) return;
    this.startTimer?.clear();
    this.startTimer = null;
    this.startsAt = null;
    this.phase = 'playing';
    void this.lock();
    const arena = OWN_WORLD.includes(this.mode) ? 'caldeira' : this.arena;
    this.game = createGame({
      mode: this.mode,
      seed: randomBytes(4).readInt32LE(0),
      width: ARENAS[arena].width,
      height: ARENAS[arena].height,
      arenaId: arena,
      ...(OWN_WORLD.includes(this.mode) ? { events: false } : {}),
      players: this.slots.map((s) => ({ id: `p${s.slot + 1}`, slot: s.slot, name: s.name, colorIndex: s.colorIndex, characterId: s.characterId, ...(s.loadout ? { loadout: s.loadout } : {}) })),
    });
    this.tally = new Map(this.game.players.map((p) => [p.id, { kills: 0, enemies: 0, powerups: 0, mimics: 0, elites: 0 }]));
    this.bossesDown = [];
    this.bossFights = [];
    this.queues.clear();
    this.held.clear();
    this.acks = {};
    this.pendingEvents = [];
    this.broadcast('start', this.startInfo());
    this.lobbyChanged();
  }

  private startInfo(): StartInfo {
    return { config: this.game!.config, grid: encodeGrid(this.game!) };
  }

  private receiveInput(client: Client, raw: unknown) {
    if (!this.game || this.phase !== 'playing') return;
    const batch = parseInputBatch(raw);
    if (!batch) return;
    for (const { slot, input } of batch.inputs) {
      // A connection may only drive the slots it owns.
      if (!this.slots.some((s) => s.slot === slot && s.owner === client.sessionId)) continue;
      const q = this.queues.get(slot) ?? [];
      const lastSeq = q.length ? q[q.length - 1].seq : (this.acks[slot] ?? -1);
      if (batch.seq <= lastSeq) continue; // stale or replayed
      q.push({ seq: batch.seq, move: input.move, bomb: input.bomb, ability: input.ability, roll: !!input.roll, jump: !!input.jump, campEnd: !!input.campEnd });
      if (q.length > MAX_QUEUED_INPUTS) {
        // Keep button presses from dropped frames so they are never silently lost.
        const dropped = q.splice(0, q.length - MAX_QUEUED_INPUTS);
        if (dropped.some((d) => d.bomb)) q[0].bomb = true;
        if (dropped.some((d) => d.ability)) q[0].ability = true;
        if (dropped.some((d) => d.roll)) q[0].roll = true;
        if (dropped.some((d) => d.jump)) q[0].jump = true;
        if (dropped.some((d) => d.campEnd)) q[0].campEnd = true;
      }
      this.queues.set(slot, q);
    }
  }

  private tick() {
    const g = this.game;
    if (!g) return;
    const inputs: InputMap = {};
    for (const p of g.players) {
      const q = this.queues.get(p.slot);
      let next = q?.shift();
      if (next && q && q.length >= TARGET_QUEUED_INPUTS) {
        const later = q.shift()!;
        later.bomb ||= next.bomb;
        later.ability ||= next.ability;
        later.roll ||= next.roll;
        later.jump ||= next.jump;
        later.campEnd ||= next.campEnd;
        next = later;
      }
      if (next) {
        this.held.set(p.slot, next.move);
        this.acks[p.slot] = next.seq;
        inputs[p.id] = { move: next.move, bomb: next.bomb, ability: next.ability, roll: next.roll, jump: next.jump, campEnd: next.campEnd };
      } else {
        // No fresh input this tick (network jitter): keep walking in the held direction.
        inputs[p.id] = { ...EMPTY_INPUT, move: this.held.get(p.slot) ?? null };
      }
    }
    step(g, inputs);
    this.pendingEvents.push(...g.events);
    this.count(g.events);

    const justEnded = g.phase === 'ended' && this.phase === 'playing';
    if (g.tick % SNAPSHOT_EVERY_TICKS === 0 || justEnded) {
      this.broadcast('snap', encodeSnapshot(g, { ...this.acks }, this.pendingEvents));
      this.pendingEvents = [];
    }
    if (justEnded) {
      this.grantRewards(g);
      this.phase = 'results';
      this.lobbyChanged();
      this.clock.setTimeout(() => this.backToLobby(), RESULTS_MS);
    }
  }

  private count(events: GameEvent[]) {
    for (const e of events) {
      if (e.type === 'playerDied' && e.byId && e.byId !== e.playerId) this.tallyOf(e.byId).kills++;
      else if (e.type === 'enemyDied') {
        const t = this.tallyOf(e.byId);
        t.enemies++;
        if (e.kind === 'mimic') t.mimics++;
        if (e.elite) t.elites++;
      }
      else if (e.type === 'powerupCollected') this.tallyOf(e.playerId).powerups++;
      else if (e.type === 'bossDefeated') {
        this.bossesDown.push(e.boss);
        if (e.tier) this.bossFights.push({ boss: e.boss, level: e.level ?? 0, tier: e.tier });
      }
      else if (e.type === 'heroJoined') this.unlockHero(e.playerId, e.characterId);
    }
  }

  private tallyOf(id: string) {
    let t = this.tally.get(id);
    if (!t) this.tally.set(id, (t = { kills: 0, enemies: 0, powerups: 0, mimics: 0, elites: 0 }));
    return t;
  }

  /** Books XP / coins / stats for every logged-in player still in the room and tells them. */
  private grantRewards(g: GameState) {
    const store = ArenaRoom.accounts;
    const result = g.result;
    if (!store || !result) return;
    const seconds = Math.max(0, (g.tick - g.countdownTicks) / SERVER_TICK_HZ);
    for (const s of this.slots) {
      const accId = this.slotAccount.get(s.slot);
      const acc = accId ? store.get(accId) : null;
      const p = g.players.find((pp) => pp.slot === s.slot);
      if (!acc || !p || !s.connected) continue;
      // The endless Adventure has no winner: a journey is measured by how far it got.
      const outcome: MatchPerformance['outcome'] = g.mode === 'adventure' ? 'draw' :
        result.outcome === 'victory' ? 'win' : result.outcome === 'defeat' ? 'loss' : result.outcome === 'draw' ? 'draw' : result.winnerIds.includes(p.id) ? 'win' : 'loss';
      const t = this.tallyOf(p.id);
      const report = store.recordMatch(
        acc,
        {
          mode: g.mode,
          outcome,
          players: g.players.length,
          kills: t.kills,
          enemies: t.enemies,
          died: !p.alive,
          blocks: p.blocksDestroyed,
          powerups: t.powerups,
          bosses: [...this.bossesDown],
          bossRushClear: g.mode === 'bossrush' && result.outcome === 'victory',
          seconds,
          depth: g.adventure?.depth ?? 0,
          atlas: [...new Set((g.adventure?.journey ?? []).map((j) => `${j.biome}:${j.variant}`))],
          bossFights: [...this.bossFights],
          // Task 3: an expedition ended at a campfire pays its whole purse to everyone.
          expeditionCoins: g.expedition?.ended ? g.expedition.coins : 0,
          mimics: t.mimics,
          elites: t.elites,
        },
        s.slot,
      );
      // New level / cosmetics show up in the lobby too.
      s.level = report.levelAfter;
      s.loadout = report.account.loadout;
      this.clients.find((c) => c.sessionId === s.owner)?.send('rewards', report);
    }
  }

  private backToLobby() {
    this.game = null;
    this.phase = 'lobby';
    // Drop players whose connection is gone; everyone else confirms again.
    this.slots = this.slots.filter((s) => s.connected);
    for (const s of this.slots) s.ready = false;
    void this.unlock();
    this.lobbyChanged();
  }

  private withinBudget(sessionId: string) {
    const now = Date.now();
    const b = this.msgBudget.get(sessionId) ?? { windowStart: now, count: 0 };
    if (now - b.windowStart >= 1000) {
      b.windowStart = now;
      b.count = 0;
    }
    b.count++;
    this.msgBudget.set(sessionId, b);
    return b.count <= MAX_MESSAGES_PER_SEC;
  }
}
