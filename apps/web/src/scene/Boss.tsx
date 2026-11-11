import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import type { BossId } from '@4walls/shared';
import { Guardian } from './Guardian';
import * as THREE from 'three';
import { Cell, DIR_VEC, type Dir } from '@4walls/shared';
import { getCell, slamCells, type BossState, type GameState } from '@4walls/core';
import { clamp01, damp, lerp, useGame } from './context';
import { NOISE_GLSL } from './vfxShaders';

const FACING: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };
const MAX_WARN = 96;

// ───────────────────────── molten rock material ─────────────────────────

const rockVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const rockFragment = /* glsl */ `
  uniform float uTime;
  uniform float uHeat;   // 1 normal, ~1.8 enraged
  uniform float uFlash;  // hit flash 0..1
  uniform float uFrozen; // ice tint 0..1
  uniform float uSeed;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vLocal;
  ${NOISE_GLSL}
  void main() {
    // Cracks follow the part's own surface (object space) so they stay put while it moves.
    vec3 p = vLocal * 5.5 + uSeed * 5.0;
    float n = vfxFbm(p.xy + p.z * 0.7);
    float n2 = vfxFbm(p.yz * 1.3 - p.x * 0.5 + 3.0);
    // Thin glowing seams between the rock plates.
    float crack = 1.0 - smoothstep(0.0, 0.018 + 0.012 * uHeat, abs(n - 0.5));
    crack = max(crack, (1.0 - smoothstep(0.0, 0.012, abs(n2 - 0.5))) * 0.7);
    vec3 L = normalize(vec3(-0.45, 0.85, 0.4));
    float diff = max(0.0, dot(normalize(vNormal), L));
    float rim = pow(1.0 - max(0.0, normalize(vNormal).y), 2.0) * 0.15;
    vec3 rock = mix(vec3(0.028, 0.02, 0.018), vec3(0.085, 0.06, 0.05), n2) * (0.35 + 0.95 * diff) + rim * 0.25;
    float pulse = 0.7 + 0.3 * sin(uTime * (3.0 + uHeat * 2.0) + n * 18.0);
    vec3 lava = mix(vec3(1.6, 0.3, 0.03), vec3(2.6, 0.95, 0.15), pulse) * uHeat;
    vec3 col = mix(rock, lava, crack);
    col = mix(col, vec3(0.55, 0.85, 1.1) * (0.5 + 0.6 * diff) + crack * vec3(0.4, 0.9, 1.6), uFrozen);
    col = mix(col, vec3(3.0, 2.6, 2.2), uFlash);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeRock(seed: number) {
  return new THREE.ShaderMaterial({
    vertexShader: rockVertex,
    fragmentShader: rockFragment,
    uniforms: { uTime: { value: 0 }, uHeat: { value: 1 }, uFlash: { value: 0 }, uFrozen: { value: 0 }, uSeed: { value: seed } },
    toneMapped: false,
  });
}

/** Chunky boulder: a slightly jittered icosphere (deterministic per seed). */
function boulder(r: number, seed: number, squash: [number, number, number] = [1, 1, 1]) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + seed) * 43758.5453;
    const k = 1 + ((h - Math.floor(h)) - 0.5) * 0.18;
    pos.setXYZ(i, v.x * k * squash[0], v.y * k * squash[1], v.z * k * squash[2]);
  }
  g.computeVertexNormals();
  return g;
}

// ───────────────────────── telegraphs ─────────────────────────

/** Cells a charge will sweep: the 3-wide lane ahead of the body until it would hit a wall. */
function chargeLane(s: GameState, b: BossState, dir: Dir) {
  const v = DIR_VEC[dir];
  const cells: { x: number; y: number }[] = [];
  let cx = Math.round(b.x);
  let cy = Math.round(b.y);
  for (let i = 0; i < 30; i++) {
    const nx = cx + v.x;
    const ny = cy + v.y;
    let blocked = false;
    for (let o = -1; o <= 1 && !blocked; o++)
      for (let d = -1; d <= 1 && !blocked; d++) {
        const x = nx + (v.x === 0 ? o : d);
        const y = ny + (v.y === 0 ? o : d);
        if (getCell(s.grid, x, y) === Cell.Wall) blocked = true;
      }
    if (blocked) break;
    cx = nx;
    cy = ny;
    for (let o = -1; o <= 1; o++) cells.push({ x: cx + v.x + (v.x === 0 ? o : 0), y: cy + v.y + (v.y === 0 ? o : 0) });
  }
  return cells.filter((c) => getCell(s.grid, c.x, c.y) !== Cell.Wall);
}

// ───────────────────────── the golem ─────────────────────────

/**
 * Golem Vulcânico: a hulking pile of basalt held together by magma. Fully procedural
 * (boulders + lava-crack shader) and animated from the simulation's boss state machine.
 */
function Golem() {
  const { controller, ox, oz } = useGame();
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const core = useRef<THREE.Mesh>(null!);
  const warn = useRef<THREE.InstancedMesh>(null!);
  const anim = useRef({ yaw: 0, walkPhase: 0, flash: 0, frozen: 0, lean: 0, crouch: 0, armUp: 0, armSpread: 0, armFwd: 0, headUp: 0, scale: 1 });

  const parts = useMemo(() => {
    const mats = Array.from({ length: 6 }, (_, i) => makeRock(i * 1.7 + 0.3));
    return {
      mats,
      pelvis: boulder(0.55, 1, [1.25, 0.8, 1]),
      torso: boulder(0.85, 2, [1.25, 1, 0.95]),
      head: boulder(0.4, 3, [1.1, 0.9, 1]),
      shoulder: boulder(0.46, 4),
      upper: boulder(0.32, 5, [1, 1.3, 1]),
      fist: boulder(0.5, 6, [1, 0.9, 1]),
      leg: boulder(0.36, 7, [1, 1.25, 1]),
      foot: boulder(0.4, 8, [1.1, 0.6, 1.3]),
      eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3, 0.6), toneMapped: false }),
      coreMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.9, 0.12), toneMapped: false }),
      warnMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.25, 0.08), toneMapped: false, transparent: true, opacity: 0.5, depthWrite: false }),
      warnGeo: new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2),
    };
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }, dt) => {
    const s = controller.state;
    const b = s.boss;
    const a = anim.current;
    const t = clock.elapsedTime;
    root.current.visible = !!b;
    warn.current.count = 0;
    if (!b) return;
    const tickF = controller.tickF;
    const al = controller.alpha;
    root.current.position.set(lerp(b.px, b.x, al) + ox, 0, lerp(b.py, b.y, al) + oz);
    const shortest = (from: number, to: number) => {
      let d = (to - from) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      return d;
    };
    a.yaw += shortest(a.yaw, FACING[b.facing]) * damp(b.action === 'charge' ? 20 : 6, dt);
    root.current.rotation.y = a.yaw;

    const span = Math.max(1, b.actionUntil - b.actionStart);
    const k = clamp01((tickF - b.actionStart) / span);
    const since = (tickF - b.actionStart) / 60;
    const frozen = s.tick < b.frozenUntil;

    // Targets for this frame (smoothed below).
    let lean = 0;
    let crouch = 0;
    let armUp = 0;
    let armSpread = 0.18;
    let armFwd = 0;
    let headUp = 0;
    let walking = false;
    let wobble = 0;
    if (b.action === 'walk') {
      walking = b.x !== b.tx || b.y !== b.ty;
    } else if (b.action === 'windup') {
      if (b.attack === 'slam') {
        armUp = 2.7 * k;
        lean = -0.22 * k;
        headUp = 0.25 * k;
      } else if (b.attack === 'meteors') {
        armSpread = 0.18 + 1.1 * k;
        headUp = 0.55 * k;
        lean = -0.15 * k;
      } else {
        crouch = 0.28 * k;
        lean = 0.35 * k;
        armFwd = -0.9 * k;
      }
    } else if (b.action === 'recover') {
      // Just slammed: fists buried in the ground, slowly pulling back up.
      const hold = clamp01(1 - since / 0.6);
      armFwd = 1.35 * hold;
      lean = 0.38 * hold;
      crouch = 0.22 * hold;
    } else if (b.action === 'charge') {
      walking = true;
      lean = 0.45;
      armFwd = -0.6;
    } else if (b.action === 'stunned') {
      lean = 0.3;
      crouch = 0.2;
      headUp = -0.4;
      wobble = Math.sin(t * 6) * 0.12;
      armFwd = 0.8;
    }
    if (!frozen) {
      const sm = damp(b.action === 'recover' && since < 0.1 ? 40 : 9, dt);
      a.lean += (lean - a.lean) * sm;
      a.crouch += (crouch - a.crouch) * sm;
      a.armUp += (armUp - a.armUp) * sm;
      a.armSpread += (armSpread - a.armSpread) * sm;
      a.armFwd += (armFwd - a.armFwd) * sm;
      a.headUp += (headUp - a.headUp) * sm;
      if (walking) a.walkPhase += dt * (b.action === 'charge' ? 14 : 5.5);
    }
    const stride = walking ? Math.sin(a.walkPhase) : 0;
    const bob = walking ? Math.abs(Math.cos(a.walkPhase)) * 0.08 : Math.sin(t * 1.6) * 0.025;

    body.current.position.y = bob - a.crouch;
    body.current.rotation.set(a.lean, 0, wobble + stride * 0.05);
    head.current.rotation.set(-a.headUp, wobble * 2, 0);
    legL.current.rotation.x = stride * 0.55;
    legR.current.rotation.x = -stride * 0.55;
    // Arms: up (overhead slam), spread (roar), forward (charge / slam impact), plus walk swing.
    armL.current.rotation.set(-a.armUp - a.armFwd - stride * 0.4, 0, -a.armSpread);
    armR.current.rotation.set(-a.armUp - a.armFwd + stride * 0.4, 0, a.armSpread);

    // Materials: heat, hit flash, ice.
    if (s.tick - b.lastHitTick < 2) a.flash = 1;
    a.flash = Math.max(0, a.flash - dt * 5);
    a.frozen += ((frozen ? 1 : 0) - a.frozen) * damp(8, dt);
    const heat = b.enraged ? 1.8 : 1;
    const windHeat = b.action === 'windup' ? 1 + k * 0.6 : 1;
    for (const m of parts.mats) {
      m.uniforms.uTime.value = t;
      m.uniforms.uHeat.value = heat * windHeat;
      m.uniforms.uFlash.value = a.flash;
      m.uniforms.uFrozen.value = a.frozen;
    }
    core.current.scale.setScalar(0.9 + 0.15 * Math.sin(t * (b.enraged ? 9 : 4)) + (windHeat - 1) * 0.6);

    // Death: the magma goes out and the rocks collapse into the floor.
    if (b.action === 'dead') {
      const dk = clamp01((tickF - b.diedTick) / 120);
      body.current.rotation.x = dk * 0.6;
      body.current.position.y = -dk * 1.6;
      a.scale = 1 - dk * 0.35;
      for (const m of parts.mats) m.uniforms.uHeat.value = Math.max(0.05, 1.6 * (1 - dk));
    } else {
      a.scale = 1;
    }
    root.current.scale.setScalar(a.scale);

    // Telegraph the incoming attack on the floor.
    if (b.action === 'windup' && b.attack !== 'meteors') {
      const cells = b.attack === 'slam' ? slamCells(s, b) : b.chargeDir ? chargeLane(s, b, b.chargeDir) : [];
      let n = 0;
      for (const c of cells) {
        if (n >= MAX_WARN) break;
        dummy.position.set(c.x + ox, 0.04, c.y + oz);
        dummy.scale.setScalar(0.75 + 0.25 * k);
        dummy.updateMatrix();
        warn.current.setMatrixAt(n++, dummy.matrix);
      }
      warn.current.count = n;
      warn.current.instanceMatrix.needsUpdate = true;
      parts.warnMat.opacity = 0.25 + 0.4 * k * (0.6 + 0.4 * Math.sin(t * (10 + k * 20)));
    }
  });

  const { mats } = parts;
  return (
    <>
      <instancedMesh ref={warn} args={[parts.warnGeo, parts.warnMat, MAX_WARN]} frustumCulled={false} renderOrder={1} />
      <group ref={root} visible={false}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[1.45, 32]} />
          <meshBasicMaterial color="#000" transparent opacity={0.4} depthWrite={false} />
        </mesh>
        <group ref={body}>
          <mesh geometry={parts.pelvis} material={mats[0]} position={[0, 0.95, 0]} castShadow />
          <mesh geometry={parts.torso} material={mats[1]} position={[0, 1.65, 0]} castShadow />
          {/* Molten heart glowing through the chest. */}
          <mesh ref={core} position={[0, 1.65, 0.62]} material={parts.coreMat}>
            <sphereGeometry args={[0.22, 16, 12]} />
          </mesh>
          <group ref={head} position={[0, 2.38, 0.12]}>
            <mesh geometry={parts.head} material={mats[2]} castShadow />
            {[-1, 1].map((sx) => (
              <mesh key={sx} position={[0.15 * sx, 0.04, 0.34]} rotation-z={0.25 * sx} material={parts.eye}>
                <boxGeometry args={[0.16, 0.06, 0.06]} />
              </mesh>
            ))}
          </group>
          {[
            { ref: armL, x: -1.05, mat: mats[3] },
            { ref: armR, x: 1.05, mat: mats[4] },
          ].map(({ ref, x, mat }) => (
            <group key={x} ref={ref} position={[x, 2.0, 0]}>
              <mesh geometry={parts.shoulder} material={mat} castShadow />
              <mesh geometry={parts.upper} material={mat} position={[0.08 * Math.sign(x), -0.55, 0]} castShadow />
              <mesh geometry={parts.fist} material={mat} position={[0.12 * Math.sign(x), -1.12, 0.08]} castShadow />
            </group>
          ))}
        </group>
        {[
          { ref: legL, x: -0.45 },
          { ref: legR, x: 0.45 },
        ].map(({ ref, x }) => (
          <group key={x} ref={ref} position={[x, 0.85, 0]}>
            <mesh geometry={parts.leg} material={mats[5]} position={[0, -0.4, 0]} castShadow />
            <mesh geometry={parts.foot} material={mats[5]} position={[0, -0.72, 0.12]} castShadow />
          </group>
        ))}
      </group>
    </>
  );
}

/** Shows the model of whichever boss is in the arena (the Boss Rush swaps them). */
export function Boss() {
  const { controller } = useGame();
  const [kind, setKind] = useState<BossId | null>(controller.state.boss?.kind ?? null);
  const current = useRef(kind);
  useFrame(() => {
    const k = controller.state.boss?.kind ?? null;
    if (k !== current.current) {
      current.current = k;
      setKind(k);
    }
  });
  if (kind === 'guardian') return <Guardian />;
  if (kind === 'golem') return <Golem />;
  return null;
}
