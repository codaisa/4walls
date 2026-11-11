import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clamp01, damp, useGame } from './context';
import { NOISE_GLSL } from './vfxShaders';

const MINE_POOL = 12;
const METEOR_POOL = 24;
const FALL_TICKS = 40; // the rock is visible for the last ~0.66 s of the fall

/** Where a falling meteor's rock is (world offsets applied by the caller); null while not visible. */
export function meteorRockPos(met: { x: number; y: number; impactTick: number }, tickF: number) {
  const left = met.impactTick - tickF;
  if (left >= FALL_TICKS || left < 0) return null;
  const f = clamp01(1 - left / FALL_TICKS);
  return { x: met.x + (1 - f) * 2.5, y: 12 * (1 - f) + 0.3, z: met.y - (1 - f) * 1.5, f };
}

/** Molten rock: dark basalt split by glowing lava cracks (unlit, so it glows at night). */
const rockVertex = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const rockFragment = /* glsl */ `
  uniform float uTime;
  varying vec3 vPos;
  varying vec3 vNormal;
  ${NOISE_GLSL}
  void main() {
    float n = vfxFbm(vPos.xy * 5.0 + vPos.z * 3.0);
    float crack = 1.0 - smoothstep(0.0, 0.07, abs(n - 0.5));
    float light = 0.35 + 0.65 * max(0.0, dot(vNormal, normalize(vec3(-0.3, 0.8, 0.5))));
    vec3 rock = vec3(0.05, 0.03, 0.025) * light;
    vec3 lava = mix(vec3(2.6, 0.6, 0.06), vec3(4.0, 2.2, 0.5), 0.5 + 0.5 * sin(uTime * 9.0 + n * 20.0));
    gl_FragColor = vec4(mix(rock, lava, crack), 1.0);
  }
`;

/** Engenheiro mines, telegraphed meteors and the ice-floor sheen. */
export function Hazards() {
  return (
    <>
      <Mines />
      <Meteors />
      <IceSheet />
    </>
  );
}

function Mines() {
  const { controller, ox, oz } = useGame();
  const groups = useRef<(THREE.Group | null)[]>([]);
  const lights = useRef<(THREE.Mesh | null)[]>([]);
  const m = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ color: '#3b3f46', metalness: 0.7, roughness: 0.35 }),
      stripe: new THREE.MeshStandardMaterial({ color: '#ffc21a', roughness: 0.5 }),
      armed: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.4, 0.2), toneMapped: false }),
      idle: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.2, 0.3), toneMapped: false }),
    }),
    [],
  );
  useFrame(({ clock }) => {
    const s = controller.state;
    for (let i = 0; i < MINE_POOL; i++) {
      const g = groups.current[i];
      if (!g) continue;
      const mine = s.mines[i];
      g.visible = !!mine;
      if (!mine) continue;
      g.position.set(mine.x + ox, 0, mine.y + oz);
      const armed = s.tick >= mine.armedTick;
      const l = lights.current[i];
      if (l) {
        l.material = armed ? m.armed : m.idle;
        l.visible = !armed || Math.floor(clock.elapsedTime * 6) % 2 === 0;
      }
    }
  });
  return (
    <>
      {Array.from({ length: MINE_POOL }, (_, i) => (
        <group key={i} ref={(g) => void (groups.current[i] = g)} visible={false}>
          <mesh position={[0, 0.05, 0]} material={m.body} castShadow>
            <cylinderGeometry args={[0.24, 0.28, 0.1, 16]} />
          </mesh>
          <mesh position={[0, 0.1, 0]} rotation-x={-Math.PI / 2} material={m.stripe}>
            <ringGeometry args={[0.13, 0.19, 16]} />
          </mesh>
          <mesh ref={(l) => void (lights.current[i] = l)} position={[0, 0.13, 0]} material={m.armed}>
            <sphereGeometry args={[0.05, 10, 8]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Meteors() {
  const { controller, ox, oz } = useGame();
  const markers = useRef<(THREE.Mesh | null)[]>([]);
  const rocks = useRef<(THREE.Mesh | null)[]>([]);
  const m = useMemo(
    () => ({
      marker: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 0.5, 0.15), toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false }),
      // Shadow of the incoming rock: grows darker as it gets closer.
      fill: new THREE.MeshBasicMaterial({ color: '#120604', transparent: true, opacity: 0.2, depthWrite: false }),
      rock: new THREE.ShaderMaterial({ vertexShader: rockVertex, fragmentShader: rockFragment, uniforms: { uTime: { value: 0 } }, toneMapped: false }),
    }),
    [],
  );
  useFrame(({ clock }) => {
    const s = controller.state;
    const tickF = controller.tickF;
    m.rock.uniforms.uTime.value = clock.elapsedTime;
    let anyFill = 0;
    for (let i = 0; i < METEOR_POOL; i++) {
      const mk = markers.current[i];
      const rk = rocks.current[i];
      if (!mk || !rk) continue;
      const met = s.meteors[i];
      mk.visible = rk.visible = !!met;
      if (!met) continue;
      const total = met.impactTick - met.spawnTick;
      const k = clamp01((tickF - met.spawnTick) / total);
      mk.position.set(met.x + ox, 0.03, met.y + oz);
      // Marker closes in and blinks faster as the impact approaches.
      const blink = 0.6 + 0.4 * Math.sin(clock.elapsedTime * (6 + k * 26));
      mk.scale.setScalar((1.25 - k * 0.6) * blink);
      anyFill = Math.max(anyFill, k);
      const pos = meteorRockPos(met, tickF);
      rk.visible = !!pos;
      if (pos) {
        rk.position.set(pos.x + ox, pos.y, pos.z + oz);
        rk.rotation.set(clock.elapsedTime * 4, clock.elapsedTime * 3, 0);
      }
    }
  m.fill.opacity = 0.2 + 0.55 * anyFill;
  });
  return (
    <>
      {Array.from({ length: METEOR_POOL }, (_, i) => (
        <group key={i}>
          <mesh ref={(r) => void (markers.current[i] = r)} rotation-x={-Math.PI / 2} visible={false}>
            <ringGeometry args={[0.32, 0.46, 28]} />
            <primitive object={m.marker} attach="material" />
            {/* Filled danger disk under the ring */}
            <mesh material={m.fill}>
              <circleGeometry args={[0.32, 28]} />
            </mesh>
          </mesh>
          <mesh ref={(r) => void (rocks.current[i] = r)} material={m.rock} visible={false}>
            <dodecahedronGeometry args={[0.36, 1]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** A glossy icy layer that fades in over the floor while the "Piso Congelado" event is active. */
function IceSheet() {
  const { controller } = useGame();
  const { w, h } = controller.state.grid;
  const ref = useRef<THREE.Mesh>(null!);
  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#cdf3ff',
        roughness: 0.05,
        metalness: 0.1,
        clearcoat: 1,
        transparent: true,
        opacity: 0,
        emissive: '#7fd6ff',
        emissiveIntensity: 0.25,
        depthWrite: false,
      }),
    [],
  );
  useFrame((_, dt) => {
    const ev = controller.state.event;
    const target = ev?.type === 'iceFloor' ? (ev.phase === 'active' ? 0.45 : 0.12) : 0;
    mat.opacity += (target - mat.opacity) * damp(3, dt);
    ref.current.visible = mat.opacity > 0.01;
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, 0.006, 0]} material={mat} visible={false} receiveShadow>
      <planeGeometry args={[w - 2, h - 2]} />
    </mesh>
  );
}
