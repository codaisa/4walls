import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DIR_VEC } from '@4walls/shared';
import { damp, lerp, useGame } from './context';

/** Enough for the endless Adventure's live window (up to three regions of Magmitos and Fagulhas). */
const POOL = 40;

/** Magmites: hopping blobs of cooled crust over a pulsing molten core. */
export function Enemies() {
  const { controller, ox, oz } = useGame();
  const groups = useRef<(THREE.Group | null)[]>([]);
  const bodies = useRef<(THREE.Group | null)[]>([]);
  const yaw = useRef<number[]>(Array(POOL).fill(0));
  const deathT = useRef<number[]>(Array(POOL).fill(0));
  const magmite = useRef<(THREE.Group | null)[]>([]);
  const sprout = useRef<(THREE.Group | null)[]>([]);
  const spark = useRef<(THREE.Group | null)[]>([]);
  const sparkCore = useRef<(THREE.Mesh | null)[]>([]);
  const sparkFlame = useRef<(THREE.Mesh | null)[]>([]);

  const m = useMemo(
    () => ({
      body: new THREE.MeshPhysicalMaterial({ color: '#3b1a14', emissive: '#ff3d0a', emissiveIntensity: 1, roughness: 0.55, clearcoat: 0.6 }),
      crust: new THREE.MeshStandardMaterial({ color: '#241517', roughness: 0.95, flatShading: true }),
      eye: new THREE.MeshBasicMaterial({ color: '#fff6d8' }),
      pupil: new THREE.MeshBasicMaterial({ color: '#160a0a' }),
      horn: new THREE.MeshStandardMaterial({ color: '#1a1012', roughness: 0.6 }),
      // Brotinho (Guardião's seedling): glossy green bulb, two leaves, root feet.
      bulb: new THREE.MeshPhysicalMaterial({ color: '#5fcf3a', emissive: '#1f6a10', emissiveIntensity: 0.35, roughness: 0.4, clearcoat: 0.7 }),
      leaf: new THREE.MeshStandardMaterial({ color: '#8cf04a', roughness: 0.5, side: THREE.DoubleSide }),
      root: new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.9 }),
      // Fagulha: a hot ember with a flickering flame crown.
      ember: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.4), toneMapped: false }),
      emberAlert: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.6, 0.3), toneMapped: false }),
      flame: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.8, 0.1), toneMapped: false, transparent: true, opacity: 0.75, depthWrite: false }),
      shell: new THREE.MeshStandardMaterial({ color: '#2a1410', roughness: 0.8, flatShading: true }),
    }),
    [],
  );

  useFrame(({ clock }, dt) => {
    const s = controller.state;
    const t = clock.elapsedTime;
    m.body.emissiveIntensity = 1.1 + Math.sin(t * 3) * 0.4;
    for (let i = 0; i < POOL; i++) {
      const g = groups.current[i];
      const b = bodies.current[i];
      if (!g || !b) continue;
      const e = s.enemies[i];
      if (!e || (!e.alive && deathT.current[i] > 0.45)) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      g.position.set(lerp(e.px, e.x, controller.alpha) + ox, 0, lerp(e.py, e.y, controller.alpha) + oz);
      if (e.dir) {
        const v = DIR_VEC[e.dir];
        const target = Math.atan2(v.x, v.y);
        let d = target - yaw.current[i];
        d = Math.atan2(Math.sin(d), Math.cos(d));
        yaw.current[i] += d * damp(10, dt);
      }
      g.rotation.y = yaw.current[i];
      const isSprout = e.kind === 'sprout';
      const isSpark = e.kind === 'spark';
      const mg = magmite.current[i];
      const sp = sprout.current[i];
      const sk = spark.current[i];
      if (mg) mg.visible = !isSprout && !isSpark;
      if (sk) {
        sk.visible = isSpark;
        if (isSpark) {
          const core = sparkCore.current[i];
          const flame = sparkFlame.current[i];
          const alert = e.mode === 'alert';
          const charge = e.mode === 'charge';
          // Warning: it swells and flashes red; charging: it stretches along its run.
          if (core) {
            core.material = alert && Math.floor(t * 14) % 2 === 0 ? m.emberAlert : m.ember;
            const sw = alert ? 1.25 + Math.sin(t * 40) * 0.08 : 1;
            core.scale.set(sw, sw, charge ? 1.7 : sw);
          }
          if (flame) {
            flame.scale.set(1, 0.8 + Math.sin(t * 22 + i) * 0.25 + (alert ? 0.5 : 0), 1);
            flame.rotation.y = t * 6;
          }
          sk.position.x = alert ? Math.sin(t * 60) * 0.03 : 0;
        }
      }
      if (sp) {
        sp.visible = isSprout;
        // Leaves flutter.
        if (isSprout) sp.rotation.z = Math.sin(t * 9 + i) * 0.06;
      }
      if (!e.alive) {
        deathT.current[i] += dt;
        const k = deathT.current[i] / 0.45;
        b.scale.set(1 + k * 0.8, Math.max(1e-4, 1 - k), 1 + k * 0.8);
        b.position.y = 0;
        continue;
      }
      deathT.current[i] = 0;
      const hop = Math.abs(Math.sin(t * 7 + i * 1.7));
      b.position.y = hop * 0.16;
      const squash = 1 - (1 - hop) * 0.18;
      b.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    }
  });

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <group key={i} ref={(g) => void (groups.current[i] = g)} visible={false}>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
            <circleGeometry args={[0.3, 18]} />
            <meshBasicMaterial color="#000" transparent opacity={0.35} depthWrite={false} />
          </mesh>
          <group ref={(g) => void (bodies.current[i] = g)}>
            <group ref={(g) => void (sprout.current[i] = g)} visible={false}>
              <mesh position={[0, 0.26, 0]} scale={[1, 1.1, 1]} material={m.bulb} castShadow>
                <sphereGeometry args={[0.24, 20, 14]} />
              </mesh>
              {[-1, 1].map((side) => (
                <mesh key={side} position={[side * 0.1, 0.56, 0]} rotation={[0, 0, -side * 0.7]} scale={[1, 0.25, 0.6]} material={m.leaf}>
                  <sphereGeometry args={[0.16, 12, 8]} />
                </mesh>
              ))}
              {[-1, 1].map((side) => (
                <group key={side}>
                  <mesh position={[side * 0.09, 0.3, 0.2]} material={m.eye}>
                    <sphereGeometry args={[0.065, 12, 10]} />
                  </mesh>
                  <mesh position={[side * 0.085, 0.3, 0.255]} material={m.pupil}>
                    <sphereGeometry args={[0.032, 8, 6]} />
                  </mesh>
                </group>
              ))}
              {[0, 1, 2].map((k) => (
                <mesh key={k} position={[Math.cos((k / 3) * Math.PI * 2) * 0.15, 0.04, Math.sin((k / 3) * Math.PI * 2) * 0.15]} rotation={[Math.PI / 2, 0, (k / 3) * Math.PI * 2]} material={m.root}>
                  <coneGeometry args={[0.04, 0.18, 5]} />
                </mesh>
              ))}
            </group>
            {/* Fagulha */}
            <group ref={(g) => void (spark.current[i] = g)} visible={false}>
              <mesh ref={(r) => void (sparkCore.current[i] = r)} position={[0, 0.32, 0]} material={m.ember}>
                <icosahedronGeometry args={[0.17, 1]} />
              </mesh>
              {[0, 1, 2, 3, 4].map((k) => (
                <mesh key={k} position={[Math.cos((k / 5) * Math.PI * 2) * 0.13, 0.28 + (k % 2) * 0.06, Math.sin((k / 5) * Math.PI * 2) * 0.13]} material={m.shell} castShadow>
                  <dodecahedronGeometry args={[0.07, 0]} />
                </mesh>
              ))}
              <mesh ref={(r) => void (sparkFlame.current[i] = r)} position={[0, 0.55, 0]} material={m.flame}>
                <coneGeometry args={[0.12, 0.34, 7, 1, true]} />
              </mesh>
              {[-1, 1].map((side) => (
                <mesh key={side} position={[side * 0.065, 0.36, 0.15]} material={m.pupil}>
                  <sphereGeometry args={[0.03, 8, 6]} />
                </mesh>
              ))}
            </group>
            <group ref={(g) => void (magmite.current[i] = g)}>
            <mesh position={[0, 0.3, 0]} scale={[1, 0.85, 1]} material={m.body} castShadow>
              <sphereGeometry args={[0.3, 22, 16]} />
            </mesh>
            {/* Crust plates */}
            {[
              [0.12, 0.5, -0.08, 0.11],
              [-0.15, 0.44, -0.1, 0.1],
              [0.0, 0.53, -0.16, 0.09],
              [0.2, 0.3, -0.12, 0.08],
            ].map(([x, y, z, r], k) => (
              <mesh key={k} position={[x, y, z]} material={m.crust}>
                <dodecahedronGeometry args={[r, 0]} />
              </mesh>
            ))}
            {[-1, 1].map((side) => (
              <group key={side}>
                <mesh position={[side * 0.11, 0.38, 0.23]} material={m.eye}>
                  <sphereGeometry args={[0.07, 12, 10]} />
                </mesh>
                <mesh position={[side * 0.1, 0.37, 0.29]} material={m.pupil}>
                  <sphereGeometry args={[0.032, 8, 6]} />
                </mesh>
                <mesh position={[side * 0.17, 0.55, 0.02]} rotation-z={-side * 0.5} material={m.horn}>
                  <coneGeometry args={[0.05, 0.16, 6]} />
                </mesh>
              </group>
            ))}
            </group>
          </group>
        </group>
      ))}
    </>
  );
}
