import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clamp01, useGame } from './context';

const OPEN_TICKS = 50;

/** Sealed region gates: a stone frame with a glowing rune barrier that dissolves when the gate opens. */
export function Gates() {
  const { controller, ox, oz } = useGame();
  const gates = controller.state.adventure?.gates ?? [];
  const barriers = useRef<(THREE.Mesh | null)[]>([]);
  const runes = useRef<(THREE.Mesh | null)[]>([]);
  const m = useMemo(
    () => ({
      stone: new THREE.MeshStandardMaterial({ color: '#8a7c86', roughness: 0.85, flatShading: true }),
      barrier: gates.map(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.9, 3.2), toneMapped: false, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })),
      rune: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.4, 0.4), toneMapped: false }),
    }),
    [gates],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    gates.forEach((g, i) => {
      const b = barriers.current[i];
      if (!b) return;
      const k = g.open ? clamp01((controller.tickF - g.openedTick) / OPEN_TICKS) : 0;
      b.visible = k < 1;
      b.scale.set(1, Math.max(0.001, 1 - k), 1);
      b.position.y = 0.6 * (1 - k);
      m.barrier[i].opacity = (0.65 + 0.15 * Math.sin(t * 3 + i)) * (1 - k);
      const r = runes.current[i];
      if (r) r.rotation.z = t * (g.open ? 0.2 : 1.2);
    });
  });

  return (
    <>
      {gates.map((g, i) => (
        <group key={g.id} position={[g.x + ox, 0, g.y + oz]} rotation-y={g.axis === 'h' ? 0 : Math.PI / 2}>
          {/* Frame: pillars on both sides of the passage + lintel. */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, 0.75, s * 0.56]} material={m.stone} castShadow>
              <boxGeometry args={[0.5, 1.5, 0.22]} />
            </mesh>
          ))}
          <mesh position={[0, 1.58, 0]} material={m.stone} castShadow>
            <boxGeometry args={[0.6, 0.22, 1.42]} />
          </mesh>
          <mesh ref={(r) => void (runes.current[i] = r)} position={[-0.31, 1.58, 0]} rotation-y={-Math.PI / 2} material={m.rune}>
            <torusGeometry args={[0.08, 0.02, 6, 6]} />
          </mesh>
          {/* The seal: a translucent rune barrier filling the doorway. */}
          <mesh ref={(r) => void (barriers.current[i] = r)} position={[0, 0.6, 0]} material={m.barrier[i]}>
            <boxGeometry args={[0.12, 1.2, 0.9]} />
          </mesh>
        </group>
      ))}
    </>
  );
}
