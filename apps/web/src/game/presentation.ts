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
/** Tick of the last chamber cleared (its banner stays up over the gate's). */
let arcDoneTick = -999;

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
      else if (e.ability === 'forro') sfx.forro();
      else if (e.ability === 'laugh') sfx.laugh();
      else if (e.ability === 'blunderbuss') sfx.blunderbuss();
      else if (e.ability === 'turbo') sfx.turbo();
      else if (e.ability === 'prize') sfx.prize();
      else sfx.bombPlaced();
      break;
    case 'cageOpened':
      sfx.cageOpen();
      hud.set({ banner: { text: 'PRISIONEIRO LIVRE!', key: tick + 2 } });
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
      // Right before the chamber: a hint of what waits; the chamber itself closes the arc.
      if (e.bossNext) hud.set({ banner: { text: 'ALGO DESPERTA NAS PROFUNDEZAS…', key: tick + 11 } });
      else if (e.arcEnd) {
        arcDoneTick = tick;
        hud.set({ banner: { text: 'ARCO CONCLUÍDO!', key: tick + 11 } });
      }
      break;
    case 'gateOpened':
      sfx.go();
      // The chamber's own banner ("arc complete") wins over the gate's.
      if (tick - arcDoneTick > 2) hud.set({ banner: { text: 'PORTÃO ABERTO!', key: tick } });
      break;
    case 'gateClosed':
      sfx.alarm(1);
      break;
    case 'chestOpened':
      sfx.chest(e.rare);
      if (e.rare) hud.set({ banner: { text: 'TESOURO SECRETO!', key: tick + 3 } });
      break;
    case 'secretFound':
      sfx.secret();
      hud.set({ banner: { text: 'PASSAGEM SECRETA!', key: tick + 4 } });
      break;
    case 'keyPicked':
      sfx.keyPick();
      hud.set({ banner: { text: 'CHAVE NA MÃO! LEVE ATÉ O PORTÃO', key: tick + 5 } });
      break;
    case 'keyDropped':
      sfx.keyDrop();
      break;
    case 'sparkAlert':
      sfx.sparkAlert();
      break;
    case 'enemyHurt':
      sfx.rootHit();
      break;
    case 'eliteSplit':
      sfx.crack();
      break;
    case 'mimicAwoke':
      sfx.laugh();
      sfx.rumble();
      hud.set({ banner: { text: 'É UM BAÚ MIMÉTICO!', key: tick + 12 } });
      break;
    case 'mimicBite':
      sfx.kick();
      break;
    case 'mimicCrouch':
      sfx.sparkAlert();
      break;
    case 'mimicLand':
      sfx.rumble();
      break;
    case 'mimicSwallow':
      sfx.clink();
      break;
    case 'mimicSpit':
      sfx.kick();
      break;
    case 'mimicDefeated':
      sfx.secret();
      hud.set({ banner: { text: 'MÍMICO VENCIDO! BAÚ DUPLO!', key: tick + 13 } });
      break;
    case 'bridgeCracking':
      sfx.creak();
      break;
    case 'bridgeFell':
      sfx.lavaSplash();
      break;
    case 'playerFell':
      sfx.lavaSplash();
      break;
    case 'sankInLava':
      sfx.hiss();
      break;
    case 'geyserWarn':
      sfx.rumble();
      break;
    case 'geyserErupt':
      sfx.geyser();
      break;
    case 'sealResisted':
      sfx.clink();
      break;
    case 'sealCracked':
      sfx.crack();
      break;
    case 'sealBroken':
      sfx.shatter();
      hud.set({ banner: { text: e.left ? `SELO QUEBRADO! FALTAM ${e.left}` : 'OS SELOS CAÍRAM!', key: tick + 9 } });
      break;
    case 'rootHit':
      sfx.rootHit();
      break;
    case 'rootPurified':
      sfx.purify();
      if (e.chamber) {
        if (e.left) hud.set({ banner: { text: `RAIZ ARRANCADA! FALTAM ${e.left}`, key: tick + 10 } });
      } else hud.set({ banner: { text: e.left ? `RAIZ PURIFICADA! FALTAM ${e.left}` : 'O BOSQUE FOI CURADO!', key: tick + 10 } });
      break;
    case 'brambleRegrow':
      sfx.rustle();
      break;
    case 'grassIgnited':
      sfx.ignite();
      break;
    case 'leverPulled':
      sfx.lever();
      hud.set({ banner: { text: 'A PONTE LEVADIÇA BAIXOU!', key: tick + 8 } });
      break;
    case 'brazierLit':
      sfx.brazier();
      if (e.lit < e.goal) hud.set({ banner: { text: `BRASEIRO ${e.lit}/${e.goal}`, key: tick + 6 } });
      break;
    case 'missionDone':
      sfx.missionDone();
      hud.set({ banner: { text: 'TESOURO REVELADO!', key: tick + 7 } });
      break;
    case 'keyDelivered':
      sfx.unlockGate();
      break;
    case 'playerRevived':
      sfx.pickup();
      hud.set({ banner: { text: 'ALIADOS DE VOLTA!', key: tick + 1 } });
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
    case 'bossPhase':
      // Phase 1 already says "enraged"; the final phase gets its own warning.
      if (e.last) {
        sfx.alarm(3);
        hud.set({ banner: { text: 'ÚLTIMO FÔLEGO!', key: tick + 3 } });
      }
      break;
    case 'bossBlocked':
      sfx.kick();
      break;
    case 'bossPlate':
      sfx.crack();
      sfx.kick();
      break;
    case 'bossArmor':
      sfx.clink();
      break;
    case 'bossCore':
      sfx.alarm(1);
      hud.set({ banner: { text: 'NÚCLEO EXPOSTO! ATAQUE!', key: tick + 4 } });
      break;
    case 'bossLeap':
      sfx.rumble();
      break;
    case 'bossRegen':
      sfx.rustle();
      break;
    case 'bossUprooted':
      sfx.rumble();
      sfx.alarm(2);
      hud.set({ banner: { text: 'ELE SE SOLTOU DO CHÃO!', key: tick + 6 } });
      break;
    case 'bramblesWithered':
      sfx.rustle();
      break;
    case 'lavaRising':
      sfx.alarm(2);
      hud.set({ banner: { text: 'A LAVA ESTÁ SUBINDO! SAIA DAS BORDAS!', key: tick + 5 } });
      break;
    case 'lavaRose':
      sfx.lavaSplash();
      break;
    case 'lavaCooled':
      sfx.hiss();
      break;
    case 'totemRevive':
      sfx.pickup();
      hud.set({ banner: { text: 'O TOTEM TROUXE UM ALIADO DE VOLTA!', key: tick + 2 } });
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
  const r = adv.regions.find((x) => x.id === rid) ?? adv.regions[0];
  const closingIn = adv.closing ? Math.max(0, Math.ceil((adv.closing.atTick - s.tick) / 60)) : null;
  return {
    regionName: r.name,
    chapter: r.chapter,
    index: r.id + 1,
    depth: adv.depth + 1,
    objective: r.objective.kind,
    progress: r.objective.kind === 'clear' ? s.enemies.filter((e) => e.alive && e.regionId === r.id && e.kind !== 'mimic').length : r.objective.progress,
    goal: r.objective.goal,
    keyCarried: adv.props.some((p) => p.kind === 'key' && p.region === r.id && p.state === 'carried'),
    braziers: (() => {
      const all = adv.props.filter((p) => p.kind === 'brazier' && p.region === r.id);
      return all.length ? { lit: all.filter((p) => p.state === 'lit').length, goal: all.length } : null;
    })(),
    gateOpen: r.cleared,
    closingIn,
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
    ...(b.regionId !== undefined ? { arc: (s.adventure?.regions.find((r) => r.id === b.regionId)?.arc ?? 0) + 1, level: b.level ?? 0 } : {}),
    ...(b.rooted ? { roots: s.adventure?.props.filter((p) => p.kind === 'root' && p.region === b.regionId && p.state === 'intact').length ?? 0 } : {}),
    ...(b.plates !== undefined ? { plates: [1, 2, 4, 8].filter((m) => b.plates! & m).length, core: b.action === 'stunned' } : {}),
  };
}
