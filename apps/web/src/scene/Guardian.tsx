import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Dir } from '@4walls/shared';
import { clamp01, damp, lerp, useGame } from './context';
import { NOISE_GLSL } from './vfxShaders';

const FACING: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };
const MAX_WARN = 160;

// ───────────────────────── bark with glowing runes ─────────────────────────

const barkVertex = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormal;
  void main() {
    vLocal = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const barkFragment = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;
  uniform float uFlash;
  uniform float uFrozen;
  uniform vec3 uBase;
  varying vec3 vLocal;
  varying vec3 vNormal;
  ${NOISE_GLSL}
  void main() {
    // Vertical bark grooves + knots.
    float a = atan(vLocal.z, vLocal.x);
    float grooves = vfxFbm(vec2(a * 3.0, vLocal.y * 1.2));
    float knots = vfxFbm(vLocal.xz * 4.0 + vLocal.y * 2.0);
    vec3 L = normalize(vec3(-0.45, 0.85, 0.4));
    float diff = max(0.0, dot(normalize(vNormal), L));
    vec3 bark = uBase * (0.55 + 0.9 * grooves) * (0.35 + 0.85 * diff);
    // Runes: thin glowing seams that pulse.
    float rune = 1.0 - smoothstep(0.0, 0.02, abs(knots - 0.5));
    float pulse = 0.7 + 0.3 * sin(uTime * 3.0 + vLocal.y * 4.0);
    vec3 col = mix(bark, vec3(0.9, 2.6, 0.5) * pulse * uGlow, rune * 0.9);
    col = mix(col, vec3(0.55, 0.85, 1.1) * (0.5 + 0.6 * diff), uFrozen);
    col = mix(col, vec3(2.6, 3.0, 2.2), uFlash);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeBark(base: string) {
  return new THREE.ShaderMaterial({
    vertexShader: barkVertex,
    fragmentShader: barkFragment,
    uniforms: { uTime: { value: 0 }, uGlow: { value: 1 }, uFlash: { value: 0 }, uFrozen: { value: 0 }, uBase: { value: new THREE.Color(base) } },
    toneMapped: false,
  });
}

/** Trunk: a tapered, slightly gnarled cylinder. */
function trunkGeometry() {
  const g = new THREE.CylinderGeometry(0.55, 0.72, 1.6, 14, 8);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 1 + Math.sin(y * 4 + Math.atan2(z, x) * 3) * 0.05;
    pos.setXYZ(i, x * k + Math.sin(y * 2) * 0.05, y, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function leafBlob(r: number, seed: number) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h = Math.sin(v.x * 12.9 + v.y * 78.2 + v.z * 37.7 + seed) * 43758.5;
    const k = 1 + ((h - Math.floor(h)) - 0.5) * 0.25;
    pos.setXYZ(i, v.x * k, v.y * k * 0.85, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Guardião Ancião: a walking tree spirit. Animated from the simulation state: sways while walking,
 * raises its branches for the roots, shakes its canopy for spores, sinks to burrow and bursts out.
 */
export function Guardian() {
  const { controller, ox, oz } = useGame();
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const canopy = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const warn = useRef<THREE.InstancedMesh>(null!);
  const spot = useRef<THREE.Mesh>(null!);
  const anim = useRef({ yaw: 0, walk: 0, flash: 0, frozen: 0, armUp: 0, sink: 0, lean: 0, shake: 0 });

  const parts = useMemo(() => {
    const bark = makeBark('#6b4a2e');
    const dark = makeBark('#4a3220');
    return {
      bark,
      dark,
      trunk: trunkGeometry(),
      leaves: [0, 1, 2, 3, 4, 5].map((i) => leafBlob(0.5 + (i % 3) * 0.08, i * 3.1)),
      leafMat: new THREE.MeshStandardMaterial({ color: '#3f9a2e', emissive: '#14420c', emissiveIntensity: 0.4, roughness: 0.7, flatShading: true }),
      leafMat2: new THREE.MeshStandardMaterial({ color: '#5cbf3a', emissive: '#1d5a10', emissiveIntensity: 0.35, roughness: 0.7, flatShading: true }),
      eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 4, 1), toneMapped: false }),
      warnMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.6, 0.25), toneMapped: false, transparent: true, opacity: 0.5, depthWrite: false }),
      warnGeo: new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2),
      spotMat: new THREE.MeshBasicMaterial({ color: '#0b0603', transparent: true, opacity: 0.5, depthWrite: false }),
    };
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }, dt) => {
    const s = controller.state;
    const b = s.boss;
    const a = anim.current;
    const t = clock.elapsedTime;
    warn.current.count = 0;
    spot.current.visible = false;
    root.current.visible = !!b;
    if (!b) return;
    const tickF = controller.tickF;
    const al = controller.alpha;
    root.current.position.set(lerp(b.px, b.x, al) + ox, 0, lerp(b.py, b.y, al) + oz);
    let d = (FACING[b.facing] - a.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    a.yaw += d * damp(5, dt);
    root.current.rotation.y = a.yaw;

    const span = Math.max(1, b.actionUntil - b.actionStart);
    const k = clamp01((tickF - b.actionStart) / span);
    const since = (tickF - b.actionStart) / 60;
    const frozen = s.tick < b.frozenUntil;
    let armUp = 0.25;
    let sink = 0;
    let lean = 0;
    let shake = 0;
    const walking = b.action === 'walk' && (b.x !== b.tx || b.y !== b.ty);
    if (b.action === 'windup') {
      if (b.attack === 'roots') {
        armUp = 0.25 + 2.3 * k;
        lean = -0.15 * k;
      } else if (b.attack === 'spores') {
        shake = k;
        lean = -0.1 * k;
      } else if (b.attack === 'burrow') {
        sink = k * k;
      }
    } else if (b.action === 'burrowed') {
      sink = 1;
    } else if (b.action === 'recover') {
      // Just slammed the roots down / just burst out of the ground.
      const hold = clamp01(1 - since / 0.5);
      armUp = 0.25 - 0.9 * hold;
      lean = 0.25 * hold;
    }
    if (!frozen) {
      const sm = damp(b.action === 'recover' && since < 0.1 ? 30 : 8, dt);
      a.armUp += (armUp - a.armUp) * sm;
      a.lean += (lean - a.lean) * sm;
      a.shake += (shake - a.shake) * sm;
      a.sink += (sink - a.sink) * damp(b.action === 'recover' ? 18 : 10, dt);
      if (walking) a.walk += dt * 4;
    }
    const sway = walking ? Math.sin(a.walk) : Math.sin(t * 0.9) * 0.4;
    body.current.position.y = -a.sink * 3.4 + (walking ? Math.abs(Math.cos(a.walk)) * 0.06 : 0);
    body.current.rotation.set(a.lean, 0, sway * 0.06);
    armL.current.rotation.set(-a.armUp, 0, 0.5 + sway * 0.15);
    armR.current.rotation.set(-a.armUp, 0, -0.5 + sway * 0.15);
    const jitter = a.shake * 0.12;
    canopy.current.rotation.set(Math.sin(t * 40) * jitter, Math.sin(t * 33) * jitter, Math.sin(t * 37) * jitter);
    canopy.current.scale.setScalar(1 + a.shake * 0.12 * (0.5 + 0.5 * Math.sin(t * 25)));

    if (s.tick - b.lastHitTick < 2) a.flash = 1;
    a.flash = Math.max(0, a.flash - dt * 5);
    a.frozen += ((frozen ? 1 : 0) - a.frozen) * damp(8, dt);
    for (const m of [parts.bark, parts.dark]) {
      m.uniforms.uTime.value = t;
      m.uniforms.uGlow.value = (b.enraged ? 1.8 : 1) * (b.action === 'windup' ? 1 + k * 0.7 : 1);
      m.uniforms.uFlash.value = a.flash;
      m.uniforms.uFrozen.value = a.frozen;
    }

    if (b.action === 'dead') {
      const dk = clamp01((tickF - b.diedTick) / 110);
      body.current.rotation.x = dk * 1.2;
      body.current.position.y = -dk * 1.4;
      root.current.scale.setScalar(1 - dk * 0.3);
    } else {
      root.current.scale.setScalar(1);
    }

    // Telegraphs: root lines (windup) and the emerge spot (while underground).
    if (b.action === 'windup' && b.attack === 'roots') {
      let n = 0;
      for (const c of b.targets) {
        if (n >= MAX_WARN) break;
        dummy.position.set(c.x + ox, 0.04, c.y + oz);
        dummy.scale.setScalar(0.7 + 0.3 * k);
        dummy.updateMatrix();
        warn.current.setMatrixAt(n++, dummy.matrix);
      }
      warn.current.count = n;
      warn.current.instanceMatrix.needsUpdate = true;
      parts.warnMat.opacity = 0.25 + 0.45 * k * (0.6 + 0.4 * Math.sin(t * (10 + k * 20)));
    }
    const target = b.targets[0];
    if ((b.action === 'burrowed' || (b.action === 'windup' && b.attack === 'burrow')) && target) {
      spot.current.visible = true;
      // The mark is in world space: undo the boss transform.
      spot.current.position.set(target.x + ox - root.current.position.x, 0.03, target.y + oz - root.current.position.z);
      spot.current.rotation.set(-Math.PI / 2, 0, -root.current.rotation.y);
      const g = b.action === 'burrowed' ? clamp01(k) : 0.2;
      spot.current.scale.setScalar(0.6 + g * 0.9);
      parts.spotMat.opacity = 0.3 + 0.4 * g * (0.7 + 0.3 * Math.sin(t * 16));
    }
  });

  const { bark, dark } = parts;
  return (
    <>
      <instancedMesh ref={warn} args={[parts.warnGeo, parts.warnMat, MAX_WARN]} frustumCulled={false} renderOrder={1} />
      <group ref={root} visible={false}>
        <mesh ref={spot} material={parts.spotMat} visible={false}>
          <circleGeometry args={[1.5, 32]} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[1.35, 32]} />
          <meshBasicMaterial color="#000" transparent opacity={0.35} depthWrite={false} />
        </mesh>
        <group ref={body}>
          {/* Root feet. */}
          {[0, 1, 2, 3, 4].map((i) => {
            const ang = (i / 5) * Math.PI * 2 + 0.3;
            return (
              <mesh key={i} position={[Math.cos(ang) * 0.6, 0.12, Math.sin(ang) * 0.6]} rotation={[Math.sin(ang) * 0.9, 0, -Math.cos(ang) * 0.9]} material={dark} castShadow>
                <coneGeometry args={[0.16, 0.7, 6]} />
              </mesh>
            );
          })}
          <mesh geometry={parts.trunk} material={bark} position={[0, 1.0, 0]} castShadow />
          {/* Face: glowing eyes + a dark mouth crack. */}
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[0.2 * sx, 1.45, 0.56]} rotation-z={0.3 * sx} material={parts.eye}>
              <sphereGeometry args={[0.09, 10, 8]} />
            </mesh>
          ))}
          <mesh position={[0, 1.17, 0.6]} scale={[1, 0.35, 0.4]} material={dark}>
            <sphereGeometry args={[0.16, 10, 8]} />
          </mesh>
          {/* Branch arms with twig fingers. */}
          {[
            { ref: armL, x: -0.62, s: -1 },
            { ref: armR, x: 0.62, s: 1 },
          ].map(({ ref, x, s }) => (
            <group key={s} ref={ref} position={[x, 1.55, 0]}>
              <mesh position={[0.3 * s, -0.35, 0.05]} rotation-z={0.8 * s} material={bark} castShadow>
                <cylinderGeometry args={[0.09, 0.15, 0.95, 7]} />
              </mesh>
              {[-0.35, 0, 0.35].map((tw, i) => (
                <mesh key={i} position={[0.68 * s, -0.72, tw * 0.4]} rotation={[tw, 0, (0.4 + i * 0.2) * s]} material={dark}>
                  <coneGeometry args={[0.05, 0.4, 5]} />
                </mesh>
              ))}
              <mesh position={[0.55 * s, -0.5, 0]} material={parts.leafMat2}>
                <icosahedronGeometry args={[0.18, 0]} />
              </mesh>
            </group>
          ))}
          {/* Canopy. */}
          <group ref={canopy} position={[0, 2.05, 0]}>
            {parts.leaves.map((g, i) => {
              const ang = (i / 6) * Math.PI * 2;
              const r = i === 5 ? 0 : 0.5;
              return <mesh key={i} geometry={g} material={i % 2 ? parts.leafMat : parts.leafMat2} position={[Math.cos(ang) * r, i === 5 ? 0.45 : 0.05 * i, Math.sin(ang) * r]} castShadow />;
            })}
          </group>
        </group>
      </group>
    </>
  );
}
