import { CHARACTERS, RULES, secToTicks, type CharacterId, type PowerupType } from '@4walls/shared';
import type { GameState, PlayerState } from './types';
import { enemyDown, harmless } from './enemies';
import { cellOf, flamesAt, isEvading, isFrozen } from './world';

/**
 * Applies one lethal hit to a player. Shields absorb the hit and grant invulnerability so the same
 * explosion (or a lingering flame) can never deal damage twice.
 */
export function hitPlayer(s: GameState, p: PlayerState, byId: string | null): void {
  if (!p.alive || s.tick < p.invulnUntil || isEvading(s, p)) return;
  if (p.shield > 0) {
    p.shield--;
    p.invulnUntil = s.tick + secToTicks(RULES.invulnSec);
    s.events.push({ type: 'shieldBroken', playerId: p.id });
    return;
  }
  // A4: in the Adventure a hit takes a heart; only the last one is a fall.
  if (s.adventure && (p.hearts ?? 0) > 1) {
    p.hearts = (p.hearts ?? 2) - 1;
    p.invulnUntil = s.tick + secToTicks(2);
    s.events.push({ type: 'heartLost', playerId: p.id, hearts: p.hearts, x: p.x, y: p.y });
    return;
  }
  // A3: a Feather of Return spends itself instead of the player.
  if ((p.feather ?? 0) > 0) {
    p.feather = (p.feather ?? 1) - 1;
    p.invulnUntil = s.tick + secToTicks(2);
    s.events.push({ type: 'featherSaved', playerId: p.id, x: p.x, y: p.y });
    return;
  }
  p.alive = false;
  if (p.hearts !== undefined) p.hearts = 0;
  p.diedTick = s.tick;
  p.moving = false;
  p.passBombs = [];
  const killer = byId ? s.players.find((k) => k.id === byId) : undefined;
  if (killer && killer.id !== p.id) killer.kills++;
  s.events.push({ type: 'playerDied', playerId: p.id, byId, x: p.x, y: p.y });
}

/** Ice blasts don't kill: they freeze (shields don't help, invulnerability does). */
export function freezePlayer(s: GameState, p: PlayerState) {
  if (!p.alive || s.tick < p.invulnUntil || isEvading(s, p) || isFrozen(s, p)) return;
  p.frozenUntil = s.tick + secToTicks(RULES.freezeSec);
  p.slideDir = null;
  s.events.push({ type: 'playerFrozen', playerId: p.id, x: p.x, y: p.y });
}

export function applyDamage(s: GameState) {
  for (const p of s.players) {
    if (!p.alive) continue;
    const fs = flamesAt(s, cellOf(p.x), cellOf(p.y));
    if (!fs.length) continue;
    const lethal = fs.find((f) => f.kind !== 'ice');
    if (lethal) hitPlayer(s, p, lethal.ownerId === 'meteor' ? null : lethal.ownerId);
    else freezePlayer(s, p);
  }
  for (const e of s.enemies) {
    if (!e.alive) continue;
    // A Mimic in mid-leap is out of reach (and can't bite).
    if (e.mode === 'leap') continue;
    const fs = flamesAt(s, cellOf(e.x), cellOf(e.y));
    const lethal = fs.find((f) => f.kind !== 'ice');
    // Elites and the Mimic take several blasts, shrugging one off for a moment after each.
    if (lethal && e.hp !== undefined && e.hp > 1 && s.tick >= (e.hurtUntil ?? 0)) {
      e.hp--;
      e.hurtUntil = s.tick + secToTicks(0.6);
      s.events.push({ type: 'enemyHurt', enemyId: e.id, hp: e.hp, x: e.x, y: e.y });
    } else if (lethal && s.tick >= (e.hurtUntil ?? 0)) {
      e.alive = false;
      e.diedTick = s.tick;
      const owner = s.players.find((p) => p.id === lethal.ownerId);
      if (owner) owner.kills++;
      s.events.push({ type: 'enemyDied', enemyId: e.id, byId: lethal.ownerId, x: e.x, y: e.y, kind: e.kind, ...(e.elite ? { elite: true } : {}) });
      enemyDown(s, e);
      continue;
    }
    if (!lethal && fs.length && s.tick >= e.frozenUntil) e.frozenUntil = s.tick + secToTicks(RULES.enemyFreezeSec);
    if (s.tick < e.frozenUntil || harmless(e)) continue; // frozen enemies are harmless
    for (const p of s.players) {
      if (p.alive && Math.abs(p.x - e.x) < RULES.enemyContactDist && Math.abs(p.y - e.y) < RULES.enemyContactDist) {
        hitPlayer(s, p, null);
      }
    }
  }
}

export function applyPowerup(s: GameState, p: PlayerState, type: PowerupType) {
  const cap = CHARACTERS[p.characterId as CharacterId]?.maxBombs ?? RULES.maxBombs;
  switch (type) {
    case 'bombUp':
      p.maxBombs = Math.min(cap, p.maxBombs + 1);
      break;
    case 'fireUp':
      p.range = Math.min(RULES.maxRange, p.range + 1);
      break;
    case 'speedUp':
      p.speed = Math.min(RULES.maxSpeed, p.speed + RULES.speedStep);
      p.speedLevel++;
      break;
    case 'shield':
      p.shield = 1;
      break;
    case 'kick':
      p.canKick = true;
      break;
    case 'boots':
      p.hasBoots = true;
      break;
    case 'ghost':
      p.ghostUntil = s.tick + secToTicks(RULES.ghostSec);
      break;
    case 'remote':
      p.hasRemote = true;
      break;
    case 'glove':
      p.canThrow = true;
      break;
    case 'infernal':
      p.special = { kind: 'fire', charges: RULES.specialCharges };
      break;
    case 'ice':
      p.special = { kind: 'ice', charges: RULES.specialCharges };
      break;
  }
}

export function collectPowerups(s: GameState) {
  for (const p of s.players) {
    if (!p.alive) continue;
    const x = cellOf(p.x);
    const y = cellOf(p.y);
    const i = s.powerups.findIndex((pu) => pu.x === x && pu.y === y);
    if (i === -1) continue;
    const [pu] = s.powerups.splice(i, 1);
    applyPowerup(s, p, pu.type);
    s.events.push({ type: 'powerupCollected', id: pu.id, playerId: p.id, powerup: pu.type, x, y });
  }
}
