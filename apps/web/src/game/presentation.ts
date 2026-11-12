import { activeBombCount, regionAt, type GameEvent, type GameState } from '@4walls/core';
import { BOSSES, CHARACTERS, GAME_EVENTS, POWERUPS, secToTicks, type CharacterId } from '@4walls/shared';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
import { sfx } from '../audio/Sfx';
import { useHud, type HudAdventure, type HudBoss, type HudPlayer } from '../store/useHud';

/** What the 3D scene needs from a match, whether simulated locally or mirrored from a server. */
export interface MatchView {
  state: GameState;
  /** 0..1 interpolation between previous and current positions. */
  alpha: number;
  /** Fractional simulation tick, for time-based animations (fuses, flames). */
  readonly tickF: number;
  paused: boolean;
  on(fn: (e: GameEvent, s: GameState) => void): () => void;
  update(dt: number): void;
  /** Per-player interpolation override (locally predicted players in online play). */
  alphaFor?(playerId: string): number;
  /** Players controlled on this device (online); undefined = everyone is local. */
  isLocal?(playerId: string): boolean;
}

export const RESULT_DELAY_MS = 1400;

/** Sound + banner feedback for a gameplay event. Shared by local and online matches. */
export function presentEvent(e: GameEvent, tick: number, onResultShown: () => void): number | null {
  const hud = useHud.getState();
  switch (e.type) {
    case 'countdown':
      sfx.countdown();
      break;
    case 'go':
      sfx.go();
      hud.set({ banner: { text: 'EXPLODA!', key: tick } });
      break;
    case 'bombPlaced':
      sfx.bombPlaced();
      break;
    case 'explosion':
      if (e.kind === 'ice') sfx.iceBlast();
      else sfx.explosion(Math.min(1.4, 0.7 + e.cells.length * 0.05), e.kind === 'fire');
      break;
    case 'playerFrozen':
      sfx.freeze();
      break;
    case 'abilityUsed':
      if (e.ability === 'dash') sfx.dash();
      else if (e.ability === 'mine') sfx.mine();
      else sfx.bombPlaced();
      break;
    case 'bombKicked':
      sfx.kick();
      break;
    case 'mineTriggered':
      sfx.alarm(1);
      break;
    case 'meteorImpact':
      sfx.explosion(0.8);
      break;
    case 'eventWarning':
      sfx.alarm(3);
      hud.set({ banner: { text: `⚠ ${GAME_EVENTS[e.event].name.toUpperCase()}!`, key: tick } });
      break;
    case 'eventStart':
      sfx.go();
      break;
    case 'blockDestroyed':
      sfx.blockBreak();
      break;
    case 'powerupCollected':
      sfx.pickup();
      hud.set({ banner: { text: POWERUPS[e.powerup].name.toUpperCase() + '!', key: tick } });
      break;
    case 'shieldBroken':
      sfx.shield();
      break;
    case 'playerDied':
      sfx.death();
      break;
    case 'enemyDied':
      sfx.enemyDeath();
      break;
    case 'regionCleared':
      sfx.victory();
      break;
    case 'gateOpened':
      sfx.go();
      hud.set({ banner: { text: 'PORTÃO ABERTO!', key: tick } });
      break;
    case 'bossSpawned':
      sfx.alarm(2);
      hud.set({ banner: { text: BOSSES[e.boss].name.toUpperCase() + '!', key: tick } });
      break;
    case 'bossWindup':
      sfx.alarm(1);
      break;
    case 'bossSlam':
      sfx.explosion(1.5);
      break;
    case 'bossRoar':
      sfx.alarm(2);
      hud.set({ banner: { text: 'CHUVA DE LAVA!', key: tick } });
      break;
    case 'bossRoots':
      sfx.explosion(0.9);
      break;
    case 'bossSpores':
      sfx.alarm(2);
      hud.set({ banner: { text: 'ESPOROS!', key: tick } });
      break;
    case 'bossBurrow':
      sfx.kick();
      hud.set({ banner: { text: 'ELE SUMIU NO CHÃO!', key: tick } });
      break;
    case 'bossEmerge':
      sfx.explosion(1.3);
      break;
    case 'bossCharge':
      sfx.dash();
      break;
    case 'bossHit':
      sfx.shield();
      break;
    case 'bossEnraged':
      sfx.alarm(3);
      hud.set({ banner: { text: 'ELE ENFURECEU!', key: tick } });
      break;
    case 'bossDefeated':
      sfx.explosion(1.6, true);
      hud.set({ banner: { text: BOSSES[e.boss].name.toUpperCase() + ' CAIU!', key: tick } });
      break;
    case 'gameOver': {
      const good = e.result.outcome === 'victory' || e.result.outcome === 'winner';
      return window.setTimeout(() => {
        if (good) sfx.victory();
        else sfx.defeat();
        onResultShown();
        useHud.getState().set({ showResult: true });
      }, RESULT_DELAY_MS);
    }
  }
  return null;
}

/** Pushes HUD data to the store only when something visible changed. */
export class HudSync {
  private key = '';
  constructor(private deviceOf: (slot: number) => string) {}

  push(s: GameState, force = false) {
    const players: HudPlayer[] = s.players.map((p) => {
      const ch = CHARACTERS[p.characterId as CharacterId] ?? CHARACTERS.bombito;
      const cd = secToTicks(ch.cooldownSec);
      const charge = Math.round(clamp(1 - (p.abilityReadyTick - s.tick) / cd, 0, 1) * 10) / 10;
      const perks: HudPlayer['perks'] = [];
      if (p.canKick) perks.push('kick');
      if (p.hasBoots) perks.push('boots');
      if (p.hasRemote) perks.push('remote');
      if (s.tick < p.ghostUntil) perks.push('ghost');
      if (p.canThrow) perks.push('glove');
      const moveCd = Math.max(1, secToTicks(0.9));
      const moveCharge = Math.round(clamp(1 - (p.maneuverReadyTick - s.tick) / moveCd, 0, 1) * 5) / 5;
      return {
      id: p.id,
      name: p.name,
      slot: p.slot,
      colorIndex: p.colorIndex,
      device: this.deviceOf(p.slot),
      alive: p.alive,
      bombs: p.maxBombs,
      bombsAvailable: p.maxBombs - activeBombCount(s, p.id),
      range: p.range,
      speedLevel: p.speedLevel,
      shield: p.shield > 0,
      kills: p.kills,
      character: ch.name,
      abilityName: ch.abilityName,
      abilityCharge: charge,
      hasRemoteBombs: s.bombs.some((b) => b.ownerId === p.id && b.remote),
      special: p.special ? { ...p.special } : null,
      perks,
      ghostLeft: Math.max(0, Math.ceil((p.ghostUntil - s.tick) / 60)),
      moveCharge,
      frozen: s.tick < p.frozenUntil,
      };
    });
    const ev = s.event;
    const event = ev
      ? {
          name: GAME_EVENTS[ev.type].name,
          description: GAME_EVENTS[ev.type].description,
          phase: ev.phase,
          secondsLeft: Math.max(0, Math.ceil(((ev.phase === 'warning' ? ev.startTick : ev.endTick) - s.tick) / 60)),
        }
      : null;
    const countdown = s.phase === 'countdown' ? Math.max(1, Math.ceil((s.countdownTicks - (s.tick - s.phaseStartTick)) / 60)) : 0;
    const timeLeft = Math.ceil(s.timeLeftTicks / 60);
    const enemiesAlive = s.enemies.filter((e) => e.alive).length;
    const adventure = adventureInfo(s);
    const boss = bossInfo(s);
    const key = JSON.stringify([s.phase, countdown, timeLeft, players, enemiesAlive, event, adventure, boss]);
    if (!force && key === this.key) return;
    this.key = key;
    useHud.getState().set({ phase: s.phase, countdown, timeLeft, players, enemiesAlive, enemiesTotal: s.enemies.length, result: s.result, event, adventure, boss });
  }
}

/** Adventure progress as seen from the lead (first living) player's region. */
function adventureInfo(s: GameState): HudAdventure | null {
  const adv = s.adventure;
  if (!adv) return null;
  const lead = s.players.find((p) => p.alive) ?? s.players[0];
  let rid = lead ? regionAt(s, lead.x, lead.y) : -1;
  // Corridors/gates belong to no region: keep showing the furthest unlocked one.
  if (rid < 0) rid = Math.max(0, ...adv.regions.filter((r) => r.unlocked).map((r) => r.id));
  const r = adv.regions[rid];
  return {
    regionName: r.name,
    index: rid + 1,
    total: adv.regions.length,
    cleared: adv.regions.filter((x) => x.cleared).length,
    enemiesLeft: s.enemies.filter((e) => e.alive && e.regionId === rid).length,
    gateOpen: r.cleared,
  };
}

/** Boss Rush health bar data (null when no boss is in the arena). */
function bossInfo(s: GameState): HudBoss | null {
  const b = s.boss;
  if (!b) return null;
  const def = BOSSES[b.kind];
  const dead = b.action === 'dead';
  return {
    name: def.name,
    title: def.title,
    hp: b.hp,
    maxHp: b.maxHp,
    enraged: b.enraged,
    index: s.bossesDefeated + (dead ? 0 : 1),
    total: s.bossesDefeated + s.bossQueue.length + (dead ? 0 : 1),
    dead,
  };
}
