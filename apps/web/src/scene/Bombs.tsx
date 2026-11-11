import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { kickIntervalTicks } from '@4walls/core';
import { SLOT_COLORS, type BombKind } from '@4walls/shared';
import { clamp01, easeOutBack, lerp, useGame } from './context';
import { BOMB_SKINS } from './Cosmetics';

const POOL = 40;

/** White skull emblem drawn once on a canvas; eye/nose holes are transparent so the bomb shows through. */
function makeSkullTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f3efe4';
  // Cranium + cheekbones.
  g.beginPath();
  g.ellipse(128, 112, 84, 76, 0, 0, Math.PI * 2);
  g.fill();
  // Jaw block with rounded corners.
  g.beginPath();
  g.roundRect(70, 140, 116, 70, 18);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  // Eye sockets.
  for (const x of [92, 164]) {
    g.beginPath();
    g.ellipse(x, 118, 27, 25, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Nose.
  g.beginPath();
  g.moveTo(128, 146);
  g.lineTo(116, 166);
  g.lineTo(140, 166);
  g.closePath();
  g.fill();
  // Teeth gaps.
  for (const x of [98, 118, 138, 158]) g.fillRect(x - 3, 182, 6, 30);
  g.fillRect(70, 206, 116, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Segmented (ridged) yellow fuse: bright rings separated by darker grooves along its length. */
function makeFuseTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 8;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, '#c98a06');
  grad.addColorStop(0.18, '#ffc61a');
  grad.addColorStop(0.5, '#ffe36a');
  grad.addColorStop(0.82, '#ffc61a');
  grad.addColorStop(1, '#c98a06');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 1);
  return tex;
}

let skullTex: THREE.Texture | null = null;
/** One skull texture shared by every bomb material. */
const SKULL_TEX = () => (skullTex ??= makeSkullTexture());

const R = 0.36;
const CENTER_Y = 0.38;
/** Rope fuse: rises out of the cap and arcs back over the bomb. */
const FUSE_CURVE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0.74, 0),
  new THREE.Vector3(0.01, 0.84, 0),
  new THREE.Vector3(0.05, 0.93, -0.01),
  new THREE.Vector3(0.12, 0.98, -0.02),
  new THREE.Vector3(0.19, 0.97, -0.02),
  new THREE.Vector3(0.22, 1.03, -0.02),
]);
const FUSE_END = FUSE_CURVE.getPoint(1);
/** Skull patch: front of the sphere, tilted up toward the top-down camera. */
const SKULL_TILT = 0.5;

/** Each bomb kind is recognisable at a glance. */
const KIND_LOOK: Record<BombKind, { body: string; emissive: string; base: number }> = {
  normal: { body: '#121116', emissive: '#ff2a00', base: 0 },
  fire: { body: '#5a1408', emissive: '#ff5a10', base: 0.55 },
  ice: { body: '#9fe3ff', emissive: '#3fb6ff', base: 0.35 },
};

/** Pooled bomb meshes: no React re-render when bombs appear or explode. */
export function Bombs() {
  const { controller, ox, oz } = useGame();
  const groups = useRef<(THREE.Group | null)[]>([]);
  const bodies = useRef<(THREE.Mesh | null)[]>([]);
  const bands = useRef<(THREE.Mesh | null)[]>([]);
  const sparks = useRef<(THREE.Mesh | null)[]>([]);
  const antennas = useRef<(THREE.Group | null)[]>([]);
  const leds = useRef<(THREE.Mesh | null)[]>([]);
  const kickInterval = kickIntervalTicks();

  const mats = useMemo(
    () =>
      Array.from({ length: POOL }, () => ({
        body: new THREE.MeshPhysicalMaterial({ color: '#121116', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, emissive: '#ff2a00', emissiveIntensity: 0 }),
        band: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
        skull: new THREE.MeshStandardMaterial({ map: SKULL_TEX(), transparent: true, alphaTest: 0.5, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 }),
      })),
    [],
  );
  const shared = useMemo(
    () => ({
      cap: new THREE.MeshPhysicalMaterial({ color: '#1a1a20', roughness: 0.3, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.2 }),
      fuse: new THREE.MeshPhysicalMaterial({ map: makeFuseTexture(), roughness: 0.35, clearcoat: 0.6 }),
      spark: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3, 0.8), toneMapped: false }),
      shine: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }),
      antenna: new THREE.MeshStandardMaterial({ color: '#cfcfcf', metalness: 0.8, roughness: 0.3 }),
      led: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 4, 0.8), toneMapped: false }),
    }),
    [],
  );
  const geo = useMemo(
    () => ({
      fuse: new THREE.TubeGeometry(FUSE_CURVE, 40, 0.04, 12, false),
      skull: new THREE.SphereGeometry(R * 1.004, 28, 20, Math.PI / 2 - 0.62, 1.24, Math.PI / 2 - SKULL_TILT - 0.6, 1.2),
    }),
    [],
  );

  const skinOf = (ownerId: string) => controller.state.config.players.find((p) => p.id === ownerId)?.loadout?.bomb;

  useFrame(({ clock }) => {
    const s = controller.state;
    const tickF = controller.tickF;
    for (let i = 0; i < POOL; i++) {
      const g = groups.current[i];
      if (!g) continue;
      const b = s.bombs[i];
      if (!b) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      if (tickF < b.flightUntil) {
        // Thrown (glove): a high lob over walls, spinning in the air.
        const k = clamp01((tickF - b.movedTick) / Math.max(1, b.flightUntil - b.movedTick));
        g.position.set(lerp(b.fromX, b.x, k) + ox, 4 * k * (1 - k) * 2.1, lerp(b.fromY, b.y, k) + oz);
        g.rotation.set(k * Math.PI * 3, 0, k * Math.PI * 1.5);
      } else {
        // Kicked bombs glide between cells.
        const slide = clamp01((tickF - b.movedTick) / kickInterval);
        g.position.set(lerp(b.fromX, b.x, slide) + ox, 0, lerp(b.fromY, b.y, slide) + oz);
        g.rotation.set(0, 0, 0);
      }
      const age = tickF - b.placedTick;
      const total = b.detonateTick - b.placedTick;
      // Remote bombs wait calmly; timed ones pulse faster and swell as the fuse burns down.
      const k = b.remote ? 0.15 : clamp01(age / total);
      const pop = easeOutBack(clamp01(age / 12));
      const freq = 4 + k * k * 22;
      const pulse = 1 + Math.sin(clock.elapsedTime * freq) * (0.04 + k * 0.08);
      const sc = pop * pulse * (1 + k * 0.12) * (b.extra ? 0.72 : 1);
      g.scale.set(sc, sc * (2 - pulse), sc);
      const m = mats[i];
      // Special bombs keep their look (readability); normal ones wear the owner's skin.
      const skin = b.kind === 'normal' ? BOMB_SKINS[skinOf(b.ownerId) ?? ''] : undefined;
      const look = skin ?? KIND_LOOK[b.kind];
      m.body.color.set(look.body);
      m.body.emissive.set(look.emissive);
      m.body.metalness = skin?.metalness ?? 0;
      m.body.roughness = skin?.roughness ?? 0.22;
      m.skull.color.set(skin?.skull ?? '#ffffff');
      m.body.emissiveIntensity = look.base + Math.pow(k, 2.2) * (0.6 + 0.6 * Math.sin(clock.elapsedTime * freq));
      const ant = antennas.current[i];
      if (ant) ant.visible = b.remote;
      const led = leds.current[i];
      if (led) led.visible = b.remote && Math.floor(clock.elapsedTime * 3) % 2 === 0;
      const owner = s.players.find((p) => p.id === b.ownerId);
      m.band.color.set(owner ? SLOT_COLORS[owner.colorIndex % SLOT_COLORS.length].primary : '#ffffff');
      const sp = sparks.current[i];
      if (sp) {
        sp.scale.setScalar(0.7 + Math.random() * 0.7);
        sp.position.set(FUSE_END.x, FUSE_END.y + 0.02 - k * 0.03, FUSE_END.z);
      }
    }
  });

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <group key={i} ref={(g) => void (groups.current[i] = g)} visible={false}>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
            <circleGeometry args={[0.36, 20]} />
            <meshBasicMaterial color="#000" transparent opacity={0.35} depthWrite={false} />
          </mesh>
          <mesh ref={(m) => void (bodies.current[i] = m)} position={[0, CENTER_Y, 0]} material={mats[i].body} castShadow>
            <sphereGeometry args={[R, 32, 24]} />
          </mesh>
          <mesh position={[0, CENTER_Y, 0]} geometry={geo.skull} material={mats[i].skull} />
          <mesh position={[-0.13, 0.56, 0.2]} scale={[1, 1.3, 0.5]} material={shared.shine}>
            <sphereGeometry args={[0.05, 10, 8]} />
          </mesh>
          {/* Cap: thick dark neck with the owner's color as a ring. */}
          <mesh position={[0, 0.71, 0]} material={shared.cap} castShadow>
            <cylinderGeometry args={[0.105, 0.13, 0.11, 20]} />
          </mesh>
          <mesh ref={(m) => void (bands.current[i] = m)} position={[0, 0.665, 0]} rotation-x={Math.PI / 2} material={mats[i].band}>
            <torusGeometry args={[0.13, 0.022, 8, 24]} />
          </mesh>
          <mesh geometry={geo.fuse} material={shared.fuse} castShadow />
          <mesh ref={(m) => void (sparks.current[i] = m)} position={[FUSE_END.x, FUSE_END.y, FUSE_END.z]} material={shared.spark}>
            <icosahedronGeometry args={[0.055, 0]} />
          </mesh>
          {/* Remote receiver: antenna + blinking LED */}
          <group ref={(g) => void (antennas.current[i] = g)} visible={false}>
            <mesh position={[-0.2, 0.78, 0]} rotation-z={0.25} material={shared.antenna}>
              <cylinderGeometry args={[0.012, 0.012, 0.32, 6]} />
            </mesh>
            <mesh ref={(m) => void (leds.current[i] = m)} position={[-0.24, 0.94, 0]} material={shared.led}>
              <sphereGeometry args={[0.035, 8, 6]} />
            </mesh>
          </group>
        </group>
      ))}
    </>
  );
}
