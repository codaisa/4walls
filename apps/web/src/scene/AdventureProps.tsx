import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { PropState } from '@4walls/core';
import { lerp, useGame } from './context';

const wood = new THREE.MeshStandardMaterial({ color: '#8a4f24', roughness: 0.75 });
const woodDark = new THREE.MeshStandardMaterial({ color: '#5e3216', roughness: 0.8 });
const iron = new THREE.MeshStandardMaterial({ color: '#4a4652', roughness: 0.35, metalness: 0.8 });
const gold = new THREE.MeshStandardMaterial({ color: '#f2b622', roughness: 0.22, metalness: 0.85, emissive: '#7a4a00', emissiveIntensity: 0.35 });
const goldGlow = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.2, metalness: 0.7, emissive: '#ffb020', emissiveIntensity: 1.6 });
const gem = new THREE.MeshStandardMaterial({ color: '#3fd0ff', roughness: 0.05, emissive: '#1a8cff', emissiveIntensity: 1.2 });
const ruby = new THREE.MeshStandardMaterial({ color: '#e0193a', roughness: 0.05, emissive: '#ff2040', emissiveIntensity: 0.8 });
const glowRing = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false });

const bodyGeo = new RoundedBoxGeometry(0.66, 0.38, 0.46, 2, 0.04);
const lidGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.66, 18, 1, false, 0, Math.PI);
lidGeo.rotateZ(Math.PI / 2);
const bandGeo = new THREE.BoxGeometry(0.06, 0.4, 0.48);
const lidBandGeo = new THREE.TorusGeometry(0.235, 0.022, 6, 18, Math.PI);

/** Adventure props: chests (common wood, rare gold) and the gate key with its padlock. */
export function AdventureProps() {
  const { controller } = useGame();
  const props = controller.state.adventure?.props ?? [];
  return (
    <>
      {props.map((p) => (p.kind === 'chest' ? <Chest key={p.id} id={p.id} /> : <GateKey key={p.id} id={p.id} />))}
      <GateLocks />
    </>
  );
}

function useProp(id: number) {
  const { controller } = useGame();
  return () => controller.state.adventure?.props.find((p) => p.id === id) as PropState | undefined;
}

/** A treasure chest: the lid swings open, a burst of light; rare ones are gilded and glow. */
function Chest({ id }: { id: number }) {
  const { controller, ox, oz } = useGame();
  const get = useProp(id);
  const p0 = get()!;
  const lid = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const shine = useRef<THREE.Mesh>(null!);
  const openedAt = useRef<number | null>(p0.state === 'open' ? -1 : null);
  useEffect(
    () =>
      controller.on((e) => {
        if (e.type === 'chestOpened' && e.propId === id) openedAt.current = performance.now();
      }),
    [controller, id],
  );
  const rare = !!p0.rare;
  const band = rare ? gold : iron;
  useFrame(({ clock }) => {
    const p = get();
    if (!p) return;
    if (p.state === 'open' && openedAt.current === null) openedAt.current = -1;
    const t = clock.elapsedTime;
    const since = openedAt.current === null ? -1 : openedAt.current < 0 ? 9999 : performance.now() - openedAt.current;
    const k = since < 0 ? 0 : Math.min(1, since / 380);
    // Overshoot on the hinge, then rest wide open.
    lid.current.rotation.x = -k * (1.9 + 0.25 * Math.sin(Math.min(1, since / 600) * Math.PI));
    ring.current.visible = since < 0;
    if (since < 0) {
      const q = (t * 0.9 + id * 0.37) % 1;
      ring.current.scale.setScalar(0.7 + q * 0.5);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (rare ? 0.6 : 0.3) * (1 - q);
    }
    shine.current.visible = since >= 0 && since < 900;
    if (shine.current.visible) {
      const s = since / 900;
      shine.current.scale.set(1, 0.5 + s * 2.5, 1);
      (shine.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - s);
    }
  });
  return (
    <group position={[p0.x + ox, 0, p0.y + oz]}>
      <mesh position={[0, 0.2, 0]} geometry={bodyGeo} material={rare ? woodDark : wood} castShadow receiveShadow />
      {[-0.24, 0.24].map((x) => (
        <mesh key={x} position={[x, 0.2, 0]} geometry={bandGeo} material={band} castShadow />
      ))}
      {/* Lid hinged at the back edge */}
      <group ref={lid} position={[0, 0.39, 0.23]}>
        <group position={[0, 0, -0.23]}>
          <mesh geometry={lidGeo} material={rare ? woodDark : wood} castShadow />
          {[-0.24, 0.24].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]} geometry={lidBandGeo} material={band} />
          ))}
          {rare && <mesh position={[0, 0.23, 0]} material={ruby}><octahedronGeometry args={[0.06, 0]} /></mesh>}
        </group>
      </group>
      {/* Clasp */}
      <mesh position={[0, 0.34, -0.24]} material={rare ? goldGlow : gold}>
        <boxGeometry args={[0.1, 0.12, 0.04]} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} material={glowRing.clone()}>
        <ringGeometry args={[0.38, 0.46, 32]} />
      </mesh>
      <mesh ref={shine} position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.22, 0.32, 1, 16, 1, true]} />
        <meshBasicMaterial color={rare ? '#ffd23f' : '#ffe9b0'} transparent opacity={0.8} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** The gate key: a golden key with a sapphire, spinning on its pedestal or floating over its carrier. */
function GateKey({ id }: { id: number }) {
  const { controller, ox, oz } = useGame();
  const get = useProp(id);
  const root = useRef<THREE.Group>(null!);
  const pedestal = useRef<THREE.Group>(null!);
  const p0 = get()!;
  const home = useMemo(() => ({ x: p0.homeX ?? p0.x, y: p0.homeY ?? p0.y }), [p0]);
  useFrame(({ clock }) => {
    const p = get();
    if (!p) return;
    const t = clock.elapsedTime;
    root.current.visible = p.state !== 'used';
    pedestal.current.visible = p.state !== 'used';
    let x = p.x;
    let y = p.y;
    let h = 0.75 + Math.sin(t * 2.4) * 0.08;
    if (p.state === 'carried') {
      const c = controller.state.players.find((pl) => pl.id === p.carrierId);
      if (c) {
        const a = controller.alphaFor?.(c.id) ?? controller.alpha;
        x = lerp(c.px, c.x, a);
        y = lerp(c.py, c.y, a);
        h = 1.95 + Math.sin(t * 5) * 0.05;
      }
    }
    root.current.position.set(x + ox, h, y + oz);
    root.current.rotation.y = t * 2;
  });
  return (
    <>
      <group ref={pedestal} position={[home.x + ox, 0, home.y + oz]}>
        <mesh position={[0, 0.12, 0]} material={iron} castShadow receiveShadow>
          <cylinderGeometry args={[0.26, 0.32, 0.24, 8]} />
        </mesh>
        <mesh position={[0, 0.26, 0]} material={gold}>
          <torusGeometry args={[0.2, 0.025, 6, 20]} />
        </mesh>
      </group>
      <group ref={root} scale={1.1}>
        {/* Bow with a gem, shaft and teeth */}
        <mesh position={[0, 0.2, 0]} material={goldGlow} castShadow>
          <torusGeometry args={[0.11, 0.035, 8, 20]} />
        </mesh>
        <mesh position={[0, 0.2, 0]} material={gem}>
          <octahedronGeometry args={[0.05, 0]} />
        </mesh>
        <mesh position={[0, -0.05, 0]} material={goldGlow} castShadow>
          <cylinderGeometry args={[0.028, 0.028, 0.32, 8]} />
        </mesh>
        {[-0.14, -0.2].map((yy, i) => (
          <mesh key={yy} position={[0.05 + i * 0.01, yy, 0]} material={goldGlow}>
            <boxGeometry args={[0.08 - i * 0.02, 0.04, 0.03]} />
          </mesh>
        ))}
        <pointLight color="#ffc04a" intensity={2.5} distance={3} />
      </group>
    </>
  );
}

/** Regions with a key objective: a big golden padlock hangs on the exit gate until the key arrives. */
function GateLocks() {
  const { controller, ox, oz } = useGame();
  const adv = controller.state.adventure!;
  const locks = adv.regions.filter((r) => r.objective.kind === 'key').map((r) => ({ region: r.id, gate: adv.gates.find((g) => g.kind !== 'back' && g.from === r.id)! })).filter((l) => l.gate);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const deliveredAt = useRef(new Map<number, number>());
  useEffect(
    () =>
      controller.on((e) => {
        if (e.type === 'keyDelivered') deliveredAt.current.set(e.region, performance.now());
      }),
    [controller],
  );
  useFrame(({ clock }) => {
    locks.forEach((l, i) => {
      const g = refs.current[i];
      if (!g) return;
      const r = adv.regions.find((x) => x.id === l.region);
      const at = deliveredAt.current.get(l.region);
      const k = at === undefined ? (r?.cleared ? 1 : 0) : Math.min(1, (performance.now() - at) / 500);
      g.visible = k < 1;
      g.scale.setScalar(Math.max(0.0001, 1 + k * 0.6));
      g.rotation.z = Math.sin(clock.elapsedTime * 2 + i) * 0.08 + k * 0.6;
      g.position.y = 0.85 + k * 0.6;
    });
  });
  return (
    <>
      {locks.map((l, i) => (
        <group key={l.region} position={[l.gate.x + ox, 0.85, l.gate.y + oz]} rotation-y={l.gate.axis === 'h' ? Math.PI / 2 : 0}>
          <group ref={(g) => void (refs.current[i] = g)}>
            <mesh material={gold} castShadow>
              <boxGeometry args={[0.46, 0.38, 0.14]} />
            </mesh>
            <mesh position={[0, 0.26, 0]} material={iron}>
              <torusGeometry args={[0.15, 0.04, 8, 20, Math.PI]} />
            </mesh>
            <mesh position={[0, -0.02, 0.075]} material={iron}>
              <cylinderGeometry args={[0.045, 0.045, 0.02, 12]} />
            </mesh>
            <mesh position={[0, -0.1, 0.075]} material={iron}>
              <boxGeometry args={[0.03, 0.1, 0.02]} />
            </mesh>
          </group>
        </group>
      ))}
    </>
  );
}
