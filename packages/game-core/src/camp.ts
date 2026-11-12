import { CAMP_ACTIONS, CHARACTER_IDS, POWERUPS, RESIDENT_OF, STARTER_CHARACTERS, type CampActionDef, type CharacterId, type PowerupType } from '@4walls/shared';
import { applyPowerup } from './combat';
import { arcInfo, arcOfRegion, becomeHero, regionAt } from './adventure';
import { nextRandom, pickWeighted, randInt } from './rng';
import type { GameState, PlayerState } from './types';
import { grantRelic } from './expedition';

const RARE: PowerupType[] = ['shield', 'kick', 'remote', 'glove', 'ghost', 'boots', 'infernal', 'ice'];

/** Prices grow a little with every camp lit (the purse grows faster the deeper you go). */
export const campPrice = (s: GameState, a: CampActionDef) => Math.round(a.price * (1 + 0.15 * Math.max(0, (s.expedition?.camps ?? 1) - 1)));

/** Heroes living at the camps: rescued by the group (accounts and this expedition). */
export function residents(s: GameState): string[] {
  return s.expedition?.residents ?? [];
}

/** The camp the player stands in, with its fire lit (services are open there only). */
function campOf(s: GameState, p: PlayerState) {
  const ex = s.expedition;
  if (!ex || ex.ended || !s.adventure || !p.alive) return null;
  const rid = regionAt(s, p.x, p.y);
  const reg = s.adventure.regions.find((r) => r.id === rid);
  if (!reg || reg.objective.kind !== 'camp') return null;
  if (!s.adventure.props.some((q) => q.kind === 'campfire' && q.region === rid && q.state === 'lit')) return null;
  return reg;
}

/** Can this player use this camp action now? (`reason` is shown on the button when not.) */
export function campActionState(s: GameState, p: PlayerState, a: CampActionDef): { ok: boolean; price: number; reason?: string } {
  const price = campPrice(s, a);
  const ex = s.expedition;
  const reg = campOf(s, p);
  if (!ex || !reg) return { ok: false, price, reason: 'Só na fogueira acesa' };
  if (a.service === 'hero') {
    const id = a.id.slice(5);
    if (id === p.characterId) return { ok: false, price, reason: 'Em uso' };
    const free = (STARTER_CHARACTERS as string[]).includes(id) || residents(s).includes(id);
    return free ? { ok: true, price } : { ok: false, price, reason: 'Resgate para liberar' };
  }
  if (!residents(s).includes(RESIDENT_OF[a.service])) return { ok: false, price, reason: 'Tenda fechada' };
  const used = ex.used ?? [];
  const mine = (k: string) => used.includes(`${reg.id}:${p.slot}:${k}`);
  const group = (k: string) => used.includes(`${reg.id}:g:${k}`);
  if (a.service === 'smith' && mine('smith')) return { ok: false, price, reason: 'Já forjou aqui' };
  if (a.service === 'cook' && mine('cook')) return { ok: false, price, reason: 'Já comeu aqui' };
  if (a.service === 'wheel' && mine('wheel')) return { ok: false, price, reason: 'Já girou aqui' };
  if (a.service === 'scout' && (group('scout') || (ex.scoutTo ?? -1) > reg.id)) return { ok: false, price, reason: 'Arco já reconhecido' };
  if (a.service === 'contract' && (group('contract') || ex.contract)) return { ok: false, price, reason: ex.contract ? 'Já há um contrato' : 'Já escolhido aqui' };
  if (a.id === 'shop:feather' && (p.feather ?? 0) >= 2) return { ok: false, price, reason: 'Máximo 2' };
  if (a.id === 'cook:heart' && (p.hearts ?? 0) > (p.maxHearts ?? 3)) return { ok: false, price, reason: 'Já está cheio' };
  if (ex.coins < price) return { ok: false, price, reason: 'Moedas insuficientes' };
  return { ok: true, price };
}

/** Region id of the camp that opens the next arc. */
function nextCamp(s: GameState, region: number) {
  const { arc } = arcOfRegion(s.config.seed, region);
  return arcInfo(s.config.seed, arc.index + 1).start;
}

/** Does it (server-validated in the simulation itself, so local and online share the rules). */
export function tryCampAction(s: GameState, p: PlayerState, index: number) {
  const a = CAMP_ACTIONS[index - 1];
  if (!a) return false;
  const st = campActionState(s, p, a);
  if (!st.ok) return false;
  const ex = s.expedition!;
  const reg = campOf(s, p)!;
  ex.coins -= st.price;
  const mark = (k: string, who: string = String(p.slot)) => {
    ex.used = [...(ex.used ?? []).filter((u) => u.startsWith(`${reg.id}:`)), `${reg.id}:${who}:${k}`];
  };
  const [, what] = a.id.split(':');
  switch (a.service) {
    case 'shop':
      if (what === 'feather') p.feather = (p.feather ?? 0) + 1;
      else applyPowerup(s, p, what as PowerupType);
      break;
    case 'smith':
      if (what === 'bomb') p.maxBombs += 1;
      else p.range += 1;
      mark('smith');
      break;
    case 'cook':
      if (what === 'shield') p.shield = Math.max(p.shield, 1);
      else if (what === 'speed') applyPowerup(s, p, 'speedUp');
      else p.hearts = Math.min((p.maxHearts ?? 3) + 1, (p.hearts ?? 0) + 1);
      mark('cook');
      break;
    case 'scout':
      ex.scoutTo = nextCamp(s, reg.id);
      mark('scout', 'g');
      break;
    case 'contract': {
      const until = nextCamp(s, reg.id);
      const k = 1 + 0.2 * Math.max(0, ex.camps - 1);
      const kind = what as 'gold' | 'chests' | 'clean';
      const base = kind === 'gold' ? 90 : kind === 'chests' ? 60 : 100;
      ex.contract = { kind, progress: 0, goal: kind === 'chests' ? 3 : 1, reward: Math.round(base * k), until };
      mark('contract', 'g');
      break;
    }
    case 'wheel': {
      mark('wheel');
      const roll = nextRandom(s);
      if (roll < 0.08 && grantRelic(s, p.x, p.y)) {
        s.events.push({ type: 'wheelSpun', playerId: p.id, result: 'rare' });
      } else if (roll < 0.45) {
        const pu = RARE[randInt(s, RARE.length)];
        applyPowerup(s, p, pu);
        s.events.push({ type: 'wheelSpun', playerId: p.id, result: 'rare', powerup: pu });
      } else if (roll < 0.62) {
        p.feather = (p.feather ?? 0) + 1;
        s.events.push({ type: 'wheelSpun', playerId: p.id, result: 'feather' });
      } else if (roll < 0.85) {
        ex.coins += st.price * 2;
        s.events.push({ type: 'wheelSpun', playerId: p.id, result: 'coins' });
      } else s.events.push({ type: 'wheelSpun', playerId: p.id, result: 'nothing' });
      void pickWeighted;
      void POWERUPS;
      break;
    }
    case 'hero':
      becomeHero(s, p, what as CharacterId);
      break;
  }
  s.events.push({ type: 'campBought', playerId: p.id, action: a.id, price: st.price });
  return true;
}

/** A hero joins the camps (rescued in a cage, or already rescued by someone in the group). */
export function addResident(s: GameState, id: string) {
  const ex = s.expedition;
  if (!ex || !(CHARACTER_IDS as string[]).includes(id) || (STARTER_CHARACTERS as string[]).includes(id)) return;
  ex.residents = ex.residents ?? [];
  if (ex.residents.includes(id)) return;
  ex.residents.push(id);
  s.events.push({ type: 'residentArrived', characterId: id });
}
