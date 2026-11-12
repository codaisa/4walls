import type { PlayerSnap } from '@4walls/shared';
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
  });
}

/** Coins into the group's purse (Adventure only). */
export function addCoins(s: GameState, amount: number, x: number, y: number) {
  const ex = s.expedition;
  if (!ex || amount <= 0 || ex.ended) return;
  ex.coins += Math.round(amount);
  s.events.push({ type: 'coins', amount: Math.round(amount), total: ex.coins, x, y });
}
