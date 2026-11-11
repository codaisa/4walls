import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  ACHIEVEMENTS,
  CHARACTER_IDS,
  COSMETICS,
  EMPTY_LOADOUT,
  EMPTY_STATS,
  SLOT_COLORS,
  achievementDone,
  applyMatchToStats,
  currentSeason,
  earnedItems,
  levelInfo,
  levelUpCoins,
  matchReward,
  sanitizeLoadout,
  type AccountView,
  type MatchPerformance,
  type RankingBoard,
  type RankingEntry,
  type RewardReport,
} from '@4walls/shared';
import { sanitizeName } from '@4walls/protocol';

interface StoredAccount extends AccountView {
  tokenHash: string;
  updatedAt: number;
}

const HISTORY = 20;
const SAVE_DELAY_MS = 400;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Guest accounts with progression, persisted as one JSON file (atomic write: tmp + rename).
 * Every client gets an account the first time it opens the game; the browser keeps the
 * credential ("id.token"), the server keeps only the token's hash.
 * A database (PostgreSQL) can replace this store at deploy time without touching its callers.
 */
export class AccountStore {
  private accounts = new Map<string, StoredAccount>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** `file` = null keeps everything in memory (tests). */
  constructor(private file: string | null) {
    if (!file) return;
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as StoredAccount[];
      for (const a of raw) this.accounts.set(a.id, this.migrate(a));
    } catch {
      // No file yet (first run) or unreadable: start empty.
    }
  }

  get size() {
    return this.accounts.size;
  }

  create(profile: { name?: unknown; characterId?: unknown; colorIndex?: unknown } = {}) {
    const id = randomBytes(8).toString('hex');
    const token = randomBytes(24).toString('base64url');
    const now = Date.now();
    const acc: StoredAccount = this.migrate({
      id,
      tokenHash: hash(token),
      name: 'Jogador',
      characterId: 'bombito',
      colorIndex: 0,
      createdAt: now,
      updatedAt: now,
      xp: 0,
      coins: 300, // a welcome gift: enough for a first cheap cosmetic
      owned: [],
      loadout: { ...EMPTY_LOADOUT },
      stats: { ...EMPTY_STATS },
      achievements: [],
      history: [],
      seasonXp: {},
    });
    this.applyProfile(acc, profile);
    this.accounts.set(id, acc);
    this.save();
    return { credential: `${id}.${token}`, account: this.view(acc) };
  }

  /** Account for an "id.token" credential, or null. */
  auth(credential: unknown): StoredAccount | null {
    if (typeof credential !== 'string' || credential.length > 128) return null;
    const dot = credential.indexOf('.');
    if (dot <= 0) return null;
    const acc = this.accounts.get(credential.slice(0, dot));
    if (!acc) return null;
    const a = Buffer.from(hash(credential.slice(dot + 1)), 'hex');
    const b = Buffer.from(acc.tokenHash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b) ? acc : null;
  }

  get(id: string) {
    return this.accounts.get(id) ?? null;
  }

  /** Name, character, color and loadout (only items the account owns). */
  updateProfile(acc: StoredAccount, patch: { name?: unknown; characterId?: unknown; colorIndex?: unknown; loadout?: unknown }) {
    this.applyProfile(acc, patch);
    if (patch.loadout !== undefined) acc.loadout = sanitizeLoadout(patch.loadout, acc.owned);
    this.touch(acc);
    return this.view(acc);
  }

  buy(acc: StoredAccount, itemId: unknown): { ok: true; account: AccountView } | { ok: false; error: string } {
    const item = typeof itemId === 'string' ? COSMETICS[itemId] : undefined;
    if (!item || item.price <= 0) return { ok: false, error: 'Item não está à venda.' };
    if (acc.owned.includes(item.id)) return { ok: false, error: 'Você já tem este item.' };
    if (acc.coins < item.price) return { ok: false, error: 'Moedas insuficientes.' };
    acc.coins -= item.price;
    acc.owned.push(item.id);
    this.touch(acc);
    return { ok: true, account: this.view(acc) };
  }

  /** Books one finished match: stats, XP, coins, level-ups, achievements, unlocks, history. */
  recordMatch(acc: StoredAccount, perf: MatchPerformance, slot: number): RewardReport {
    const reward = matchReward(perf);
    const levelBefore = levelInfo(acc.xp).level;
    acc.stats = applyMatchToStats(acc.stats, perf);
    acc.xp += reward.xp;
    const season = currentSeason().id;
    acc.seasonXp[season] = (acc.seasonXp[season] ?? 0) + reward.xp;
    const levelAfter = levelInfo(acc.xp).level;
    let bonusCoins = 0;
    for (let l = levelBefore + 1; l <= levelAfter; l++) bonusCoins += levelUpCoins(l);
    const newAchievements = ACHIEVEMENTS.filter((a) => !acc.achievements.includes(a.id) && achievementDone(a, acc.stats));
    for (const a of newAchievements) {
      acc.achievements.push(a.id);
      bonusCoins += a.coins;
    }
    acc.coins += reward.coins + bonusCoins;
    const before = new Set(acc.owned);
    this.grantEarned(acc);
    const newItems = acc.owned.filter((id) => !before.has(id));
    acc.history.unshift({ at: Date.now(), mode: perf.mode, outcome: perf.outcome, xp: reward.xp, coins: reward.coins + bonusCoins, kills: perf.kills, enemies: perf.enemies, seconds: Math.round(perf.seconds) });
    acc.history.length = Math.min(acc.history.length, HISTORY);
    this.touch(acc);
    return { slot, reward, levelBefore, levelAfter, bonusCoins, newAchievements: newAchievements.map((a) => a.id), newItems, account: this.view(acc) };
  }

  ranking(board: RankingBoard, limit = 50, meId?: string): { entries: RankingEntry[]; me: RankingEntry | null; season: string } {
    const season = currentSeason().id;
    const value = (a: StoredAccount) => (board === 'wins' ? a.stats.wins : board === 'season' ? (a.seasonXp[season] ?? 0) : a.xp);
    const sorted = [...this.accounts.values()]
      .filter((a) => a.stats.matches > 0)
      .sort((a, b) => value(b) - value(a) || b.xp - a.xp || a.createdAt - b.createdAt);
    const entry = (a: StoredAccount, i: number): RankingEntry => ({
      rank: i + 1,
      id: a.id,
      name: a.name,
      level: levelInfo(a.xp).level,
      title: a.loadout.title,
      characterId: a.characterId,
      colorIndex: a.colorIndex,
      value: value(a),
      wins: a.stats.wins,
      matches: a.stats.matches,
    });
    const meIdx = meId ? sorted.findIndex((a) => a.id === meId) : -1;
    return { entries: sorted.slice(0, Math.max(1, Math.min(100, limit))).map(entry), me: meIdx >= 0 ? entry(sorted[meIdx], meIdx) : null, season };
  }

  view(acc: StoredAccount): AccountView {
    const { tokenHash: _t, updatedAt: _u, ...v } = acc;
    return structuredClone(v);
  }

  /** Writes now (shutdown / tests). */
  flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify([...this.accounts.values()]));
    renameSync(tmp, this.file);
  }

  private applyProfile(acc: StoredAccount, p: { name?: unknown; characterId?: unknown; colorIndex?: unknown }) {
    if (p.name !== undefined) acc.name = sanitizeName(p.name, acc.name);
    if (typeof p.characterId === 'string' && (CHARACTER_IDS as string[]).includes(p.characterId)) acc.characterId = p.characterId;
    if (Number.isInteger(p.colorIndex) && (p.colorIndex as number) >= 0 && (p.colorIndex as number) < SLOT_COLORS.length) acc.colorIndex = p.colorIndex as number;
  }

  private grantEarned(acc: StoredAccount) {
    for (const id of earnedItems(levelInfo(acc.xp).level, acc.achievements, acc.seasonXp)) if (!acc.owned.includes(id)) acc.owned.push(id);
  }

  /** Fills fields added after the account was saved and drops unknown items. */
  private migrate(a: StoredAccount): StoredAccount {
    a.stats = { ...EMPTY_STATS, ...a.stats };
    a.owned = (a.owned ?? []).filter((id) => COSMETICS[id]);
    a.achievements = a.achievements ?? [];
    a.history = a.history ?? [];
    a.seasonXp = a.seasonXp ?? {};
    this.grantEarned(a);
    a.loadout = sanitizeLoadout(a.loadout ?? EMPTY_LOADOUT, a.owned);
    return a;
  }

  private touch(acc: StoredAccount) {
    acc.updatedAt = Date.now();
    this.save();
  }

  private save() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }
}
