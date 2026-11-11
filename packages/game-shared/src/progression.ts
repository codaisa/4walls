/**
 * Phase 7 — progression and economy. Pure data and rules shared by the server (which owns the
 * accounts and grants rewards) and the client (which shows them). Everything here is cosmetic or
 * bookkeeping: nothing in this file changes gameplay (no pay-to-win).
 */
import type { BossId, ModeId } from './index';

// ───────────────────────────── levels ─────────────────────────────

export const MAX_LEVEL = 50;

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number) => 120 + (level - 1) * 60;

/** Level, XP inside the level and XP the level needs, from the account's total XP. */
export function levelInfo(totalXp: number) {
  let level = 1;
  let rest = Math.max(0, Math.floor(totalXp));
  while (level < MAX_LEVEL && rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, xpInLevel: rest, xpForLevel: xpToNext(level) };
}

/** Coins granted for reaching a level (on top of any cosmetic it unlocks). */
export const levelUpCoins = (level: number) => 50 + Math.floor(level / 5) * 25;

// ───────────────────────────── cosmetics ─────────────────────────────

export type CosmeticSlot = 'hat' | 'bomb' | 'fire' | 'title';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITY_LABEL: Record<Rarity, string> = { common: 'comum', rare: 'raro', epic: 'épico', legendary: 'lendário' };

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  name: string;
  desc: string;
  rarity: Rarity;
  /** Price in coins at the shop; 0 = not for sale (earned some other way). */
  price: number;
  /** Unlocked for free when the account reaches this level. */
  level?: number;
  /** Unlocked by this achievement. */
  achievement?: AchievementId;
  /** Unlocked by reaching `seasonXp` season XP during this season. */
  season?: { id: string; xp: number };
  /** Owned by every account from the start. */
  starter?: boolean;
}

const C = (d: CosmeticDef) => d;

export const COSMETICS: Record<string, CosmeticDef> = Object.fromEntries(
  [
    // Hats (sit on the block head).
    C({ id: 'hat_bone', slot: 'hat', name: 'Boné', desc: 'Aba virada para trás, estilo de quem já explodiu muita parede.', rarity: 'common', price: 250 }),
    C({ id: 'hat_cartola', slot: 'hat', name: 'Cartola', desc: 'Elegância antes, durante e depois da explosão.', rarity: 'rare', price: 600 }),
    C({ id: 'hat_bruxa', slot: 'hat', name: 'Chapéu de Bruxa', desc: 'Pontudo, torto e cheio de mistério.', rarity: 'rare', price: 750 }),
    C({ id: 'hat_coroa', slot: 'hat', name: 'Coroa', desc: 'Para quem reina sobre as quatro paredes.', rarity: 'epic', price: 1500 }),
    C({ id: 'hat_aureola', slot: 'hat', name: 'Auréola', desc: 'Anjo? Com tantas bombas? Duvidoso.', rarity: 'epic', price: 0, level: 10 }),
    C({ id: 'hat_chifres', slot: 'hat', name: 'Chifres de Magma', desc: 'Arrancados do Golem Vulcânico.', rarity: 'epic', price: 0, achievement: 'golem_slayer' }),
    C({ id: 'hat_folhas', slot: 'hat', name: 'Coroa de Folhas', desc: 'Presente do Guardião Ancião a quem o derrotou.', rarity: 'epic', price: 0, achievement: 'guardian_slayer' }),
    // Bomb skins (tint and finish of your bombs).
    C({ id: 'bomb_toxica', slot: 'bomb', name: 'Bomba Tóxica', desc: 'Verde radioativo que brilha no escuro.', rarity: 'common', price: 400 }),
    C({ id: 'bomb_cristal', slot: 'bomb', name: 'Bomba de Cristal', desc: 'Lapidada, translúcida e muito frágil (só que não).', rarity: 'rare', price: 650 }),
    C({ id: 'bomb_neon', slot: 'bomb', name: 'Bomba Neon', desc: 'Rosa choque piscando no ritmo do pavio.', rarity: 'rare', price: 800 }),
    C({ id: 'bomb_ouro', slot: 'bomb', name: 'Bomba de Ouro', desc: 'Ostentação pura, explode igualzinho.', rarity: 'epic', price: 1800 }),
    C({ id: 'bomb_magma', slot: 'bomb', name: 'Bomba de Magma', desc: 'Rachaduras incandescentes de rocha vulcânica.', rarity: 'rare', price: 0, level: 5 }),
    C({ id: 'bomb_vulcanica', slot: 'bomb', name: 'Bomba Vulcânica', desc: 'Recompensa da Temporada Vulcânica.', rarity: 'legendary', price: 0, season: { id: 's1-vulcanica', xp: 3000 } }),
    // Explosion colors (normal bombs only; special bombs keep their look so they stay readable).
    C({ id: 'fire_azul', slot: 'fire', name: 'Fogo Azul', desc: 'Chamas de plasma, mais quentes que o normal.', rarity: 'rare', price: 900 }),
    C({ id: 'fire_verde', slot: 'fire', name: 'Fogo Tóxico', desc: 'Explosões verdes de laboratório.', rarity: 'rare', price: 900 }),
    C({ id: 'fire_roxo', slot: 'fire', name: 'Fogo Arcano', desc: 'Chamas roxas de feitiçaria.', rarity: 'epic', price: 0, level: 8 }),
    C({ id: 'fire_dourado', slot: 'fire', name: 'Fogo Dourado', desc: 'O brilho do campeão.', rarity: 'legendary', price: 0, achievement: 'champion' }),
    // Titles (shown under the name).
    C({ id: 'title_novato', slot: 'title', name: 'Novato', desc: 'Todo mundo começa em algum lugar.', rarity: 'common', price: 0, starter: true }),
    C({ id: 'title_pavio', slot: 'title', name: 'Pavio Curto', desc: 'Explode por qualquer coisa.', rarity: 'common', price: 300 }),
    C({ id: 'title_demolidor', slot: 'title', name: 'Demolidor', desc: 'Destruiu 300 blocos.', rarity: 'rare', price: 0, achievement: 'demolisher' }),
    C({ id: 'title_incendiario', slot: 'title', name: 'Incendiário', desc: 'Explodiu 100 inimigos.', rarity: 'rare', price: 0, achievement: 'hunter' }),
    C({ id: 'title_veterano', slot: 'title', name: 'Veterano', desc: 'Jogou 50 partidas.', rarity: 'rare', price: 0, achievement: 'veteran' }),
    C({ id: 'title_cacador', slot: 'title', name: 'Caçador de Chefes', desc: 'Venceu o Boss Rush inteiro.', rarity: 'epic', price: 0, achievement: 'boss_rush' }),
    C({ id: 'title_guardiao', slot: 'title', name: 'Amigo da Floresta', desc: 'Derrotou o Guardião Ancião.', rarity: 'epic', price: 0, achievement: 'guardian_slayer' }),
    C({ id: 'title_rei', slot: 'title', name: 'Rei da Arena', desc: 'Venceu 25 partidas.', rarity: 'epic', price: 0, achievement: 'champion' }),
    C({ id: 'title_lenda', slot: 'title', name: 'Lenda', desc: 'Chegou ao nível 20.', rarity: 'legendary', price: 0, level: 20 }),
  ].map((d) => [d.id, d]),
);

export const COSMETIC_IDS = Object.keys(COSMETICS);
export const SLOT_LABEL: Record<CosmeticSlot, string> = { hat: 'Chapéu', bomb: 'Bomba', fire: 'Explosão', title: 'Título' };
export const RARITY_COLOR: Record<Rarity, string> = { common: '#cfd6dc', rare: '#5ab8ff', epic: '#c77dff', legendary: '#ffc23a' };

/** What the player wears. `null` = the default look. */
export interface Loadout {
  hat: string | null;
  bomb: string | null;
  fire: string | null;
  title: string | null;
}
export const EMPTY_LOADOUT: Loadout = { hat: null, bomb: null, fire: null, title: 'title_novato' };

/** Keeps only items that exist, sit in the right slot and are owned. */
export function sanitizeLoadout(raw: unknown, owned: readonly string[]): Loadout {
  const r = (raw ?? {}) as Partial<Record<CosmeticSlot, unknown>>;
  const pick = (slot: CosmeticSlot) => {
    const id = r[slot];
    return typeof id === 'string' && COSMETICS[id]?.slot === slot && owned.includes(id) ? id : null;
  };
  return { hat: pick('hat'), bomb: pick('bomb'), fire: pick('fire'), title: pick('title') };
}

/** Same check without ownership (what other players' clients accept from the server). */
export function cleanLoadout(raw: unknown): Loadout {
  return sanitizeLoadout(raw, COSMETIC_IDS);
}

// ───────────────────────────── seasons ─────────────────────────────

export interface SeasonDef {
  id: string;
  name: string;
  /** ISO dates (inclusive start, exclusive end). */
  start: string;
  end: string;
  /** Accent color for the season banner. */
  color: string;
}

/** Themed seasons. Season XP is tracked apart from the account XP and has its own ranking. */
export const SEASONS: SeasonDef[] = [
  { id: 's1-vulcanica', name: 'Temporada Vulcânica', start: '2026-11-01', end: '2027-02-01', color: '#ff7a2c' },
  { id: 's2-congelante', name: 'Temporada Congelante', start: '2027-02-01', end: '2027-05-01', color: '#7fd6ff' },
  { id: 's3-monstros', name: 'Temporada dos Monstros', start: '2027-05-01', end: '2027-08-01', color: '#9ae66e' },
  { id: 's4-cyberpunk', name: 'Temporada Cyberpunk', start: '2027-08-01', end: '2027-11-01', color: '#ff4fd8' },
];

export function currentSeason(now = Date.now()): SeasonDef {
  const t = new Date(now).toISOString().slice(0, 10);
  return SEASONS.find((s) => t >= s.start && t < s.end) ?? SEASONS[SEASONS.length - 1];
}

// ───────────────────────────── stats & achievements ─────────────────────────────

export interface PlayerStats {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  /** Players knocked out by you. */
  kills: number;
  /** Magmitos, Brotinhos… blown up. */
  enemies: number;
  deaths: number;
  blocks: number;
  powerups: number;
  bossesDefeated: number;
  bossKills: Partial<Record<BossId, number>>;
  bossRushClears: number;
  winStreak: number;
  bestWinStreak: number;
  playSeconds: number;
  byMode: Partial<Record<ModeId, { matches: number; wins: number }>>;
}

export const EMPTY_STATS: PlayerStats = {
  matches: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  kills: 0,
  enemies: 0,
  deaths: 0,
  blocks: 0,
  powerups: 0,
  bossesDefeated: 0,
  bossKills: {},
  bossRushClears: 0,
  winStreak: 0,
  bestWinStreak: 0,
  playSeconds: 0,
  byMode: {},
};

export type AchievementId = 'first_win' | 'demolisher' | 'hunter' | 'veteran' | 'golem_slayer' | 'guardian_slayer' | 'boss_rush' | 'champion' | 'streak' | 'collector';

export interface AchievementDef {
  id: AchievementId;
  name: string;
  desc: string;
  icon: string;
  coins: number;
  /** Progress toward the goal (value, goal). */
  progress: (s: PlayerStats) => [number, number];
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_win', name: 'Primeira Vitória', desc: 'Vença uma partida.', icon: '🏆', coins: 100, progress: (s) => [s.wins, 1] },
  { id: 'streak', name: 'Imparável', desc: 'Vença 3 partidas seguidas.', icon: '🔥', coins: 200, progress: (s) => [s.bestWinStreak, 3] },
  { id: 'collector', name: 'Colecionador', desc: 'Pegue 100 power-ups.', icon: '🎁', coins: 150, progress: (s) => [s.powerups, 100] },
  { id: 'demolisher', name: 'Demolidor', desc: 'Destrua 300 blocos.', icon: '🧱', coins: 150, progress: (s) => [s.blocks, 300] },
  { id: 'hunter', name: 'Incendiário', desc: 'Exploda 100 inimigos ou rivais.', icon: '💥', coins: 200, progress: (s) => [s.enemies + s.kills, 100] },
  { id: 'veteran', name: 'Veterano', desc: 'Jogue 50 partidas.', icon: '🎖️', coins: 250, progress: (s) => [s.matches, 50] },
  { id: 'golem_slayer', name: 'Quebra-Rocha', desc: 'Derrote o Golem Vulcânico.', icon: '🌋', coins: 200, progress: (s) => [s.bossKills.golem ?? 0, 1] },
  { id: 'guardian_slayer', name: 'Lenhador', desc: 'Derrote o Guardião Ancião.', icon: '🌳', coins: 250, progress: (s) => [s.bossKills.guardian ?? 0, 1] },
  { id: 'boss_rush', name: 'Caçador de Chefes', desc: 'Vença o Boss Rush inteiro.', icon: '👑', coins: 400, progress: (s) => [s.bossRushClears, 1] },
  { id: 'champion', name: 'Campeão', desc: 'Vença 25 partidas.', icon: '⭐', coins: 500, progress: (s) => [s.wins, 25] },
];

export const achievementDone = (a: AchievementDef, s: PlayerStats) => {
  const [v, goal] = a.progress(s);
  return v >= goal;
};

// ───────────────────────────── match rewards ─────────────────────────────

/** What one player did in one match (counted by the server). */
export interface MatchPerformance {
  mode: ModeId;
  outcome: 'win' | 'loss' | 'draw';
  /** Players in the match (a Versus win is worth more with more rivals). */
  players: number;
  kills: number;
  enemies: number;
  died: boolean;
  blocks: number;
  powerups: number;
  /** Bosses that fell during the match (team credit). */
  bosses: BossId[];
  /** Whole Boss Rush cleared. */
  bossRushClear: boolean;
  seconds: number;
}

export interface MatchReward {
  xp: number;
  coins: number;
  /** Itemized for the results screen. */
  lines: { label: string; xp: number }[];
}

/** Match XP/coins. Generous enough that a casual player levels up every few matches. */
export function matchReward(p: MatchPerformance): MatchReward {
  const lines: { label: string; xp: number }[] = [];
  const add = (label: string, xp: number) => xp > 0 && lines.push({ label, xp });
  // Participation grows with time actually played (no XP farming with instant self-knockouts).
  add('Partida', Math.min(70, Math.floor(p.seconds / 3)));
  // A Versus win counts only against rivals (alone it is just practice against the Magmitos).
  if (p.outcome === 'win') add('Vitória', p.mode === 'versus' ? (p.players > 1 ? 60 + 30 * (p.players - 1) : 0) : 90);
  else if (p.outcome === 'draw') add('Empate', 25);
  add('Rivais explodidos', p.kills * 25);
  add('Inimigos explodidos', Math.min(100, p.enemies * 10));
  add('Blocos', Math.min(50, p.blocks));
  add('Power-ups', Math.min(40, p.powerups * 4));
  add('Chefões derrotados', p.bosses.length * 100);
  if (p.bossRushClear) add('Boss Rush completo', 150);
  const xp = lines.reduce((n, l) => n + l.xp, 0);
  const coins = Math.round(xp / 4) + (p.outcome === 'win' ? 20 : 0);
  return { xp, coins, lines };
}

/** Adds one match to the cumulative stats (returns a new object). */
export function applyMatchToStats(s: PlayerStats, p: MatchPerformance): PlayerStats {
  const n: PlayerStats = { ...s, bossKills: { ...s.bossKills }, byMode: { ...s.byMode } };
  n.matches++;
  if (p.outcome === 'win') n.wins++;
  else if (p.outcome === 'loss') n.losses++;
  else n.draws++;
  n.winStreak = p.outcome === 'win' ? s.winStreak + 1 : 0;
  n.bestWinStreak = Math.max(s.bestWinStreak, n.winStreak);
  n.kills += p.kills;
  n.enemies += p.enemies;
  n.deaths += p.died ? 1 : 0;
  n.blocks += p.blocks;
  n.powerups += p.powerups;
  n.bossesDefeated += p.bosses.length;
  for (const b of p.bosses) n.bossKills[b] = (n.bossKills[b] ?? 0) + 1;
  n.bossRushClears += p.bossRushClear ? 1 : 0;
  n.playSeconds += Math.round(p.seconds);
  const m = n.byMode[p.mode] ?? { matches: 0, wins: 0 };
  n.byMode[p.mode] = { matches: m.matches + 1, wins: m.wins + (p.outcome === 'win' ? 1 : 0) };
  return n;
}

// ───────────────────────────── account (wire format) ─────────────────────────────

export interface MatchRecord {
  at: number;
  mode: ModeId;
  outcome: MatchPerformance['outcome'];
  xp: number;
  coins: number;
  kills: number;
  enemies: number;
  seconds: number;
}

/** The account as the owner sees it. */
export interface AccountView {
  id: string;
  name: string;
  characterId: string;
  colorIndex: number;
  createdAt: number;
  xp: number;
  coins: number;
  owned: string[];
  loadout: Loadout;
  stats: PlayerStats;
  achievements: AchievementId[];
  history: MatchRecord[];
  seasonXp: Record<string, number>;
}

/** Result of one match for one account (sent by the server right after the match). */
export interface RewardReport {
  slot: number;
  reward: MatchReward;
  levelBefore: number;
  levelAfter: number;
  /** Coins from level-ups and achievements (on top of reward.coins). */
  bonusCoins: number;
  newAchievements: AchievementId[];
  newItems: string[];
  account: AccountView;
}

export interface RankingEntry {
  rank: number;
  id: string;
  name: string;
  level: number;
  title: string | null;
  characterId: string;
  colorIndex: number;
  value: number;
  wins: number;
  matches: number;
}

export type RankingBoard = 'xp' | 'wins' | 'season';

/** Items earned (not bought) for this level / achievements / season XP. */
export function earnedItems(level: number, achievements: readonly string[], seasonXp: Record<string, number>): string[] {
  return Object.values(COSMETICS)
    .filter(
      (c) =>
        c.starter ||
        (c.level !== undefined && level >= c.level) ||
        (c.achievement !== undefined && achievements.includes(c.achievement)) ||
        (c.season !== undefined && (seasonXp[c.season.id] ?? 0) >= c.season.xp),
    )
    .map((c) => c.id);
}

/** How the item is obtained, for the shop / inventory cards. */
export function unlockHint(c: CosmeticDef): string {
  if (c.starter) return 'Inicial';
  if (c.price > 0) return `${c.price} moedas`;
  if (c.level !== undefined) return `Nível ${c.level}`;
  if (c.achievement) return `Conquista: ${ACHIEVEMENTS.find((a) => a.id === c.achievement)?.name ?? c.achievement}`;
  if (c.season) return `${SEASONS.find((s) => s.id === c.season!.id)?.name ?? 'Temporada'}: ${c.season.xp} XP`;
  return '';
}
