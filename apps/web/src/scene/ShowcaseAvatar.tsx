import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { SLOT_COLORS, type CharacterId } from '@4walls/shared';
import { modelUrl } from './CharacterGLB';
import { HeadHat, headAnchor } from './Cosmetics';

/** Animations the Ateliê can show (the same clips the game plays). */
export type ShowcaseClip = 'Idle' | 'Run' | 'Jump' | 'Roll' | 'Slide' | 'Throw' | 'Cast' | 'Victory' | 'Defeat';
const ONE_SHOT: ShowcaseClip[] = ['Jump', 'Roll', 'Slide', 'Throw', 'Cast', 'Defeat'];
/** Pause after a one-shot clip before it plays again (seconds). */
const REPLAY_GAP = 0.6;

/**
 * Character model for menus: tinted with the player color, playing any clip on a loop
 * (one-shot clips replay after a short pause), with the matching facial expression.
 */
export function ShowcaseAvatar({ characterId, colorIndex, clip = 'Idle', scale = 1, hat = null }: { characterId: CharacterId; colorIndex: number; clip?: ShowcaseClip; scale?: number; hat?: string | null }) {
  const gltf = useGLTF(modelUrl(characterId));
  const colors = SLOT_COLORS[colorIndex % SLOT_COLORS.length];

  const { scene, mixer, actions, eyes, anchor } = useMemo(() => {
    const scene = cloneSkinned(gltf.scene) as THREE.Group;
    const suit = new THREE.Color(colors.primary);
    const glove = suit.clone().lerp(new THREE.Color('#ffffff'), 0.12);
    const boot = suit.clone().lerp(new THREE.Color('#5a2a00'), 0.18);
    const eyes: Record<string, THREE.Material[]> = { Eye: [], EyeHappy: [], EyeX: [] };
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
        const c = (m as THREE.MeshStandardMaterial).clone();
        if (c.name === 'Suit') c.color.copy(suit);
        else if (c.name === 'Glove') c.color.copy(glove);
        else if (c.name === 'Boot') c.color.copy(boot);
        if (c.name in eyes) eyes[c.name].push(c);
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
    });
    const mixer = new THREE.AnimationMixer(scene);
    const actions = Object.fromEntries(gltf.animations.map((c) => [c.name, mixer.clipAction(c)])) as Partial<Record<ShowcaseClip, THREE.AnimationAction>>;
    const anchor = headAnchor(scene, characterId);
    return { scene, mixer, actions, eyes, anchor };
  }, [gltf, colors.primary]);

  const root = useRef<THREE.Group>(null!);
  const state = useRef({ wait: 0 });

  useEffect(() => {
    const a = actions[clip] ?? actions.Idle;
    if (!a) return;
    mixer.stopAllAction();
    a.reset();
    a.setLoop(ONE_SHOT.includes(clip) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = true;
    // The game speeds the run up with movement speed; show it at the base-speed cadence.
    a.timeScale = clip === 'Run' ? 1.75 : 1;
    a.play();
    state.current.wait = 0;
    const expression = clip === 'Victory' ? 'EyeHappy' : clip === 'Defeat' ? 'EyeX' : 'Eye';
    for (const [k, list] of Object.entries(eyes)) for (const m of list) m.visible = k === expression;
    return () => {
      a.stop();
    };
  }, [clip, actions, mixer, eyes]);

  useFrame((_, dt) => {
    mixer.update(Math.min(dt, 0.05));
    const a = actions[clip];
    let y = 0;
    if (a && ONE_SHOT.includes(clip)) {
      const dur = a.getClip().duration;
      const k = Math.min(1, a.time / dur);
      // The game adds the jump arc on top of the pose; do the same here.
      if (clip === 'Jump') y = 4 * k * (1 - k) * 0.55;
      if (k >= 1) {
        state.current.wait += dt;
        if (state.current.wait > (clip === 'Defeat' ? 1.6 : REPLAY_GAP)) {
          state.current.wait = 0;
          a.reset().play();
        }
      }
    }
    root.current.position.y = y;
  });

  return (
    <group ref={root} scale={scale}>
      <primitive object={scene} />
      <HeadHat anchor={anchor} hatId={hat} />
    </group>
  );
}
