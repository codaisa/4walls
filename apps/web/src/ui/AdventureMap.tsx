import { useEffect, useRef, useState } from 'react';
import { Cell, SLOT_COLORS, type BiomeId } from '@4walls/shared';
import { cellIndex, getCell, type GameState } from '@4walls/core';
import { sfx } from '../audio/Sfx';
import type { MatchView } from '../game/presentation';
import { isTouchDevice } from '../input/InputManager';

const FLOOR: Record<BiomeId, string> = { volcanic: '#8a5e4c', transition: '#7a7c5c', forest: '#5f9142' };
const BLOCK: Record<BiomeId, string> = { volcanic: '#5c3b30', transition: '#545640', forest: '#3f6530' };
const BIOME_ICON: Record<BiomeId, string> = { volcanic: '🌋', transition: '🌫️', forest: '🌳' };

/**
 * Draws the live Adventure window: explored cells by biome, locked regions as silhouettes, gates,
 * chests, cages, the key and the players. Secrets stay secret: cracked walls look like walls.
 */
function drawMap(ctx: CanvasRenderingContext2D, s: GameState, W: number, H: number, localIds: (id: string) => boolean, big: boolean) {
  const adv = s.adventure;
  ctx.clearRect(0, 0, W, H);
  if (!adv) return;
  const g = s.grid;
  const cell = Math.max(2, Math.floor(Math.min(W / g.w, H / g.h)));
  const offX = Math.floor((W - cell * g.w) / 2);
  const offY = Math.floor((H - cell * g.h) / 2);
  const px = (x: number) => offX + (x - g.x0) * cell;
  const py = (y: number) => offY + (y - g.y0) * cell;
  const regionOf = (x: number, y: number) => adv.regionOf[cellIndex(g, x, y)];
  for (let y = g.y0; y < g.y0 + g.h; y++)
    for (let x = g.x0; x < g.x0 + g.w; x++) {
      const rid = regionOf(x, y);
      const reg = adv.regions.find((r) => r.id === rid);
      if (!reg) continue;
      const c = getCell(g, x, y);
      if (c === Cell.Wall || c === Cell.Cracked) continue;
      if (c === Cell.Lava) {
        ctx.fillStyle = reg.unlocked ? '#d9481f' : 'rgba(255,90,30,0.25)';
        ctx.fillRect(px(x), py(y), cell, cell);
        continue;
      }
      if (!reg.unlocked) {
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(px(x), py(y), cell, cell);
        continue;
      }
      const seen = adv.explored[cellIndex(g, x, y)] === 1;
      ctx.fillStyle = !seen ? 'rgba(255,255,255,0.12)' : c === Cell.Block ? BLOCK[reg.biome] : FLOOR[reg.biome];
      ctx.fillRect(px(x), py(y), cell - (big ? 1 : 0), cell - (big ? 1 : 0));
    }
  const seenAt = (x: number, y: number) => adv.explored[cellIndex(g, x, y)] === 1;
  // Locked regions: a big "?" on the silhouette.
  for (const r of adv.regions.filter((q) => !q.unlocked)) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `900 ${cell * 6}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', px(r.cx * adv.chunkW + 8), py(r.cy * adv.chunkH + 7));
  }
  const dot = (x: number, y: number, r: number, fill: string, stroke?: string) => {
    ctx.beginPath();
    ctx.arc(px(x) + cell / 2, py(y) + cell / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = Math.max(1, cell / 5);
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  };
  for (const gt of adv.gates) {
    ctx.fillStyle = gt.kind === 'back' ? '#6b6470' : gt.open ? '#c4a5ff' : '#ff5a3c';
    ctx.fillRect(px(gt.x) - cell * 0.25, py(gt.y) - cell * 0.25, cell * 1.5, cell * 1.5);
  }
  for (const p of adv.props) {
    if (p.kind === 'chest' && p.state === 'closed' && seenAt(p.x, p.y)) {
      ctx.fillStyle = p.rare ? '#ffd23f' : '#c98a3c';
      ctx.fillRect(px(p.x) + cell * 0.1, py(p.y) + cell * 0.2, cell * 0.8, cell * 0.6);
    }
    if (p.kind === 'key' && p.state !== 'used') dot(p.x, p.y, Math.max(2, cell * 0.55), '#ffd23f', '#fff4c2');
    if (p.kind === 'brazier' && seenAt(p.x, p.y)) dot(p.x, p.y, Math.max(2, cell * 0.45), p.state === 'lit' ? '#ff8a2a' : '#5a3a2a', '#ffb070');
  }
  for (const c of adv.cages) if (c.state !== 'rescued' && seenAt(c.x, c.y)) dot(c.x, c.y, Math.max(2, cell * 0.5), '#7fd6ff', '#0b2a44');
  for (const p of s.players) {
    if (!p.alive) continue;
    const col = SLOT_COLORS[p.colorIndex % SLOT_COLORS.length].primary;
    dot(p.x, p.y, Math.max(2.5, cell * (localIds(p.id) ? 0.9 : 0.7)), col, '#ffffff');
  }
}

/**
 * Adventure map. Computer: a minimap in the corner (click it or press M / Select for the big map).
 * Phone: a 🗺️ button under the pause button opens the journey map. Never pauses the game.
 */
export function AdventureMap({ controller }: { controller: MatchView }) {
  const [open, setOpen] = useState(false);
  const [touch] = useState(isTouchDevice);
  const mini = useRef<HTMLCanvasElement>(null);
  const full = useRef<HTMLCanvasElement>(null);
  const toggle = () => {
    sfx.ui();
    setOpen((o) => !o);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') toggle();
      else if (e.code === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    let selectWas = false;
    const isLocal = (id: string) => (controller.isLocal ? controller.isLocal(id) : true);
    const timer = window.setInterval(() => {
      // Gamepad Select / Back toggles the map.
      const pads = navigator.getGamepads?.() ?? [];
      const sel = Array.from(pads).some((p) => p?.buttons[8]?.pressed);
      if (sel && !selectWas) toggle();
      selectWas = sel;
      const s = controller.state;
      for (const [c, big] of [
        [mini.current, false],
        [full.current, true],
      ] as const) {
        if (!c) continue;
        const ctx = c.getContext('2d');
        if (ctx) drawMap(ctx, s, c.width, c.height, isLocal, big);
      }
    }, 150);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, open]);

  const journey = controller.state.adventure?.journey ?? [];
  return (
    <>
      {touch ? (
        <button
          className="pointer-events-auto absolute right-0 top-14 z-30 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/60 bg-black/45 text-lg"
          onClick={toggle}
          aria-label="Mapa"
          data-testid="map-button"
        >
          🗺️
        </button>
      ) : (
        <button className="hud-panel pointer-events-auto absolute bottom-0 right-0 z-30 overflow-hidden p-1" onClick={toggle} aria-label="Abrir mapa (M)" title="Mapa (M)" data-testid="minimap">
          <canvas ref={mini} width={180} height={120} className="block" />
          <span className="absolute bottom-1 right-2 text-[10px] font-bold text-white/60">M</span>
        </button>
      )}
      {open && (
        <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onClick={toggle} data-testid="journey-map">
          <div className="hud-panel flex max-h-full w-full max-w-4xl flex-col gap-2 px-4 py-3 [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:gap-3 [@media(max-height:500px)]:py-2">
            <canvas ref={full} width={760} height={420} className="min-h-0 w-full flex-1 rounded-lg bg-black/40 object-contain [@media(max-height:500px)]:h-[calc(100dvh-5rem)] [@media(max-height:500px)]:w-auto" />
            <div className="flex min-w-0 flex-col gap-1 [@media(max-height:500px)]:w-48">
              <div className="font-display text-xl text-amber-100">Mapa da jornada</div>
              <div className="text-[11px] text-white/60">🟣 portão aberto · 🔴 fechado · 🟡 chave/baú · 🔵 cela</div>
              <ol className="mt-1 flex flex-wrap gap-1 overflow-y-auto text-xs [@media(max-height:500px)]:flex-col [@media(max-height:500px)]:flex-nowrap">
                {journey.map((j, i) => (
                  <li key={j.id} className={`rounded-full px-2 py-0.5 font-bold ${i === journey.length - 1 ? 'bg-amber-300 text-amber-950' : 'bg-white/10 text-white/80'}`}>
                    {BIOME_ICON[j.biome]} {j.id + 1}. {j.name}
                  </li>
                ))}
              </ol>
              <div className="mt-auto text-[11px] text-white/50">{touch ? 'Toque para fechar' : 'M, Select ou clique para fechar'}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
