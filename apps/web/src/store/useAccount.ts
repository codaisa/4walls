import { create } from 'zustand';
import { EMPTY_LOADOUT, STARTER_CHARACTERS, type AccountView, type CosmeticSlot, type Loadout, type RankingBoard, type RankingEntry, type RewardReport } from '@4walls/shared';
import { serverUrl } from '../online/session';
import { useProfile } from './useProfile';

const KEY = '4walls.account';

export type AccountStatus = 'idle' | 'loading' | 'ready' | 'offline';

interface AccountState {
  status: AccountStatus;
  account: AccountView | null;
  /** Rewards of the last online match, until the player dismisses them. */
  lastReward: RewardReport | null;
  /** Feedback of the last shop action. */
  shopError: string | null;
}

export const useAccount = create<AccountState>(() => ({ status: 'idle', account: null, lastReward: null, shopError: null }));

/** HTTP base of the game server (same host/port as the websocket). */
export const apiBase = () => serverUrl().replace(/^ws/, 'http');

const readCredential = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const writeCredential = (c: string) => {
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* private mode: a new guest account next time */
  }
};

/** "id.token" of this browser's account (sent when joining rooms). */
export const credential = () => readCredential() ?? undefined;

async function api<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const auth = readCredential();
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
  });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T };
}

let loading: Promise<void> | null = null;

/** Loads (or creates) this browser's guest account. Safe to call often. */
export function ensureAccount(): Promise<void> {
  if (useAccount.getState().status === 'ready') return Promise.resolve();
  loading ??= (async () => {
    useAccount.setState({ status: 'loading' });
    try {
      const p = useProfile.getState();
      const profile = { name: p.name, characterId: p.characterId, colorIndex: p.colorIndex };
      if (readCredential()) {
        const me = await api<{ account: AccountView }>('/api/me');
        if (me.ok) {
          useAccount.setState({ status: 'ready', account: me.data.account });
          pushProfile();
          return;
        }
        if (me.status !== 401) throw new Error(`HTTP ${me.status}`);
      }
      const created = await api<{ credential: string; account: AccountView }>('/api/account', { method: 'POST', body: JSON.stringify(profile) });
      if (!created.ok) throw new Error(`HTTP ${created.status}`);
      writeCredential(created.data.credential);
      useAccount.setState({ status: 'ready', account: created.data.account });
    } catch (err) {
      console.warn('[4walls] account unavailable (offline?)', err);
      useAccount.setState({ status: 'offline' });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
/** Mirrors the local profile (name, character, color) onto the account. */
function pushProfile() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    if (useAccount.getState().status !== 'ready') return;
    const p = useProfile.getState();
    const r = await api<{ account: AccountView }>('/api/me', { method: 'PATCH', body: JSON.stringify({ name: p.name, characterId: p.characterId, colorIndex: p.colorIndex }) }).catch(() => null);
    if (r?.ok) useAccount.setState({ account: r.data.account });
  }, 500);
}
useProfile.subscribe((s, prev) => {
  if (s.name !== prev.name || s.characterId !== prev.characterId || s.colorIndex !== prev.colorIndex) pushProfile();
});

/** Equips (or, with null, removes) a cosmetic. Optimistic; the server validates ownership. */
export async function equip(slot: CosmeticSlot, itemId: string | null) {
  const acc = useAccount.getState().account;
  if (!acc) return;
  const loadout: Loadout = { ...acc.loadout, [slot]: itemId };
  useAccount.setState({ account: { ...acc, loadout } });
  const r = await api<{ account: AccountView }>('/api/me', { method: 'PATCH', body: JSON.stringify({ loadout }) }).catch(() => null);
  if (r?.ok) useAccount.setState({ account: r.data.account });
}

export async function buy(itemId: string): Promise<boolean> {
  useAccount.setState({ shopError: null });
  const r = await api<{ account?: AccountView; error?: string }>('/api/shop/buy', { method: 'POST', body: JSON.stringify({ itemId }) }).catch(() => null);
  if (r?.ok && r.data.account) {
    useAccount.setState({ account: r.data.account });
    return true;
  }
  useAccount.setState({ shopError: r?.data.error ?? 'Sem conexão com o servidor.' });
  return false;
}

export async function fetchRanking(board: RankingBoard) {
  const r = await api<{ entries: RankingEntry[]; me: RankingEntry | null; season: string }>(`/api/ranking?board=${board}&limit=50`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.data;
}

/** A match ended: the server booked the rewards. */
export function receiveReward(r: RewardReport) {
  useAccount.setState({ account: r.account, lastReward: r });
}

/** The player's current cosmetics (default look when offline). */
export const myLoadout = (): Loadout => useAccount.getState().account?.loadout ?? EMPTY_LOADOUT;

/**
 * Moves this browser to another account (the "transfer code" shown in the settings of the other
 * device). Returns false when the code is not valid on this server.
 */
export async function restoreAccount(code: string): Promise<boolean> {
  const cred = code.trim();
  if (!/^[0-9a-f]{16}\.[\w-]{20,64}$/.test(cred)) return false;
  const res = await fetch(`${apiBase()}/api/me`, { headers: { Authorization: `Bearer ${cred}` } }).catch(() => null);
  if (!res?.ok) return false;
  const { account } = (await res.json()) as { account: AccountView };
  writeCredential(cred);
  useAccount.setState({ status: 'ready', account });
  // The local profile follows the account it now belongs to.
  useProfile.getState().set({ name: account.name, characterId: account.characterId as never, colorIndex: account.colorIndex });
  return true;
}

/** Server push (e.g. a hero unlocked mid-match). */
export function receiveAccount(account: AccountView) {
  useAccount.setState({ account });
}

/** Heroes this device can pick: starters + the ones its account rescued. */
export function ownedHeroes(): string[] {
  const acc = useAccount.getState().account;
  return [...STARTER_CHARACTERS, ...(acc?.characters ?? [])];
}

const claimedThisSession = new Set<string>();
/**
 * A local player just got `characterId` from a cage: true when it is new for this device's
 * collection. Adds it right away so the menus show it (the server confirms with an "account" push).
 */
export function claimHero(characterId: string) {
  if ((STARTER_CHARACTERS as string[]).includes(characterId)) return false;
  const acc = useAccount.getState().account;
  const owned = !!acc?.characters?.includes(characterId) || claimedThisSession.has(characterId);
  claimedThisSession.add(characterId);
  if (!owned && acc) useAccount.setState({ account: { ...acc, characters: [...(acc.characters ?? []), characterId] } });
  return !owned;
}
