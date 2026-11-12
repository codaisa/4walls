import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PRESETS, type PresetId } from '../vfx/presets';
import { VfxLayer } from '../vfx/VfxLayer';
import { vfx, type VfxPreset } from '../vfx/vfx';

/** Effects meant to be emitted every frame (auras, trails, ambience) loop continuously here. */
const CONTINUOUS = new Set<PresetId>(['boss.trail', 'boss.rage', 'mote.trail', 'amb.embers', 'amb.fireflies', 'amb.pollen', 'amb.night', 'amb.mist', 'amb.snow', 'camp.sparks', 'portal.swirl', 'bomb.fuse', 'boss.telegraph', 'dust.step']);
/** Emissions per second for the continuous ones. */
const RATE: Partial<Record<PresetId, number>> = { 'amb.embers': 14, 'amb.fireflies': 6, 'amb.pollen': 10, 'amb.night': 6, 'amb.mist': 1.2, 'amb.snow': 18, 'camp.sparks': 8, 'portal.swirl': 6, 'bomb.fuse': 12, 'boss.telegraph': 5, 'dust.step': 8, 'mote.trail': 30 };
const TIERS = ['Baixo', 'Médio', 'Alto'] as const;

function Driver({ id, repeat, stats }: { id: PresetId; repeat: boolean; stats: React.RefObject<HTMLDivElement | null> }) {
  const acc = useRef(0);
  const last = useRef<PresetId | null>(null);
  const t = useRef(0);
  const gl = useThree((s) => s.gl);
  useFrame((_, dt) => {
    t.current += dt;
    const moving = id === 'boss.trail' || id === 'mote.trail';
    const x = moving ? Math.sin(t.current * 1.5) * 2.5 : 0;
    const z = moving ? Math.cos(t.current * 1.5) * 1.2 : 0;
    if (CONTINUOUS.has(id)) {
      acc.current += dt * (RATE[id] ?? 30);
      while (acc.current >= 1) {
        acc.current -= 1;
        vfx.emit(id, x, id === 'mote.trail' ? 0.8 : 0, z);
      }
    } else if (last.current !== id || (repeat && acc.current > 1.6)) {
      acc.current = 0;
      vfx.emit(id, 0, 0, 0);
    } else acc.current += dt;
    last.current = id;
    if (stats.current) stats.current.textContent = `${vfx.count} sprites · ${gl.info.render.calls} chamadas`;
  });
  return null;
}

/** /vfx (dev only): live catalog of every effect preset, with replay and a quality switch. */
export function VfxLab() {
  const navigate = useNavigate();
  const [id, setId] = useState<PresetId>(() => {
    const q = new URLSearchParams(location.search).get('id');
    return q && q in PRESETS ? (q as PresetId) : 'explosion.core';
  });
  const [repeat, setRepeat] = useState(true);
  const [tier, setTier] = useState<0 | 1 | 2>(1);
  const [n, setN] = useState(0);
  const stats = useRef<HTMLDivElement>(null);
  const groups = new Map<string, PresetId[]>();
  for (const k of Object.keys(PRESETS) as PresetId[]) {
    const g = (PRESETS[k] as VfxPreset).group;
    groups.set(g, [...(groups.get(g) ?? []), k]);
  }
  const p = PRESETS[id] as VfxPreset;
  return (
    <div className="flex h-full w-full bg-[#1d1a22] text-amber-50">
      <aside className="flex h-full w-60 shrink-0 flex-col gap-2 overflow-y-auto border-r border-white/10 p-2 text-sm">
        <button className="rounded bg-white/10 px-2 py-1 text-left" onClick={() => navigate('/')}>
          ← Menu
        </button>
        {[...groups].map(([g, ids]) => (
          <div key={g}>
            <div className="mb-1 font-display text-amber-200">{g}</div>
            {ids.map((k) => (
              <button
                key={k}
                className={`block w-full rounded px-2 py-1 text-left ${k === id ? 'bg-amber-500/40' : 'hover:bg-white/10'}`}
                onClick={() => {
                  setId(k);
                  setN((x) => x + 1);
                }}
              >
                {(PRESETS[k] as VfxPreset).label}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <main className="relative h-full flex-1">
        <Canvas key={tier} camera={{ position: [0, 7.5, 6], fov: 45 }} onCreated={({ camera }) => camera.lookAt(0, 0, 0)} dpr={[1, 1.5]}>
          <color attach="background" args={['#2a2530']} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[4, 8, 3]} intensity={1.6} />
          <mesh rotation-x={-Math.PI / 2}>
            <planeGeometry args={[16, 12]} />
            <meshStandardMaterial color="#6d6458" roughness={0.9} />
          </mesh>
          <gridHelper args={[16, 16, '#857a6c', '#7a7064']} position={[0, 0.01, 0]} />
          <VfxLayer tier={tier} />
          <Driver key={n} id={id} repeat={repeat} stats={stats} />
        </Canvas>
        <div className="pointer-events-none absolute left-2 top-2 max-w-[60%] rounded bg-black/50 p-2 text-xs">
          <div className="font-display text-base text-amber-200">{p.label}</div>
          <div className="opacity-80">{p.desc}</div>
          <div className="mt-1 opacity-60">
            id: {id} · {p.emitters.length} camadas{p.shake ? ` · tremor ${p.shake}` : ''}
          </div>
          <div ref={stats} className="mt-1 text-amber-300" />
        </div>
        <div className="absolute bottom-2 right-2 flex gap-1 text-xs">
          {TIERS.map((label, i) => (
            <button key={label} className={`rounded px-2 py-1 ${tier === i ? 'bg-amber-500/60' : 'bg-black/50'}`} onClick={() => setTier(i as 0 | 1 | 2)}>
              {label}
            </button>
          ))}
          <button className={`rounded px-2 py-1 ${repeat ? 'bg-amber-500/60' : 'bg-black/50'}`} onClick={() => setRepeat((r) => !r)}>
            Repetir
          </button>
          <button className="rounded bg-black/50 px-2 py-1" onClick={() => setN((x) => x + 1)}>
            Tocar
          </button>
        </div>
      </main>
    </div>
  );
}
