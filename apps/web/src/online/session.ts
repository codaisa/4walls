import { Client, type Room } from '@colyseus/sdk';
import { create } from 'zustand';
import { DEFAULT_PORT, ROOM_NAME, type LobbyInfo, type Messages, type Snapshot, type StartInfo } from '@4walls/protocol';
import type { RewardReport } from '@4walls/shared';
import { receiveReward } from '../store/useAccount';

export type OnlineStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface OnlineState {
  status: OnlineStatus;
  error: string | null;
  sessionId: string;
  lobby: LobbyInfo | null;
  /** Latest match start; a new object per match. */
  start: StartInfo | null;
  /** Date.now() offset to the server clock (serverNow - localNow). */
  clockOffset: number;
}

export const useOnline = create<OnlineState>(() => ({
  status: 'idle',
  error: null,
  sessionId: '',
  lobby: null,
  start: null,
  clockOffset: 0,
}));

/** Where the game server lives: same origin in production, :2567 in dev. Override with VITE_SERVER_URL. */
export function serverUrl() {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  const secure = location.protocol === 'https:';
  // Production build: the game server also serves the page, so it lives on this very origin.
  if (import.meta.env.PROD) return `${secure ? 'wss' : 'ws'}://${location.host}`;
  return `${secure ? 'wss' : 'ws'}://${location.hostname}:${DEFAULT_PORT}`;
}

type SnapListener = (s: Snapshot) => void;

/**
 * The single online connection of this browser tab. Several local players share it:
 * the server tracks them as separate slots owned by this session.
 */
class OnlineSession {
  private client: Client | null = null;
  private room: Room | null = null;
  private snapListeners = new Set<SnapListener>();

  get connected() {
    return !!this.room;
  }

  async createRoom(isPublic = false) {
    return this.connect((c) => c.create(ROOM_NAME, { public: isPublic }));
  }

  /** Public matchmaking: join any open public room, or open a new one. */
  async quickPlay() {
    return this.connect((c) => c.joinOrCreate(ROOM_NAME, { public: true }));
  }

  async joinByCode(code: string) {
    return this.connect((c) => c.joinById(code.toUpperCase()), 'Sala não encontrada, cheia ou já em partida.');
  }

  send<K extends keyof Messages>(type: K, msg: Messages[K]) {
    this.room?.send(type, msg);
  }

  onSnapshot(fn: SnapListener) {
    this.snapListeners.add(fn);
    return () => {
      this.snapListeners.delete(fn);
    };
  }

  async leave() {
    const r = this.room;
    this.room = null;
    useOnline.setState({ status: 'idle', lobby: null, start: null, error: null, sessionId: '' });
    if (r) await r.leave(true).catch(() => {});
  }

  private async connect(open: (c: Client) => Promise<Room>, failMessage = 'Não foi possível conectar ao servidor.') {
    await this.leave();
    useOnline.setState({ status: 'connecting', error: null });
    try {
      this.client ??= new Client(serverUrl());
      let room: Room;
      try {
        room = await open(this.client);
      } catch (first) {
        // Phones switch between Wi-Fi and mobile data all the time: one quick retry.
        console.warn('[4walls] online connect retry', first);
        await new Promise((r) => setTimeout(r, 700));
        room = await open(this.client);
      }
      this.attach(room);
      return true;
    } catch (err) {
      console.warn('[4walls] online connect failed', err);
      useOnline.setState({ status: 'error', error: failMessage });
      return false;
    }
  }

  private attach(room: Room) {
    this.room = room;
    // Mobile: drops happen any time (screen lock, app switch, network handover), even right
    // after joining. Keep retrying quickly for as long as the server holds our seat.
    Object.assign(room.reconnection, { minUptime: 0, maxRetries: 40, minDelay: 250, maxDelay: 1500, maxEnqueuedMessages: 4 });
    useOnline.setState({ status: 'connected', sessionId: room.sessionId, lobby: null, start: null });
    room.onMessage('lobby', (lobby: LobbyInfo) => {
      useOnline.setState({ lobby, clockOffset: lobby.serverNow - Date.now() });
      if (lobby.phase === 'lobby' && useOnline.getState().start) useOnline.setState({ start: null });
    });
    room.onMessage('start', (start: StartInfo) => useOnline.setState({ start }));
    room.onMessage('rewards', (r: RewardReport) => receiveReward(r));
    room.onMessage('snap', (snap: Snapshot) => {
      for (const l of this.snapListeners) l(snap);
    });
    room.onDrop(() => useOnline.setState({ status: 'reconnecting' }));
    room.onReconnect(() => useOnline.setState({ status: 'connected' }));
    room.onLeave((code) => {
      if (this.room !== room) return; // we left on purpose
      this.room = null;
      useOnline.setState({
        status: 'error',
        lobby: null,
        start: null,
        error: code === 1000 || code === 4000 ? 'A sala foi encerrada.' : 'Conexão com o servidor perdida.',
      });
    });
  }
}

export const online = new OnlineSession();
