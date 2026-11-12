import { createPortal, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * Cosmetics drawn on top of the shared models: hats (procedural, attached to the head bone so
 * they follow every animation), bomb skins and explosion colors. Never touch gameplay.
 */

/** Top of the block head in model space (the engineer's hard hat sits higher). */
const HEAD_TOP: Record<string, number> = { bombito: 1.08, ninja: 1.08, engenheiro: 1.15, silvio: 1.14 };

export interface HeadAnchor {
  bone: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: number;
}

/**
 * Where a hat goes on a freshly cloned (rest pose, unparented) character scene: the head-top
 * point and the model orientation expressed in the head bone's space.
 */
export function headAnchor(scene: THREE.Object3D, characterId: string): HeadAnchor | null {
  const bone = scene.getObjectByName('head');
  if (!bone) return null;
  scene.updateMatrixWorld(true);
  const position = bone.worldToLocal(new THREE.Vector3(0, HEAD_TOP[characterId] ?? 1.08, 0));
  const quaternion = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
  const scale = 1 / bone.getWorldScale(new THREE.Vector3()).x;
  return { bone, position, quaternion, scale };
}

/** Hat on the head bone (renders nothing without a hat). */
export function HeadHat({ anchor, hatId }: { anchor: HeadAnchor | null; hatId: string | null | undefined }) {
  if (!anchor || !hatId) return null;
  return createPortal(
    <group position={anchor.position} quaternion={anchor.quaternion} scale={anchor.scale}>
      <HatModel id={hatId} />
    </group>,
    anchor.bone,
  );
}

const std = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
const glow = (r: number, g: number, b: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false });

/** Procedural toy-style hats. Origin = top center of the head, +Z = the face, units = model units. */
export function HatModel({ id }: { id: string }) {
  const mats = useMemo(
    () => ({
      red: std('#e2383b'),
      white: std('#f4efe6'),
      black: std('#17151c', { roughness: 0.35 }),
      ribbon: std('#c4202b'),
      purple: std('#5b2a86'),
      gold: std('#ffc23a', { metalness: 0.85, roughness: 0.25 }),
      ruby: std('#e0103a', { metalness: 0.2, roughness: 0.15, emissive: '#5a0010' }),
      sapphire: std('#2a7bff', { metalness: 0.2, roughness: 0.15, emissive: '#001a5a' }),
      basalt: std('#2a2226', { roughness: 0.9, flatShading: true }),
      lava: glow(3.2, 0.9, 0.15),
      halo: glow(3.0, 2.4, 0.9),
      leaf: std('#4caf3c', { flatShading: true }),
      leafDark: std('#2f7a2a', { flatShading: true }),
      flower: std('#ff8fc8'),
    }),
    [],
  );
  const halo = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (halo.current) {
      halo.current.position.y = 0.2 + Math.sin(clock.elapsedTime * 2.2) * 0.025;
      halo.current.rotation.y = clock.elapsedTime * 0.8;
    }
  });

  switch (id) {
    case 'hat_bone':
      // Cap with the brim turned backwards and a white front panel.
      return (
        <group position={[0, -0.03, 0]}>
          <mesh material={mats.red} scale={[1, 0.5, 0.95]} castShadow>
            <sphereGeometry args={[0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh material={mats.white} position={[0, 0.07, 0.2]} rotation-x={-0.55} scale={[1, 0.6, 0.25]}>
            <sphereGeometry args={[0.16, 14, 8]} />
          </mesh>
          <mesh material={mats.red} position={[0, 0.015, -0.33]} rotation-x={0.12} scale={[1, 0.18, 1]} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 0.06, 20, 1, false, Math.PI / 2, Math.PI]} />
          </mesh>
          <mesh material={mats.white} position={[0, 0.15, 0]}>
            <sphereGeometry args={[0.035, 10, 8]} />
          </mesh>
        </group>
      );
    case 'hat_cartola':
      return (
        <group position={[0, -0.02, 0]} rotation-z={0.08}>
          <mesh material={mats.black} position={[0, 0.01, 0]} castShadow>
            <cylinderGeometry args={[0.34, 0.34, 0.03, 28]} />
          </mesh>
          <mesh material={mats.black} position={[0, 0.2, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.18, 0.38, 24]} />
          </mesh>
          <mesh material={mats.ribbon} position={[0, 0.07, 0]}>
            <cylinderGeometry args={[0.188, 0.188, 0.07, 24]} />
          </mesh>
        </group>
      );
    case 'hat_bruxa':
      return (
        <group position={[0, -0.02, 0]}>
          <mesh material={mats.purple} position={[0, 0.01, 0]} castShadow>
            <cylinderGeometry args={[0.44, 0.44, 0.025, 28]} />
          </mesh>
          <mesh material={mats.purple} position={[0.03, 0.3, -0.02]} rotation={[-0.2, 0, -0.18]} castShadow>
            <coneGeometry args={[0.25, 0.6, 20]} />
          </mesh>
          <mesh material={mats.gold} position={[0, 0.07, 0]}>
            <cylinderGeometry args={[0.232, 0.24, 0.07, 20]} />
          </mesh>
          <mesh material={mats.gold} position={[0, 0.07, 0.235]}>
            <boxGeometry args={[0.09, 0.08, 0.02]} />
          </mesh>
        </group>
      );
    case 'hat_coroa':
      return (
        <group position={[0, -0.02, 0]}>
          <mesh material={mats.gold} position={[0, 0.07, 0]} castShadow>
            <cylinderGeometry args={[0.24, 0.24, 0.14, 24, 1, true]} />
          </mesh>
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return (
              <group key={i} position={[Math.sin(a) * 0.235, 0, Math.cos(a) * 0.235]}>
                <mesh material={mats.gold} position={[0, 0.2, 0]} castShadow>
                  <coneGeometry args={[0.055, 0.14, 4]} />
                </mesh>
                <mesh material={mats.gold} position={[0, 0.28, 0]}>
                  <sphereGeometry args={[0.022, 8, 6]} />
                </mesh>
                <mesh material={i % 2 ? mats.sapphire : mats.ruby} position={[Math.sin(a) * 0.012, 0.07, Math.cos(a) * 0.012]}>
                  <octahedronGeometry args={[0.035, 0]} />
                </mesh>
              </group>
            );
          })}
        </group>
      );
    case 'hat_aureola':
      return (
        <group ref={halo} position={[0, 0.2, 0]}>
          <mesh material={mats.halo} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.22, 0.028, 10, 36]} />
          </mesh>
          <pointLight color="#ffd27a" intensity={0.6} distance={1.2} />
        </group>
      );
    case 'hat_chifres':
      // Two basalt horns curling up and inward, with glowing magma tips.
      return (
        <group position={[0, -0.14, 0]} scale={1.6}>
          {[1, -1].map((s) => (
            <group key={s} position={[0.14 * s, 0, 0.02]} rotation={[0.12, 0, -0.42 * s]}>
              <mesh material={mats.basalt} position={[0, 0.1, 0]} castShadow>
                <coneGeometry args={[0.07, 0.22, 7]} />
              </mesh>
              <group position={[0, 0.19, 0]} rotation-z={0.75 * s}>
                <mesh material={mats.basalt} position={[0, 0.06, 0]}>
                  <coneGeometry args={[0.042, 0.13, 6]} />
                </mesh>
                <mesh material={mats.lava} position={[0, 0.13, 0]}>
                  <coneGeometry args={[0.02, 0.05, 5]} />
                </mesh>
              </group>
            </group>
          ))}
        </group>
      );
    case 'hat_folhas':
      return (
        <group position={[0, -0.02, 0]}>
          {Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2;
            return (
              <mesh
                key={i}
                material={i % 2 ? mats.leaf : mats.leafDark}
                position={[Math.sin(a) * 0.25, 0.04, Math.cos(a) * 0.25]}
                rotation={[0.5 * Math.cos(a), a, -0.5 * Math.sin(a)]}
                scale={[0.6, 0.25, 1]}
                castShadow
              >
                <sphereGeometry args={[0.1, 6, 4]} />
              </mesh>
            );
          })}
          <group position={[0.16, 0.08, 0.17]}>
            {Array.from({ length: 5 }, (_, i) => {
              const a = (i / 5) * Math.PI * 2;
              return (
                <mesh key={i} material={mats.flower} position={[Math.sin(a) * 0.035, 0, Math.cos(a) * 0.035]} scale={[1, 0.5, 1]}>
                  <sphereGeometry args={[0.03, 8, 6]} />
                </mesh>
              );
            })}
            <mesh material={mats.gold} position={[0, 0.01, 0]}>
              <sphereGeometry args={[0.022, 8, 6]} />
            </mesh>
          </group>
        </group>
      );
    default:
      return null;
  }
}

// ───────────────────────────── bombs & explosions ─────────────────────────────

export interface BombSkin {
  body: string;
  emissive: string;
  /** Base glow (the fuse glow is added on top). */
  base: number;
  metalness: number;
  roughness: number;
  /** Skull emblem tint. */
  skull: string;
}

export const BOMB_SKINS: Record<string, BombSkin> = {
  bomb_toxica: { body: '#1f6b1a', emissive: '#6aff3a', base: 0.45, metalness: 0, roughness: 0.25, skull: '#d6ffb8' },
  bomb_cristal: { body: '#7fd8ff', emissive: '#2a9dff', base: 0.25, metalness: 0.1, roughness: 0.05, skull: '#ffffff' },
  bomb_neon: { body: '#ff2fa8', emissive: '#ff4fd8', base: 0.6, metalness: 0, roughness: 0.2, skull: '#fff0fb' },
  bomb_ouro: { body: '#ffc23a', emissive: '#ff9a00', base: 0.08, metalness: 1, roughness: 0.18, skull: '#3a2400' },
  bomb_magma: { body: '#2b1a17', emissive: '#ff4a10', base: 0.5, metalness: 0, roughness: 0.6, skull: '#ffb36a' },
  bomb_vulcanica: { body: '#3a0d05', emissive: '#ff7a00', base: 0.75, metalness: 0.4, roughness: 0.3, skull: '#ffe08a' },
};

/** Explosion palettes for normal bombs: index sent to the flame shaders (0 = classic fire). */
export const FIRE_STYLE: Record<string, number> = { fire_azul: 1, fire_verde: 2, fire_roxo: 3, fire_dourado: 4 };

/** GLSL: heat → color for the cosmetic palettes (style 1..4); h in 0..1. */
export const STYLED_RAMP_GLSL = /* glsl */ `
  vec3 styledRamp(float h, float kind, float style) {
    if (style < 0.5 || kind > 0.5) return heatRamp(h, kind);
    vec3 lo = vec3(0.0); vec3 mid = vec3(0.0); vec3 hi = vec3(0.0);
    if (style < 1.5) { lo = vec3(0.0, 0.05, 0.4); mid = vec3(0.2, 0.9, 3.4); hi = vec3(2.6, 3.8, 5.0); }
    else if (style < 2.5) { lo = vec3(0.05, 0.3, 0.0); mid = vec3(0.7, 3.2, 0.25); hi = vec3(3.2, 5.0, 2.2); }
    else if (style < 3.5) { lo = vec3(0.25, 0.0, 0.4); mid = vec3(2.0, 0.4, 3.4); hi = vec3(4.2, 3.0, 5.0); }
    else { lo = vec3(0.4, 0.2, 0.0); mid = vec3(3.4, 2.4, 0.4); hi = vec3(5.0, 4.8, 3.0); }
    vec3 c = mix(lo, mid, smoothstep(0.04, 0.5, h));
    return mix(c, hi, smoothstep(0.7, 1.0, h));
  }
`;
