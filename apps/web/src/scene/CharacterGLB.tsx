import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CHARACTER_IDS, SLOT_COLORS, STARTER_CHARACTERS, type Dir } from '@4walls/shared';
import { Character } from './Character';
import { HeadHat, headAnchor } from './Cosmetics';
import { damp, lerp, useGame } from './context';

/** Rigged models built by tools/blender/build_characters.py. */
export const modelUrl = (id: string) => `/models/${(CHARACTER_IDS as string[]).includes(id) ? id : 'bombito'}.glb`;
// Starters load with the game; rescued heroes (bigger, rarer) load when a scene needs them.
for (const id of STARTER_CHARACTERS) useGLTF.preload(modelUrl(id));
export const preloadHeroes = () => {
  for (const id of CHARACTER_IDS) if (!STARTER_CHARACTERS.includes(id)) useGLTF.preload(modelUrl(id));
};
/** Heroes whose costume already covers the head: cosmetic hats would clash with it. */
const BUILT_IN_HEADGEAR = new Set(['bombzaga', 'tiringao', 'bombiao', 'reipelota', 'senha']);

const FACING_ANGLE: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };
const shortestAngle = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
/** Slightly larger than a cell for readability from the top camera (matches the procedural model). */
const MODEL_SCALE = 1.12;

/**
 * Player avatar: the Blender-made rigged model when available, the procedural one meanwhile
 * (while loading) or if the file is missing/broken. Gameplay never waits on art.
 */
export function PlayerAvatar({ playerId }: { playerId: string }) {
  // A rescued hero can change a player's class mid-match: remount with the new model.
  const { controller } = useGame();
  const characterOf = () => controller.state.players.find((p) => p.id === playerId)?.characterId ?? 'bombito';
  const [characterId, setCharacterId] = useState(characterOf);
  useFrame(() => {
    const c = characterOf();
    if (c !== characterId) setCharacterId(c);
  });
  return <AvatarModel key={characterId} playerId={playerId} />;
}

function AvatarModel({ playerId }: { playerId: string }) {
  return (
    <ModelErrorBoundary fallback={<Character playerId={playerId} />}>
      <Suspense fallback={<Character playerId={playerId} />}>
        <CharacterGLB playerId={playerId} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[4walls] character model failed, using procedural fallback', err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type Clip = 'Idle' | 'Run' | 'Victory' | 'Defeat' | 'Cast' | 'Roll' | 'Jump' | 'Throw' | 'Slide';
type Expression = 'Eye' | 'EyeHappy' | 'EyeX';
/** Ability gesture length (the Cast clip is 12 frames at 24 fps). */
const CAST_MS = 520;
const THROW_MS = 420;
const SLIDE_MS = 460;
/** Jump arc height (cells) for a full two-cell hop. */
const JUMP_HEIGHT = 0.85;
/** How long a defeated player stays lying on the floor before sinking away. */
const LIE_SECONDS = 2.6;

function CharacterGLB({ playerId }: { playerId: string }) {
  const { controller, ox, oz } = useGame();
  const player = controller.state.players.find((p) => p.id === playerId)!;
  const gltf = useGLTF(modelUrl(player.characterId));
  const colors = SLOT_COLORS[player.colorIndex % SLOT_COLORS.length];

  // Each player gets its own skeleton and materials (tinted with the player's colors).
  const ownHat = controller.state.config.players.find((p) => p.id === playerId)?.loadout?.hat;
  const hat = BUILT_IN_HEADGEAR.has(player.characterId) ? null : ownHat;
  const { scene, mixer, actions, tinted, eyes, anchor } = useMemo(() => {
    const scene = cloneSkinned(gltf.scene) as THREE.Group;
    const tinted: THREE.MeshStandardMaterial[] = [];
    // Expression eye sets live on the same face; exactly one is shown at a time.
    const eyes: Record<Expression, THREE.Material[]> = { Eye: [], EyeHappy: [], EyeX: [] };
    // White block head stays white; the suit, gloves and boots carry the player's color.
    const suit = new THREE.Color(colors.primary);
    const glove = suit.clone().lerp(new THREE.Color('#ffffff'), 0.12);
    const boot = suit.clone().lerp(new THREE.Color('#5a2a00'), 0.18);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false; // skinned bounds don't follow animation
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
        const c = (m as THREE.MeshStandardMaterial).clone();
        if (c.name === 'Suit') c.color.copy(suit);
        else if (c.name === 'Glove') c.color.copy(glove);
        else if (c.name === 'Boot') c.color.copy(boot);
        if (c.name in eyes) eyes[c.name as Expression].push(c);
        if ('emissiveIntensity' in c) tinted.push(c);
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
    });
    const mixer = new THREE.AnimationMixer(scene);
    const actions = Object.fromEntries(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)])) as Partial<Record<Clip, THREE.AnimationAction>>;
    for (const name of ['Defeat', 'Cast', 'Roll', 'Jump', 'Throw', 'Slide'] as const) {
      const a = actions[name];
      if (a) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
    }
    // Hat anchor is measured on the rest pose, before any animation runs.
    const anchor = headAnchor(scene, player.characterId);
    return { scene, mixer, actions, tinted, eyes, anchor };
  }, [gltf, colors.primary, colors.secondary]);

  const root = useRef<THREE.Group>(null!);
  const shield = useRef<THREE.Mesh>(null!);
  const ghost = useRef<THREE.Mesh>(null!);
  const ice = useRef<THREE.Mesh>(null!);
  const anim = useRef({ yaw: 0, current: '' as Clip | '', deathT: 0, castUntil: 0, throwUntil: 0, slideUntil: 0, moveStart: -1, squash: 0, wasAir: false });

  const play = (name: Clip, fade = 0.18) => {
    const a = anim.current;
    if (a.current === name) return;
    const next = actions[name];
    if (!next) return;
    const prev = a.current ? actions[a.current] : undefined;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    prev?.fadeOut(fade);
    a.current = name;
  };

  useEffect(() => {
    play('Idle', 0);
    // A quick "cast" gesture whenever this player fires their ability.
    const off = controller.on((e) => {
      if (e.type === 'abilityUsed' && e.playerId === playerId) anim.current.castUntil = performance.now() + CAST_MS;
      if (e.type === 'bombThrown' && e.playerId === playerId) anim.current.throwUntil = performance.now() + THROW_MS;
      if (e.type === 'bombKicked' && e.playerId === playerId) anim.current.slideUntil = performance.now() + SLIDE_MS;
    });
    return () => {
      off();
      mixer.stopAllAction();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixer, controller, playerId]);

  const overlays = useMemo(
    () => ({
      shield: new THREE.MeshPhysicalMaterial({ color: '#7fd6ff', emissive: '#2fa8ff', emissiveIntensity: 0.6, transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false }),
      ghost: new THREE.MeshBasicMaterial({ color: '#d9c7ff', transparent: true, opacity: 0.18, depthWrite: false }),
      ice: new THREE.MeshPhysicalMaterial({ color: '#bfefff', emissive: '#5cc8ff', emissiveIntensity: 0.35, roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false }),
    }),
    [],
  );

  useFrame(({ clock }, dt) => {
    const s = controller.state;
    const p = s.players.find((pp) => pp.id === playerId);
    if (!p) return;
    const a = anim.current;
    const t = clock.elapsedTime;
    const al = controller.alphaFor?.(p.id) ?? controller.alpha;
    // Jumps: a parabolic arc on top of the scripted ground path (from the tick-accurate maneuver).
    const m = p.maneuver;
    let air = 0;
    let mk = 0;
    if (m) {
      mk = Math.min(1, Math.max(0, (controller.tickF - m.startTick) / Math.max(1, m.endTick - m.startTick)));
      if (m.kind === 'jump') {
        const dist = Math.abs(m.toX - m.fromX) + Math.abs(m.toY - m.fromY);
        air = 4 * mk * (1 - mk) * JUMP_HEIGHT * (dist === 0 ? 0.55 : dist === 1 ? 0.75 : 1);
      }
    }
    root.current.position.set(lerp(p.px, p.x, al) + ox, air, lerp(p.py, p.y, al) + oz);
    // Squash on landing, stretch on take-off.
    if (a.wasAir && air === 0) a.squash = 1;
    a.wasAir = air > 0.02;
    a.squash = Math.max(0, a.squash - dt * 6);
    a.yaw += shortestAngle(a.yaw, FACING_ANGLE[p.facing]) * damp(18, dt);
    root.current.rotation.y = a.yaw;

    const frozen = p.alive && s.tick < p.frozenUntil;
    const won = s.phase === 'ended' && !!s.result?.winnerIds.includes(p.id);
    const now = performance.now();
    const icySlide = !!p.slideDir && p.moving;
    // A new roll/jump always restarts its clip, timed to the maneuver's exact duration.
    if (m && m.startTick !== a.moveStart) {
      a.moveStart = m.startTick;
      a.current = '';
      const clip = m.kind === 'roll' ? actions.Roll : actions.Jump;
      if (clip) clip.timeScale = clip.getClip().duration / Math.max(0.05, (m.endTick - m.startTick) / 60);
    }
    if (!p.alive) play('Defeat', 0.08);
    else if (won) play('Victory');
    else if (m) play(m.kind === 'roll' ? 'Roll' : 'Jump', 0.05);
    else if (now < a.throwUntil) {
      // Mocap clips are longer than the gameplay moment: speed them up to fit exactly.
      if (actions.Throw) actions.Throw.timeScale = actions.Throw.getClip().duration / (THROW_MS / 1000);
      play('Throw', 0.06);
    } else if (now < a.slideUntil || icySlide) {
      if (actions.Slide) actions.Slide.timeScale = icySlide ? 1 : actions.Slide.getClip().duration / (SLIDE_MS / 1000);
      play('Slide', 0.08);
    }
    else if (now < a.castUntil) play('Cast', 0.06);
    else if (p.moving && !controller.paused) play('Run', 0.12);
    else play('Idle', 0.25);
    const expression: Expression = !p.alive ? 'EyeX' : won ? 'EyeHappy' : 'Eye';
    for (const k of Object.keys(eyes) as Expression[]) for (const m of eyes[k]) m.visible = k === expression;
    const run = actions.Run;
    // Short chibi legs cover little ground per step, so the cadence rises with movement speed
    // (base speed → ~0.29 s cycle) to keep the feet from visibly skating.
    if (run) run.timeScale = Math.min(2.8, Math.max(1.2, 1.75 * (p.speed / 3.6)));
    // Frozen = the pose literally freezes inside the ice block.
    mixer.update(frozen || controller.paused ? 0 : dt);

    ice.current.visible = frozen;
    shield.current.visible = p.alive && p.shield > 0;
    shield.current.rotation.y = t;
    const ghosting = p.alive && s.tick < p.ghostUntil;
    ghost.current.visible = ghosting && ((p.ghostUntil - s.tick) / 60 > 2 || Math.floor(t * 8) % 2 === 0);
    const invuln = p.alive && s.tick < p.invulnUntil;
    root.current.visible = !invuln || Math.floor(t * 16) % 2 === 0 || !p.alive;

    // Fuse spark / lamp flicker.
    const flick = 0.75 + Math.random() * 0.5;
    for (const m of tinted) if (m.name === 'Spark') m.emissiveIntensity = 8 * flick;

    // Defeated: fall over, lie on the floor for a moment, then sink away.
    if (!p.alive) {
      a.deathT = Math.min(LIE_SECONDS + 0.7, a.deathT + dt);
      const k = Math.max(0, (a.deathT - LIE_SECONDS) / 0.7);
      root.current.scale.setScalar(Math.max(0.0001, (1 - k * k) * MODEL_SCALE));
    } else {
      a.deathT = 0;
      const sq = a.squash * a.squash * 0.18;
      const stretch = m?.kind === 'jump' && mk < 0.25 ? (0.25 - mk) * 0.4 : 0;
      root.current.scale.set(MODEL_SCALE * (1 + sq - stretch * 0.5), MODEL_SCALE * (1 - sq + stretch), MODEL_SCALE * (1 + sq - stretch * 0.5));
    }
  });

  return (
    <group ref={root}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
        <circleGeometry args={[0.34, 20]} />
        <meshBasicMaterial color="#000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <primitive object={scene} />
      <HeadHat anchor={anchor} hatId={hat} />
      <mesh ref={shield} position={[0, 0.6, 0]} material={overlays.shield}>
        <icosahedronGeometry args={[0.72, 2]} />
      </mesh>
      <mesh ref={ghost} position={[0, 0.6, 0]} material={overlays.ghost}>
        <sphereGeometry args={[0.74, 20, 14]} />
      </mesh>
      <mesh ref={ice} position={[0, 0.62, 0]} material={overlays.ice}>
        <boxGeometry args={[0.95, 1.3, 0.95]} />
      </mesh>
    </group>
  );
}
