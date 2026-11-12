import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGame } from './context';

const iron = new THREE.MeshStandardMaterial({ color: '#8a8794', roughness: 0.3, metalness: 0.85, emissive: '#2a2630', emissiveIntensity: 0.4 });
const ironDark = new THREE.MeshStandardMaterial({ color: '#24222b', roughness: 0.5, metalness: 0.7 });
const gold = new THREE.MeshStandardMaterial({ color: '#f2b622', roughness: 0.25, metalness: 0.8, emissive: '#7a4a00', emissiveIntensity: 0.4 });
const shadowBody = new THREE.MeshStandardMaterial({ color: '#2b2238', roughness: 0.6 });
const shadowHead = new THREE.MeshStandardMaterial({ color: '#4a3d5c', roughness: 0.45 });
const eyeGlow = new THREE.MeshBasicMaterial({ color: '#fff6c8', toneMapped: false });
const markGlow = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb020', emissiveIntensity: 2.2, roughness: 0.3 });
const ringGlow = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.6, toneMapped: false, depthWrite: false });

const BAR_POS: [number, number][] = [];
for (let i = 0; i < 4; i++) {
  const t = -0.36 + (i * 0.72) / 3;
  BAR_POS.push([t, -0.4], [t, 0.4], [-0.4, t], [0.4, t]);
}

/** Caged heroes of the Adventure: locked cage → freed prisoner waving for help → gone once rescued. */
export function Cages() {
  const { controller } = useGame();
  const cages = controller.state.adventure?.cages ?? [];
  return (
    <>
      {cages.map((c) => (
        <Cage key={c.id} id={c.id} />
      ))}
    </>
  );
}

function Cage({ id }: { id: number }) {
  const { controller, ox, oz } = useGame();
  const cage = controller.state.adventure!.cages[id];
  const cageRef = useRef<THREE.Group>(null!);
  const prisoner = useRef<THREE.Group>(null!);
  const question = useRef<THREE.Group>(null!);
  const bang = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const eyes = useRef<THREE.Group>(null!);
  const phase = useMemo(() => id * 1.7, [id]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    const st = cage.state;
    cageRef.current.visible = st === 'locked';
    prisoner.current.visible = st !== 'rescued';
    question.current.visible = st === 'locked';
    bang.current.visible = st === 'free';
    ring.current.visible = st === 'free';
    if (st === 'locked') {
      // Restless prisoner rattling the bars.
      prisoner.current.position.y = Math.abs(Math.sin(t * 3)) * 0.04;
      prisoner.current.rotation.y = Math.sin(t * 1.3) * 0.5;
      question.current.position.y = 1.35 + Math.sin(t * 2.2) * 0.06;
      question.current.rotation.y = t * 1.5;
    } else if (st === 'free') {
      // Jumping and waving: "over here!"
      prisoner.current.position.y = Math.abs(Math.sin(t * 6)) * 0.22;
      prisoner.current.rotation.y = Math.sin(t * 4) * 0.25;
      bang.current.position.y = 1.45 + Math.abs(Math.sin(t * 6)) * 0.22;
      const k = (t * 1.6) % 1;
      ring.current.scale.setScalar(0.6 + k * 0.7);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
    }
    // Blink.
    eyes.current.scale.y = Math.sin(t * 0.9) > 0.97 ? 0.1 : 1;
  });

  return (
    <group position={[cage.x + ox, 0, cage.y + oz]}>
      {/* The cage */}
      <group ref={cageRef}>
        <mesh position={[0, 0.04, 0]} material={ironDark} castShadow receiveShadow>
          <boxGeometry args={[0.9, 0.08, 0.9]} />
        </mesh>
        {/* Gold trim around the base so the cage pops on dark floors */}
        {([
          [0, -0.44, 0.92, 0.04],
          [0, 0.44, 0.92, 0.04],
          [-0.44, 0, 0.04, 0.92],
          [0.44, 0, 0.04, 0.92],
        ] as const).map(([x, z, sx, sz], i) => (
          <mesh key={`trim${i}`} position={[x, 0.09, z]} material={gold}>
            <boxGeometry args={[sx, 0.03, sz]} />
          </mesh>
        ))}
        {/* Open roof (seen from the top camera): two crossing bars and a hanging ring */}
        <mesh position={[0, 1.0, 0]} material={iron} castShadow>
          <boxGeometry args={[0.84, 0.035, 0.04]} />
        </mesh>
        <mesh position={[0, 1.0, 0]} material={iron} castShadow>
          <boxGeometry args={[0.04, 0.035, 0.84]} />
        </mesh>
        <mesh position={[0, 1.08, 0]} rotation={[0, Math.PI / 2, 0]} material={iron} castShadow>
          <torusGeometry args={[0.09, 0.022, 8, 20]} />
        </mesh>
        {BAR_POS.map(([x, z], i) => (
          <mesh key={i} position={[x, 0.53, z]} material={iron} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.92, 8]} />
          </mesh>
        ))}
        {/* Horizontal rails tying the bars together */}
        {[0.32, 0.74, 1.0].flatMap((y) =>
          ([
            [0, -0.4, 0.84, 0.03],
            [0, 0.4, 0.84, 0.03],
            [-0.4, 0, 0.03, 0.84],
            [0.4, 0, 0.03, 0.84],
          ] as const).map(([x, z, sx, sz], i) => (
            <mesh key={`${y}-${i}`} position={[x, y, z]} material={iron}>
              <boxGeometry args={[sx, 0.03, sz]} />
            </mesh>
          )),
        )}
        {/* Padlock on the front */}
        <group position={[0, 0.5, 0.44]}>
          <mesh material={gold} castShadow>
            <boxGeometry args={[0.16, 0.13, 0.06]} />
          </mesh>
          <mesh position={[0, 0.09, 0]} material={gold}>
            <torusGeometry args={[0.05, 0.016, 8, 16, Math.PI]} />
          </mesh>
          <mesh position={[0, -0.01, 0.032]} material={ironDark}>
            <cylinderGeometry args={[0.018, 0.018, 0.01, 10]} />
          </mesh>
        </group>
      </group>

      {/* The prisoner: a mystery hero in silhouette */}
      <group ref={prisoner}>
        <mesh position={[0, 0.28, 0]} material={shadowBody} castShadow>
          <capsuleGeometry args={[0.17, 0.12, 6, 12]} />
        </mesh>
        <mesh position={[0, 0.72, 0]} material={shadowHead} castShadow>
          <boxGeometry args={[0.5, 0.44, 0.44]} />
        </mesh>
        <group ref={eyes} position={[0, 0.72, 0.225]}>
          {[-0.09, 0.09].map((x) => (
            <mesh key={x} position={[x, 0, 0]} material={eyeGlow}>
              <capsuleGeometry args={[0.035, 0.1, 4, 8]} />
            </mesh>
          ))}
        </group>
        {/* Waving arms */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0.26 * s, 0.5, 0.05]} rotation={[0, 0, s * 0.5]} material={shadowBody}>
            <sphereGeometry args={[0.08, 12, 8]} />
          </mesh>
        ))}
      </group>

      {/* "?" above a locked cage */}
      <group ref={question} position={[0, 1.35, 0]}>
        <mesh position={[0, 0.12, 0]} rotation={[0, 0, -Math.PI / 2]} material={markGlow}>
          <torusGeometry args={[0.1, 0.035, 10, 20, Math.PI * 1.4]} />
        </mesh>
        <mesh position={[0, -0.03, 0]} material={markGlow}>
          <cylinderGeometry args={[0.035, 0.035, 0.1, 10]} />
        </mesh>
        <mesh position={[0, -0.16, 0]} material={markGlow}>
          <sphereGeometry args={[0.045, 12, 8]} />
        </mesh>
      </group>

      {/* "!" above a freed prisoner + pulsing ring on the floor */}
      <group ref={bang} position={[0, 1.45, 0]}>
        <mesh position={[0, 0.08, 0]} material={markGlow}>
          <cylinderGeometry args={[0.05, 0.03, 0.26, 10]} />
        </mesh>
        <mesh position={[0, -0.13, 0]} material={markGlow}>
          <sphereGeometry args={[0.05, 12, 8]} />
        </mesh>
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} material={ringGlow}>
        <ringGeometry args={[0.38, 0.48, 40]} />
      </mesh>
    </group>
  );
}
