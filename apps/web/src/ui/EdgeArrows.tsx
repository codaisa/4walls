import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { regionAt, type GameState } from '@4walls/core';
import { useGame } from '../scene/context';

/**
 * Off-screen goal arrows (Adventure). A probe inside the 3D canvas projects the goals every frame;
 * a plain DOM layer above the game draws an arrow at the screen edge for each one out of view.
 */
interface EdgeItem {
  id: string;
  icon: string;
  color: string;
  /** Screen position (px) and the arrow tip angle (deg, 0 = up). */
  x: number;
  y: number;
  angle: number;
  dist: number;
  show: boolean;
}

const MAX = 3;
const edge = { items: [] as EdgeItem[] };
const v = new THREE.Vector3();

function goals(s: GameState, me: { x: number; y: number }) {
  const adv = s.adventure;
  if (!adv) return [];
  const rid = regionAt(s, me.x, me.y);
  const r = adv.regions.find((q) => q.id === rid) ?? adv.regions.find((q) => q.id === adv.depth);
  if (!r) return [];
  const out: { id: string; x: number; y: number; icon: string; color: string }[] = [];
  const gate = adv.gates.find((g) => g.kind !== 'back' && g.from === r.id);
  if (gate && r.cleared) out.push({ id: 'gate', x: gate.x, y: gate.y, icon: '✦', color: '#c4a5ff' });
  else if (r.objective.kind === 'key') {
    const key = adv.props.find((p) => p.kind === 'key' && p.region === r.id);
    if (key?.state === 'idle') out.push({ id: 'key', x: key.x, y: key.y, icon: '🔑', color: '#ffd23f' });
    else if (key?.state === 'carried' && gate) out.push({ id: 'lock', x: gate.x, y: gate.y, icon: '🔒', color: '#ffd23f' });
  }
  const cage = adv.cages.find((c) => c.region === r.id && c.state !== 'rescued');
  if (cage) out.push({ id: 'cage', x: cage.x, y: cage.y, icon: cage.state === 'free' ? '❗' : '⛓️', color: '#7fd6ff' });
  return out;
}

/** Lives inside the <Canvas>: projects the goals for the DOM layer. */
export function EdgeProbe() {
  const { controller, ox, oz } = useGame();
  useFrame(({ camera, size }) => {
    const s = controller.state;
    if (!s.adventure) return;
    const me = s.players.find((p) => p.alive && (controller.isLocal ? controller.isLocal(p.id) : true)) ?? s.players.find((p) => p.alive);
    if (!me) {
      edge.items = [];
      return;
    }
    edge.items = goals(s, me)
      .slice(0, MAX)
      .map((g) => {
        v.set(g.x + ox, 0.5, g.y + oz).project(camera);
        let dx = v.x;
        let dy = v.y;
        if (v.z > 1) {
          dx = -dx;
          dy = -dy;
        }
        const show = v.z > 1 || Math.abs(dx) > 0.9 || Math.abs(dy) > 0.82;
        // Clamp onto a rectangle inside the screen edges (room for the HUD at the top).
        // Stay clear of the corner buttons (pause, map) and the HUD panels at the top.
        const k = Math.min(0.8 / Math.max(1e-4, Math.abs(dx)), (dy > 0 ? 0.55 : 0.72) / Math.max(1e-4, Math.abs(dy)));
        const ex = dx * Math.min(1, k);
        const ey = dy * Math.min(1, k);
        const sx = dx;
        const sy = -dy;
        return {
          id: g.id,
          icon: g.icon,
          color: g.color,
          x: ((ex + 1) / 2) * size.width,
          y: ((1 - ey) / 2) * size.height,
          angle: (Math.atan2(sx, -sy) * 180) / Math.PI,
          dist: Math.round(Math.abs(g.x - me.x) + Math.abs(g.y - me.y)),
          show,
        };
      });
  });
  return null;
}

/** DOM layer (outside the canvas). */
export function EdgeArrows() {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      for (let i = 0; i < MAX; i++) {
        const el = refs.current[i];
        if (!el) continue;
        const it = edge.items[i];
        if (!it || !it.show) {
          el.style.opacity = '0';
          continue;
        }
        el.style.opacity = '1';
        el.style.transform = `translate(${it.x}px, ${it.y}px)`;
        el.style.setProperty('--arrow-color', it.color);
        (el.children[0] as HTMLElement).style.transform = `rotate(${it.angle}deg)`;
        (el.children[1] as HTMLElement).textContent = it.icon;
        (el.children[2] as HTMLElement).textContent = `${it.dist}`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" data-testid="edge-arrows">
      {Array.from({ length: MAX }, (_, i) => (
        <div key={i} ref={(el) => void (refs.current[i] = el)} className="edge-arrow" style={{ opacity: 0 }}>
          <span className="tip" />
          <span />
          <span className="dist" />
        </div>
      ))}
    </div>
  );
}
