import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, Suspense, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Cell } from '@4walls/shared';
import { GEYSER_PERIOD, GEYSER_WARN, geyserPhase, getCell, platformPos, type PropState } from '@4walls/core';
import { lerp, useGame } from './context';
import { RESIDENT_OF } from '@4walls/shared';
import { ShowcaseAvatar } from './ShowcaseAvatar';

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
      {props.map((p) =>
        p.kind === 'chest' ? <Chest key={p.id} id={p.id} /> : p.kind === 'campfire' ? <Campfire key={p.id} id={p.id} /> : p.kind === 'tent' ? <Tent key={p.id} id={p.id} /> : p.kind === 'key' ? <GateKey key={p.id} id={p.id} /> : p.kind === 'brazier' ? (
          <Brazier key={p.id} id={p.id} />
        ) : p.kind === 'vent' ? (
          <AshVent key={p.id} id={p.id} />
        ) : p.kind === 'bridge' ? (
          <Bridge key={p.id} id={p.id} />
        ) : p.kind === 'platform' ? (
          <Platform key={p.id} id={p.id} />
        ) : p.kind === 'geyser' ? (
          <Geyser key={p.id} id={p.id} />
        ) : p.kind === 'seal' ? (
          <Seal key={p.id} id={p.id} />
        ) : p.kind === 'root' ? (
          <Root key={p.id} id={p.id} />
        ) : p.kind === 'bramble' ? (
          <Bramble key={p.id} id={p.id} />
        ) : p.kind === 'grass' ? (
          <Grass key={p.id} id={p.id} />
        ) : p.kind === 'totem' ? (
          <Totem key={p.id} id={p.id} />
        ) : (
          <Lever key={p.id} id={p.id} />
        ),
      )}
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
  const root = useRef<THREE.Group>(null!);
  const lid = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const revealedAt = useRef<number | null>(null);
  const shine = useRef<THREE.Mesh>(null!);
  const crown = useRef<THREE.Group>(null!);
  const warn = useRef<THREE.Mesh>(null!);
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
    // Mission reward: hidden until the braziers are lit, then it pops up out of the ground.
    // A Mimic's chest is gone ('used') while the beast is loose, and comes back double.
    const gone = p.state === 'hidden' || p.state === 'used';
    root.current.visible = !gone;
    if (gone) {
      revealedAt.current = null;
      return;
    }
    const dbl = p.hp === 2;
    root.current.position.set(p.x + ox, 0, p.y + oz);
    crown.current.visible = dbl;
    if (revealedAt.current === null) revealedAt.current = p.tick > 0 && controller.state.tick - p.tick < 30 ? performance.now() : -1;
    const rk = revealedAt.current < 0 ? 1 : Math.min(1, (performance.now() - revealedAt.current) / 600);
    root.current.scale.setScalar(Math.max(0.0001, rk < 1 ? rk * (1 + 0.3 * Math.sin(rk * Math.PI)) : 1) * (dbl ? 1.3 : 1));
    if (p.state === 'open' && openedAt.current === null) openedAt.current = -1;
    const t = clock.elapsedTime;
    const since = openedAt.current === null ? -1 : openedAt.current < 0 ? 9999 : performance.now() - openedAt.current;
    const k = since < 0 ? 0 : Math.min(1, since / 380);
    // Overshoot on the hinge, then rest wide open.
    lid.current.rotation.x = -k * (1.9 + 0.25 * Math.sin(Math.min(1, since / 600) * Math.PI));
    const ex = controller.state.expedition;
    warn.current.visible = !!p.mimic && !dbl && since < 0 && ((ex?.scoutTo ?? -1) > p.region || !!ex?.relics?.includes('mimic_eye'));
    if (warn.current.visible) warn.current.position.y = 0.95 + 0.06 * Math.sin(t * 5);
    // The Mimic's tell: now and then the lid twitches by itself, as if something breathed inside.
    if (p.mimic && !dbl && since < 0) {
      const w = (t + id * 0.71) % 5.5;
      lid.current.rotation.x = w < 0.35 ? -0.12 * Math.abs(Math.sin(w * 28)) : 0;
    }
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
    <group ref={root} position={[p0.x + ox, 0, p0.y + oz]} visible={p0.state !== 'hidden'}>
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
      {/* Scouted: this chest is a Mimic. */}
      <mesh ref={warn} position={[0, 0.95, 0]} visible={false}>
        <octahedronGeometry args={[0.13, 0]} />
        <meshBasicMaterial color={new THREE.Color(3, 0.3, 0.2)} toneMapped={false} />
      </mesh>
      {/* The double chest left by a beaten Mimic: gold crown and gems. */}
      <group ref={crown} visible={false}>
        {[-0.2, 0, 0.2].map((x) => (
          <mesh key={x} position={[x, 0.62, 0]} material={x === 0 ? ruby : goldGlow}>
            <octahedronGeometry args={[x === 0 ? 0.07 : 0.05, 0]} />
          </mesh>
        ))}
        {[-0.24, 0.24].map((x) => (
          <mesh key={x} position={[x, 0.2, 0]} geometry={bandGeo} material={goldGlow} />
        ))}
      </group>
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

const stone = new THREE.MeshStandardMaterial({ color: '#5a4e58', roughness: 0.85, flatShading: true });
const coal = new THREE.MeshStandardMaterial({ color: '#1c1416', roughness: 0.9 });
const fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.3, 0.25), toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false });
const emberGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.5, 0.1), toneMapped: false });
const ashMat = new THREE.MeshStandardMaterial({ color: '#6e6468', roughness: 1, transparent: true, opacity: 0.88, depthWrite: false });

const logMat = new THREE.MeshStandardMaterial({ color: '#5b3a22', roughness: 0.9 });

const TENT_COLOR: Record<string, string> = { shop: '#d9534f', smith: '#6d6a75', cook: '#e8a33d', scout: '#3f8fd2', contract: '#8a5cc7', wheel: '#3fb37f' };
const tentGeo = new THREE.ConeGeometry(0.62, 1.05, 4, 1);
tentGeo.rotateY(Math.PI / 4);

/** A3 — a resident's tent: colored canvas, a pennant; the hero stands at the door once rescued. */
function Tent({ id }: { id: number }) {
  const { controller, ox, oz } = useGame();
  const get = useProp(id);
  const p0 = get()!;
  const service = (p0.service ?? 'shop') as keyof typeof RESIDENT_OF;
  const resident = RESIDENT_OF[service];
  const [home, setHome] = useState(() => !!controller.state.expedition?.residents?.includes(resident));
  const flag = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const h = !!controller.state.expedition?.residents?.includes(resident);
    if (h !== home) setHome(h);
    flag.current.rotation.y = Math.sin(clock.elapsedTime * 3 + id) * 0.4;
  });
  // The door faces the fire.
  const fire = controller.state.adventure?.props.find((q) => q.kind === 'campfire' && q.region === p0.region);
  const yaw = fire ? Math.atan2(fire.x - p0.x, fire.y - p0.y) : 0;
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: TENT_COLOR[service] ?? '#aa7744', roughness: 0.85, side: THREE.DoubleSide, flatShading: true }), [service]);
  return (
    <group position={[p0.x + ox, 0, p0.y + oz]} rotation-y={yaw}>
      <mesh position={[0, 0.52, 0]} geometry={tentGeo} material={mat} castShadow receiveShadow />
      <mesh position={[0, 0.3, 0.42]} material={coal}>
        <planeGeometry args={[0.32, 0.55]} />
      </mesh>
      <mesh position={[0, 1.18, 0]} material={logMat}>
        <cylinderGeometry args={[0.02, 0.02, 0.35, 5]} />
      </mesh>
      <mesh ref={flag} position={[0.1, 1.28, 0]} material={mat}>
        <planeGeometry args={[0.2, 0.12]} />
      </mesh>
      {home && (
        <group position={[0, 0, 0.62]} scale={0.8}>
          <Suspense fallback={null}>
            <ShowcaseAvatar characterId={resident} colorIndex={(Object.keys(RESIDENT_OF).indexOf(service) + 1) % 4} />
          </Suspense>
        </group>
      )}
    </group>
  );
}

/** Task 3 — the camp's fire: stones and crossed logs; the group gathering lights it. */
function Campfire({ id }: { id: number }) {
  const { ox, oz } = useGame();
  const get = useProp(id);
  const p0 = get()!;
  const fire = useRef<THREE.Group>(null!);
  const light = useRef<THREE.PointLight>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const litAt = useRef<number | null>(p0.state === 'lit' ? -1 : null);
  useFrame(({ clock }) => {
    const p = get();
    if (!p) return;
    const t = clock.elapsedTime;
    if (p.state === 'lit' && litAt.current === null) litAt.current = performance.now();
    if (p.state !== 'lit') litAt.current = null;
    const k = litAt.current === null ? 0 : litAt.current < 0 ? 1 : Math.min(1, (performance.now() - litAt.current) / 500);
    fire.current.visible = k > 0;
    const flick = 0.85 + 0.15 * Math.sin(t * 13 + id) + 0.1 * Math.sin(t * 29);
    fire.current.scale.set(Math.max(0.0001, k), Math.max(0.0001, k * flick), Math.max(0.0001, k));
    fire.current.rotation.y = t * 1.2;
    light.current.intensity = 10 * k * flick;
    // Unlit: a ring on the ground invites the group to gather.
    ring.current.visible = k === 0;
    if (k === 0) {
      const q = (t * 0.8) % 1;
      ring.current.scale.setScalar(1.2 + q * 2.4);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - q);
    }
  });
  return (
    <group position={[p0.x + ox, 0, p0.y + oz]}>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[Math.cos((i / 9) * Math.PI * 2) * 0.42, 0.07, Math.sin((i / 9) * Math.PI * 2) * 0.42]} material={stone} castShadow>
          <dodecahedronGeometry args={[0.11, 0]} />
        </mesh>
      ))}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.12, 0]} rotation={[0, (i / 3) * Math.PI, Math.PI / 2 - 0.25]} material={logMat} castShadow>
          <cylinderGeometry args={[0.06, 0.07, 0.62, 6]} />
        </mesh>
      ))}
      <mesh position={[0, 0.06, 0]} material={coal}>
        <cylinderGeometry args={[0.28, 0.3, 0.05, 10]} />
      </mesh>
      <group ref={fire} position={[0, 0.15, 0]}>
        <mesh position={[0, 0.38, 0]} material={fireMat}>
          <coneGeometry args={[0.3, 0.85, 9, 1, true]} />
        </mesh>
        <mesh position={[0.1, 0.26, 0.06]} rotation={[0, 1, 0]} material={fireMat}>
          <coneGeometry args={[0.18, 0.55, 7, 1, true]} />
        </mesh>
        <mesh position={[-0.1, 0.22, -0.05]} material={fireMat}>
          <coneGeometry args={[0.16, 0.48, 7, 1, true]} />
        </mesh>
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.46, 0.54, 32]} />
        <meshBasicMaterial color="#ffb347" transparent opacity={0.5} toneMapped={false} depthWrite={false} />
      </mesh>
      <pointLight ref={light} position={[0, 1.2, 0]} color="#ff9a3a" intensity={0} distance={7} />
    </group>
  );
}

/** Brazier (side mission): a stone bowl of coal; a blast next to it sets it roaring. */
function Brazier({ id }: { id: number }) {
  const { ox, oz } = useGame();
  const get = useProp(id);
  const p0 = get()!;
  const fire = useRef<THREE.Group>(null!);
  const light = useRef<THREE.PointLight>(null!);
  const smolder = useRef<THREE.Mesh>(null!);
  const litAt = useRef<number | null>(p0.state === 'lit' ? -1 : null);
  useFrame(({ clock }) => {
    const p = get();
    if (!p) return;
    const t = clock.elapsedTime;
    if (p.state === 'lit' && litAt.current === null) litAt.current = performance.now();
    const k = litAt.current === null ? 0 : litAt.current < 0 ? 1 : Math.min(1, (performance.now() - litAt.current) / 400);
    fire.current.visible = k > 0;
    const flick = 0.85 + 0.15 * Math.sin(t * 17 + id) + 0.1 * Math.sin(t * 31);
    fire.current.scale.set(Math.max(0.0001, k), Math.max(0.0001, k * flick * (k < 1 ? 1.6 - 0.6 * k : 1)), Math.max(0.0001, k));
    fire.current.rotation.y = t * 1.5;
    light.current.intensity = 6 * k * flick;
    smolder.current.visible = k === 0;
  });
  return (
    <group position={[p0.x + ox, 0, p0.y + oz]}>
      <mesh position={[0, 0.22, 0]} material={stone} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.28, 0.44, 8]} />
      </mesh>
      <mesh position={[0, 0.5, 0]} material={stone} castShadow>
        <cylinderGeometry args={[0.38, 0.24, 0.16, 10, 1, true]} />
      </mesh>
      <mesh position={[0, 0.5, 0]} material={coal}>
        <cylinderGeometry args={[0.32, 0.32, 0.06, 10]} />
      </mesh>
      {/* Unlit: a faint glow between the coals hints that it can burn */}
      <mesh ref={smolder} position={[0, 0.54, 0]} material={emberGlow}>
        <sphereGeometry args={[0.06, 8, 6]} />
      </mesh>
      <group ref={fire} position={[0, 0.55, 0]}>
        <mesh position={[0, 0.25, 0]} material={fireMat}>
          <coneGeometry args={[0.26, 0.6, 9, 1, true]} />
        </mesh>
        <mesh position={[0.08, 0.18, 0.05]} rotation={[0, 1, 0]} material={fireMat}>
          <coneGeometry args={[0.15, 0.42, 7, 1, true]} />
        </mesh>
        <mesh position={[-0.08, 0.15, -0.04]} material={fireMat}>
          <coneGeometry args={[0.13, 0.36, 7, 1, true]} />
        </mesh>
      </group>
      <pointLight ref={light} position={[0, 1, 0]} color="#ff8a2a" intensity={0} distance={5} />
    </group>
  );
}

const PUFF_PERIOD = 540; // ticks between puffs (9 s)
const PUFF_LEN = 240; // ticks the cloud lasts (4 s)

/**
 * Ash vent: a cracked grate that breathes out a thick ash cloud every few seconds, hiding the
 * floor (and the bombs on it) around it. Timing comes from the tick, so everyone sees it alike.
 */
function AshVent({ id }: { id: number }) {
  const { controller, ox, oz } = useGame();
  const get = useProp(id);
  const p0 = get()!;
  const cloud = useRef<THREE.Group>(null!);
  const glow = useRef<THREE.Mesh>(null!);
  const puffs = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * Math.PI * 2 + i, r: 0.3 + (i % 4) * 0.33, y: 0.3 + (i % 3) * 0.35, s: 0.55 + (i % 5) * 0.12 })),
    [],
  );
  useFrame(({ clock }) => {
    const ph = (controller.tickF + id * 97) % PUFF_PERIOD;
    const warn = ph > PUFF_PERIOD - 60; // a second of rumbling before it blows
    const on = ph < PUFF_LEN;
    const k = on ? Math.min(1, ph / 20) * Math.min(1, (PUFF_LEN - ph) / 50) : 0;
    cloud.current.visible = k > 0.01;
    cloud.current.scale.setScalar(0.6 + 0.4 * k);
    cloud.current.rotation.y = clock.elapsedTime * 0.2;
    (glow.current.material as THREE.MeshBasicMaterial).color.setRGB(warn ? 2.4 : 0.9, warn ? 0.8 : 0.3, 0.05);
  });
  return (
    <group position={[p0.x + ox, 0, p0.y + oz]}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={coal}>
        <circleGeometry args={[0.4, 10]} />
      </mesh>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} material={stone}>
        <ringGeometry args={[0.32, 0.46, 10]} />
      </mesh>
      <mesh ref={glow} position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.22, 10]} />
        <meshBasicMaterial color={new THREE.Color(0.9, 0.3, 0.05)} toneMapped={false} />
      </mesh>
      <group ref={cloud} visible={false}>
        {puffs.map((q, i) => (
          <mesh key={i} position={[Math.cos(q.a) * q.r, q.y, Math.sin(q.a) * q.r]} scale={q.s} material={ashMat}>
            <icosahedronGeometry args={[0.6, 1]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ───────────────────────────── the lava river ─────────────────────────────

const plank = new THREE.MeshStandardMaterial({ color: '#7a4a28', roughness: 0.8 });
const plankDark = new THREE.MeshStandardMaterial({ color: '#4e2e18', roughness: 0.85 });
const rope = new THREE.MeshStandardMaterial({ color: '#c9a36b', roughness: 0.9 });
const obsidian = new THREE.MeshStandardMaterial({ color: '#241c2c', roughness: 0.25, metalness: 0.3 });
const rune = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.2, 3.2), toneMapped: false });
const lavaHot = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1, 0.15), toneMapped: false });
const warnMat = new THREE.MeshBasicMaterial({ color: '#ff3a1a', transparent: true, opacity: 0.6, toneMapped: false, depthWrite: false });
const gemOff = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.3, 0.2), toneMapped: false });
const gemOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.6, 0.8), toneMapped: false });

/** Which way the far bank is from a river cell (the drawbridge hinges there). */
function farSide(controller: ReturnType<typeof useGame>['controller'], p: PropState): [number, number] {
  const adv = controller.state.adventure!;
  const gate = adv.gates.find((g) => g.kind !== 'back' && g.from === p.region);
  const dx = (gate?.x ?? p.x) - p.x;
  const dy = (gate?.y ?? p.y) - p.y;
  return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
}

/**
 * Bridge planks over the lava. Fragile: they shake when stepped on, crack and drop into the river,
 * then are rebuilt. Drawbridge: raised flaps that swing down when the lever is blown.
 */
function Bridge({ id }: { id: number }) {
  const { controller, ox, oz } = useGame();
  const get = useProp(id);
  const p0 = get()!;
  const root = useRef<THREE.Group>(null!);
  const hinge = useRef<THREE.Group>(null!);
  const cracks = useRef<THREE.Mesh>(null!);
  const fallAt = useRef<number | null>(null);
  const draw = p0.variant === 'draw';
  const [fx, fz] = draw ? farSide(controller, p0) : [1, 0];
  // Hinge on the far-bank edge; "raised" swings the flap up around it.
  const yaw = Math.atan2(fx, fz);
  useFrame(({ clock }) => {
    const p = get();
    if (!p) return;
    const t = clock.elapsedTime;
    if (draw) {
      const k = p.state === 'lowered' ? Math.min(1, (controller.state.tick - p.tick) / 40) : 0;
      hinge.current.rotation.x = -(1 - k) * 1.35 * (1 - 0.08 * Math.sin(k * Math.PI * 3) * (1 - k));
      return;
    }
    if (p.state === 'fallen') {
      if (fallAt.current === null) fallAt.current = performance.now();
      const k = Math.min(1, (performance.now() - fallAt.current) / 700);
      root.current.position.y = -k * k * 1.6;
      root.current.rotation.z = k * 0.6;
      root.current.visible = k < 1;
      return;
    }
    fallAt.current = null;
    root.current.visible = true;
    root.current.rotation.z = 0;
    const shaking = p.state === 'cracking';
    root.current.position.y = shaking ? Math.sin(t * 50) * 0.025 : 0;
    root.current.position.x = shaking ? Math.sin(t * 37) * 0.02 : 0;
    cracks.current.visible = shaking;
  });
  return (
    <group position={[p0.x + ox, 0, p0.y + oz]}>
      {draw ? (
        <group rotation-y={yaw}>
          <group ref={hinge} position={[0, -0.02, 0.5]}>
            <group position={[0, 0, -0.5]}>
              {[-0.33, 0, 0.33].map((x) => (
                <mesh key={x} position={[x, -0.05, 0]} material={plank} castShadow receiveShadow>
                  <boxGeometry args={[0.3, 0.1, 0.98]} />
                </mesh>
              ))}
              {[-0.48, 0.48].map((x) => (
                <mesh key={x} position={[x, 0.02, 0]} material={iron}>
                  <boxGeometry args={[0.05, 0.08, 1]} />
                </mesh>
              ))}
            </group>
          </group>
        </group>
      ) : (
        <group ref={root}>
          {[-0.36, -0.12, 0.12, 0.36].map((z, i) => (
            <mesh key={z} position={[0, -0.06, z]} rotation={[0, (i % 2 ? 0.05 : -0.04), 0]} material={i % 2 ? plankDark : plank} castShadow receiveShadow>
              <boxGeometry args={[0.96, 0.08, 0.2]} />
            </mesh>
          ))}
          {[-0.46, 0.46].map((x) => (
            <mesh key={x} position={[x, 0.05, 0]} material={rope}>
              <boxGeometry args={[0.04, 0.04, 1]} />
            </mesh>
          ))}
          <mesh ref={cracks} position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0.4]} visible={false}>
            <planeGeometry args={[0.8, 0.06]} />
            <meshBasicMaterial color="#1a0d06" />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Shuttle: an obsidian slab floating over the lava with glowing runes, gliding bank to bank. */
function Platform({ id }: { id: number }) {
  const { controller, ox, oz } = useGame();
  const get = useProp(id);
  const root = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    const p = get();
    if (!p || !p.track) return;
    const pos = platformPos(p, controller.tickF);
    root.current.position.set(pos.x + ox, Math.sin(clock.elapsedTime * 2 + id) * 0.025, pos.y + oz);
  });
  return (
    <group ref={root}>
      <mesh position={[0, -0.12, 0]} material={obsidian} castShadow receiveShadow>
        <cylinderGeometry args={[0.52, 0.42, 0.24, 8]} />
      </mesh>
      <mesh position={[0, -0.32, 0]} material={obsidian}>
        <coneGeometry args={[0.4, 0.35, 8]} />
      </mesh>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} position={[Math.cos((k / 4) * Math.PI * 2 + 0.4) * 0.36, 0.006, Math.sin((k / 4) * Math.PI * 2 + 0.4) * 0.36]} rotation={[-Math.PI / 2, 0, 0]} material={rune}>
          <circleGeometry args={[0.05, 6]} />
        </mesh>
      ))}
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} material={rune}>
        <ringGeometry args={[0.18, 0.22, 6]} />
      </mesh>
    </group>
  );
}

/** Geyser: a vent ring that bubbles red before throwing a column of lava into the air. */
function Geyser({ id }: { id: number }) {
  const { controller, ox, oz } = useGame();
  const get = useProp(id);
  const p0 = get()!;
  const column = useRef<THREE.Mesh>(null!);
  const warn = useRef<THREE.Mesh>(null!);
  const bubbles = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    const p = get();
    if (!p) return;
    const ph = geyserPhase(p, Math.floor(controller.tickF));
    const t = clock.elapsedTime;
    const warning = ph >= GEYSER_PERIOD - GEYSER_WARN;
    warn.current.visible = warning;
    if (warning) (warn.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.35 * Math.abs(Math.sin(t * 12));
    bubbles.current.scale.setScalar(warning ? 1.4 : 0.8);
    bubbles.current.children.forEach((b, i) => {
      b.position.y = 0.05 + ((t * (warning ? 1.6 : 0.5) + i * 0.37) % 1) * 0.3;
    });
    const burst = ph < 42;
    column.current.visible = burst;
    if (burst) {
      const k = ph / 42;
      const h = Math.sin(Math.min(1, k * 2.2) * Math.PI * 0.5) * (1 - Math.max(0, k - 0.7) / 0.3) * 2.6;
      column.current.scale.set(1 + Math.sin(t * 30) * 0.06, Math.max(0.01, h), 1);
      column.current.position.y = h / 2;
    }
  });
  return (
    <group position={[p0.x + ox, 0, p0.y + oz]}>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={stone}>
        <ringGeometry args={[0.24, 0.46, 9]} />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} material={lavaHot}>
        <circleGeometry args={[0.25, 12]} />
      </mesh>
      <mesh ref={warn} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} material={warnMat} visible={false}>
        <ringGeometry args={[0.46, 0.56, 24]} />
      </mesh>
      <group ref={bubbles}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[Math.cos(i * 1.7) * 0.12, 0.1, Math.sin(i * 1.7) * 0.12]} material={lavaHot}>
            <sphereGeometry args={[0.045, 8, 6]} />
          </mesh>
        ))}
      </group>
      <mesh ref={column} material={lavaHot} visible={false}>
        <cylinderGeometry args={[0.18, 0.3, 1, 12, 1, true]} />
      </mesh>
    </group>
  );
}

/** Lever: a stone post with an iron handle. A blast beside it throws it down (red gem → green). */
function Lever({ id }: { id: number }) {
  const { controller, ox, oz } = useGame();
  const get = useProp(id);
  const p0 = get()!;
  const handle = useRef<THREE.Group>(null!);
  const gem = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const p = get();
    if (!p) return;
    const on = p.state === 'on';
    const k = on ? Math.min(1, (controller.state.tick - p.tick) / 18) : 0;
    handle.current.rotation.x = 0.7 - k * 1.4;
    gem.current.material = on ? gemOn : gemOff;
  });
  return (
    <group position={[p0.x + ox, 0, p0.y + oz]}>
      <mesh position={[0, 0.3, 0]} material={stone} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.6, 0.5]} />
      </mesh>
      <mesh ref={gem} position={[0, 0.45, 0.26]} material={gemOff}>
        <octahedronGeometry args={[0.07, 0]} />
      </mesh>
      <group ref={handle} position={[0, 0.62, 0]}>
        <mesh position={[0, 0.25, 0]} material={iron} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.5, 8]} />
        </mesh>
        <mesh position={[0, 0.52, 0]} material={gold}>
          <sphereGeometry args={[0.08, 12, 8]} />
        </mesh>
      </group>
    </group>
  );
}

// ───────────────────────────── obsidian and corrupted forest ─────────────────────────────

const obsidianGlass = new THREE.MeshPhysicalMaterial({ color: '#1c1428', roughness: 0.08, metalness: 0.2, clearcoat: 1, emissive: '#2a0a4a', emissiveIntensity: 0.4 });
const veinMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.5, 2.8), toneMapped: false });
const rootBark = new THREE.MeshStandardMaterial({ color: '#3a2430', roughness: 0.85, flatShading: true });
const corruptCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.4, 2.6), toneMapped: false });
const sapling = new THREE.MeshStandardMaterial({ color: '#6fd84a', roughness: 0.5, emissive: '#1f6a10', emissiveIntensity: 0.4 });
const thorn = new THREE.MeshStandardMaterial({ color: '#2f3a24', roughness: 0.8, flatShading: true });
const thornTip = new THREE.MeshStandardMaterial({ color: '#7a4a6a', roughness: 0.6 });
const straw = new THREE.MeshStandardMaterial({ color: '#c9a35a', roughness: 0.95, flatShading: true });
const ash = new THREE.MeshStandardMaterial({ color: '#1a1416', roughness: 1 });

/** Obsidian seal: a dark crystal monolith; each chain blast opens brighter violet cracks. */
function Seal({ id }: { id: number }) {
  const { controller, ox, oz } = useGame();
  const get = useProp(id);
  const p0 = get()!;
  const root = useRef<THREE.Group>(null!);
  const veins = useRef<THREE.Group>(null!);
  const brokeAt = useRef<number | null>(null);
  const hitAt = useRef(0);
  useEffect(
    () =>
      controller.on((e) => {
        if ((e.type === 'sealCracked' || e.type === 'sealResisted') && e.propId === id) hitAt.current = performance.now();
      }),
    [controller, id],
  );
  useFrame(({ clock }) => {
    const p = get();
    if (!p) return;
    if (p.state === 'broken') {
      if (brokeAt.current === null) brokeAt.current = performance.now();
      const k = Math.min(1, (performance.now() - brokeAt.current) / 450);
      root.current.scale.set(1 + k * 0.5, Math.max(0.0001, 1 - k), 1 + k * 0.5);
      root.current.visible = k < 1;
      return;
    }
    const hp = p.hp ?? 3;
    // Cracks show up as the seal weakens (3 → 0).
    veins.current.children.forEach((v, i) => (v.visible = i < (3 - hp) * 2 + 1));
    const pulse = 0.6 + 0.4 * Math.sin(clock.elapsedTime * (2 + (3 - hp) * 2));
    veinMat.color.setRGB(1.6 * pulse, 0.5 * pulse, 2.8 * pulse);
    const shake = performance.now() - hitAt.current < 200 ? Math.sin(performance.now() * 0.12) * 0.04 : 0;
    root.current.position.x = shake;
  });
  return (
    <group position={[p0.x + ox, 0, p0.y + oz]}>
      <group ref={root}>
        <mesh position={[0, 0.55, 0]} scale={[0.42, 0.62, 0.42]} material={obsidianGlass} castShadow receiveShadow>
          <octahedronGeometry args={[1, 0]} />
        </mesh>
        <mesh position={[0, 0.08, 0]} material={stone} receiveShadow>
          <cylinderGeometry args={[0.42, 0.48, 0.16, 6]} />
        </mesh>
        <group ref={veins} position={[0, 0.55, 0]}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <mesh key={i} position={[Math.cos(i * 2.1) * 0.2, (i % 3) * 0.18 - 0.18, Math.sin(i * 2.1) * 0.2]} rotation={[i * 0.7, i * 1.3, 0.4 + i]} material={veinMat}>
              <boxGeometry args={[0.03, 0.34, 0.03]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

/** Corrupted root: a knot of twisted roots around a pulsing violet heart; purified, a sapling sprouts. */
function Root({ id }: { id: number }) {
  const { ox, oz } = useGame();
  const get = useProp(id);
  const p0 = get()!;
  const knot = useRef<THREE.Group>(null!);
  const core = useRef<THREE.Mesh>(null!);
  const sprout = useRef<THREE.Group>(null!);
  const curedAt = useRef<number | null>(null);
  const roots = useMemo(() => Array.from({ length: 6 }, (_, i) => ({ a: (i / 6) * Math.PI * 2 + i * 0.3, tilt: 0.5 + (i % 3) * 0.2, len: 0.55 + (i % 2) * 0.2 })), []);
  useFrame(({ clock }) => {
    const p = get();
    if (!p) return;
    const t = clock.elapsedTime;
    if (p.state === 'broken') {
      if (curedAt.current === null) curedAt.current = performance.now();
      const k = Math.min(1, (performance.now() - curedAt.current) / 600);
      knot.current.scale.setScalar(Math.max(0.0001, 1 - k));
      knot.current.visible = k < 1;
      sprout.current.visible = true;
      sprout.current.scale.setScalar(Math.max(0.0001, k));
      sprout.current.rotation.y = t * 0.6;
      return;
    }
    sprout.current.visible = false;
    const hp = p.hp ?? 3;
    const beat = 1 + 0.15 * Math.sin(t * (3 + (3 - hp)));
    core.current.scale.setScalar((0.6 + hp * 0.15) * beat);
    knot.current.rotation.y = Math.sin(t * 0.7 + id) * 0.08;
  });
  return (
    <group position={[p0.x + ox, 0, p0.y + oz]}>
      <group ref={knot}>
        {roots.map((r, i) => (
          <mesh key={i} position={[Math.cos(r.a) * 0.18, 0.22, Math.sin(r.a) * 0.18]} rotation={[Math.sin(r.a) * r.tilt, 0, -Math.cos(r.a) * r.tilt]} material={rootBark} castShadow>
            <cylinderGeometry args={[0.05, 0.11, r.len, 6]} />
          </mesh>
        ))}
        <mesh position={[0, 0.4, 0]} scale={[0.32, 0.42, 0.32]} material={rootBark} castShadow>
          <dodecahedronGeometry args={[1, 0]} />
        </mesh>
        <mesh ref={core} position={[0, 0.5, -0.22]} material={corruptCore}>
          <sphereGeometry args={[0.12, 12, 10]} />
        </mesh>
      </group>
      <group ref={sprout} visible={false}>
        <mesh position={[0, 0.15, 0]} material={sapling}>
          <cylinderGeometry args={[0.025, 0.035, 0.3, 6]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.09, 0.3, 0]} rotation={[0, 0, -s * 0.6]} scale={[1, 0.25, 0.55]} material={sapling}>
            <sphereGeometry args={[0.12, 10, 8]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Bramble: a thorny bush in place of a crate; cut, it sprouts back while a corrupted root lives. */
function Bramble({ id }: { id: number }) {
  const { controller, ox, oz } = useGame();
  const get = useProp(id);
  const p0 = get()!;
  const bush = useRef<THREE.Group>(null!);
  const grow = useRef({ shown: 1, target: 1 });
  const lumps = useMemo(() => Array.from({ length: 5 }, (_, i) => ({ x: Math.cos(i * 1.3) * 0.18, y: 0.3 + (i % 2) * 0.16, z: Math.sin(i * 1.3) * 0.18, s: 0.22 + (i % 3) * 0.05 })), []);
  useFrame((_, dt) => {
    const p = get();
    if (!p) return;
    const isBlock = getCell(controller.state.grid, p.x, p.y) === Cell.Block;
    const g = grow.current;
    g.target = isBlock ? 1 : 0;
    g.shown += (g.target - g.shown) * Math.min(1, dt * (g.target ? 3 : 12));
    bush.current.visible = g.shown > 0.02;
    bush.current.scale.setScalar(Math.max(0.0001, g.shown));
  });
  return (
    <group position={[p0.x + ox, 0, p0.y + oz]}>
      <group ref={bush}>
        {lumps.map((l, i) => (
          <mesh key={i} position={[l.x, l.y, l.z]} scale={l.s} material={thorn} castShadow>
            <icosahedronGeometry args={[1, 0]} />
          </mesh>
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <mesh key={i} position={[Math.cos(i * 2.4) * 0.34, 0.25 + (i % 3) * 0.14, Math.sin(i * 2.4) * 0.34]} rotation={[Math.sin(i * 2.4) * 1.2, 0, -Math.cos(i * 2.4) * 1.2]} material={thornTip}>
            <coneGeometry args={[0.03, 0.16, 4]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Dry grass: straw tufts that flare up when a blast reaches them, then leave black ash. */
function Grass({ id }: { id: number }) {
  const { ox, oz } = useGame();
  const get = useProp(id);
  const p0 = get()!;
  const tufts = useRef<THREE.Group>(null!);
  const fire = useRef<THREE.Group>(null!);
  const scorch = useRef<THREE.Mesh>(null!);
  const blades = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ x: ((i % 3) - 1) * 0.26 + Math.sin(i * 3.1) * 0.06, z: (Math.floor(i / 3) - 1) * 0.26 + Math.cos(i * 2.3) * 0.06, h: 0.22 + (i % 4) * 0.05, r: i * 0.7 })), []);
  useFrame(({ clock }) => {
    const p = get();
    if (!p) return;
    const t = clock.elapsedTime;
    tufts.current.visible = p.state === 'dry';
    fire.current.visible = p.state === 'burning';
    scorch.current.visible = p.state !== 'dry';
    if (p.state === 'dry') tufts.current.rotation.z = Math.sin(t * 1.5 + id) * 0.05;
    if (p.state === 'burning') fire.current.children.forEach((f, i) => (f.scale.y = 0.7 + 0.5 * Math.abs(Math.sin(t * 14 + i * 1.7))));
  });
  return (
    <group position={[p0.x + ox, 0, p0.y + oz]}>
      <group ref={tufts}>
        {blades.map((b, i) => (
          <mesh key={i} position={[b.x, b.h / 2, b.z]} rotation={[0, b.r, 0.15]} material={straw}>
            <coneGeometry args={[0.07, b.h, 4]} />
          </mesh>
        ))}
      </group>
      <group ref={fire} visible={false}>
        {blades.slice(0, 5).map((b, i) => (
          <mesh key={i} position={[b.x, 0.22, b.z]} material={fireMat}>
            <coneGeometry args={[0.13, 0.5, 6, 1, true]} />
          </mesh>
        ))}
      </group>
      <mesh ref={scorch} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={ash} visible={false}>
        <circleGeometry args={[0.45, 12]} />
      </mesh>
    </group>
  );
}

// ───────────────────────────── Guardian Chamber ─────────────────────────────

const totemStone = new THREE.MeshStandardMaterial({ color: '#77707e', roughness: 0.82, flatShading: true });
const totemCap = new THREE.MeshStandardMaterial({ color: '#36313b', roughness: 0.7, flatShading: true });
const totemRune = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.4, 1.8), toneMapped: false });

/**
 * Totem of Return: a carved stone pillar with teal runes and a floating ring. Ready, it glows and
 * the ring spins; spent, it goes dark until the boss's next phase recharges it.
 */
function Totem({ id }: { id: number }) {
  const { controller, ox, oz } = useGame();
  const get = useProp(id);
  const p0 = get()!;
  const rune = useMemo(() => totemRune.clone(), []);
  const ring = useRef<THREE.Group>(null!);
  const glow = useRef<THREE.PointLight>(null!);
  const flash = useRef(0);
  useEffect(
    () =>
      controller.on((e) => {
        if (e.type === 'totemRevive' && e.propId === id) flash.current = 1;
      }),
    [controller, id],
  );
  useFrame(({ clock }, dt) => {
    const p = get();
    if (!p) return;
    const t = clock.elapsedTime;
    const ready = p.state === 'idle';
    flash.current = Math.max(0, flash.current - dt * 1.2);
    const k = ready ? 0.75 + 0.25 * Math.sin(t * 3 + id) : 0.1;
    const f = flash.current * 3;
    rune.color.setRGB(0.4 * k + f, 2.4 * k + f, 1.8 * k + f);
    ring.current.rotation.y = t * (ready ? 0.9 : 0.12);
    ring.current.position.y = 1.32 + (ready ? Math.sin(t * 2 + id) * 0.06 : -0.08);
    glow.current.intensity = (ready ? 1.4 : 0) + flash.current * 8;
  });
  return (
    <group position={[p0.x + ox, 0, p0.y + oz]}>
      <mesh position={[0, 0.1, 0]} material={totemCap} receiveShadow castShadow>
        <cylinderGeometry args={[0.46, 0.5, 0.2, 8]} />
      </mesh>
      <mesh position={[0, 0.66, 0]} material={totemStone} castShadow receiveShadow>
        <boxGeometry args={[0.52, 0.95, 0.52]} />
      </mesh>
      <mesh position={[0, 1.2, 0]} rotation={[0, Math.PI / 4, 0]} material={totemCap} castShadow>
        <cylinderGeometry args={[0.2, 0.4, 0.22, 4]} />
      </mesh>
      {/* Carved face: two glowing eyes and a mouth line on the front. */}
      {[-0.11, 0.11].map((x) => (
        <mesh key={x} position={[x, 0.86, 0.265]} material={rune}>
          <boxGeometry args={[0.09, 0.05, 0.02]} />
        </mesh>
      ))}
      <mesh position={[0, 0.64, 0.265]} material={rune}>
        <boxGeometry args={[0.22, 0.035, 0.02]} />
      </mesh>
      {/* Side runes. */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.5 + i * 0.16, 0]} rotation={[0, (i * Math.PI) / 2 + Math.PI / 2, 0]} material={rune}>
          <boxGeometry args={[0.04, 0.1, 0.54]} />
        </mesh>
      ))}
      <group ref={ring} position={[0, 1.32, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={rune}>
          <torusGeometry args={[0.36, 0.025, 6, 28]} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[Math.cos((i * Math.PI) / 2) * 0.36, 0, Math.sin((i * Math.PI) / 2) * 0.36]} material={rune}>
            <octahedronGeometry args={[0.06, 0]} />
          </mesh>
        ))}
      </group>
      <pointLight ref={glow} position={[0, 1.3, 0]} color="#5fffd0" intensity={1.4} distance={3} decay={1.6} />
    </group>
  );
}
