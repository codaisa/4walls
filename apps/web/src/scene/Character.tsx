import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SLOT_COLORS, type Dir } from '@4walls/shared';
import { damp, lerp, useGame } from './context';

/** Characters are slightly larger than a cell's "comfortable" size for readability from the top camera. */
const MODEL_SCALE = 1.25;
const FACING_ANGLE:Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

function shortestAngle(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Bombito — procedural stylized character: oversized glossy bomb-helmet head with a sparking fuse,
 * expressive eyes, gloved hands and chunky boots. All animation (idle, run, hit, defeat, victory)
 * is procedural and driven purely by the simulation state.
 */
export function Character({ playerId }: { playerId: string }) {
  const { controller, ox, oz } = useGame();
  const player = controller.state.players.find((p) => p.id === playerId)!;
  const colors = SLOT_COLORS[player.colorIndex % SLOT_COLORS.length];

  const mats = useMemo(() => makeMaterials(colors.primary, colors.secondary), [colors.primary, colors.secondary]);

  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const handL = useRef<THREE.Mesh>(null!);
  const handR = useRef<THREE.Mesh>(null!);
  const footL = useRef<THREE.Mesh>(null!);
  const footR = useRef<THREE.Mesh>(null!);
  const spark = useRef<THREE.Mesh>(null!);
  const shield = useRef<THREE.Mesh>(null!);
  const ghost = useRef<THREE.Mesh>(null!);
  const ice = useRef<THREE.Mesh>(null!);
  const anim = useRef({ yaw: 0, phase: 0, move: 0, deathT: 0, hitFlash: 0 });

  useFrame(({ clock }, dt) => {
    const s = controller.state;
    const p = s.players.find((pp) => pp.id === playerId);
    if (!p) return;
    const a = anim.current;
    const t = clock.elapsedTime;
    const al = controller.alphaFor?.(p.id) ?? controller.alpha;
    const x = lerp(p.px, p.x, al);
    const y = lerp(p.py, p.y, al);
    root.current.position.set(x + ox, 0, y + oz);

    // Facing: smooth turn toward the latest direction.
    a.yaw += shortestAngle(a.yaw, FACING_ANGLE[p.facing]) * damp(18, dt);
    root.current.rotation.y = a.yaw;

    const frozen = p.alive && s.tick < p.frozenUntil;
    const ghosting = p.alive && s.tick < p.ghostUntil;
    ice.current.visible = frozen;
    ghost.current.visible = ghosting;
    if (ghosting) {
      const left = (p.ghostUntil - s.tick) / 60;
      // Blink during the last 2 seconds as a warning.
      ghost.current.visible = left > 2 || Math.floor(t * 8) % 2 === 0;
      ghost.current.scale.setScalar(1 + Math.sin(t * 5) * 0.05);
    }
    a.move = lerp(a.move, p.moving && !controller.paused && !frozen ? 1 : 0, damp(14, dt));
    a.phase += dt * (6 + p.speed * 2.2) * a.move;
    const sw = Math.sin(a.phase);
    const bounce = Math.abs(Math.sin(a.phase)) * 0.09 * a.move;
    const breathe = Math.sin(t * 2.4) * 0.018 * (1 - a.move);

    const won = s.phase === 'ended' && !!s.result?.winnerIds.includes(p.id);
    let jump = 0;
    let spin = 0;
    if (won) {
      const k = (t * 2.2) % 1;
      jump = Math.sin(k * Math.PI) * 0.55;
      spin = t * 3;
    } else if (s.phase === 'countdown') {
      jump = Math.abs(Math.sin(t * 4 + p.slot)) * 0.08;
    }

    body.current.position.y = bounce + jump;
    body.current.rotation.x = 0.16 * a.move; // lean into the run
    body.current.rotation.y = spin;
    body.current.scale.set(1 - breathe * 0.5, 1 + breathe, 1 - breathe * 0.5);
    head.current.rotation.z = Math.sin(a.phase * 0.5) * 0.06 * a.move;

    footL.current.position.z = 0.04 + sw * 0.17 * a.move;
    footR.current.position.z = 0.04 - sw * 0.17 * a.move;
    footL.current.position.y = 0.07 + Math.max(0, sw) * 0.09 * a.move;
    footR.current.position.y = 0.07 + Math.max(0, -sw) * 0.09 * a.move;
    handL.current.position.z = 0.02 - sw * 0.16 * a.move;
    handR.current.position.z = 0.02 + sw * 0.16 * a.move;
    const wave = won ? Math.sin(t * 14) * 0.12 + 0.35 : 0;
    handL.current.position.y = 0.42 + wave;
    handR.current.position.y = 0.42 + wave;

    // Fuse spark flicker.
    const fl = 0.8 + Math.random() * 0.5;
    spark.current.scale.setScalar(fl);

    // Shield bubble and invulnerability blink.
    shield.current.visible = p.alive && p.shield > 0;
    shield.current.rotation.y = t;
    const invuln = p.alive && s.tick < p.invulnUntil;
    root.current.visible = !invuln || Math.floor(t * 16) % 2 === 0 || !p.alive;

    // Defeat: topple, spin and sink.
    if (!p.alive) {
      a.deathT = Math.min(1.2, a.deathT + dt);
      const k = a.deathT / 1.2;
      root.current.rotation.y = a.yaw + k * 9;
      body.current.rotation.x = -k * 1.4;
      root.current.position.y = Math.sin(Math.min(1, k * 2) * Math.PI) * 0.6 - k * 0.3;
      const sc = Math.max(0.0001, 1 - Math.pow(k, 3));
      root.current.scale.setScalar(sc * MODEL_SCALE);
    } else {
      a.deathT = 0;
      root.current.scale.setScalar(MODEL_SCALE);
    }
  });

  return (
    <group ref={root}>
      {/* Blob shadow keeps players readable even under heavy effects. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
        <circleGeometry args={[0.34, 20]} />
        <meshBasicMaterial color="#000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <group ref={body}>
        {/* Boots */}
        <mesh ref={footL} position={[-0.13, 0.07, 0.04]} scale={[1, 0.65, 1.35]} material={mats.dark} castShadow>
          <sphereGeometry args={[0.1, 14, 10]} />
        </mesh>
        <mesh ref={footR} position={[0.13, 0.07, 0.04]} scale={[1, 0.65, 1.35]} material={mats.dark} castShadow>
          <sphereGeometry args={[0.1, 14, 10]} />
        </mesh>
        {/* Torso */}
        <mesh position={[0, 0.36, 0]} scale={[1, 1.05, 0.92]} material={mats.primary} castShadow>
          <sphereGeometry args={[0.22, 22, 16]} />
        </mesh>
        <mesh position={[0, 0.3, 0]} rotation-x={Math.PI / 2} material={mats.dark}>
          <torusGeometry args={[0.2, 0.035, 8, 24]} />
        </mesh>
        <mesh position={[0, 0.3, 0.2]} material={mats.secondary}>
          <boxGeometry args={[0.08, 0.06, 0.04]} />
        </mesh>
        {/* Gloves */}
        <mesh ref={handL} position={[-0.29, 0.42, 0.02]} material={mats.secondary} castShadow>
          <sphereGeometry args={[0.085, 14, 10]} />
        </mesh>
        <mesh ref={handR} position={[0.29, 0.42, 0.02]} material={mats.secondary} castShadow>
          <sphereGeometry args={[0.085, 14, 10]} />
        </mesh>
        {/* Bomb-helmet head */}
        <group ref={head} position={[0, 0.78, 0]}>
          <mesh material={mats.helmet} castShadow>
            <sphereGeometry args={[0.3, 28, 20]} />
          </mesh>
          <mesh rotation-x={Math.PI / 2} position={[0, 0.06, 0]} material={mats.band}>
            <torusGeometry args={[0.296, 0.03, 8, 32]} />
          </mesh>
          {/* Face window */}
          <mesh position={[0, -0.03, 0.15]} scale={[1, 0.82, 0.62]} material={mats.face}>
            <sphereGeometry args={[0.22, 24, 16]} />
          </mesh>
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.085, 0.0, 0.272]}>
              <mesh scale={[0.75, 1.15, 0.5]} material={mats.eye}>
                <sphereGeometry args={[0.055, 14, 10]} />
              </mesh>
              <mesh position={[0.012, 0.022, 0.022]} material={mats.eyeShine}>
                <sphereGeometry args={[0.016, 8, 6]} />
              </mesh>
              <mesh position={[side * 0.05, -0.07, -0.01]} scale={[1, 0.6, 0.3]} material={mats.blush}>
                <sphereGeometry args={[0.035, 10, 8]} />
              </mesh>
            </group>
          ))}
          {/* Fuse cap and spark (every character keeps the bomb-helmet signature) */}
          <mesh position={[0, 0.3, 0]} material={mats.dark}>
            <cylinderGeometry args={[0.07, 0.085, 0.07, 12]} />
          </mesh>
          <mesh position={[0.03, 0.39, 0]} rotation-z={-0.4} material={mats.fuse}>
            <cylinderGeometry args={[0.018, 0.022, 0.15, 6]} />
          </mesh>
          <mesh ref={spark} position={[0.065, 0.47, 0]} material={mats.spark}>
            <icosahedronGeometry args={[0.04, 0]} />
          </mesh>
          {player.characterId === 'ninja' && <NinjaGear mats={mats} />}
          {player.characterId === 'engenheiro' && <EngineerHat mats={mats} />}
        </group>
        {player.characterId === 'ninja' && <NinjaScarf mats={mats} />}
        {player.characterId === 'engenheiro' && <ToolBelt mats={mats} />}
        <mesh ref={shield} position={[0, 0.55, 0]} material={mats.shield}>
          <icosahedronGeometry args={[0.6, 2]} />
        </mesh>
        <mesh ref={ghost} position={[0, 0.55, 0]} material={mats.ghost}>
          <sphereGeometry args={[0.62, 20, 14]} />
        </mesh>
      </group>
      {/* Ice block when frozen (outside the body group so it doesn't bob). */}
      <mesh ref={ice} position={[0, 0.55, 0]} material={mats.ice}>
        <boxGeometry args={[0.9, 1.15, 0.9]} />
      </mesh>
    </group>
  );
}

type Mats = ReturnType<typeof makeMaterials>;

/** Ninja: knotted headband + face mask (lower face) — agile silhouette. */
function NinjaGear({ mats }: { mats: Mats }) {
  return (
    <>
      <mesh rotation-x={Math.PI / 2} position={[0, 0.1, 0]} material={mats.cloth}>
        <torusGeometry args={[0.302, 0.045, 8, 32]} />
      </mesh>
      <mesh position={[0, 0.1, -0.31]} material={mats.cloth}>
        <sphereGeometry args={[0.05, 10, 8]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.06, 0.04, -0.4]} rotation={[0.5, s * 0.3, s * 0.4]} material={mats.cloth}>
          <boxGeometry args={[0.05, 0.18, 0.02]} />
        </mesh>
      ))}
      <mesh position={[0, -0.12, 0.17]} scale={[1.02, 0.52, 0.66]} material={mats.mask}>
        <sphereGeometry args={[0.22, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
      </mesh>
    </>
  );
}

function NinjaScarf({ mats }: { mats: Mats }) {
  return (
    <>
      <mesh position={[0, 0.54, 0]} rotation-x={Math.PI / 2} material={mats.cloth}>
        <torusGeometry args={[0.17, 0.05, 8, 20]} />
      </mesh>
      <mesh position={[0.08, 0.45, -0.22]} rotation={[0.9, 0.2, 0.15]} material={mats.cloth}>
        <boxGeometry args={[0.08, 0.26, 0.03]} />
      </mesh>
    </>
  );
}

/** Engenheiro: hard hat with brim and lamp, goggles on the forehead. */
function EngineerHat({ mats }: { mats: Mats }) {
  return (
    <>
      <mesh position={[0, 0.08, 0]} material={mats.hardHat}>
        <sphereGeometry args={[0.32, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[0, 0.085, 0.04]} material={mats.hardHat}>
        <cylinderGeometry args={[0.39, 0.39, 0.03, 28]} />
      </mesh>
      <mesh position={[0, 0.3, 0]} material={mats.hardHat}>
        <boxGeometry args={[0.05, 0.08, 0.5]} />
      </mesh>
      <mesh position={[0, 0.22, 0.27]} material={mats.lamp}>
        <cylinderGeometry args={[0.045, 0.045, 0.04, 12]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.09, 0.13, 0.26]} rotation-x={-0.35} material={mats.goggle}>
          <torusGeometry args={[0.055, 0.018, 8, 16]} />
        </mesh>
      ))}
    </>
  );
}

function ToolBelt({ mats }: { mats: Mats }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.17, 0.25, 0.09]} material={mats.pouch}>
          <boxGeometry args={[0.08, 0.1, 0.07]} />
        </mesh>
      ))}
      <mesh position={[0.21, 0.23, -0.06]} rotation-z={0.3} material={mats.goggle}>
        <cylinderGeometry args={[0.015, 0.015, 0.18, 6]} />
      </mesh>
    </>
  );
}

function makeMaterials(primaryHex: string, secondaryHex: string) {
  // The suit is a darker shade of the slot color so the bright helmet stays the focal point.
  const suit = new THREE.Color(primaryHex).lerp(new THREE.Color('#1c1426'), 0.45);
  return {
    primary: new THREE.MeshPhysicalMaterial({ color: suit, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
    secondary: new THREE.MeshPhysicalMaterial({ color: secondaryHex, roughness: 0.5, clearcoat: 0.4 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: primaryHex, roughness: 0.22, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1 }),
    band: new THREE.MeshPhysicalMaterial({ color: '#2a2130', roughness: 0.3, clearcoat: 0.8 }),
    face: new THREE.MeshStandardMaterial({ color: '#ffe2c4', roughness: 0.6 }),
    eye: new THREE.MeshStandardMaterial({ color: '#1a1424', roughness: 0.2 }),
    eyeShine: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    blush: new THREE.MeshBasicMaterial({ color: '#ff8fa0', transparent: true, opacity: 0.55 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2a2130', roughness: 0.7 }),
    fuse: new THREE.MeshStandardMaterial({ color: '#c9a36b', roughness: 0.9 }),
    spark: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.4, 0.6), toneMapped: false }),
    cloth: new THREE.MeshStandardMaterial({ color: '#1e1a26', roughness: 0.85 }),
    mask: new THREE.MeshStandardMaterial({ color: '#27222f', roughness: 0.8, side: THREE.DoubleSide }),
    hardHat: new THREE.MeshPhysicalMaterial({ color: '#ffc21a', roughness: 0.35, clearcoat: 0.8 }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2), toneMapped: false }),
    goggle: new THREE.MeshStandardMaterial({ color: '#5c4a3a', roughness: 0.5, metalness: 0.4 }),
    pouch: new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: 0.8 }),
    shield: new THREE.MeshPhysicalMaterial({
      color: '#7fd6ff',
      emissive: '#2fa8ff',
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.22,
      roughness: 0.1,
      depthWrite: false,
    }),
    ghost: new THREE.MeshBasicMaterial({ color: '#d9c7ff', transparent: true, opacity: 0.18, depthWrite: false }),
    ice: new THREE.MeshPhysicalMaterial({
      color: '#bfefff',
      emissive: '#5cc8ff',
      emissiveIntensity: 0.35,
      roughness: 0.05,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  };
}
