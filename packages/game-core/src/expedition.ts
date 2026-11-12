import { RELIC_IDS, type PlayerSnap } from '@4walls/shared';
import { randInt } from './rng';
import type { ExpeditionState, GameState, PlayerState } from './types';

/** Share of the carried purse lost when the whole group falls. */
export const EXPEDITION_LOSS = 0.5;

export const newExpedition = (): ExpeditionState => ({ camp: 0, coins: 0, snapshot: [], returns: 0, camps: 0, best: 0, banked: 0 });

/** What a campfire remembers of a hero. */
export const snapPlayer = (p: PlayerState): PlayerSnap => ({
  slot: p.slot,
  characterId: p.characterId,
  speed: p.speed,
  maxBombs: p.maxBombs,
  range: p.range,
  speedLevel: p.speedLevel,
  shield: p.shield,
  canKick: p.canKick,
  hasBoots: p.hasBoots,
  hasRemote: p.hasRemote,
  canThrow: p.canThrow,
  special: p.special ? { kind: p.special.kind as 'fire' | 'ice', charges: p.special.charges } : null,
  ...(p.feather ? { feather: p.feather } : {}),
  ...(p.maxHearts ? { maxHearts: p.maxHearts } : {}),
});

export function applySnap(p: PlayerState, snap: PlayerSnap | undefined) {
  if (!snap) return;
  Object.assign(p, {
    characterId: snap.characterId,
    speed: snap.speed,
    maxBombs: snap.maxBombs,
    range: snap.range,
    speedLevel: snap.speedLevel,
    shield: snap.shield,
    canKick: snap.canKick,
    hasBoots: snap.hasBoots,
    hasRemote: snap.hasRemote,
    canThrow: snap.canThrow,
    special: snap.special ? { ...snap.special } : null,
    feather: snap.feather ?? 0,
    ...(snap.maxHearts ? { maxHearts: snap.maxHearts } : {}),
  });
}

/** A3: contract progress (chests opened, a gold medal); completes and pays when the goal is met. */
export function contractStep(s: GameState, kind: 'gold' | 'chests', region: number) {
  const c = s.expedition?.contract;
  if (!c || c.kind !== kind || region >= c.until) return;
  c.progress++;
  if (c.progress < c.goal) return;
  s.expedition!.contract = null;
  s.expedition!.contractsDone = (s.expedition!.contractsDone ?? 0) + 1;
  addCoins(s, c.reward, 0, 0);
  s.events.push({ type: 'contractDone', kind: c.kind, reward: c.reward });
}

/** Coins into the group's purse (Adventure only). */
export function addCoins(s: GameState, amount: number, x: number, y: number) {
  const ex = s.expedition;
  if (!ex || amount <= 0 || ex.ended) return;
  if (hasRelic(s, 'coin_magnet')) amount *= 1.25;
  ex.coins += Math.round(amount);
  s.events.push({ type: 'coins', amount: Math.round(amount), total: ex.coins, x, y });
}

// ───────────────────────────── A4: hearts and relics ─────────────────────────────

export const HEARTS = 3;

export const hasRelic = (s: GameState, id: string) => !!s.expedition?.relics?.includes(id);

/** A relic the group doesn't have yet (coins when the codex of this expedition is full). */
export function grantRelic(s: GameState, x: number, y: number) {
  const ex = s.expedition;
  if (!ex) return null;
  const left = RELIC_IDS.filter((id) => !(ex.relics ?? []).includes(id));
  if (!left.length) {
    addCoins(s, 50, x, y);
    return null;
  }
  const id = left[randInt(s, left.length)];
  ex.relics = [...(ex.relics ?? []), id];
  s.events.push({ type: 'relicFound', relic: id, x, y });
  return id;
}

/** Hearts back to full (camps; waking at a camp). */
export function refillHearts(s: GameState) {
  for (const p of s.players) if (!p.left && p.alive) p.hearts = Math.max(p.hearts ?? 0, p.maxHearts ?? HEARTS);
}
