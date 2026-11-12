import { useEffect, useRef, useState } from 'react';
import { Cell } from '@4walls/shared';
import { getCell, regionById, type GameState } from '@4walls/core';
import type { MatchView } from '../game/presentation';
import { isTouchDevice } from '../input/InputManager';

/**
 * Contextual Adventure tips. Each one shows once per device, at the moment it matters (first bomb,
 * first Fagulha, first secret wall…), worded for the controls in hand. Never blocks the game.
 */
type HintId = 'bomb' | 'escape' | 'powerup' | 'cage' | 'cracked' | 'key' | 'spark' | 'brazier' | 'vent' | 'map' | 'river' | 'fragile' | 'geyser' | 'lever' | 'seal' | 'root' | 'grass' | 'chasm' | 'boss' | 'totem' | 'plates' | 'core' | 'anchors' | 'elite' | 'mimic' | 'motes' | 'night' | 'mist' | 'medals' | 'camp' | 'campShop' | 'hearts' | 'relic';

const KEY = '4walls.hints';
const seenSet = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
};
const markSeen = (id: HintId) => {
  try {
    const s = seenSet();
    s.add(id);
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* private mode: tips may repeat next time */
  }
};

const gamepad = () => Array.from(navigator.getGamepads?.() ?? []).some(Boolean);

function text(id: HintId, touch: boolean): { icon: string; body: string } {
  const bomb = touch ? 'toque no botão A' : gamepad() ? 'aperte A' : 'aperte Espaço';
  switch (id) {
    case 'bomb':
      return { icon: '💣', body: `Ponha uma bomba: ${bomb}. Ela explode os blocos e os Magmitos.` };
    case 'escape':
      return { icon: '✚', body: 'Saia de perto! A explosão vai em cruz pelas 4 direções.' };
    case 'powerup':
      return { icon: '⭐', body: 'Um power-up caiu do bloco: passe por cima para pegar!' };
    case 'cage':
      return { icon: '⛓️', body: 'Um prisioneiro! Exploda a cela e encoste nele para resgatar um herói.' };
    case 'cracked':
      return { icon: '🧱', body: 'Muro rachado brilhando… uma explosão do lado revela um segredo.' };
    case 'key':
      return { icon: '🔑', body: 'Esta região pede a chave: ache-a e leve até o cadeado do portão.' };
    case 'spark':
      return { icon: '⚡', body: 'Fagulha! Quando ela brilha, vai investir em linha reta: saia da mira!' };
    case 'brazier':
      return { icon: '🔥', body: 'Braseiro apagado: acenda os 3 com explosões ao lado e ganhe um tesouro.' };
    case 'vent':
      return { icon: '🌫️', body: 'Respiro de cinza: a nuvem esconde o chão e as bombas. Cuidado!' };
    case 'river':
      return { icon: '🌋', body: `Rio de lava! Atravesse pela ponte frágil, pela plataforma ou ${touch ? 'pule 1 casa (Y)' : 'pule 1 casa'}. Cair é fatal.` };
    case 'fragile':
      return { icon: '🪵', body: 'Ponte frágil: ela range e desaba em 1 segundo. Atravesse sem parar!' };
    case 'geyser':
      return { icon: '♨️', body: 'Gêiser: quando borbulhar em vermelho, saia de cima!' };
    case 'lever':
      return { icon: '⚙️', body: 'Exploda ao lado da alavanca para baixar a ponte levadiça e abrir o portão.' };
    case 'seal':
      return { icon: '💠', body: 'Selo de Obsidiana: uma bomba sozinha não faz nada. Encoste 2 bombas para explodirem em cadeia!' };
    case 'root':
      return { icon: '🌿', body: 'Raiz corrompida: 3 explosões a curam. Enquanto viver, os espinheiros voltam a crescer.' };
    case 'grass':
      return { icon: '🔥', body: 'Capim seco pega fogo e o fogo se espalha. Não fique em cima!' };
    case 'chasm':
      return { icon: '🕳️', body: 'Abismo! Cair é fatal. Dá para pular 1 casa por cima.' };
    case 'boss':
      return { icon: '☠️', body: 'O guardião do arco! Saia das casas marcadas no chão e acerte o corpo dele com explosões.' };
    case 'camp':
      return { icon: '🔥', body: 'Acampamento! Reúnam-se na fogueira: ela salva a expedição e enche os corações.' };
    case 'campShop':
      return { icon: '🏕️', body: 'Abra 🏕️ Acampamento para comprar com os moradores. Guarde moedas no cofre: se o grupo cair, perde metade do que carrega.' };
    case 'hearts':
      return { icon: '❤️', body: 'Na Aventura cada herói tem 3 corações. Um golpe tira um; a fogueira enche todos.' };
    case 'relic':
      return { icon: '🏺', body: 'Uma relíquia! Ela vale até o fim da expedição e fica para sempre no seu códice (Perfil).' };
    case 'motes':
      return { icon: '🟣', body: 'Chefe corrompido: motas violetas caçam você. Uma explosão as desfaz, e ele ganha uma fase a mais.' };
    case 'night':
      return { icon: '🌙', body: 'Chefe da noite: só dá para vê-lo pela própria luz. Fique de olho nas casas marcadas no chão!' };
    case 'mist':
      return { icon: '☁️', body: 'Chefe da névoa: de tempos em tempos caem golpes da neblina. Saia das marcas vermelhas!' };
    case 'medals':
      return { icon: '🥇', body: 'Medalhas: vença sem ninguém cair, dentro do tempo e com todos de pé para ganhar o ouro (e mais prêmios).' };
    case 'elite':
      return { icon: '👑', body: 'Inimigo de elite (de coroa)! O Magmito grande aguenta 3 explosões e a Fagulha grande se divide em duas.' };
    case 'mimic':
      return { icon: '🧰', body: 'Era um Baú Mimético! Ele pula em você e engole bombas para cuspir de volta. Vença e ganhe um baú duplo.' };
    case 'anchors':
      return { icon: '🌿', body: 'O Guardião está preso por 3 raízes e se cura enquanto uma viver. Exploda ao lado delas para soltá-lo!' };
    case 'plates':
      return { icon: '🛡️', body: 'Placas de pedra protegem o Golem: cada explosão quebra a placa daquele lado. Lado sem placa sofre dano!' };
    case 'core':
      return { icon: '🔥', body: 'Ele trombou na parede: o núcleo está aberto! Agora cada acerto vale dobrado.' };
    case 'totem':
      return { icon: '🗿', body: 'Um aliado caiu! Exploda ao lado de um Totem do Retorno (brilho verde) para trazê-lo de volta.' };
    case 'map':
      return { icon: '🗺️', body: touch ? 'Toque em 🗺️ (no canto) para ver o mapa da jornada.' : 'Aperte M para ver o mapa da jornada.' };
  }
}

const near = (s: GameState, me: { x: number; y: number }, pred: (x: number, y: number) => boolean, r: number) => {
  const px = Math.round(me.x);
  const py = Math.round(me.y);
  for (let y = py - r; y <= py + r; y++) for (let x = px - r; x <= px + r; x++) if (Math.abs(x - px) + Math.abs(y - py) <= r && pred(x, y)) return true;
  return false;
};

export function TutorialHints({ controller }: { controller: MatchView }) {
  const [touch] = useState(isTouchDevice);
  const [hint, setHint] = useState<{ id: HintId; key: number } | null>(null);
  const queue = useRef<HintId[]>([]);
  const seen = useRef(seenSet());

  useEffect(() => {
    let seq = 1;
    const want = (id: HintId) => {
      if (seen.current.has(id) || queue.current.includes(id)) return;
      seen.current.add(id);
      markSeen(id);
      queue.current.push(id);
    };
    const isMine = (id: string) => (controller.isLocal ? controller.isLocal(id) : true);
    const off = controller.on((e, s) => {
      if (e.type === 'bombPlaced' && isMine(e.ownerId)) {
        // The bomb tip did its job: drop it and teach running away instead.
        queue.current = queue.current.filter((h) => h !== 'bomb');
        setHint((h) => (h?.id === 'bomb' ? null : h));
        want('escape');
      } else if (e.type === 'powerupSpawned') want('powerup');
      else if (e.type === 'sparkAlert') want('spark');
      else if (e.type === 'mimicAwoke') want('mimic');
      else if (e.type === 'heartLost' && isMine(e.playerId)) want('hearts');
      else if (e.type === 'relicFound') want('relic');
      else if (e.type === 'campLit' && !e.again) want('campShop');
      else if (e.type === 'regionEntered' && regionById(s, e.region)?.objective.kind === 'camp') want('camp');
      else if (e.type === 'regionEntered') {
        if (regionById(s, e.region)?.objective.kind === 'key') want('key');
        if (e.region >= 2) want('map');
      }
    });
    const timer = window.setInterval(() => {
      const s = controller.state;
      const adv = s.adventure;
      if (!adv || s.phase !== 'playing') return;
      const me = s.players.find((p) => p.alive && isMine(p.id));
      if (!me) return;
      if (adv.depth === 0) want('bomb');
      if (adv.cages.some((c) => c.state === 'locked' && Math.abs(c.x - me.x) + Math.abs(c.y - me.y) <= 4)) want('cage');
      if (near(s, me, (x, y) => getCell(s.grid, x, y) === Cell.Cracked, 3)) want('cracked');
      if (adv.props.some((p) => p.kind === 'brazier' && p.state === 'unlit' && Math.abs(p.x - me.x) + Math.abs(p.y - me.y) <= 3)) want('brazier');
      if (adv.props.some((p) => p.kind === 'vent' && Math.abs(p.x - me.x) + Math.abs(p.y - me.y) <= 3)) want('vent');
      if (near(s, me, (x, y) => getCell(s.grid, x, y) === Cell.Lava, 3)) want('river');
      if (adv.props.some((p) => p.kind === 'geyser' && Math.abs(p.x - me.x) + Math.abs(p.y - me.y) <= 3)) want('geyser');
      if (adv.props.some((p) => p.kind === 'seal' && p.state === 'intact' && Math.abs(p.x - me.x) + Math.abs(p.y - me.y) <= 4)) want('seal');
      if (adv.props.some((p) => p.kind === 'root' && p.state === 'intact' && Math.abs(p.x - me.x) + Math.abs(p.y - me.y) <= 4)) want('root');
      if (adv.props.some((p) => p.kind === 'grass' && p.state === 'dry' && Math.abs(p.x - me.x) + Math.abs(p.y - me.y) <= 2)) want('grass');
      if (near(s, me, (x, y) => getCell(s.grid, x, y) === Cell.Chasm, 2)) want('chasm');
      if (s.enemies.some((e) => e.alive && e.elite && Math.abs(e.x - me.x) + Math.abs(e.y - me.y) <= 6)) want('elite');
      if (s.boss && s.boss.regionId !== undefined && s.boss.action !== 'dead') {
        want('boss');
        if (s.boss.plates !== undefined) want('plates');
        if (s.boss.rooted) want('anchors');
        if (s.boss.mod === 'corrupted') want('motes');
        if (s.boss.mod === 'night') want('night');
        if (s.boss.mod === 'mist') want('mist');
        want('medals');
        if (s.boss.plates !== undefined && s.boss.action === 'stunned') want('core');
        if (s.players.some((p) => !p.alive && !p.left) && adv.props.some((p) => p.kind === 'totem' && p.state === 'idle')) want('totem');
      }
      if (adv.props.some((p) => p.kind === 'lever' && p.state === 'off' && Math.abs(p.x - me.x) + Math.abs(p.y - me.y) <= 4)) want('lever');
      if (adv.props.some((p) => p.kind === 'bridge' && p.state === 'cracking' && Math.abs(p.x - me.x) + Math.abs(p.y - me.y) <= 1)) want('fragile');
      // Show the next tip when the current one is done.
      setHint((h) => {
        if (h || !queue.current.length) return h;
        return { id: queue.current.shift()!, key: seq++ };
      });
    }, 300);
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, [controller]);

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(null), hint.id === 'bomb' ? 8000 : 5200);
    return () => window.clearTimeout(t);
  }, [hint]);

  if (!hint) return null;
  const { icon, body } = text(hint.id, touch);
  return (
    <div key={hint.key} className="tutorial-hint pointer-events-none absolute inset-x-0 bottom-[20%] z-40 flex justify-center px-24 [@media(max-height:500px)]:bottom-[24%]" data-testid="tutorial-hint">
      <div className="hud-panel flex max-w-md items-center gap-2 px-3 py-2 text-sm font-bold leading-snug text-amber-50 [@media(max-height:500px)]:text-xs">
        <span className="text-2xl [@media(max-height:500px)]:text-xl" aria-hidden>
          {icon}
        </span>
        <span>{body}</span>
      </div>
    </div>
  );
}
