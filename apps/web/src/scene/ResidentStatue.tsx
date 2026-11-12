import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { SLOT_COLORS, type CharacterId } from '@4walls/shared';
import { modelUrl } from './CharacterGLB';
import { graphicsPreset, useSettings } from '../store/useSettings';

/**
 * V0 (performance): a hero standing still at a camp, baked once into a few static meshes.
 *
 * A live hero is ~17 skinned meshes (body, face, costume parts), each skinned twice per frame
 * (color + shadow pass). Six residents cost about half of a camp's GPU time. Here the Idle pose
 * is baked into plain geometry, merged per material (≈4–6 draw calls), and the "breathing" is a
 * cheap bob and sway on the whole statue.
 */
const baked = new Map<string, THREE.Group>();

function bake(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, characterId: string, colorIndex: number) {
  const scene = cloneSkinned(gltf.scene) as THREE.Group;
  const colors = SLOT_COLORS[colorIndex % SLOT_COLORS.length];
  const suit = new THREE.Color(colors.primary);
  const glove = suit.clone().lerp(new THREE.Color('#ffffff'), 0.12);
  const boot = suit.clone().lerp(new THREE.Color('#5a2a00'), 0.18);
  // The resting pose: a moment into the Idle clip.
  const mixer = new THREE.AnimationMixer(scene);
  const idle = gltf.animations.find((c) => c.name === 'Idle');
  if (idle) {
    mixer.clipAction(idle).play();
    mixer.update(0.3);
  }
  scene.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const byMaterial = new Map<string, { material: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const v = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const src = mesh.material as THREE.MeshStandardMaterial;
    // Only the resting expression (the happy / knocked-out eyes stay hidden).
    if (src.name === 'EyeHappy' || src.name === 'EyeX') return;
    const geo = mesh.geometry.clone();
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? (mesh as THREE.SkinnedMesh) : null;
    m4.multiplyMatrices(toRoot, mesh.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (skinned) skinned.applyBoneTransform(i, v);
      v.applyMatrix4(m4);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    geo.morphAttributes = {};
    geo.computeVertexNormals();
    // Plain colored parts all go into one mesh, their color baked per vertex; textured or glowing
    // parts (eyes, gems) keep their own material.
    const color = src.name === 'Suit' ? suit : src.name === 'Glove' ? glove : src.name === 'Boot' ? boot : src.color ?? new THREE.Color('#ffffff');
    const glowing = !!src.map || (src.emissive && src.emissive.getHex() !== 0 && (src.emissiveIntensity ?? 1) > 0) || src.transparent;
    const key = glowing ? src.uuid : 'flat';
    let entry = byMaterial.get(key);
    if (!entry) {
      const mat = glowing ? src.clone() : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
      entry = { material: mat, geos: [] };
      byMaterial.set(key, entry);
    }
    if (!glowing) {
      const n = geo.getAttribute('position').count;
      const cols = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) cols.set([color.r, color.g, color.b], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    }
    entry.geos.push(geo);
  });
  const out = new THREE.Group();
  out.name = `statue:${characterId}`;
  for (const { material, geos } of byMaterial.values()) {
    const ready = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    const merged = mergeGeometries(ready, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, material);
    m.castShadow = true;
    out.add(m);
  }
  mixer.stopAllAction();
  return out;
}

/** A resident hero, baked into a statue that breathes. */
export function ResidentStatue({ characterId, colorIndex }: { characterId: CharacterId; colorIndex: number }) {
  const gltf = useGLTF(modelUrl(characterId));
  const statue = useMemo(() => {
    const key = `${characterId}:${colorIndex}`;
    let base = baked.get(key);
    if (!base) {
      base = bake(gltf, characterId, colorIndex);
      baked.set(key, base);
    }
    const c = base.clone();
    // V0: real shadows only on "high"; phones get a soft blob (≈200k fewer triangles per frame).
    const real = graphicsPreset(useSettings.getState().quality).shadowMap >= 2048;
    c.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) m.castShadow = real;
    });
    return c;
  }, [gltf, characterId, colorIndex]);
  const blob = !(graphicsPreset(useSettings.getState().quality).shadowMap >= 2048);
  const root = useRef<THREE.Group>(null!);
  const seed = useMemo(() => (characterId.charCodeAt(0) % 7) * 0.9, [characterId]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    // Breathing and a slow look around: the whole statue, no skinning.
    root.current.scale.set(1, 1 + Math.sin(t * 2.1) * 0.025, 1);
    root.current.rotation.y = Math.sin(t * 0.45) * 0.35;
  });
  return (
    <>
      {blob && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, 0]}>
          <circleGeometry args={[0.32, 16]} />
          <meshBasicMaterial color="#000" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
      <group ref={root}>
        <primitive object={statue} />
      </group>
    </>
  );
}
