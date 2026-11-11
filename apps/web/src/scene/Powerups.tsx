import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { POWERUPS, RARITY_COLOR, type PowerupType } from '@4walls/shared';
import { clamp01, easeOutBack, useGame } from './context';

const POOL = 32;
const TYPES = Object.keys(POWERUPS) as PowerupType[];

const glow = (hex: string, k = 2.4) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });
const std = (hex: string, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
  new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.35, clearcoat: 0.8, ...extra });

function useIconMaterials() {
  return useMemo(
    () => ({
      token: std('#2b2240', { roughness: 0.3, clearcoat: 1 }),
      ring: Object.fromEntries(TYPES.map((t) => [t, glow(RARITY_COLOR[POWERUPS[t].rarity])])) as unknown as Record<PowerupType, THREE.Material>,
      bomb: std('#1e1830', { roughness: 0.25, clearcoat: 1 }),
      fire: glow('#ff6a1f', 2.2),
      fireCore: glow('#ffe08a', 2.8),
      cyan: std('#3ee0ff', { emissive: '#18a8d8', emissiveIntensity: 1.1 }),
      shield: std('#8fa6ff', { emissive: '#3d5bff', emissiveIntensity: 0.9, metalness: 0.4 }),
      cream: new THREE.MeshBasicMaterial({ color: '#ffe9a8' }),
      boot: std('#8a5a33'),
      sole: std('#3a2a20'),
      ghost: new THREE.MeshPhysicalMaterial({ color: '#e7dcff', transparent: true, opacity: 0.85, emissive: '#9f7bff', emissiveIntensity: 0.6 }),
      dark: new THREE.MeshBasicMaterial({ color: '#1b1428' }),
      remote: std('#d93b3b'),
      antenna: std('#cfcfcf', { metalness: 0.8 }),
      led: glow('#7dff6a', 3),
      glove: std('#ffd21a', { emissive: '#7a5200', emissiveIntensity: 0.3 }),
      ice: new THREE.MeshPhysicalMaterial({ color: '#c9f3ff', emissive: '#54c8ff', emissiveIntensity: 0.7, roughness: 0.05, transparent: true, opacity: 0.9 }),
    }),
    [],
  );
}
type IconMats = ReturnType<typeof useIconMaterials>;

/** One small 3D icon per power-up type: shapes read at a glance, colors follow the effect. */
const ICONS: Record<PowerupType, (m: IconMats) => ReactNode> = {
  bombUp: (m) => (
    <>
      <mesh material={m.bomb}><sphereGeometry args={[0.17, 18, 14]} /></mesh>
      <mesh position={[0, 0.19, 0]} material={m.fireCore}><icosahedronGeometry args={[0.04, 0]} /></mesh>
      <mesh position={[0, 0, 0.18]} material={m.cream}><boxGeometry args={[0.16, 0.045, 0.03]} /></mesh>
      <mesh position={[0, 0, 0.18]} material={m.cream}><boxGeometry args={[0.045, 0.16, 0.03]} /></mesh>
    </>
  ),
  fireUp: (m) => (
    <>
      <mesh material={m.fire} position={[0, 0.02, 0]}><coneGeometry args={[0.15, 0.4, 8]} /></mesh>
      <mesh material={m.fireCore} position={[0, -0.02, 0]}><coneGeometry args={[0.08, 0.24, 8]} /></mesh>
    </>
  ),
  speedUp: (m) => (
    <>
      {[0, 0.13].map((z) => (
        <group key={z} position={[0, 0, z - 0.06]}>
          <mesh rotation={[0, 0, Math.PI / 4]} position={[-0.07, 0, 0]} material={m.cyan}><boxGeometry args={[0.2, 0.06, 0.06]} /></mesh>
          <mesh rotation={[0, 0, -Math.PI / 4]} position={[0.07, 0, 0]} material={m.cyan}><boxGeometry args={[0.2, 0.06, 0.06]} /></mesh>
        </group>
      ))}
    </>
  ),
  shield: (m) => (
    <>
      <mesh rotation-x={Math.PI / 2} material={m.shield}><cylinderGeometry args={[0.18, 0.18, 0.06, 6]} /></mesh>
      <mesh position={[0, 0, 0.04]} rotation-x={Math.PI / 2} material={m.cream}><cylinderGeometry args={[0.07, 0.07, 0.03, 6]} /></mesh>
    </>
  ),
  kick: (m) => (
    <>
      <mesh position={[-0.05, -0.02, 0]} scale={[1, 0.7, 1.5]} material={m.boot}><sphereGeometry args={[0.1, 14, 10]} /></mesh>
      <mesh position={[0.13, 0.02, 0]} material={m.bomb}><sphereGeometry args={[0.09, 14, 10]} /></mesh>
      <mesh position={[0.24, 0.02, 0]} material={m.fireCore}><boxGeometry args={[0.08, 0.02, 0.02]} /></mesh>
    </>
  ),
  glove: (m) => (
    <>
      <mesh position={[-0.04, -0.05, 0]} scale={[1, 0.95, 0.9]} material={m.glove}><sphereGeometry args={[0.13, 16, 12]} /></mesh>
      <mesh position={[0.08, 0.0, 0.07]} material={m.glove}><sphereGeometry args={[0.05, 10, 8]} /></mesh>
      <mesh position={[-0.04, -0.17, 0]} rotation-x={Math.PI / 2} material={m.glove}><torusGeometry args={[0.09, 0.03, 8, 16]} /></mesh>
      <mesh position={[0.1, 0.2, 0]} material={m.bomb}><sphereGeometry args={[0.08, 14, 10]} /></mesh>
      <mesh position={[0.15, 0.27, 0]} material={m.fireCore}><icosahedronGeometry args={[0.03, 0]} /></mesh>
    </>
  ),
  boots: (m) => (
    <>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.08, 0, 0]}>
          <mesh position={[0, 0.06, 0]} material={m.boot}><cylinderGeometry args={[0.05, 0.06, 0.16, 10]} /></mesh>
          <mesh position={[0, -0.04, 0.04]} scale={[1, 0.5, 1.5]} material={m.sole}><sphereGeometry args={[0.065, 10, 8]} /></mesh>
        </group>
      ))}
    </>
  ),
  ghost: (m) => (
    <>
      <mesh position={[0, 0.03, 0]} scale={[1, 1.2, 1]} material={m.ghost}><sphereGeometry args={[0.15, 16, 12]} /></mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.05, 0.07, 0.13]} material={m.dark}><sphereGeometry args={[0.025, 8, 6]} /></mesh>
      ))}
    </>
  ),
  remote: (m) => (
    <>
      <mesh material={m.remote}><boxGeometry args={[0.16, 0.24, 0.07]} /></mesh>
      <mesh position={[0, 0.03, 0.04]} material={m.cream}><cylinderGeometry args={[0.035, 0.035, 0.02, 12]} /></mesh>
      <mesh position={[0.05, 0.2, 0]} material={m.antenna}><cylinderGeometry args={[0.01, 0.01, 0.16, 6]} /></mesh>
      <mesh position={[0.05, 0.29, 0]} material={m.led}><sphereGeometry args={[0.025, 8, 6]} /></mesh>
    </>
  ),
  infernal: (m) => (
    <>
      <mesh material={m.bomb}><sphereGeometry args={[0.14, 16, 12]} /></mesh>
      <mesh position={[0, 0.18, 0]} material={m.fire}><coneGeometry args={[0.09, 0.22, 7]} /></mesh>
      <mesh position={[0, 0, 0]} rotation-x={Math.PI / 2} material={m.fire}><torusGeometry args={[0.15, 0.025, 6, 20]} /></mesh>
    </>
  ),
  ice: (m) => (
    <>
      <mesh material={m.ice}><octahedronGeometry args={[0.17, 0]} /></mesh>
      <mesh rotation-y={Math.PI / 4} scale={0.6} position={[0, 0.14, 0]} material={m.ice}><octahedronGeometry args={[0.1, 0]} /></mesh>
    </>
  ),
};

/** Floating power-up tokens: a pedestal ring in the rarity color + a distinctive icon per type. */
export function Powerups() {
  const { controller, ox, oz } = useGame();
  const groups = useRef<(THREE.Group | null)[]>([]);
  const icons = useRef<(THREE.Group | null)[][]>([]);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const m = useIconMaterials();

  useFrame(({ clock }) => {
    const s = controller.state;
    const t = clock.elapsedTime;
    for (let i = 0; i < POOL; i++) {
      const g = groups.current[i];
      if (!g) continue;
      const pu = s.powerups[i];
      if (!pu) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      const pop = easeOutBack(clamp01((controller.tickF - pu.bornTick) / 20));
      g.position.set(pu.x + ox, 0, pu.y + oz);
      g.scale.setScalar(Math.max(pop, 1e-4));
      TYPES.forEach((type, j) => {
        const ic = icons.current[i]?.[j];
        if (!ic) return;
        ic.visible = type === pu.type;
        if (!ic.visible) return;
        ic.position.y = 0.5 + Math.sin(t * 3 + pu.id) * 0.06;
        ic.rotation.y = t * 1.6 + pu.id;
      });
      const r = rings.current[i];
      if (r) {
        r.material = m.ring[pu.type];
        r.scale.setScalar(1 + Math.sin(t * 4 + pu.id) * 0.06);
      }
    }
  });

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => {
        icons.current[i] = icons.current[i] ?? [];
        return (
          <group key={i} ref={(g) => void (groups.current[i] = g)} visible={false}>
            <mesh position={[0, 0.06, 0]} material={m.token} receiveShadow>
              <cylinderGeometry args={[0.36, 0.4, 0.1, 24]} />
            </mesh>
            <mesh ref={(r) => void (rings.current[i] = r)} position={[0, 0.12, 0]} rotation-x={-Math.PI / 2} material={m.ring.bombUp}>
              <torusGeometry args={[0.33, 0.03, 8, 32]} />
            </mesh>
            {TYPES.map((type, j) => (
              <group key={type} ref={(g) => void (icons.current[i][j] = g)} visible={false}>
                {ICONS[type](m)}
              </group>
            ))}
          </group>
        );
      })}
    </>
  );
}
