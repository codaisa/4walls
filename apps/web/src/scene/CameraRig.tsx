import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { damp, lerp, useGame } from './context';
import { closeCamera, useSettings } from '../store/useSettings';

const ELEVATION = THREE.MathUtils.degToRad(60);
const target = new THREE.Vector3();
const desired = new THREE.Vector3();
const pt = new THREE.Vector3();
const MARGIN = 0.9; // keep the region of interest within 90% of the screen (HUD room)
/**
 * Smallest framed fraction of the arena. 1 = always the whole arena (best readability on the
 * current 15×13 maps); lower it for large arenas so the camera zooms in on the players.
 */
const MIN_FRAME = 1;
/** Adventure camera window (half extents, in cells) around the players. */
const FOLLOW_HALF_W = 7.5;
const FOLLOW_HALF_D = 5.5;
/** Phone camera window: about 11×7 cells around your own player(s), so characters read clearly. */
const CLOSE_HALF_W = 5.5;
const CLOSE_HALF_D = 3.6;
/** The close camera may look past the arena edge so a player in a corner isn't under the HUD. */
const CLOSE_EDGE = 2.2;

/**
 * Shared camera: frames every living player with adaptive zoom (local multiplayer friendly),
 * never framing less than most of the arena and never leaving anyone off-screen. The zoom is
 * solved by projecting the region's corners, so it works for any aspect ratio.
 */
export function CameraRig() {
  const { controller, fx, ox, oz } = useGame();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene);
  const probe = useMemo(() => new THREE.PerspectiveCamera(), []);
  const smooth = useRef({ x: 0, z: 0, dist: 30, init: false });

  useFrame(({ clock }, dt) => {
    const s = controller.state;
    const { w, h } = s.grid;
    const alive = s.players.filter((p) => p.alive);
    const close = closeCamera(useSettings.getState().camera);
    // Phone: follow this device's players (spectate the survivors once they are out).
    const mine = close && controller.isLocal ? alive.filter((p) => controller.isLocal!(p.id)) : alive;
    const focus = mine.length ? mine : alive.length ? alive : s.players;

    // Region of interest: bounding box of players, grown to at least ~85% of the arena.
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of focus) {
      const x = lerp(p.px, p.x, controller.alpha) + ox;
      const z = lerp(p.py, p.y, controller.alpha) + oz;
      minX = Math.min(minX, x - 2);
      maxX = Math.max(maxX, x + 2);
      minZ = Math.min(minZ, z - 2);
      maxZ = Math.max(maxZ, z + 2);
    }
    if (!focus.length) minX = maxX = minZ = maxZ = 0;
    // Adventure: follow the players with a fixed gameplay-sized window (grows if co-op players spread).
    const follow = !!s.adventure || close;
    const fw = close ? CLOSE_HALF_W : FOLLOW_HALF_W;
    const fd = close ? CLOSE_HALF_D : FOLLOW_HALF_D;
    const halfW = follow
      ? Math.min(w / 2, Math.max((maxX - minX) / 2, fw))
      : Math.min(w / 2, Math.max((maxX - minX) / 2, (w / 2) * MIN_FRAME));
    const halfD = follow
      ? Math.min(h / 2, Math.max((maxZ - minZ) / 2, fd))
      : Math.min(h / 2, Math.max((maxZ - minZ) / 2, (h / 2) * MIN_FRAME));
    let cx = follow ? (minX + maxX) / 2 : lerp((minX + maxX) / 2, 0, 0.6);
    let cz = follow ? (minZ + maxZ) / 2 : lerp((minZ + maxZ) / 2, 0, 0.6);
    const edge = close ? CLOSE_EDGE : 0;
    // Arenas are centered on the origin; the endless Adventure's grid window sits in world space.
    const gx = s.adventure ? s.grid.x0 + (w - 1) / 2 : 0;
    const gz = s.adventure ? s.grid.y0 + (h - 1) / 2 : 0;
    cx = THREE.MathUtils.clamp(cx, gx + Math.min(0, -w / 2 + halfW - edge), gx + Math.max(0, w / 2 - halfW + edge));
    cz = THREE.MathUtils.clamp(cz, gz + Math.min(0, -h / 2 + halfD - edge), gz + Math.max(0, h / 2 - halfD + edge));

    // Solve the distance that fits the region's corners (floor and wall-top height) on screen.
    probe.fov = camera.fov;
    probe.aspect = camera.aspect;
    probe.updateProjectionMatrix();
    const fits = (dist: number) => {
      probe.position.set(cx, Math.sin(ELEVATION) * dist, cz + Math.cos(ELEVATION) * dist);
      probe.lookAt(cx, 0, cz);
      probe.updateMatrixWorld();
      for (const y of [0, 1.1])
        for (const [x, z] of [
          [cx - halfW, cz - halfD],
          [cx + halfW, cz - halfD],
          [cx - halfW, cz + halfD],
          [cx + halfW, cz + halfD],
        ]) {
          pt.set(x, y, z).project(probe);
          if (Math.abs(pt.x) > MARGIN || Math.abs(pt.y) > MARGIN) return false;
        }
      return true;
    };
    let lo = 4;
    let hi = 80;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    // Dev-only: `window.__camZoom = 0.3` zooms in for close-up art checks.
    const devZoom = import.meta.env.DEV ? ((window as unknown as { __camZoom?: number }).__camZoom ?? 1) : 1;
    const dist = hi * devZoom;

    const sm = smooth.current;
    if (!sm.init) Object.assign(sm, { x: cx, z: cz, dist: dist * 1.3, init: true });
    sm.x = lerp(sm.x, cx, damp(3, dt));
    sm.z = lerp(sm.z, cz, damp(3, dt));
    sm.dist = lerp(sm.dist, dist, damp(2.2, dt));

    target.set(sm.x, 0, sm.z);
    desired.set(sm.x, Math.sin(ELEVATION) * sm.dist, sm.z + Math.cos(ELEVATION) * sm.dist);

    // Camera shake can be turned off in the settings (motion sickness).
    const trauma = useSettings.getState().shake ? fx.shake * fx.shake : 0;
    const t = clock.elapsedTime * 38;
    desired.x += Math.sin(t * 1.1) * trauma * 0.35;
    desired.y += Math.sin(t * 1.7 + 1) * trauma * 0.25;
    desired.z += Math.sin(t * 1.3 + 2) * trauma * 0.3;

    camera.position.copy(desired);
    camera.lookAt(target);

    // Large worlds: the key light (and its shadow frustum) travels with the camera focus.
    if (follow) {
      const key = scene.getObjectByName('KeyLight') as THREE.DirectionalLight | undefined;
      if (key) {
        key.position.set(sm.x - 8, 18, sm.z + 10);
        key.target.position.set(sm.x, 0, sm.z);
        key.target.updateMatrixWorld();
      }
    }
  });

  return null;
}
